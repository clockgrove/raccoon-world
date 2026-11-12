#!/usr/bin/env node
// Generates four-view turnaround candidates of a character from the owner's photos, for the owner to pick one
// (issue 50; Stevie's turnaround was made the same way in clockgrove/clockgrove#77). Each candidate is one
// image edit through Vercel AI Gateway, drawn as a 2x2 sheet (front, three-quarter, side, back) and cropped
// into its four views.
//
// Usage: node art/tools/turnaround.mjs <subject> --dry-run   forecast the run: no key, no call, no spend
//        node art/tools/turnaround.mjs <subject>             generate the candidates still missing
//        node art/tools/turnaround.mjs <subject> --candidates N
//
// The inputs are in art/<subject>/turnaround.json. Every call reserves its cost against the run's cap
// before it is made; a call that would pass the cap is refused. The ledger <out>/provenance.json records every
// call: provider, model, route, endpoint, parameters, input hashes, the reservation and the measured cost,
// provider terms and the output grant, and the sha256 of every file written. A failed call keeps its
// reservation, because the provider may still have charged it. The key comes from AI_GATEWAY_API_KEY and is never
// printed. Nothing here picks: the pick is the owner's.
//
// In a Factory worker (FACTORY_GATEWAY_URL set, Factory v0.9.15+) the call goes through Factory's metering relay with
// the relay token in AI_GATEWAY_API_KEY; the relay prices and caps it. Each call's cost is the gateway's own
// providerMetadata.gateway.cost in the answer; only a direct call whose answer has none falls back to the credit
// balance before and after it (the relay refuses /v1/credits).
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { cropRgba, decodePng, encodePng } from "../../spikes/stevie-3d/scripts/png.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** AI_GATEWAY_URL is for an offline test against a local stub only; real runs use the gateway, or Factory's relay. */
const RELAYED = Boolean(process.env.FACTORY_GATEWAY_URL) && !process.env.AI_GATEWAY_URL;
const GATEWAY = process.env.AI_GATEWAY_URL ?? (RELAYED ? `${process.env.FACTORY_GATEWAY_URL}/v1` : "https://ai-gateway.vercel.sh/v1");

