// Drives the quality lab (issue 45) in a real browser through `globalThis.lab` and `globalThis.labRunner`.
//
//   node spikes/quality-lab/scripts/lab.mjs journey [--backend webgpu|webgl2|both]
//       CI check on SwiftShader: builds the static site (the one GitHub Pages serves), serves it, and on each backend
//       checks the renderer is the software GPU and reports itself so, then applies every preset and every sweep
//       config and checks each one draws a frame without an error, that the walk moves Stevie, and that the runner's
//       sweep and ceiling search run and report no times. Software-GPU times are never reported.
//   node spikes/quality-lab/scripts/lab.mjs shot <file> [--backend webgpu|webgl2] [--preset medium] [--view yard|close]
//       [--state dusk|night] [--width 1280] [--height 720] [--t 2]   one frame, for working on the look
//   node spikes/quality-lab/scripts/lab.mjs shots [--out references/quality-lab]   the report's images and provenance
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildSite, pinned, repo, SITE } from "./serve.mjs";

const SWIFTSHADER_FLAGS = [
  "--enable-unsafe-webgpu",
  "--enable-unsafe-swiftshader",
  "--use-webgpu-adapter=swiftshader",
  "--use-angle=swiftshader",
  "--enable-features=Vulkan",
  "--use-vulkan=swiftshader",
];

const { chromium } = await import(pathToFileURL(path.join(pinned, "node_modules/playwright/index.mjs")).href);
const { sweepSteps, PRESETS } = await import(pathToFileURL(path.join(repo, "spikes/quality-lab/src/config.ts")).href);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [k, inline] = arg.slice(2).split(/=(.*)/su);
      args[k] = inline ?? argv[++i];
    } else args._.push(arg);
  }
  return args;
}

