// Drives the 3D visual ceiling (issue 34) in a real browser through `globalThis.ceiling`.
//
//   node spikes/ceiling-3d/scripts/ceiling.mjs journey
//       CI check on SwiftShader, WebGPU and WebGL2: the frame draws, the renderer is the software GPU, hiding
//       Stevie or any set group changes the picture, and the walk animates. Small canvas, so it stays quick.
//   node spikes/ceiling-3d/scripts/ceiling.mjs capture --label "<host>" [--out <dir>] [--browser <exe>]
//       [--browser-arg=<flag>]... [--backend webgpu|webgl2|both] [--dprs 1,2] [--only <shot-name>]
//       The report's shots: the hero frame, dusk in rain, night, the close-up, Stevie's idle and walk, at 1× and 2×
//       DPR, plus side-by-sides with the mockup, results.json and the measurements table in docs/design/3d-ceiling.md.
//   node spikes/ceiling-3d/scripts/ceiling.mjs shot <file> [--view hero|close] [--state hero|dusk|night]
//       [--backend webgpu|webgl2] [--dpr 1] [--width 1672] [--height 941] [--hide a,b]   one frame, for working on the look
//
// Software-GPU frame times are never performance claims: records from software renderers carry performance: false.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { pinned, repo, serve } from "./serve.mjs";

const SOFTWARE = /swiftshader|llvmpipe|lavapipe|softpipe|software|microsoft basic render/i;
const SWIFTSHADER_FLAGS = [
  "--enable-unsafe-webgpu",
  "--enable-unsafe-swiftshader",
  "--use-webgpu-adapter=swiftshader",
  "--use-angle=swiftshader",
  "--enable-features=Vulkan",
  "--use-vulkan=swiftshader",
];
const MOCKUP = path.join(repo, "docs/design/reference/raccoon-world-reference.png");
const DOC = path.join(repo, "docs/design/3d-ceiling.md");
/** Every object the journey hides one at a time (set.ts groups, Stevie and the rain). */
const OBJECTS = ["stevie", "ground", "house", "porch", "porch-lamp", "neighbour", "fence", "tree", "path", "plants", "props", "clutter", "rain"];

const { chromium } = await import(pathToFileURL(path.join(pinned, "node_modules/playwright/index.mjs")).href);

function parseArgs(argv) {
  const args = { _: [], browserArgs: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--browser-arg=")) args.browserArgs.push(arg.slice("--browser-arg=".length));
    else if (arg.startsWith("--")) {
      const [k, inline] = arg.slice(2).split(/=(.*)/su);
      args[k] = inline ?? argv[++i];
    } else args._.push(arg);
  }
  return args;
}

function ensureChromium() {
  if (existsSync(chromium.executablePath())) return;
  console.log("ceiling: Playwright's Chromium is missing; installing it");
  const result = spawnSync(process.execPath, [path.join(pinned, "node_modules/playwright/cli.js"), "install", "chromium"], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("could not install Playwright's Chromium (see output above)");
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function open(browser, url, { backend, width, height, dpr, rain }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);
  page.on("pageerror", (error) => console.error(`ceiling: page error: ${error.message}`));
  page.on("console", (m) => m.type() === "error" && console.error(`ceiling: console: ${m.text().slice(0, 400)}`));
  const q = new URLSearchParams({ backend, dpr: String(dpr), ...(rain ? { rain: String(rain) } : {}) });
  await page.goto(`${url}?${q}`);
  await page.waitForFunction(() => globalThis.ceiling?.status().ready || globalThis.ceiling?.status().failure, undefined, { timeout: 300_000 });
  const status = await page.evaluate(() => globalThis.ceiling.status());
  check(!status.failure, `${backend}: the frame failed: ${status.failure}`);
  return { page, context, status };
}

const shoot = async (page) => page.screenshot({ type: "png" });

/** Pixels whose summed RGB difference exceeds `threshold`, between two PNGs, counted in the page. */
function differing(page, a, b, threshold = 24) {
  return page.evaluate(
    async ({ a, b, threshold }) => {
      const read = async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, image.width, image.height);
      };
      const [da, db] = [await read(a), await read(b)];
      if (da.width !== db.width || da.height !== db.height) return Number.POSITIVE_INFINITY;
      let count = 0;
      for (let i = 0; i < da.data.length; i += 4)
        if (Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]) > threshold) count++;
      return count;
    },
    { a, b, threshold },
  );
}
const dataUrl = (png) => `data:image/png;base64,${png.toString("base64")}`;

