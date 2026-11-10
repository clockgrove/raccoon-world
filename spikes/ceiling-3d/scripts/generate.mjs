#!/usr/bin/env node
// Generates the ceiling-3d props with Meshy text-to-3D (preview, then refine) and keeps a ledger.
// GLBs go to references/ceiling-3d/props/<name>.glb; references/ceiling-3d/provenance.json records each
// call (cost reserved against the Objective's cap, credits, minutes, task ids) and each file (sha256, grant).
// The key comes from MESHY_API_KEY and is never printed.
//
//   node spikes/ceiling-3d/scripts/generate.mjs props [name...]   runs the named props (default all) concurrently
//   node spikes/ceiling-3d/scripts/generate.mjs ledger            prints the committed total
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const OUT = path.join(repo, "references/ceiling-3d");
const PROPS_DIR = path.join(OUT, "props");
const LEDGER = path.join(OUT, "provenance.json");
/** The Objective's cap for all generation; each call reserves its cost first. */
const CAP_USD = 75;
const POLL_MS = 5_000;
const JOB_LIMIT_MS = 900_000;
const MESHY = "https://api.meshy.ai/openapi";
const MESHY_USD_PER_CREDIT = 0.02;
const RESERVE_CREDITS = 40;
/** Meshy's documented prices per step (text-to-3D preview and refine), used when calls run concurrently. */
const STEP_CREDITS = { preview: 20, refine: 10 };

const OUTPUT_GRANT = {
  license: "CC-BY-4.0",
  plan: "Meshy Free",
  commercial: true,
  relabel: false,
  attribution: "3D model generated with Meshy (meshy.ai)",
  source: "https://www.meshy.ai/terms",
};

const STYLE =
  "stylised-realistic slightly painterly game prop, hand-painted textures, warm dusk light not baked in, isolated object, no ground plane";
const PROPS = {
  "trash-can": ["a dented galvanised steel garbage can with ribbed sides, lying on its side, lid off, weathered and wet", 8000],
  mailbox: ["a weathered dark grey metal rural mailbox on a short wooden post", 6000],
  "lamp-post": ["a short black iron garden lamp post with a glass lantern head, about 1.2 m", 6000],
  mushrooms: ["a small cluster of brown-capped wild mushrooms with pale stems", 4000],
  "tree-base": ["the base of a large old tree trunk with thick spreading roots and mossy bark, cut off at the top", 12000],
  "bird-feeder": ["a hanging cylindrical glass bird feeder full of seeds with a dark metal cap and a hook", 5000],
  "watering-can": ["an old galvanised metal watering can", 5000],
  "garden-bed": ["a rectangular raised garden bed made of weathered wooden planks filled with dark soil and small leafy vegetable plants", 12000],
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const minutesSince = (start) => Math.round((Date.now() - start) / 600) / 100;
function key() {
  const value = process.env.MESHY_API_KEY;
  if (!value) throw new Error("MESHY_API_KEY is not set");
  return value;
}

async function readLedger() {
  const text = await readFile(LEDGER, "utf8").catch(() => null);
  return text ? JSON.parse(text) : { capUsd: CAP_USD, calls: [], batches: [], files: {} };
}
const committed = (book) =>
  book.calls.reduce((sum, c) => sum + Number(c.costUsd ?? c.reservedUsd ?? 0), 0);

let chain = Promise.resolve();
/** Writes serialise through one promise chain so concurrent props never interleave a write. */
const saveLedger = (book) => {
  chain = chain.then(async () => {
    await mkdir(OUT, { recursive: true });
    await writeFile(LEDGER, `${JSON.stringify(book, null, 2)}\n`);
  });
  return chain;
};

async function json(response, what) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const headers = () => ({ authorization: `Bearer ${key()}`, "content-type": "application/json" });

async function balance() {
  const body = await json(await fetch(`${MESHY}/v1/balance`, { headers: headers() }), "meshy balance");
  return Number(body.balance);
}

async function job(body) {
  const url = `${MESHY}/v2/text-to-3d`;
  const created = await json(
    await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) }),
    `meshy ${body.mode}`,
  );
  const id = created.result;
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > JOB_LIMIT_MS) throw new Error(`meshy ${body.mode} ${id}: no result in time`);
    await sleep(POLL_MS);
    const task = await json(await fetch(`${url}/${id}`, { headers: headers() }), `meshy ${body.mode} status`);
    if (task.status === "SUCCEEDED") return { id, task, minutes: minutesSince(start) };
    if (task.status === "FAILED" || task.status === "CANCELED")
      throw new Error(`meshy ${body.mode} ${id}: ${task.status} ${JSON.stringify(task.task_error ?? {}).slice(0, 300)}`);
  }
}