function ensureChromium() {
  if (existsSync(chromium.executablePath())) return;
  console.log("lab: Playwright's Chromium is missing; installing it");
  const result = spawnSync(process.execPath, [path.join(pinned, "node_modules/playwright/cli.js"), "install", "chromium"], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("could not install Playwright's Chromium (see output above)");
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".json": "application/json" };

/** A static server over the built site, as GitHub Pages serves it: under a sub-path, to prove the URLs are relative. */
async function staticServer(root, prefix = "/raccoon-world/quality-lab/") {
  const server = http.createServer(async (request, response) => {
    const url = decodeURIComponent((request.url ?? "/").split("?")[0]);
    if (!url.startsWith(prefix)) {
      response.statusCode = 404;
      response.end();
      return;
    }
    const rel = url.slice(prefix.length) || "index.html";
    const file = path.join(root, rel);
    if (!file.startsWith(root)) {
      response.statusCode = 403;
      response.end();
      return;
    }
    const bytes = await readFile(file).catch(() => null);
    if (!bytes) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream");
    response.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}${prefix}` };
}

async function open(browser, url, { backend, width, height, ui = false, extra = {} }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(`lab: page error: ${error.message}`);
  });
  page.on("console", (m) => m.type() === "error" && console.error(`lab: console: ${m.text().slice(0, 300)}`));
  const q = new URLSearchParams({ backend, ui: ui ? "1" : "0", ...extra });
  await page.goto(`${url}?${q}`);
  await page.waitForFunction(() => globalThis.lab?.status().ready || globalThis.lab?.status().failure, undefined, { timeout: 300_000 });
  const status = await page.evaluate(() => globalThis.lab.status());
  check(!status.failure, `${backend}: the lab failed: ${status.failure}`);
  return { page, context, status, errors };
}

/** Distinct colours in a frame (a blank or failed frame has one or two). */
function colours(page, png) {
  return page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    const seen = new Set();
    for (let i = 0; i < data.length; i += 16) seen.add((data[i] >> 3) * 1024 + (data[i + 1] >> 3) * 32 + (data[i + 2] >> 3));
    return seen.size;
  }, png);
}

function differing(page, a, b) {
  return page.evaluate(
    async ({ a, b }) => {
      const read = async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, image.width, image.height).data;
      };
      const [da, db] = [await read(a), await read(b)];
      let count = 0;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) count++;
      return count;
    },
    { a, b },
  );
}

/**
 * One browser on one backend: opens the lab (with its panel when `runner` is set), applies each config and checks it
 * draws, then runs the optional extra checks. The page opens on the `start` preset (its first step's) so it compiles
 * that config once at load. Shards run concurrently, so the software GPU's shader compiles overlap.
 */
async function shard(siteUrl, { name, backend, start, steps, walk = false, runner = false }) {
  const browser = await chromium.launch({ headless: true, args: SWIFTSHADER_FLAGS });
  const log = (message) => console.log(`lab journey ${name} (${backend}): ${message}`);
  try {
    const { page, status, errors } = await open(browser, siteUrl, { backend, width: 320, height: 180, ui: runner, extra: { t: "1", preset: start, idle: "1" } });
    check(status.backend === backend, `${name}: the lab ran on ${status.backend}`);
    check(/swiftshader/iu.test(status.adapter), `${name}: adapter "${status.adapter}" is not SwiftShader`);
    check(status.software === true, `${name}: the lab does not flag SwiftShader as software`);
    const stevie = await page.evaluate(() => globalThis.lab.stevie());
    check(stevie && stevie.joints === 30 && stevie.clip === "walk", `${name}: Stevie is not c3 on the 30-joint rig with a walk: ${JSON.stringify(stevie)}`);
    check(Math.abs(stevie.speedMps - 0.268) < 1e-6, `${name}: Stevie walks at ${stevie.speedMps} m/s, not 0.268`);
    const frames = {};
    for (const step of steps) {
      const t0 = Date.now();
      await page.evaluate((config) => globalThis.lab.apply(config), step.config);
      const png = await page.evaluate(() => globalThis.lab.frame());
      const distinct = await colours(page, png);
      const after = await page.evaluate(() => globalThis.lab.status());
      check(!after.failure, `${name}: ${step.id} failed: ${after.failure}`);
      check(distinct > 20, `${name}: ${step.id} drew only ${distinct} colours`);
      check(errors.length === 0, `${name}: ${step.id} raised ${errors.join("; ")}`);
      frames[step.id] = png;
      log(`${step.id} renders (${distinct} colours, ${Math.round((Date.now() - t0) / 1000)} s)`);
    }
    const probeError = await page.evaluate(() => globalThis.lab.probeError());
    check(!probeError || !steps.some((step) => step.config.probes), `${name}: light probes could not bake, so the probe configs drew without them: ${probeError}`);
    if (frames["preset:ultra"] && frames["preset:low"]) {
      const differ = await differing(page, frames["preset:ultra"], frames["preset:low"]);
      check(differ > 200, `${name}: Ultra and Low differ by only ${differ} px`);
    }
    if (walk) {
      // The walk: Stevie moves along his loop between two clock times in the close-up; night differs from dusk.
      await page.evaluate((c) => globalThis.lab.apply(c), PRESETS.low);
      await page.evaluate(() => globalThis.lab.setView("close"));
      await page.evaluate(() => globalThis.lab.freeze(1));
      const a = await page.evaluate(() => globalThis.lab.frame());
      await page.evaluate(() => globalThis.lab.freeze(1.3));
      const b = await page.evaluate(() => globalThis.lab.frame());
      const walked = await differing(page, a, b);
      check(walked > 50, `${name}: the walk changed only ${walked} px`);
      await page.evaluate(() => globalThis.lab.setState("night"));
      const night = await page.evaluate(() => globalThis.lab.frame());
      check((await differing(page, b, night)) > 200, `${name}: night looks like dusk`);
      log(`walk changes ${walked} px; night differs from dusk`);
    }
    if (runner) {
      // The runner through its panel: the sweep's first config and two ceiling steps, with no times on a software GPU.
      const sweep = await page.evaluate(() => globalThis.labRunner.runSweep({ warmupMs: 50, holdMs: 150, maxSteps: 1 }));
      check(sweep.software === true && sweep.steps.length === 1, `${name}: the sweep did not run: ${JSON.stringify(sweep).slice(0, 300)}`);
      check(sweep.steps.every((s) => s.measurement === null && !s.error && s.screenshot.startsWith("data:image/")), `${name}: the sweep reported times, errors or no screenshot on a software GPU`);
      const ceiling = await page.evaluate(() => globalThis.labRunner.findCeiling({ warmupMs: 50, holdMs: 150, maxSteps: 2 }));
      check(ceiling.software === true && ceiling.held === false && ceiling.steps.every((s) => s.measurement === null), `${name}: the ceiling search reported times on a software GPU`);
      const link = await page.evaluate(() => document.querySelector("a[href^='https://github.com/clockgrove/raccoon-world/issues/new']")?.getAttribute("href") ?? null);
      check(link, `${name}: no "send results" link to a new issue`);
      // No frame time of any kind, under any key, in the send link or in the reports the copy and download buttons serialise.
      const times = /"(frameMs\w*|gpuMs\w*|softwareMs|softwareFrameMs|p50|p95)":\s*[-0-9{]/u;
      check(!times.test(decodeURIComponent(link)), `${name}: the send link carries software frame times`);
      check(!times.test(JSON.stringify([sweep, ceiling])), `${name}: the runner's reports carry software frame times`);
      check(errors.length === 0, `${name}: the runner raised ${errors.join("; ")}`);
      log(`runner: sweep ${sweep.steps.length} step and ceiling ${ceiling.steps.length} steps, software, no times; send link ${link.length} chars`);
    }
  } finally {
    await browser.close();
  }
}