/** The route. Its terms and output grant are those Assetforge records for openai/gpt-image-2 (src/routes.ts). */
export const ROUTE = {
  provider: "vercel-ai-gateway",
  model: "openai/gpt-image-2",
  route: "vercel-ai-gateway:images/edits:openai/gpt-image-2",
  endpoint: `${GATEWAY}/images/edits`,
  providerTerms: "OpenAI Services Agreement and Usage Policies, via Vercel AI Gateway (as of 2026-11-07)",
  outputGrant: { license: "LicenseRef-openai-api", plan: "api", commercial: true, relabel: true },
  digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
};
export const PARAMETERS = { size: "1536x1024", quality: "high", n: 1 };
/** Quadrant order of the 2x2 sheet: top-left, top-right, bottom-left, bottom-right. */
export const VIEWS = ["front", "three-quarter", "side", "back"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const dataUrl = (bytes) => `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
const usd = (n) => `$${n.toFixed(2)}`;

export async function loadRun(subject) {
  if (!/^[a-z][a-z0-9-]*$/.test(subject ?? "")) throw new Error(`not a subject name: ${subject}`);
  const run = JSON.parse(await readFile(join(root, "art", subject, "turnaround.json"), "utf8"));
  for (const key of ["prompt", "out"]) if (typeof run[key] !== "string") throw new Error(`turnaround.json: ${key}`);
  if (!Array.isArray(run.photos) || run.photos.length === 0) throw new Error("turnaround.json: photos");
  for (const key of ["candidates", "capUsd", "reserveUsd"])
    if (!(run[key] > 0)) throw new Error(`turnaround.json: ${key} must be positive`);
  return run;
}

const committed = (book) => book.calls.reduce((sum, c) => sum + Number(c.costUsd ?? c.reservedUsd ?? 0), 0);

/** The candidate numbers a run would make: those without a finished call, up to `count`. */
export function pending(book, count) {
  const done = new Set(book.calls.filter((c) => c.status === "done").map((c) => c.candidate));
  return Array.from({ length: count }, (_, i) => `c${i + 1}`).filter((c) => !done.has(c));
}

/** Refuses a plan whose reservations would pass the cap; returns the total that would be committed. */
export function forecast(book, run, todo) {
  const total = committed(book) + todo.length * run.reserveUsd;
  if (total > run.capUsd + 1e-9)
    throw new Error(`refused: ${todo.length} calls at ${usd(run.reserveUsd)} would commit ${usd(total)} of ${usd(run.capUsd)}`);
  return total;
}

async function json(response, what) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
async function balance(token) {
  const body = await json(await fetch(`${GATEWAY}/credits`, { headers: { authorization: `Bearer ${token}` } }), "gateway credits");
  return Number(body.balance);
}

async function main(argv) {
  const subject = argv.find((a) => !a.startsWith("--"));
  const dryRun = argv.includes("--dry-run");
  const run = await loadRun(subject);
  const n = argv.indexOf("--candidates");
  const count = n >= 0 ? Number(argv[n + 1]) : run.candidates;
  if (!(Number.isInteger(count) && count > 0)) throw new Error("--candidates takes a positive whole number");

  const out = join(root, run.out);
  const ledgerPath = join(out, "provenance.json");
  const book = existsSync(ledgerPath)
    ? JSON.parse(await readFile(ledgerPath, "utf8"))
    : { subject, capUsd: run.capUsd, ...ROUTE, calls: [], files: {} };
  const photos = await Promise.all(run.photos.map(async (path) => ({ path, bytes: await readFile(join(root, path)) })));
  const inputs = photos.map(({ path, bytes }) => ({ path, sha256: sha256(bytes) }));
  const todo = pending(book, count);
  const total = forecast(book, run, todo);
  console.log(
    `${subject}: ${todo.length} candidate(s) to make (${todo.join(", ") || "none"}), ${usd(run.reserveUsd)} reserved each; ` +
      `${usd(total)} of ${usd(run.capUsd)} committed after them. Route ${ROUTE.route}; inputs ${inputs.map((i) => i.path).join(", ")}.`,
  );
  if (dryRun || todo.length === 0) return;

  // Factory's relay takes requests up to 32 MB; the photos travel base64-encoded in the JSON body. A body over that is
  // refused here, before anything is reserved, rather than by the relay after the reservation.
  const RELAY_MAX_BYTES = 32 * 1024 * 1024;
  const bodyBytes = Buffer.byteLength(JSON.stringify({ model: ROUTE.model, images: photos.map(({ bytes }) => ({ image_url: dataUrl(bytes) })), prompt: run.prompt, ...PARAMETERS }));
  if (RELAYED && bodyBytes > RELAY_MAX_BYTES)
    throw new Error(
      `the request is ${(bodyBytes / 1048576).toFixed(1)} MB, over the 32 MB Factory's gateway relay takes: use smaller reference photos, or run this in the owner's session`,
    );

  const token = process.env.AI_GATEWAY_API_KEY;
  if (!token) throw new Error("AI_GATEWAY_API_KEY is not set");
  const save = () => writeFile(ledgerPath, `${JSON.stringify(book, null, 2)}\n`);
  await mkdir(out, { recursive: true });
  for (const candidate of todo) {
    forecast(book, run, [candidate]); // reserve before the call, never past the cap
    const record = {
      id: `${subject}-turnaround-${candidate}-${Date.now()}`,
      candidate,
      provider: ROUTE.provider,
      model: ROUTE.model,
      route: ROUTE.route,
      endpoint: ROUTE.endpoint,
      parameters: { ...PARAMETERS, prompt: run.prompt, images: inputs },
      providerTerms: ROUTE.providerTerms,
      outputGrant: ROUTE.outputGrant,
      reservedUsd: run.reserveUsd,
      startedAt: new Date().toISOString(),
      status: "reserved",
    };
    book.calls.push(record);
    await save();
    console.log(`${record.id}: reserved ${usd(run.reserveUsd)}; ${usd(committed(book))} of ${usd(run.capUsd)} committed`);
    const start = Date.now();
    try {
      // The balance is read only where it may be needed: a direct call (the relay refuses /v1/credits).
      const before = RELAYED ? null : await balance(token);
      const response = await fetch(ROUTE.endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: ROUTE.model,
          images: photos.map(({ bytes }) => ({ image_url: dataUrl(bytes) })),
          prompt: run.prompt,
          ...PARAMETERS,
        }),
      });
      const requestId = response.headers.get("x-vercel-id") ?? response.headers.get("x-request-id");
      const body = await json(response, "images/edits");
      const b64 = body.data?.[0]?.b64_json;
      if (!b64) throw new Error("images/edits returned no image");
      const sheet = Buffer.from(b64, "base64");
      const reported = Number.parseFloat(body.providerMetadata?.gateway?.cost);
      let cost;
      if (Number.isFinite(reported) && reported >= 0) cost = { usd: reported, basis: "the gateway's own cost in the answer (providerMetadata.gateway.cost)" };
      else if (RELAYED) cost = { usd: null, basis: "not in the answer; Factory's relay metered the call (the reservation stands in the ledger)" };
      else {
        await sleep(process.env.AI_GATEWAY_URL ? 0 : 10_000); // the gateway's balance lags the call by a few seconds
        cost = { usd: Math.max(0, before - (await balance(token))), basis: "AI Gateway credit balance before and after the call" };
      }
      Object.assign(record, {
        status: "done",
        ...(requestId && { requestId }),
        ...(body.generationId && { generationId: body.generationId }),
        ...(cost.usd !== null && { costUsd: Math.round(cost.usd * 1e6) / 1e6 }),
        costBasis: cost.basis,
        ...(RELAYED && { via: "Factory gateway relay" }),
        usage: body.usage ?? null,
        minutes: Math.round((Date.now() - start) / 600) / 100,
      });
      const image = decodePng(sheet);
      const w = Math.floor(image.width / 2);
      const h = Math.floor(image.height / 2);
      const files = { "turnaround.png": sheet };
      VIEWS.forEach((view, i) => {
        files[`turnaround-${view}.png`] = encodePng(cropRgba(image, (i % 2) * w, Math.floor(i / 2) * h, w, h));
      });
      await mkdir(join(out, candidate), { recursive: true });
      for (const [name, bytes] of Object.entries(files)) {
        const rel = `${candidate}/${name}`;
        await writeFile(join(out, rel), bytes);
        book.files[rel] = {
          call: record.id,
          provider: ROUTE.provider,
          model: ROUTE.model,
          route: ROUTE.route,
          costUsd: name === "turnaround.png" ? record.costUsd : 0,
          outputGrant: ROUTE.outputGrant,
          digitalSourceType: ROUTE.digitalSourceType,
          sha256: sha256(bytes),
          ...(name !== "turnaround.png" && { derivedFrom: `${candidate}/turnaround.png`, view: name.slice(11, -4) }),
        };
      }
      console.log(`${record.id}: ${record.costUsd === undefined ? "cost metered by the relay, reservation kept" : `${usd(record.costUsd)} spent`}; wrote ${run.out}/${candidate}/`);
    } catch (error) {
      Object.assign(record, { status: "failed", error: String(error.message ?? error).slice(0, 500) });
      throw error;
    } finally {
      await save();
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