async function runProp(book, name, attempt) {
  const [subject, polycount] = PROPS[name];
  const prompt = `${subject}, ${STYLE}`;
  const reservedUsd = RESERVE_CREDITS * MESHY_USD_PER_CREDIT;
  const after = committed(book) + reservedUsd;
  if (after > CAP_USD + 1e-9)
    throw new Error(`refused: reserving $${reservedUsd} would commit $${after.toFixed(2)} of $${CAP_USD}`);
  const record = {
    id: `${name}-${Date.now()}${attempt > 1 ? `-retry${attempt - 1}` : ""}`,
    step: "text to 3D (preview then refine)",
    provider: "Meshy",
    model: "Meshy text-to-3D (latest)",
    endpoint: `POST ${MESHY}/v2/text-to-3d (mode preview, then refine)`,
    parameters: {
      prompt,
      art_style: "realistic",
      should_remesh: true,
      topology: "triangle",
      target_polycount: polycount,
      enable_pbr: false,
    },
    reservedUsd,
    startedAt: new Date().toISOString(),
    status: "reserved",
  };
  book.calls.push(record);
  await saveLedger(book);
  console.log(`${name}: reserved $${reservedUsd}; $${after.toFixed(2)} of $${CAP_USD} committed`);
  const start = Date.now();
  try {
    const preview = await job({
      mode: "preview",
      prompt,
      art_style: "realistic",
      should_remesh: true,
      topology: "triangle",
      target_polycount: polycount,
    });
    record.taskIds = { preview: preview.id };
    await saveLedger(book);
    const refine = await job({ mode: "refine", preview_task_id: preview.id, enable_pbr: false, texture_prompt: STYLE });
    record.taskIds.refine = refine.id;
    const glb = refine.task.model_urls?.glb;
    if (!glb) throw new Error(`meshy refine ${refine.id}: no model_urls.glb`);
    const response = await fetch(glb);
    if (!response.ok) throw new Error(`download glb: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(PROPS_DIR, { recursive: true });
    await writeFile(path.join(PROPS_DIR, `${name}.glb`), bytes);
    const credits = STEP_CREDITS.preview + STEP_CREDITS.refine;
    Object.assign(record, {
      status: "done",
      minutes: minutesSince(start),
      steps: [
        { step: "preview", minutes: preview.minutes, taskId: preview.id, credits: STEP_CREDITS.preview },
        { step: "refine", minutes: refine.minutes, taskId: refine.id, credits: STEP_CREDITS.refine },
      ],
      credits,
      costUsd: Math.round(credits * MESHY_USD_PER_CREDIT * 100) / 100,
      costBasis: `Meshy's documented credits per step (preview ${STEP_CREDITS.preview}, refine ${STEP_CREDITS.refine}; calls may run concurrently so per-call balance diffs are not possible), valued at $${MESHY_USD_PER_CREDIT} per credit (estimate); the batch record holds the measured balance diff`,
    });
    book.files[`props/${name}.glb`] = {
      call: record.id,
      provider: "Meshy",
      model: record.model,
      parameters: record.parameters,
      costUsd: record.costUsd,
      sha256: sha256(bytes),
      bytes: bytes.length,
      outputGrant: OUTPUT_GRANT,
    };
    console.log(`${name}: wrote props/${name}.glb (${bytes.length} bytes)`);
  } catch (error) {
    // A failed call keeps its reservation: the provider may still have charged it.
    Object.assign(record, {
      status: "failed",
      minutes: minutesSince(start),
      error: String(error.message ?? error).slice(0, 500),
    });
    console.log(`${name}: FAILED ${record.error}`);
  } finally {
    await saveLedger(book);
  }
  return record.status === "done";
}