async function journey(args) {
  ensureChromium();
  const started = Date.now();
  const { media } = await buildSite(SITE);
  console.log(`lab journey: built the static site (media: ${media.join(", ")})`);
  const site = await staticServer(SITE);
  const all = sweepSteps();
  const byId = (...ids) => ids.map((id) => all.find((s) => s.id === id));
  const effects = all.filter((s) => !s.id.startsWith("preset:"));
  // Every config on WebGPU (the backend the sweep's GPU times come from) and Ultra and Low on the WebGL2 fallback, in
  // three browsers: CI's runner has about two cores, and each extra browser compiles the same base shaders again on the
  // software GPU. Within a page the configs run cheapest first, so each compiles only the shaders it adds.
  const half = Math.ceil(effects.length / 2);
  const shards = [
    { name: "effects", backend: "webgpu", start: "medium", steps: [...byId("preset:medium"), ...effects.slice(0, half)], walk: true },
    { name: "presets", backend: "webgpu", start: "medium", steps: [...byId("preset:medium"), ...effects.slice(half), ...byId("preset:high", "preset:ultra", "preset:low")], runner: true },
    { name: "fallback", backend: "webgl2", start: "ultra", steps: byId("preset:ultra", "preset:low"), walk: true },
  ].filter((s) => !args.backend || args.backend === "both" || s.backend === args.backend);
  try {
    const results = await Promise.allSettled(shards.map((s) => shard(site.url, s)));
    const failed = results.filter((r) => r.status === "rejected");
    for (const r of failed) console.error(`lab journey: ${r.reason?.stack ?? r.reason}`);
    if (failed.length) throw new Error(`${failed.length} of ${shards.length} shards failed`);
  } finally {
    site.server.close();
  }
  console.log(`lab journey: every config renders (${Math.round((Date.now() - started) / 1000)} s, software GPU, not performance)`);
}

async function shotOne(browser, url, o) {
  const { page, context } = await open(browser, url, { backend: o.backend ?? "webgpu", width: Number(o.width ?? 1280), height: Number(o.height ?? 720), extra: { t: String(o.t ?? 2) } });
  await page.evaluate((c) => globalThis.lab.apply(c), PRESETS[o.preset ?? "high"]);
  await page.evaluate((v) => globalThis.lab.setView(v), o.view ?? "yard");
  await page.evaluate((s) => globalThis.lab.setState(s), o.state ?? "dusk");
  const png = Buffer.from((await page.evaluate(() => globalThis.lab.frame())).split(",")[1], "base64");
  const status = await page.evaluate(() => globalThis.lab.status());
  await context.close();
  return { png, status };
}

async function shot(args) {
  ensureChromium();
  await buildSite(SITE);
  const site = await staticServer(SITE);
  const browser = await chromium.launch({ headless: true, args: SWIFTSHADER_FLAGS });
  try {
    const { png, status } = await shotOne(browser, site.url, args);
    await writeFile(path.resolve(args._[1] ?? "shot.png"), png);
    console.log(JSON.stringify({ backend: status.backend, adapter: status.adapter, canvas: status.canvas }));
  } finally {
    await browser.close();
    site.server.close();
  }
}

/** The report's images: the lab at dusk and night, in the yard and the close-up (High preset, software GPU). */
async function shots(args) {
  ensureChromium();
  const outDir = path.resolve(args.out ?? path.join(repo, "references/quality-lab"));
  await mkdir(outDir, { recursive: true });
  await buildSite(SITE);
  const site = await staticServer(SITE);
  const browser = await chromium.launch({ headless: true, args: SWIFTSHADER_FLAGS });
  const records = [];
  try {
    for (const s of [
      { file: "yard-dusk.png", view: "yard", state: "dusk" },
      { file: "yard-night.png", view: "yard", state: "night" },
      { file: "close-dusk.png", view: "close", state: "dusk" },
    ]) {
      const { png, status } = await shotOne(browser, site.url, { ...s, preset: "high", width: 1280, height: 720, t: 2 });
      await writeFile(path.join(outDir, s.file), png);
      records.push({ file: s.file, sha256: createHash("sha256").update(png).digest("hex"), view: s.view, state: s.state, preset: "high", backend: status.backend, adapter: status.adapter, canvas: status.canvas, performance: false });
      console.log(`lab shots: ${s.file}`);
    }
  } finally {
    await browser.close();
    site.server.close();
  }
  const provenance = {
    what: "Screenshots of the quality lab page (spikes/quality-lab) for docs/design/quality-lab.md, drawn by `node spikes/quality-lab/scripts/lab.mjs shots` on SwiftShader (software GPU). Not performance.",
    digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia",
    generationSpendUsd: 0,
    inputs: {
      stevie: "references/stevie/3d-wave0-candidates/c3-rigged/c3-rigged.glb (#54; see its provenance.json)",
      props: "references/ceiling-3d/props (#34; CC BY 4.0, see references/ceiling-3d/provenance.json)",
    },
    records,
  };
  await writeFile(path.join(outDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
if (command === "journey") await journey(args);
else if (command === "shot") await shot(args);
else if (command === "shots") await shots(args);
else {
  console.error("Usage: node spikes/quality-lab/scripts/lab.mjs journey | shot <file> | shots");
  process.exit(2);
}
process.exit(0);