async function journey() {
  ensureChromium();
  const started = Date.now();
  for (const backend of ["webgpu", "webgl2"]) {
    const served = await serve();
    const browser = await chromium.launch({ headless: true, args: SWIFTSHADER_FLAGS });
    try {
      const { page, status } = await open(browser, served.url, { backend, width: 480, height: 270, dpr: 1, rain: 800 });
      check(status.backend === backend, `${backend}: the frame ran on ${status.backend}`);
      const renderer = await page.evaluate(() => globalThis.ceiling.rendererString());
      check(/swiftshader/i.test(renderer), `${backend}: renderer string "${renderer}" is not SwiftShader`);
      for (const name of OBJECTS) check(status.objects.includes(name), `${backend}: object "${name}" is missing from ${JSON.stringify(status.objects)}`);
      check(status.canvas[0] === 480 && status.canvas[1] === 270, `${backend}: canvas is ${status.canvas}, not the window at DPR 1`);
      await page.evaluate(() => globalThis.ceiling.set({ view: "hero", state: "hero", seconds: 0, hidden: [] }));
      const base = dataUrl(await shoot(page));
      for (const name of OBJECTS) {
        await page.evaluate((name) => globalThis.ceiling.set({ hidden: [name] }), name);
        const changed = await differing(page, base, dataUrl(await shoot(page)));
        check(changed > 20, `${backend}: hiding "${name}" changed only ${changed} pixels`);
        console.log(`ceiling journey ${backend}: hiding ${name} changes ${changed} px`);
      }
      await page.evaluate(() => globalThis.ceiling.set({ hidden: [], view: "close", clip: "walk", seconds: 0, rain: false }));
      const a = dataUrl(await shoot(page));
      await page.evaluate(() => globalThis.ceiling.set({ seconds: 0.3 }));
      const walked = await differing(page, a, dataUrl(await shoot(page)));
      check(walked > 50, `${backend}: the walk moved only ${walked} pixels`);
      console.log(`ceiling journey ${backend}: ready on "${renderer}", props ${status.props.map((p) => `${p.name}:${p.source}`).join(" ")}, walk changes ${walked} px`);
    } finally {
      await browser.close();
      await served.server.close();
    }
  }
  console.log(`ceiling journey: both backends draw the frame (${Math.round((Date.now() - started) / 1000)} s, software GPU, not performance)`);
}

/** The report's shots, one record each. */
const SHOTS = [
  { name: "hero", view: "hero", state: "hero" },
  { name: "dusk", view: "hero", state: "dusk" },
  { name: "night", view: "hero", state: "night" },
  { name: "close", view: "close", state: "hero" },
  { name: "close-night", view: "close", state: "night" },
];

async function sideBySide(page, left, right, label) {
  return page.evaluate(
    async ({ left, right, label }) => {
      const load = async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return image;
      };
      const [a, b] = [await load(left), await load(right)];
      const h = 941;
      const wa = Math.round((a.width / a.height) * h);
      const wb = Math.round((b.width / b.height) * h);
      const canvas = new OffscreenCanvas(wa + wb + 12, h + 40);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#14130e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(a, 0, 40, wa, h);
      ctx.drawImage(b, wa + 12, 40, wb, h);
      ctx.fillStyle = "#eee9d9";
      ctx.font = "22px system-ui, sans-serif";
      ctx.fillText("Mockup (docs/design/reference/raccoon-world-reference.png)", 10, 28);
      ctx.fillText(label, wa + 22, 28);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return btoa(s);
    },
    { left, right, label },
  );
}

async function strip(page, frames) {
  return page.evaluate(
    async ({ frames }) => {
      const images = [];
      for (const src of frames) {
        const image = new Image();
        image.src = src;
        await image.decode();
        images.push(image);
      }
      const w = 420;
      const h = Math.round((images[0].height / images[0].width) * w);
      const canvas = new OffscreenCanvas(w * images.length, h);
      const ctx = canvas.getContext("2d");
      images.forEach((image, i) => ctx.drawImage(image, i * w, 0, w, h));
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return btoa(s);
    },
    { frames },
  );
}