async function props(names) {
  const chosen = names.length ? names : Object.keys(PROPS);
  for (const n of chosen) if (!PROPS[n]) throw new Error(`unknown prop ${n}; one of ${Object.keys(PROPS).join(", ")}`);
  const todo = chosen.filter((n) => !existsSync(path.join(PROPS_DIR, `${n}.glb`)));
  if (!todo.length) return console.log("nothing to do: every GLB exists");
  const book = await readLedger();
  book.capUsd = CAP_USD;
  book.batches ??= [];
  const before = await balance();
  const batch = { startedAt: new Date().toISOString(), props: todo, balanceBefore: before };
  book.batches.push(batch);
  await saveLedger(book);
  // The Free plan queues few tasks (HTTP 429 NoMorePendingTasks), so MESHY_CONCURRENCY caps the workers.
  const workers = Number(process.env.MESHY_CONCURRENCY ?? todo.length);
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: Math.min(workers, todo.length) }, async () => {
      for (let n = queue.shift(); n; n = queue.shift())
        await runProp(book, n, 1 + book.calls.filter((c) => c.id.startsWith(`${n}-`)).length);
    }),
  );
  const after = await balance();
  Object.assign(batch, {
    balanceAfter: after,
    credits: before - after,
    costUsd: Math.round((before - after) * MESHY_USD_PER_CREDIT * 100) / 100,
    costBasis: `Meshy credit balance before and after the whole concurrent batch (exact credits), valued at $${MESHY_USD_PER_CREDIT} per credit (estimate)`,
  });
  await saveLedger(book);
  console.log(`batch: ${batch.credits} credits measured (~$${batch.costUsd})`);
}

// Tripo route (Meshy's Free-plan credits ran out after two props): text to model on Tripo's v3 API, the same
// API #77 measured. Calls run one at a time so each one's credits are an exact balance diff.
const TRIPO = "https://openapi.tripo3d.ai/v3";
const TRIPO_MODEL = "v3.1-20260211";
const TRIPO_USD_PER_CREDIT = 0.01;
const TRIPO_RESERVE_USD = 0.8;
/** Tripo's terms: the API does not expose this key's plan, so the Free plan's terms (CC BY 4.0) are assumed. */
const TRIPO_GRANT = {
  license: "CC-BY-4.0",
  plan: "Tripo (plan not exposed by the API; Free-plan terms assumed)",
  commercial: true,
  relabel: false,
  attribution: "3D model generated with Tripo (tripo3d.ai)",
  source: "https://www.tripo3d.ai/terms",
};
const tripoHeaders = () => {
  const value = process.env.TRIPO_API_KEY;
  if (!value) throw new Error("TRIPO_API_KEY is not set");
  return { authorization: `Bearer ${value}` };
};
async function tripoBody(response, what) {
  const body = await json(response, what);
  if (body.code !== 0) throw new Error(`${what}: code ${body.code} ${body.message ?? ""}`);
  return body.data;
}
const tripoBalance = async () =>
  Number((await tripoBody(await fetch(`${TRIPO}/account/balance`, { headers: tripoHeaders() }), "tripo balance")).balance);
function fileUrls(value, at = []) {
  if (typeof value === "string" && /^https?:/u.test(value)) return [{ at: at.join("."), url: value }];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => fileUrls(v, [...at, k]));
  return [];
}

