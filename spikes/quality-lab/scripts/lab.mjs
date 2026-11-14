// Drives the quality lab (issue 45) in a real browser through `globalThis.lab` and `globalThis.labRunner`.
//
//   node spikes/quality-lab/scripts/lab.mjs journey [--backend webgpu|webgl2|both]
//       CI check on SwiftShader: runs tests/media.journey.node.test.mjs (the shipped media), then builds the static site (the one GitHub Pages serves), serves it, and on each backend
//       checks the renderer is the software GPU and reports itself so, then applies every preset and every sweep
//       config and checks each one draws a frame without an error, that the walk moves Stevie, and that the runner's
//       sweep and ceiling search run and report no times. It ends with the `levels` proof below on the same site.
//       Software-GPU times are never reported.
//   node spikes/quality-lab/scripts/lab.mjs groom [--backend webgpu|webgl2|both]
//       Focused proof of the groomed coat (#81): the approved Stevie, both coats, Compare fur and its export.
//   node spikes/quality-lab/scripts/lab.mjs levels [--backend webgpu|webgl2|both]
//       Focused proof of Stevie's detail levels (#113): ?platform=phone draws the 1024 px phone levels and switches
//       between them from the close-up to the yard, Compare levels runs and exports with no times, desktop draws level 0.
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
    const { page, status, errors } = await open(browser, siteUrl, { backend, width: 320, height: 180, ui: runner || backend === "webgl2", extra: { t: "1", preset: start, idle: "1" } });
    check(status.backend === backend, `${name}: the lab ran on ${status.backend}`);
    check(/swiftshader/iu.test(status.adapter), `${name}: adapter "${status.adapter}" is not SwiftShader`);
    check(status.software === true, `${name}: the lab does not flag SwiftShader as software`);
    check(status.config.coat === "summer" && status.config.furMode === "groomed", `${name}: summer groom is not the default`);
    const stevie = await page.evaluate(() => globalThis.lab.stevie());
    check(stevie && stevie.joints === 30 && stevie.clip === "walk", `${name}: Stevie is not the approved model on the 30-joint rig with a walk: ${JSON.stringify(stevie)}`);
    check(Math.abs(stevie.speedMps - 0.267756) < 1e-6, `${name}: Stevie walks at ${stevie.speedMps} m/s, not 0.267756`);
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
      const triangles = await page.evaluate(() => globalThis.labRunner.findTriangleBudget({ warmupMs: 50, holdMs: 150, maxSteps: 2 }));
      check(
        triangles.software === true && triangles.steps.length === 2 && triangles.held === null && triangles.estimatedTriangles === null && triangles.noLimitUpTo === null && triangles.steps.every((s) => s.measurement === null && !s.error),
        `${name}: the triangle budget run did not run cleanly on a software GPU: ${JSON.stringify(triangles).slice(0, 300)}`,
      );
      // The cast budget and the soak: two short steps each, no times on a software GPU, and three raccoons draw more.
      const cast = await page.evaluate(() => globalThis.labRunner.findCastBudget({ warmupMs: 50, holdMs: 150, maxSteps: 2 }));
      check(
        cast.software === true && cast.steps.length === 2 && cast.steps.every((s) => s.measurement === null && !s.error) && cast.steps[1].triangles > cast.steps[0].triangles,
        `${name}: the cast budget run did not run cleanly on a software GPU: ${JSON.stringify(cast).slice(0, 300)}`,
      );
      const soak = await page.evaluate(() => globalThis.labRunner.runSoak({ seconds: 2, windowS: 1, warmupMs: 50, holdMs: 150 }));
      check(soak.software === true && soak.steps.length === 2 && soak.steps.every((s) => s.measurement === null && !s.error), `${name}: the soak did not run cleanly on a software GPU: ${JSON.stringify(soak).slice(0, 300)}`);
      // Geometry detail must really add triangles: the scene count at 4× is above the art as made.
      // ...and draw the same yard: midpoint splits keep every shape, so a frozen frame barely changes.
      const counts = await page.evaluate(async () => {
        const lab = globalThis.lab;
        const base = lab.status().config;
        const frame = async (detail) => {
          await lab.apply({ ...base, detail });
          return { triangles: lab.status().triangles, shot: await lab.screenshot(320) };
        };
        lab.freeze(4);
        const plain = await frame(1);
        const four = await frame(4);
        lab.freeze(null);
        await lab.apply(base);
        const pixels = async (url) => {
          const img = new Image();
          img.src = url;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, c.width, c.height).data;
        };
        const [a, b] = await Promise.all([pixels(plain.shot), pixels(four.shot)]);
        let sum = 0;
        for (let i = 0; i < a.length; i += 4) sum += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
        return { plain: plain.triangles, four: four.triangles, meanDiff: sum / (a.length / 4) };
      });
      check(counts.four > counts.plain, `${name}: Geometry detail 4× did not add triangles (${JSON.stringify(counts)})`);
      check(counts.meanDiff < 3, `${name}: Geometry detail 4× changed the picture (mean difference ${counts.meanDiff.toFixed(2)} of 255)`);
      const copy = await page.evaluate(() => {
        const button = [...document.querySelectorAll(".ql button")].find((b) => b.textContent === "Copy results");
        return { enabled: Boolean(button && !button.disabled), text: globalThis.labRunner.copied() };
      });
      check(copy.enabled, `${name}: no enabled "Copy results" button after the runs`);
      // No frame time of any kind, under any key, in what Copy results copies or in the reports Download JSON saves.
      const times = /"(frameMs\w*|gpuMs\w*|softwareMs|softwareFrameMs|p50|p95)":\s*[-0-9{]/u;
      const slim = JSON.parse(copy.text);
      const timeColumns = ["frameMsP50", "frameMsP95", "frameMsP99", "missedPct", "gpuMsP50", "gpuMsP95", "cpuMsP50", "cpuMsP95"].map((c) => slim.columns.indexOf(c));
      check(slim.reports.length === 5 && slim.reports.every((r) => r.steps.every((row) => timeColumns.every((i) => row[i] == null))), `${name}: Copy results carries software frame times`);
      check(!times.test(JSON.stringify([sweep, ceiling, triangles, cast, soak])), `${name}: the runner's reports carry software frame times`);
      check(errors.length === 0, `${name}: the runner raised ${errors.join("; ")}`);
      log(`runner: sweep ${sweep.steps.length} step, ceiling ${ceiling.steps.length} steps, triangle budget ${triangles.steps.length} steps, cast ${cast.steps.length} steps (${cast.steps[0].triangles} → ${cast.steps[1].triangles} triangles), soak ${soak.steps.length} windows, software, no times; detail 4× ${counts.plain} → ${counts.four} triangles, same picture (mean difference ${counts.meanDiff.toFixed(2)}); copied ${copy.text.length} chars`);
    }
    if (runner || backend === "webgl2") await checkGroom(page, backend, errors);
  } finally {
    await browser.close();
  }
}

