// Drives the 3D look proof (issue 26) in a real browser through `globalThis.look3d`.
//
//   node spikes/look-3d/scripts/look.mjs journey [--out <dir>]
//       CI check on SwiftShader: content renders on both backends, hiding any named object changes the picture.
//   node spikes/look-3d/scripts/look.mjs capture --label "<host>" [--out <dir>] [--browser <exe>]
//       [--browser-arg=<flag>]... [--backend webgpu|webgl2|both]
//       The maintainer's report capture (real GPU); writes PNGs, results.json and the measurements table.
//
// SwiftShader frame times are never performance claims; records from software renderers carry `performance: false`.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { pinned, repo, serve } from "./serve.mjs";

const PROPS = ["ground", "path", "puddles", "house", "porch", "porch-lamp", "window", "fence", "bin-1", "bin-2", "plants", "shrubs"];
const SOFTWARE = /swiftshader|llvmpipe|lavapipe|softpipe|software|microsoft basic render/i;
const SWIFTSHADER_FLAGS = [
  "--enable-unsafe-webgpu",
  "--enable-unsafe-swiftshader",
  "--use-webgpu-adapter=swiftshader",
  "--use-angle=swiftshader",
  "--enable-features=Vulkan",
  "--use-vulkan=swiftshader",
];
const DUSK = 63_000_000;
const NIGHT = 79_200_000;

const { chromium } = await import(pathToFileURL(path.join(pinned, "node_modules/playwright/index.mjs")).href);

function parseArgs(argv) {
  const args = { _: [], browserArgs: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--browser-arg=")) args.browserArgs.push(arg.slice("--browser-arg=".length));
    else if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split(/=(.*)/su);
      args[key] = inline ?? argv[++i];
    } else args._.push(arg);
  }
  return args;
}