async function capture(args) {
  ensureChromium();
  const label = args.label ?? "unlabelled host";
  const outDir = path.resolve(args.out ?? path.join(repo, "references/ceiling-3d"));
  await mkdir(outDir, { recursive: true });
  const backends = !args.backend || args.backend === "both" ? ["webgpu", "webgl2"] : [args.backend];
  const launch = { headless: !args.browser, args: args.browser ? args.browserArgs : [...SWIFTSHADER_FLAGS, ...args.browserArgs] };
  if (args.browser) launch.executablePath = args.browser;
  const mockup = dataUrl(await readFile(MOCKUP));
  const resultsFile = path.join(outDir, "results.json");
  const results = existsSync(resultsFile) ? JSON.parse(await readFile(resultsFile, "utf8")) : { records: [] };
  const write = async (file, bytes, record) => {
    await writeFile(path.join(outDir, file), bytes);
    results.records = results.records.filter((r) => r.file !== file);
    results.records.push({ file, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, host: label, ...record });
    console.log(`ceiling capture: ${file}`);
  };
  for (const backend of backends) {
    // The report shows WebGPU at 1x and 2x and WebGL2 at 1x (parity), unless --dprs says otherwise.
    const dprs = args.dprs ? args.dprs.split(",").map(Number) : backend === "webgpu" ? [1, 2] : [1];
    for (const dpr of dprs) {
      const served = await serve();
      const browser = await chromium.launch(launch);
      try {
        const { page, status } = await open(browser, served.url, { backend, width: 1672, height: 941, dpr });
        const renderer = await page.evaluate(() => globalThis.ceiling.rendererString());
        const software = SOFTWARE.test(renderer);
        const common = { backend: status.backend, renderer, dpr, canvas: status.canvas, performance: !software, props: status.props, stevie: status.stevie };
        for (const shot of SHOTS) {
          if (args.only && args.only !== shot.name) continue;
          await page.evaluate((s) => globalThis.ceiling.set({ view: s.view, state: s.state, clip: "idle", heading: "three-quarter", seconds: 0.4, rain: true, hidden: [] }), shot);
          const png = await shoot(page);
          const file = `${shot.name}-${dpr}x-${backend}.png`;
          const metrics = await page.evaluate((n) => globalThis.ceiling.measure(n), software ? 12 : 120);
          await page.evaluate((s) => globalThis.ceiling.set({ seconds: 0.4 }), shot);
          await write(file, png, { ...common, shot: shot.name, view: shot.view, state: shot.state, metrics: software ? { ...metrics, frameMsP50: "software, not performance", frameMsP95: "software, not performance", softwareFrameMs: [metrics.frameMsP50, metrics.frameMsP95] } : metrics });
          if (dpr === 1 && shot.view === "hero") {
            const sbs = Buffer.from(await sideBySide(page, mockup, dataUrl(png), `Real-time 3D, ${shot.state} (${backend}, ${dpr}× DPR)`), "base64");
            await write(`vs-mockup-${shot.name}-${backend}.png`, sbs, { ...common, shot: `side-by-side ${shot.name}`, view: shot.view, state: shot.state });
          }
        }
        if (dpr === 1 && !args.only) {
          for (const clip of ["idle", "walk"]) {
            const times = clip === "idle" ? [0, 0.6, 1.2, 1.8] : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
            const frames = [];
            for (const seconds of times) {
              await page.evaluate((o) => globalThis.ceiling.set({ view: "close", state: "hero", clip: o.clip, seconds: o.seconds, rain: false, hidden: [] }), { clip, seconds });
              const png = await page.screenshot({ type: "png", clip: { x: 1672 / 2 - 420, y: 941 / 2 - 300, width: 840, height: 600 } });
              frames.push(dataUrl(png));
            }
            await write(`motion-${clip}-${backend}.png`, Buffer.from(await strip(page, frames), "base64"), { ...common, shot: `Stevie ${clip}, close-up`, times });
          }
        }
      } finally {
        await browser.close();
        await served.server.close();
      }
    }
  }
  results.records.sort((a, b) => a.file.localeCompare(b.file));
  results.capturedOn = label;
  await writeFile(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
  await writeTable(results);
}

async function writeTable(results) {
  if (!existsSync(DOC)) return;
  const rows = results.records
    .filter((r) => r.metrics)
    .map((r) => {
      const m = r.metrics;
      const time = r.performance ? `${m.frameMsP50} / ${m.frameMsP95}` : "software, not performance";
      return `| ${r.host} | ${r.backend} | ${r.renderer} | ${r.dpr}× (${r.canvas.join("×")}) | ${r.shot} | ${time} | ${m.textureMiB ?? "n/a"} | ${m.jsHeapMiB ?? "n/a"} | ${m.drawCalls ?? "n/a"} |`;
    });
  const table = [
    "| Host | Backend | Renderer | DPR (canvas px) | Shot | Frame p50 / p95 (ms) | Texture MiB | JS heap MiB | Draw calls |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
  const doc = await readFile(DOC, "utf8");
  const next = doc.replace(/<!-- ceiling:measurements:start -->[\s\S]*<!-- ceiling:measurements:end -->/u, `<!-- ceiling:measurements:start -->\n${table}\n<!-- ceiling:measurements:end -->`);
  await writeFile(DOC, next);
}

async function shot(args) {
  ensureChromium();
  const served = await serve();
  const browser = await chromium.launch({ headless: true, args: SWIFTSHADER_FLAGS });
  try {
    const backend = args.backend ?? "webgpu";
    const dpr = Number(args.dpr ?? 1);
    const { page, status } = await open(browser, served.url, { backend, width: Number(args.width ?? 1672), height: Number(args.height ?? 941), dpr });
    await page.evaluate((a) => globalThis.ceiling.set({ view: a.view ?? "hero", state: a.state ?? "hero", seconds: 0.4, clip: a.clip ?? "idle", hidden: a.hide ? a.hide.split(",") : [] }), args);
    await writeFile(path.resolve(args._[1] ?? "shot.png"), await shoot(page));
    console.log(JSON.stringify({ backend: status.backend, props: status.props, canvas: status.canvas }));
  } finally {
    await browser.close();
    await served.server.close();
  }
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
if (command === "journey") await journey();
else if (command === "capture") await capture(args);
else if (command === "shot") await shot(args);
else {
  console.error("Usage: node spikes/ceiling-3d/scripts/ceiling.mjs journey | capture --label <host> | shot <file>");
  process.exit(2);
}
process.exit(0);