async function tripoProp(book, name) {
  const [subject, faces] = PROPS[name];
  const prompt = `${subject}, ${STYLE}`;
  const after = committed(book) + TRIPO_RESERVE_USD;
  if (after > CAP_USD + 1e-9) throw new Error(`refused: reserving $${TRIPO_RESERVE_USD} would commit $${after.toFixed(2)} of $${CAP_USD}`);
  const parameters = { model: TRIPO_MODEL, prompt, texture: true, pbr: true, face_limit: faces };
  const record = {
    id: `${name}-tripo-${Date.now()}`,
    step: "text to model (Tripo)",
    provider: "Tripo",
    model: `Tripo text-to-model ${TRIPO_MODEL}`,
    endpoint: `POST ${TRIPO}/generation/text-to-model`,
    parameters,
    reservedUsd: TRIPO_RESERVE_USD,
    startedAt: new Date().toISOString(),
    status: "reserved",
  };
  book.calls.push(record);
  await saveLedger(book);
  console.log(`${name}: reserved $${TRIPO_RESERVE_USD}; $${after.toFixed(2)} of $${CAP_USD} committed`);
  const start = Date.now();
  try {
    const before = await tripoBalance();
    const created = await tripoBody(
      await fetch(`${TRIPO}/generation/text-to-model`, {
        method: "POST",
        headers: { ...tripoHeaders(), "content-type": "application/json" },
        body: JSON.stringify(parameters),
      }),
      "tripo text-to-model",
    );
    const id = created.task_id;
    record.taskIds = { model: id };
    let task;
    for (;;) {
      if (Date.now() - start > JOB_LIMIT_MS) throw new Error(`tripo ${id}: no result in time`);
      await sleep(POLL_MS);
      task = await tripoBody(await fetch(`${TRIPO}/tasks/${id}`, { headers: tripoHeaders() }), "tripo task");
      if (task.status === "success") break;
      if (!["queued", "running"].includes(task.status)) throw new Error(`tripo ${id}: ${task.status} ${JSON.stringify(task).slice(0, 300)}`);
    }
    const urls = fileUrls(task.output ?? {}).filter((f) => /\.glb(\?|$)/u.test(f.url));
    const pick = urls.find((f) => /pbr/u.test(f.at)) ?? urls[0];
    if (!pick) throw new Error(`tripo ${id}: no GLB in ${JSON.stringify(task.output ?? {}).slice(0, 300)}`);
    const response = await fetch(pick.url);
    if (!response.ok) throw new Error(`download glb: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(PROPS_DIR, { recursive: true });
    await writeFile(path.join(PROPS_DIR, `${name}.glb`), bytes);
    const credits = before - (await tripoBalance());
    Object.assign(record, {
      status: "done",
      minutes: minutesSince(start),
      output: pick.at,
      credits,
      costUsd: Math.round(credits * TRIPO_USD_PER_CREDIT * 100) / 100,
      costBasis: `Tripo credit balance before and after this call (exact credits), valued at $${TRIPO_USD_PER_CREDIT} per credit (estimate, as in #77)`,
    });
    book.files[`props/${name}.glb`] = {
      call: record.id,
      provider: "Tripo",
      model: record.model,
      parameters,
      costUsd: record.costUsd,
      sha256: sha256(bytes),
      bytes: bytes.length,
      outputGrant: TRIPO_GRANT,
    };
    console.log(`${name}: wrote props/${name}.glb (${bytes.length} bytes, ${credits} credits)`);
  } catch (error) {
    Object.assign(record, { status: "failed", minutes: minutesSince(start), error: String(error.message ?? error).slice(0, 500) });
    console.log(`${name}: FAILED ${record.error}`);
  } finally {
    await saveLedger(book);
  }
}

async function tripoProps(names) {
  const chosen = names.length ? names : Object.keys(PROPS);
  const book = await readLedger();
  for (const n of chosen) {
    if (!PROPS[n]) throw new Error(`unknown prop ${n}`);
    if (existsSync(path.join(PROPS_DIR, `${n}.glb`))) continue;
    await tripoProp(book, n);
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === "props") await props(rest);
else if (command === "tripo") await tripoProps(rest);
else if (command === "ledger") {
  const book = await readLedger();
  console.log(`committed $${committed(book).toFixed(2)} of $${book.capUsd} across ${book.calls.length} calls`);
  for (const b of book.batches ?? []) console.log(`batch ${b.startedAt}: ${b.credits ?? "?"} credits measured`);
  for (const [f, v] of Object.entries(book.files)) console.log(`${f}: ${v.bytes} bytes sha256 ${v.sha256.slice(0, 12)}`);
} else {
  console.log("usage: generate.mjs props [name...] | ledger");
  process.exitCode = 2;
}