// Kirk's approved Stevie (c1 of #107 with the cleaner face of #114): the source GLB's sha256, as its manifest's
// contentHash records it. Other candidates had the same triangle and joint counts, so the hash is what tells them apart.
const STEVIE_SHA256 = "ac9b439ca4c015c2b038228a53e3c29011313ffbfe8cc47444dc85021c0df355";

/** The sha256 of the model file the page loaded, fetched again from the URL Stevie reports. */
async function loadedSha256(page) {
  return page.evaluate(async () => {
    const bytes = await fetch(new URL(globalThis.lab.stevie().url, document.baseURI)).then((r) => r.arrayBuffer());
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  });
}

const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance * Math.abs(b);

async function checkGroom(page, backend, errors, out) {
  if (await page.locator(".ql.collapsed").count()) await page.locator(".ql-head").click();
  const reportCount = await page.evaluate(() => globalThis.labRunner.reports().length);
  await page.getByRole("group", { name: "Preset", exact: true }).getByRole("button", { name: "Medium", exact: true }).click();
  const apply = page.getByRole("button", { name: /^Apply \d+ changes?$/ });
  if (await apply.isVisible()) {
    await apply.click();
    await page.waitForFunction(() => !document.querySelector(".ql.busy"));
  }
  await page.evaluate(async () => {
    await globalThis.lab.setView("yard");
    await globalThis.lab.setState("dusk");
    globalThis.lab.freeze(1);
  });
  const initial = await page.evaluate(() => globalThis.lab.stevie());
  check(initial.source === "assets/models/stevie/stevie.glb" && initial.triangles === 59847 && initial.joints === 30, `${backend}: wrong approved model: ${JSON.stringify(initial)}`);
  // The loaded file is the web media built from the approved model: its bytes match web-media.json, whose source hash is the approved model's.
  const webMedia = JSON.parse(await readFile(path.join(repo, "references/web-media/web-media.json"), "utf8")).files["stevie.glb"];
  const loaded = await loadedSha256(page);
  check(webMedia.sourceSha256 === STEVIE_SHA256 && loaded === webMedia.sha256 && initial.contentHash === STEVIE_SHA256, `${backend}: loaded model is not the approved model's web media: ${JSON.stringify({ url: initial.url, loaded, webMedia: webMedia.sha256, contentHash: initial.contentHash })}`);
  // The quantized media keeps its scale in the inverse bind matrices; the lab must find it, not assume metres.
  check(initial.metresPerUnit.every((m) => m > 0.2 && m < 0.6) && initial.metresPerUnit.every((m) => near(m, initial.metresPerUnit[0], 1e-3)), `${backend}: compressed media's bind scale not found: ${JSON.stringify(initial.metresPerUnit)}`);
  const download = await page.evaluate(async () => {
    const sizes = await fetch(new URL("media/manifest.json", document.baseURI)).then((r) => r.json());
    // The desktop levels (stevie.lodN.glb) ship beside the page but it draws the phone tier's, not these.
    const bytes = Object.entries(sizes).filter(([key]) => !key.startsWith("source/") && !/^stevie\.lod\d\.glb$/u.test(key) && /\.(glb|ktx2)$/u.test(key)).reduce((sum, [, size]) => sum + size, 0);
    return { expected: Math.round(bytes / 1e5) / 10, actual: globalThis.lab.status().device.modelMb };
  });
  check(download.actual === download.expected, `${backend}: groom downloads missing from load report: ${JSON.stringify(download)}`);
  check((await colours(page, await page.evaluate(() => globalThis.lab.frame()))) > 20, `${backend}: yard is blank`);
  await page.evaluate(() => globalThis.lab.setView("close"));
  const frames = {};
  for (const [coat, furMode, maxLengthM] of [["summer", "groomed", 0.04], ["winter", "groomed", 0.08], ["summer", "uniform", 0.012]]) {
    await page.evaluate(async ({ coat, furMode }) => {
      await globalThis.lab.apply({ ...globalThis.lab.status().config, furShells: 8, furFins: true, coat, furMode });
      globalThis.lab.freeze(1);
    }, { coat, furMode });
    const metrics = await page.evaluate(() => globalThis.lab.stevie());
    check(metrics.coat === coat && metrics.furMode === furMode && metrics.maxLengthM === maxLengthM, `${backend}: wrong groom: ${JSON.stringify(metrics)}`);
    check(metrics.drawnMaxLengthM?.length === 3 && metrics.drawnMaxLengthM.every((m) => near(m, maxLengthM, 1e-6)), `${backend}: ${coat} ${furMode} fur is not drawn at ${maxLengthM} m: ${JSON.stringify(metrics.drawnMaxLengthM)}`);
    if (furMode === "groomed") {
      check(["length", "direction", "density"].every((kind) => metrics.groom?.[kind] === `assets/models/stevie/stevie.groom.${coat}.${kind}.ktx2`), `${backend}: wrong seasonal map paths: ${JSON.stringify(metrics.groom)}`);
      check(metrics.baseColor === "assets/models/stevie/stevie.baseColor.ktx2" && metrics.eyesMask === "assets/models/stevie/stevie.eyes.mask.ktx2", `${backend}: missing base colour or eye mask`);
      check(metrics.winterTint === (coat === "winter" ? "assets/models/stevie/stevie.tint.winter.ktx2" : null), `${backend}: wrong winter tint`);
    }
    frames[`${coat}:${furMode}`] = await page.evaluate(() => globalThis.lab.frame());
    if (out) {
      await mkdir(out, { recursive: true });
      await writeFile(path.join(out, `${backend}-${coat}-${furMode}.png`), Buffer.from(frames[`${coat}:${furMode}`].split(",")[1], "base64"));
    }
    console.log(`lab groom (${backend}): ${coat} ${furMode} renders, maxLengthM=${maxLengthM}`);
  }
  check((await differing(page, frames["summer:groomed"], frames["winter:groomed"])) > 50, `${backend}: winter does not change the coat`);
  check((await differing(page, frames["summer:groomed"], frames["summer:uniform"])) > 20, `${backend}: groomed shells look identical to uniform shells`);
  await page.evaluate(async () => {
    await globalThis.lab.apply({ ...globalThis.lab.status().config, coat: "winter", furMode: "groomed", antialias: "traa" });
    globalThis.lab.freeze(1.1);
  });
  check((await colours(page, await page.evaluate(() => globalThis.lab.frame()))) > 20, `${backend}: temporal groom rendering is blank`);
  console.log(`lab groom (${backend}): winter fins and temporal antialiasing render`);
  // The controls edit the draft, Apply updates both the scene and its reported config.
  await page.getByRole("group", { name: "Coat", exact: true }).getByRole("button", { name: "Winter", exact: true }).click();
  await page.getByRole("group", { name: "Fur material", exact: true }).getByRole("button", { name: "Groomed", exact: true }).click();
  await page.getByRole("button", { name: /^Apply \d+ changes?$/ }).click();
  await page.waitForFunction(() => globalThis.lab.status().config.coat === "winter" && globalThis.lab.status().config.furMode === "groomed" && !document.querySelector(".ql.busy"));
  const comparison = await page.evaluate(() => globalThis.labRunner.compareFur({ presets: ["medium"], maxSteps: 2, warmupMs: 50, holdMs: 150 }));
  check(comparison.kind === "fur" && comparison.coat === "winter" && comparison.steps.length === 6, `${backend}: missing comparison steps`);
  check(comparison.steps.every((s) => !s.error && s.measurement === null), `${backend}: comparison errors or fabricated software times: ${JSON.stringify(comparison.steps.map(({id,error,measurement}) => ({id,error,measurement})))}`);
  check(comparison.costs.length === 1 && comparison.costs[0].gpuMsP50 === null && comparison.costs[0].cpuMsP50 === null, `${backend}: fabricated cost deltas`);
  const [uniform, groomed] = comparison.steps;
  check(uniform.config.furMode === "uniform" && groomed.config.furMode === "groomed", `${backend}: missing paired materials`);
  check(JSON.stringify({ ...uniform.config, furMode: "groomed" }) === JSON.stringify(groomed.config), `${backend}: preset pair has different settings`);
  check(comparison.castBudgets.length === 2 && comparison.castBudgets.every((r) => r.gpuMsPerRaccoon === null && r.cpuMsPerRaccoon === null && r.held === null), `${backend}: invalid software cast budgets`);
  const castSteps = comparison.steps.slice(2);
  check(castSteps.map((s) => s.config.cast).join(",") === "1,3,1,3", `${backend}: cast counts are not paired`);
  check(castSteps[1].triangles > castSteps[0].triangles && castSteps[3].triangles > castSteps[2].triangles, `${backend}: cast clones do not add groomed geometry`);
  check(JSON.stringify({ ...comparison.castBudgets[0].base, furMode: "groomed" }) === JSON.stringify(comparison.castBudgets[1].base), `${backend}: cast effects differ`);
  const copied = JSON.parse(await page.evaluate(() => globalThis.labRunner.copied()));
  const added = copied.reports.at(-1);
  check(copied.reports.length === reportCount + 1 && added.kind === "fur" && added.costs.length === 1 && added.costs[0].cpuMsP50 === null && added.castBudgets.length === 2, `${backend}: comparison missing from Copy results`);
  check(errors.length === 0, `${backend}: page errors: ${errors.join("; ")}`);
  console.log(`lab groom (${backend}): controls, paired preset/cast steps and exported results pass; software timings suppressed`);
  return initial;
}