function ensureChromium() {
  if (existsSync(chromium.executablePath())) return;
  console.log("look: Playwright's Chromium is missing; installing it");
  const result = spawnSync(process.execPath, [path.join(pinned, "node_modules/playwright/cli.js"), "install", "chromium"], {
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("could not install Playwright's Chromium (see output above)");
}

async function openPage(browser, url, query, options = {}) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  page.on("pageerror", (error) => console.error(`look: page error: ${error.message}`));
  await page.goto(`${url}${query}`);
  await page.waitForFunction(
    () => {
      const status = globalThis.look3d?.status();
      return status?.ready && status.contentStatus !== "loading";
    },
    undefined,
    { timeout: 120_000 },
  );
  return page;
}

/** Counts pixels whose summed absolute RGB difference exceeds `threshold`, between two PNG data URLs. */
function differingPixels(page, a, b, threshold) {
  return page.evaluate(
    async ({ a, b, threshold }) => {
      const pixels = async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      };
      const [da, db] = [await pixels(a), await pixels(b)];
      if (da.width !== db.width || da.height !== db.height) return Number.POSITIVE_INFINITY;
      let count = 0;
      for (let i = 0; i < da.data.length; i += 4) {
        const sum = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]);
        if (sum > threshold) count++;
      }
      return count;
    },
    { a, b, threshold },
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntil(read, accept, what, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = await read();
    if (accept(last)) return last;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}; last value ${JSON.stringify(last)}`);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function journey(args) {
  const outDir = args.out ? path.resolve(args.out) : undefined;
  ensureChromium();
  const lines = [];
  for (const backend of ["webgpu", "webgl2"]) {
    let served;
    let browser;
    try {
      served = await serve({ backend });
      browser = await chromium.launch({ headless: true, args: SWIFTSHADER_FLAGS });
      const page = await openPage(browser, served.url, "?view=whole");
      const status = await page.evaluate(() => globalThis.look3d.status());
      check(status.contentStatus === "ready", `${backend}: content status is ${status.contentStatus} (${status.contentFailure ?? "no failure reported"})`);
      check(status.backend === backend, `${backend}: renderer ran on ${status.backend}`);
      const renderer = await page.evaluate(() => globalThis.look3d.rendererString());
      check(/swiftshader/i.test(renderer), `${backend}: renderer string "${renderer}" is not SwiftShader`);
      for (const name of ["stevie", ...PROPS]) check(status.objects.includes(name), `${backend}: object "${name}" is missing from ${JSON.stringify(status.objects)}`);

      const setup = (p, tier) =>
        p.evaluate((tier) => {
          const l = globalThis.look3d;
          l.setReducedMotion(true);
          l.setEnvironment(63_000_000, 9000);
          l.setStevie({ clip: "idle", heading: "three-quarter", seconds: 0 });
          l.setQuality(tier);
        }, tier);
      const empty = await openPage(browser, served.url, "?view=whole&content=none");
      const tiers = [];
      for (const tier of ["low", "high"]) {
        await setup(page, tier);
        await setup(empty, tier);
        const withContent = await page.evaluate(() => globalThis.look3d.capture());
        const without = await empty.evaluate(() => globalThis.look3d.capture());
        const content = await differingPixels(page, withContent, without, 30);
        check(content > 200, `${backend}/${tier}: content changes only ${content} pixels against the no-content picture (need > 200)`);
        const weak = [];
        for (const name of ["stevie", ...PROPS]) {
          await page.evaluate((n) => globalThis.look3d.setHidden([n]), name);
          const hidden = await page.evaluate(() => globalThis.look3d.capture());
          const changed = await differingPixels(page, withContent, hidden, 30);
          if (!(changed > 8)) weak.push(`${name} (${changed} pixels)`);
        }
        await page.evaluate(() => globalThis.look3d.setHidden([]));
        check(weak.length === 0, `${backend}/${tier}: hiding these objects does not change the picture: ${weak.join(", ")}`);
        if (outDir) {
          await mkdir(outDir, { recursive: true });
          await writeFile(path.join(outDir, `journey-${backend}-${tier}.png`), Buffer.from(withContent.split(",")[1], "base64"));
        }
        tiers.push(`${tier}: ${content} pixels from content, each of ${PROPS.length + 1} objects changes the picture`);
      }

      await page.evaluate(() => {
        const l = globalThis.look3d;
        l.setReducedMotion(false);
        l.setStevie({ clip: "walk", heading: "right", seconds: null });
      });
      await pollUntil(
        () => page.evaluate(() => globalThis.look3d.status().stevie),
        (stevie) => stevie?.clip === "walk" && stevie.heading === "right",
        "Stevie to report the walk clip",
      );
      const first = await page.evaluate(() => globalThis.look3d.capture());
      await sleep(200);
      const second = await page.evaluate(() => globalThis.look3d.capture());
      check(first !== second, `${backend}: two captures 200 ms apart are identical while Stevie walks`);
      lines.push(`look: ${backend} on "${renderer}" (software, not performance); ${tiers.join("; ")}; walk animates`);
    } finally {
      await browser?.close();
      await served?.server.close();
    }
  }
  for (const line of lines) console.log(line);
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const pngSize = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });
const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

/** Crops 240x240 around `center` from each data URL and lays the crops side by side; returns a PNG buffer. */
async function strip(page, frames, center) {
  const data = await page.evaluate(
    async ({ frames, center }) => {
      const size = 240;
      const out = document.createElement("canvas");
      out.width = size * frames.length;
      out.height = size;
      const context = out.getContext("2d");
      for (const [i, src] of frames.entries()) {
        const image = new Image();
        image.src = src;
        await image.decode();
        const x = Math.max(0, Math.min(image.width - size, Math.round(center[0] - size / 2)));
        const y = Math.max(0, Math.min(image.height - size, Math.round(center[1] - size / 2)));
        context.drawImage(image, x, y, size, size, i * size, 0, size, size);
      }
      return out.toDataURL("image/png");
    },
    { frames, center },
  );
  return Buffer.from(data.split(",")[1], "base64");
}

async function captureReport(args) {
  const label = args.label;
  check(label, "capture needs --label \"<host description>\"");
  const outDir = path.resolve(args.out ?? path.join(repo, "references/look-3d"));
  const choice = args.backend ?? "both";
  check(["webgpu", "webgl2", "both"].includes(choice), `--backend must be webgpu, webgl2 or both, not "${choice}"`);
  const backends = choice === "both" ? ["webgpu", "webgl2"] : [choice];
  const states = [
    { name: "dusk-rain", timeMs: DUSK, rain: 9000, label: "dusk in rain (17:30)" },
    { name: "night", timeMs: NIGHT, rain: 9000, label: "night in rain (22:00)" },
  ];
  const commit = (await readFile(path.join(repo, "CLOCKGROVE_COMMIT"), "utf8")).trim();
  if (!args.browser) ensureChromium();
  await mkdir(outDir, { recursive: true });
  const launch = {
    headless: true,
    args: args.browserArgs.length > 0 ? args.browserArgs : SWIFTSHADER_FLAGS,
    ...(args.browser ? { executablePath: path.resolve(args.browser) } : {}),
  };
  const shots = [];
  const motion = [];
  const measurements = [];

  for (const backend of backends) {
    let served;
    let browser;
    try {
      served = await serve({ backend });
      browser = await chromium.launch(launch);
      for (const dpr of [1, 2]) {
        const page = await openPage(browser, served.url, "?view=yard", { deviceScaleFactor: dpr });
        const info = async () => {
          const [status, rendererString, userAgent] = await page.evaluate(() => [
            globalThis.look3d.status(),
            globalThis.look3d.rendererString(),
            navigator.userAgent,
          ]);
          check(status.backend === backend, `${backend}: renderer ran on ${status.backend}`);
          check(status.contentStatus === "ready", `${backend}: content status is ${status.contentStatus} (${status.contentFailure ?? "no failure"})`);
          return { backend, rendererString, qualityTier: status.qualityTier, dpr, userAgent, label, performance: !SOFTWARE.test(rendererString) };
        };
        const views = await page.evaluate(() => Object.keys(globalThis.look3d.views));
        await page.evaluate(() => {
          const l = globalThis.look3d;
          l.setReducedMotion(true);
          l.setQuality("high");
          l.setStevie({ clip: "idle", heading: "three-quarter", seconds: 0 });
        });
        for (const state of states) {
          await page.evaluate(({ t, r }) => globalThis.look3d.setEnvironment(t, r), { t: state.timeMs, r: state.rain });
          for (const view of views) {
            await page.evaluate((v) => globalThis.look3d.setView(v), view);
            await page.waitForTimeout(500);
            const buffer = await page.locator("canvas").screenshot();
            const file = `zoom-${state.name}-${view}-${dpr}x-${backend}.png`;
            await writeFile(path.join(outDir, file), buffer);
            shots.push({ file, sha256: sha256(buffer), bytes: buffer.length, ...pngSize(buffer), state: state.name, view, ...(await info()) });
          }
        }
        if (dpr !== 1) {
          await page.context().close();
          continue;
        }

        await page.evaluate(({ t, r }) => {
          globalThis.look3d.setEnvironment(t, r);
          globalThis.look3d.setView("close");
        }, { t: DUSK, r: 9000 });
        const headings = await page.evaluate(() => [...globalThis.look3d.headings]);
        const clips = {
          idle: [0, 0.6, 1.2, 1.8],
          walk: Array.from({ length: 8 }, (_, i) => Math.round(i * 0.1 * 10) / 10),
        };
        for (const heading of headings) {
          for (const [clip, seconds] of Object.entries(clips)) {
            const frames = [];
            let center = [320, 200];
            for (const s of seconds) {
              await page.evaluate(({ clip, heading, s }) => globalThis.look3d.setStevie({ clip, heading, seconds: s }), { clip, heading, s });
              frames.push(await page.evaluate(() => globalThis.look3d.capture()));
              center = (await page.evaluate(() => globalThis.look3d.screenPoints().stevie)) ?? center;
            }
            const buffer = await strip(page, frames, center);
            const file = `motion-${heading}-${clip}-${backend}.png`;
            await writeFile(path.join(outDir, file), buffer);
            motion.push({ file, sha256: sha256(buffer), bytes: buffer.length, ...pngSize(buffer), state: "dusk-rain", view: "close", heading, clip, seconds, ...(await info()) });
          }
        }

        await page.evaluate(() => globalThis.look3d.setStevie({ clip: "idle", heading: "three-quarter", seconds: null }));
        for (const state of states) {
          await page.evaluate(({ t, r }) => globalThis.look3d.setEnvironment(t, r), { t: state.timeMs, r: state.rain });
          for (const view of views) {
            await page.evaluate((v) => {
              globalThis.look3d.setView(v);
              globalThis.look3d.setReducedMotion(false);
            }, view);
            await page.waitForTimeout(3000);
            const m = await page.evaluate(() => globalThis.look3d.metrics());
            const record = { ...(await info()), state: state.name, view };
            const frameMs = Array.isArray(m.frameMs) ? m.frameMs : [];
            const times = { p50: percentile(frameMs, 50), p95: percentile(frameMs, 95), samples: frameMs.length };
            measurements.push({
              ...record,
              ...(record.performance ? { frameMs: times } : { softwareFrameMs: times }),
              textureBytes: m.textureBytes,
              jsHeapUsedBytes: m.jsHeapUsedBytes ?? null,
              contentUpdateMs: m.contentUpdateMs ?? null,
              firstRenderMs: m.firstRenderMs ?? null,
            });
          }
        }
        await page.context().close();
      }
    } finally {
      await browser?.close();
      await served?.server.close();
    }
  }

  const results = { issue: 26, clockgroveCommit: commit, label, capturedAt: new Date().toISOString(), shots, motion, measurements };
  await writeFile(path.join(outDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  await updateDoc(measurements, label, path.join(outDir, "results.json"));
  console.log(`look: wrote ${shots.length} shots, ${motion.length} motion strips and ${measurements.length} measurements to ${outDir}`);
}

async function updateDoc(measurements, label, resultsPath) {
  const doc = path.join(repo, "docs/design/3d-look-proof.md");
  if (!existsSync(doc)) return;
  const start = "<!-- look3d:measurements:start -->";
  const end = "<!-- look3d:measurements:end -->";
  const text = await readFile(doc, "utf8");
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from < 0 || to < from) return;
  const mib = (bytes) => (typeof bytes === "number" ? (bytes / 1048576).toFixed(1) : "n/a");
  const rows = measurements.map((m) => {
    const times = m.performance ? `${m.frameMs.p50?.toFixed(1)} / ${m.frameMs.p95?.toFixed(1)}` : "software, not performance";
    return `| ${m.label} | ${m.backend} | ${m.rendererString} | ${m.qualityTier} | ${m.state} | ${m.view} | ${times} | ${mib(m.textureBytes)} | ${mib(m.jsHeapUsedBytes)} |`;
  });
  const table = [
    "| Host | Backend | Renderer | Tier | State | View | Frame p50 / p95 (ms) | Texture MiB | JS heap MiB |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `Captured on "${label}"; every number and image is in \`${path.relative(repo, resultsPath).split(path.sep).join("/")}\`.`,
  ].join("\n");
  await writeFile(doc, `${text.slice(0, from + start.length)}\n${table}\n${text.slice(to)}`);
}

const args = parseArgs(process.argv.slice(2));
const mode = args._[0];
try {
  if (mode === "journey") await journey(args);
  else if (mode === "capture") await captureReport(args);
  else {
    console.error('Usage: node spikes/look-3d/scripts/look.mjs journey [--out <dir>] | capture --label "<host>" [--out <dir>] [--browser <exe>] [--browser-arg=<flag>]... [--backend webgpu|webgl2|both]');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`look: FAILED: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
// Vite's file watchers and browser handles can outlive the work; the result is already set.
process.exit(process.exitCode ?? 0);