/** The issue 81 path: shipped media, both coat renders and paired measurements through the real page. */
async function groomJourney(args) {
  ensureChromium();
  await buildSite(SITE);
  const site = await staticServer(SITE);
  const browser = await chromium.launch({ headless: true, args: SWIFTSHADER_FLAGS });
  try {
    let compressed;
    for (const backend of args.backend && args.backend !== "both" ? [args.backend] : ["webgpu", "webgl2"]) {
      console.log(`lab groom (${backend}): opening approved Stevie in the yard`);
      const { page, context, status, errors } = await open(browser, site.url, { backend, width: Number(args.width ?? 640), height: Number(args.height ?? 360), ui: true, extra: { t: "1", preset: "medium", idle: "1" } });
      check(status.backend === backend && status.software, `${backend}: expected software ${backend}`);
      check(status.config.coat === "summer" && status.config.furMode === "groomed", `${backend}: summer groom is not the default`);
      compressed = await checkGroom(page, backend, errors, args.out);
      await context.close();
    }
    console.log("lab groom: opening source media for compatibility");
    const source = await open(browser, site.url, { backend: args.backend === "webgl2" ? "webgl2" : "webgpu", width: Number(args.width ?? 640), height: Number(args.height ?? 360), extra: { t: "1", preset: "medium", idle: "1", media: "source" } });
    const sourceMetrics = await source.page.evaluate(() => globalThis.lab.stevie());
    check(sourceMetrics.triangles === 59847 && sourceMetrics.groom.length === "assets/models/stevie/stevie.groom.summer.length.png" && sourceMetrics.baseColor === "assets/models/stevie/stevie.baseColor.png", "source media did not retain the uncompressed model and maps");
    check((await colours(source.page, await source.page.evaluate(() => globalThis.lab.frame()))) > 20 && source.errors.length === 0, "source media failed to render");
    check((await loadedSha256(source.page)) === STEVIE_SHA256, "source media did not load the approved GLB");
    // Both files are the same raccoon in metres: the source's units are metres, and the bind-pose sizes agree.
    check(sourceMetrics.metresPerUnit.every((m) => near(m, 1, 1e-3)), `source media is not in metres: ${JSON.stringify(sourceMetrics.metresPerUnit)}`);
    check(sourceMetrics.bindSizeM.every((m, i) => near(compressed.bindSizeM[i], m, 0.005)), `compressed and source bind sizes differ: ${JSON.stringify({ compressed: compressed.bindSizeM, source: sourceMetrics.bindSizeM })}`);
    check(sourceMetrics.drawnMaxLengthM?.every((m) => near(m, 0.04, 1e-6)), `source summer fur is not drawn at 0.04 m: ${JSON.stringify(sourceMetrics.drawnMaxLengthM)}`);
    await source.context.close();
    console.log(`lab groom: uncompressed source media renders; metres per unit ${compressed.metresPerUnit.map((m) => m.toFixed(4))} (web media) and ${sourceMetrics.metresPerUnit.map((m) => m.toFixed(4))} (source), bind size ${compressed.bindSizeM.map((m) => m.toFixed(3))} m and ${sourceMetrics.bindSizeM.map((m) => m.toFixed(3))} m`);
  } finally {
    await browser.close();
    site.server.close();
  }
}

/** What the drawn level must be, from the manifest: [file, triangles, minScreenHeight] for the phone tier, finest first. */
async function phoneChain() {
  const { model } = JSON.parse(await readFile(path.join(repo, "assets/models/stevie/manifest.json"), "utf8"));
  const heights = Object.fromEntries(model.chain.levels.map((l) => [l.level, l.minScreenHeight]));
  const phone = model.chain.tiers.find((t) => t.name === "phone").levels.map((level) => {
    const entry = Object.values(model.tiers.phone.levels).find((l) => l.level === level);
    return { file: path.basename(entry.path), level, triangles: entry.triangles, minScreenHeight: heights[level], sha256: entry.sha256, textureMaxPx: entry.textureMaxPx };
  });
  return { phone, mainTriangles: model.triangles };
}

/** The drawn level, once a frame has drawn it, from a view at a zoom scale. */
const drawn = (page, view, zoom = 1) =>
  page.evaluate(async ({ view, zoom }) => {
    await globalThis.lab.setZoom(zoom);
    await globalThis.lab.setView(view);
    globalThis.lab.frame();
    return globalThis.lab.status().stevie;
  }, { view, zoom });

async function checkLevels(browser, siteUrl, backend, chain) {
  const [near, far] = chain.phone;
  // ---- A phone: the phone levels, switched by Stevie's height on screen ----
  const phone = await open(browser, siteUrl, { backend, width: 640, height: 360, ui: true, extra: { t: "1", preset: "medium", idle: "1", platform: "phone" } });
  const { page, errors } = phone;
  check(phone.status.platform === "phone" && phone.status.software, `${backend}: expected a software phone page`);
  const web = JSON.parse(await readFile(path.join(repo, "references/web-media/web-media.json"), "utf8")).files;
  // Stevie is a third of the frame in the close-up and about 6% in the yard, both above the finest level's 5%; zoomed
  // out to 60% he is below it, so that framing draws the coarsest level.
  const close = await drawn(page, "close");
  const yard = await drawn(page, "yard", 0.6);
  const framed = await drawn(page, "yard");
  const expected = (h) => chain.phone.find((l) => h >= l.minScreenHeight) ?? far;
  check(framed.file === expected(framed.screenHeight).file, `${backend}: the yard as framed (height ${framed.screenHeight}) draws ${framed.file}, not ${expected(framed.screenHeight).file}`);
  for (const [view, seen, level] of [["close-up", close, near], ["zoomed-out yard", yard, far]]) {
    check(seen.mode === "phone" && seen.file === level.file && seen.level === level.level && seen.triangles === level.triangles, `${backend}: the ${view} draws ${JSON.stringify(seen)}, not ${level.file} with ${level.triangles} triangles`);
    check(seen.textureMaxPx === 1024, `${backend}: the ${view}'s level draws with ${seen.textureMaxPx} px textures, not 1024`);
  }
  check([19747, 5979].includes(close.triangles) && [19747, 5979].includes(yard.triangles) && close.triangles !== yard.triangles, `${backend}: the levels' triangle counts are not 19747 and 5979`);
  check(close.screenHeight >= near.minScreenHeight && yard.screenHeight < near.minScreenHeight, `${backend}: Stevie's screen heights ${close.screenHeight} (close-up) and ${yard.screenHeight} (zoomed out) do not straddle ${near.minScreenHeight}`);
  // The loaded bytes are the web media built from the manifest's file, not the 59,847-triangle model.
  for (const [view, zoom, level] of [["close", 1, near], ["yard", 0.6, far]]) {
    await drawn(page, view, zoom);
    const entry = web[level.file];
    check(entry?.sourceSha256 === level.sha256 && (await loadedSha256(page)) === entry.sha256, `${backend}: the loaded ${view} file is not the web media of ${level.file}`);
  }
  await drawn(page, "close");
  const frame = await page.evaluate(() => globalThis.lab.frame());
  check((await colours(page, frame)) > 20, `${backend}: the phone close-up is blank`);
  console.log(`lab levels (${backend}): phone draws ${near.file} (${close.triangles} triangles, height ${close.screenHeight}) in the close-up, ${framed.file} in the yard as framed (height ${framed.screenHeight}) and ${far.file} (${yard.triangles}, height ${yard.screenHeight}) zoomed out, ${close.textureMaxPx} px`);
  // The panel's control: level 0 only, then back to the phone levels.
  if (await page.locator(".ql.collapsed").count()) await page.locator(".ql-head").click();
  const levelsGroup = page.getByRole("group", { name: "Stevie's levels", exact: true });
  await levelsGroup.getByRole("button", { name: "Level 0 only", exact: true }).click();
  await page.getByRole("button", { name: /^Apply \d+ changes?$/ }).click();
  await page.waitForFunction(() => globalThis.lab.status().config.levels === "single" && !document.querySelector(".ql.busy"));
  const single = await drawn(page, "close");
  check(single.mode === "single" && single.file === "stevie.glb" && single.triangles === chain.mainTriangles, `${backend}: the panel's level 0 control draws ${JSON.stringify(single)}`);
  await levelsGroup.getByRole("button", { name: "Phone levels", exact: true }).click();
  await page.getByRole("button", { name: /^Apply \d+ changes?$/ }).click();
  await page.waitForFunction(() => globalThis.lab.status().config.levels === "phone" && !document.querySelector(".ql.busy"));
  check((await drawn(page, "close")).file === near.file, `${backend}: the panel did not return to the phone levels`);
  // Compare levels: each preset once on level 0 and once on the phone levels, no times on a software GPU.
  const reportCount = await page.evaluate(() => globalThis.labRunner.reports().length);
  const comparison = await page.evaluate(() => globalThis.labRunner.compareLevels({ presets: ["medium", "low"], warmupMs: 50, holdMs: 150 }));
  check(comparison.kind === "levels" && comparison.software === true && comparison.view === "close" && comparison.steps.length === 4, `${backend}: Compare levels did not run its four steps: ${JSON.stringify(comparison).slice(0, 300)}`);
  check(comparison.steps.every((s) => !s.error && s.measurement === null && s.screenshot.startsWith("data:image/")), `${backend}: Compare levels errors, times or no screenshot on a software GPU: ${JSON.stringify(comparison.steps.map(({ id, error, measurement }) => ({ id, error, measurement })))}`);
  check(comparison.costs.length === 2 && comparison.costs.every((c) => Object.entries(c).every(([key, value]) => key === "preset" || value === null)), `${backend}: Compare levels fabricated costs: ${JSON.stringify(comparison.costs)}`);
  const [level0, levelled] = comparison.steps;
  check(level0.config.levels === "single" && levelled.config.levels === "phone" && JSON.stringify({ ...level0.config, levels: "phone" }) === JSON.stringify(levelled.config), `${backend}: the comparison pair differs in more than the levels`);
  check(level0.stevie.file === "stevie.glb" && level0.stevie.triangles === chain.mainTriangles && levelled.stevie.file === near.file && levelled.stevie.triangles === near.triangles, `${backend}: the pair did not draw level 0 and the phone close-up level: ${JSON.stringify([level0.stevie, levelled.stevie])}`);
  check((await page.evaluate(() => globalThis.lab.status().config.levels)) === "phone", `${backend}: Compare levels did not restore the page's levels`);
  const copied = JSON.parse(await page.evaluate(() => globalThis.labRunner.copied()));
  const added = copied.reports.at(-1);
  check(copied.reports.length === reportCount + 1 && added.kind === "levels" && added.costs.length === 2 && added.costs.every((c) => c.gpuMsP50 === null && c.frameMsP95 === null), `${backend}: Compare levels missing from Copy results or carries times`);
  const timeColumns = ["frameMsP50", "frameMsP95", "frameMsP99", "gpuMsP50", "gpuMsP95", "cpuMsP50", "cpuMsP95"].map((c) => copied.columns.indexOf(c));
  check(added.steps.every((row) => timeColumns.every((i) => row[i] == null)), `${backend}: Copy results carries software frame times for Compare levels`);
  const downloaded = await page.evaluate(() => JSON.stringify(globalThis.labRunner.reports().at(-1).steps.map(({ screenshot, ...rest }) => rest)));
  check(!/"(frameMs\w*|gpuMs\w*|cpuMs\w*)":\s*[-0-9{]/u.test(downloaded), `${backend}: the downloaded Compare levels JSON carries software frame times`);
  check(errors.length === 0, `${backend}: page errors on the phone page: ${errors.join("; ")}`);
  console.log(`lab levels (${backend}): panel control, Compare levels (${comparison.steps.length} steps) and exported results pass; software timings suppressed`);
  await phone.context.close();
  // ---- A desktop: today's single level 0 ----
  const desktop = await open(browser, siteUrl, { backend, width: 640, height: 360, extra: { t: "1", preset: "medium", idle: "1" } });
  const base = await drawn(desktop.page, "close");
  check(desktop.status.platform === "desktop" && base.mode === "single" && base.file === "stevie.glb" && base.level === 0 && base.triangles === chain.mainTriangles && base.textureMaxPx === 2048, `${backend}: desktop does not draw the 59847-triangle main file at 2048 px: ${JSON.stringify(base)}`);
  const farBase = await drawn(desktop.page, "yard");
  check(farBase.file === "stevie.glb", `${backend}: desktop switched level in the yard: ${JSON.stringify(farBase)}`);
  check(desktop.errors.length === 0, `${backend}: page errors on the desktop page: ${desktop.errors.join("; ")}`);
  console.log(`lab levels (${backend}): desktop draws ${base.file} (${base.triangles} triangles, ${base.textureMaxPx} px) in both views`);
  await desktop.context.close();
}

/** The issue 113 path: the phone levels, their switch, Compare levels and the desktop's level 0, through the real page. */
async function levelsJourney(args) {
  ensureChromium();
  await buildSite(SITE);
  const site = await staticServer(SITE);
  try {
    await checkLevelsOn(site.url, args);
  } finally {
    site.server.close();
  }
}

async function checkLevelsOn(url, args) {
  const chain = await phoneChain();
  const browser = await chromium.launch({ headless: true, args: SWIFTSHADER_FLAGS });
  try {
    for (const backend of args.backend && args.backend !== "both" ? [args.backend] : ["webgpu", "webgl2"]) await checkLevels(browser, url, backend, chain);
  } finally {
    await browser.close();
  }
}

/** The shipped media's own tests (#81): compressed model and maps, manifest and provenance, as the site serves them. */
function mediaTests() {
  const result = spawnSync(process.execPath, ["--test", path.join(repo, "spikes/quality-lab/tests/media.journey.node.test.mjs")], { stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error("the quality lab's media tests failed (see output above)");
}

async function journey(args) {
  mediaTests();
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
    // Stevie's detail levels (#113): the phone levels, their switch, Compare levels and the desktop's level 0.
    await checkLevelsOn(site.url, args);
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
      stevie: "assets/models/stevie/stevie.glb (#107 c1, face #114; see stevie.glb.provenance.json)",
      props: "references/ceiling-3d/props (#34; CC BY 4.0, see references/ceiling-3d/provenance.json)",
    },
    records,
  };
  await writeFile(path.join(outDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
if (command === "groom") await groomJourney(args);
else if (command === "levels") await levelsJourney(args);
else if (command === "journey") await journey(args);
else if (command === "shot") await shot(args);
else if (command === "shots") await shots(args);
else {
  console.error("Usage: node spikes/quality-lab/scripts/lab.mjs groom | levels | journey | shot <file> | shots");
  process.exit(2);
}
process.exit(0);
