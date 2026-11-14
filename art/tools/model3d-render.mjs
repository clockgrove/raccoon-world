// Renders a handed-off rigged GLB through the pinned Clockgrove renderer's world-content seam
// (clockgrove/clockgrove#112), mirroring Clockgrove's own "loads a validated rigged GLB and renders its idle clip
// through world content" journey (#281).
//
//   node art/tools/model3d-render.mjs <world-dir> <manifest>
//
// <world-dir> is a throwaway copy of this repository holding the model; <manifest> is the world manifest path
// relative to it. CLOCKGROVE_DIR names the pinned checkout (default: .clockgrove in this repository).
// The hand-off's uncompressed 2048 px maps are resampled to 512 px in the content module: the renderer starts
// at its low tier, whose texture ceiling they overrun (the shipped KTX2 build step is target-side).
// Exit 0 with one JSON line on success, 1 on a failed check, 2 on a usage or pin error.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TIMEOUT_MS = 240_000;
const SWIFTSHADER = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const [worldArg, manifestArg] = process.argv.slice(2);
if (!worldArg || !manifestArg) {
  console.error("Usage: node art/tools/model3d-render.mjs <world-dir> <manifest>");
  process.exit(2);
}
const world = path.resolve(worldArg);
const pinned = path.resolve(process.env.CLOCKGROVE_DIR ?? path.join(repo, ".clockgrove"));
const pinFile = path.join(pinned, ".raccoon-world-pin");
const expected = (await readFile(path.join(repo, "CLOCKGROVE_COMMIT"), "utf8")).trim();
const actual = existsSync(pinFile) ? (await readFile(pinFile, "utf8")).trim() : "";
if (actual !== expected) {
  console.error(`model3d-render: ${pinned} is at "${actual || "no pin"}", not the pinned ${expected}`);
  process.exit(2);
}

const fail = (message) => {
  throw new Error(message);
};

const timer = setTimeout(() => {
  console.error(`model3d-render: FAILED: timed out after ${TIMEOUT_MS / 1000} s`);
  process.exit(1);
}, TIMEOUT_MS);
timer.unref();

const work = path.join(world, "model3d-render");
let server;
let browser;
let code = 0;
try {
  const manifest = JSON.parse(await readFile(path.join(world, manifestArg), "utf8"));
  const sourcePath = manifest.source?.path;
  const idle = manifest.model?.clips?.find((clip) => clip.name === "idle");
  if (typeof sourcePath !== "string") fail("the manifest has no source.path");
  if (!idle) fail("the manifest lists no idle clip");

  const { chromium } = await import(pathToFileURL(path.join(pinned, "node_modules/playwright/index.mjs")).href);
  if (!existsSync(chromium.executablePath())) {
    const installed = spawnSync(process.execPath, [path.join(pinned, "node_modules/playwright/cli.js"), "install", "chromium"], {
      stdio: ["ignore", process.stderr, process.stderr],
    });
    if (installed.status !== 0) fail("could not install Playwright's Chromium");
  }
  const { createServer } = await import(pathToFileURL(path.join(pinned, "apps/web/node_modules/vite/dist/node/index.js")).href);
  const { neutralShell } = await import(pathToFileURL(path.join(pinned, "apps/web/src/shell-input.ts")).href);

  await mkdir(work, { recursive: true });
  const toPinned = `${path.relative(work, pinned).split(path.sep).join("/")}/`;
  for (const file of ["index.html", "main.ts", "snapshot.json"]) {
    const text = await readFile(path.join(pinned, "worlds/fixture/renderer", file), "utf8");
    await writeFile(path.join(work, file), text.replaceAll("../../../", toPinned));
  }
  await writeFile(
    path.join(work, "content.ts"),
    `
export const diagnostics: any = { setAnchor() {}, setModelAnchor() {} };
export function fixtureContent() {
  return { version: 1, async create(context: any) {
    const { THREE } = context;
    const { gltf } = await context.loaders({ basis: "/decoders/", draco: "/decoders/" });
    const loaded = await gltf.loadAsync(${JSON.stringify(`/${sourcePath}`)});
    // The renderer starts at the low tier, whose 16 MiB texture ceiling the uncompressed 2048 px maps overrun
    // (the content then fails as content_contract), so the maps are resampled to 512 px before they are placed.
    const shrunk = new Set<any>();
    const fit: Promise<void>[] = [];
    loaded.scene.traverse((object: any) => {
      for (const material of [object.material].flat().filter(Boolean)) {
        for (const value of Object.values(material)) {
          const texture: any = value;
          if (!texture?.isTexture || shrunk.has(texture) || !texture.image || texture.image.width <= 512) continue;
          shrunk.add(texture);
          fit.push(createImageBitmap(texture.image, { resizeWidth: 512, resizeHeight: 512, resizeQuality: "high" }).then((bitmap) => {
            texture.image = bitmap;
            texture.needsUpdate = true;
          }));
        }
      }
    });
    await Promise.all(fit);
    const root = new THREE.Group();
    root.add(loaded.scene);
    context.place(root, { x: -2, y: -2 });
    let model: any;
    loaded.scene.traverse((object: any) => { if (object.isSkinnedMesh) model = object; });
    const clip = loaded.animations.find((animation: any) => animation.name === "idle");
    const mixer = new THREE.AnimationMixer(loaded.scene);
    let poseMs: number | undefined;
    mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
    Object.assign(diagnostics, { model, clip, root,
      pose(ms: number) { poseMs = ms; mixer.setTime(ms / 1000); },
    });
    return { root, update(frame: any) { mixer.setTime((poseMs ?? frame.timeMs) / 1000); },
      dispose() { mixer.stopAllAction(); mixer.uncacheRoot(loaded.scene); } };
  } };
}
`,
  );

  server = await createServer({
    root: world,
    configFile: path.join(pinned, "apps/web/vite.config.ts"),
    logLevel: "error",
    cacheDir: path.join(process.env.TMPDIR ?? os.tmpdir(), "model3d-render-vite"),
    define: { __WORLD_SHELL__: JSON.stringify(neutralShell) },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [pinned, world] } },
  });
  await server.listen();
  browser = await chromium.launch({ headless: true, args: SWIFTSHADER });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.setDefaultTimeout(120_000);
  page.on("console", (m) => m.type() === "error" && console.error(`model3d-render: console error: ${m.text()}`));
  page.on("requestfailed", (r) => console.error(`model3d-render: request failed: ${r.url()}`));
  page.on("pageerror", (error) => console.error(`model3d-render: page error: ${error.message}`));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/model3d-render/`);
  try {
    await page.waitForFunction(
      () =>
        globalThis.fixtureRenderer?.adapter.metrics.contentStatus === "ready" &&
        globalThis.fixtureRenderer?.adapter.metrics.firstRenderMs !== undefined,
    );
  } catch (error) {
    const state = await page.evaluate(() => JSON.stringify({ status: globalThis.fixtureRenderer?.adapter.metrics.contentStatus, failure: globalThis.fixtureRenderer?.adapter.metrics.contentFailure, tier: globalThis.fixtureRenderer?.adapter.tier, bytes: globalThis.fixtureRenderer?.adapter.resourceTextureBytes})).catch(() => "unavailable");
    fail(`content never became ready (${error.message.split("\n")[0]}); renderer state ${state}`);
  }
  const rendered = await page.evaluate(async (poseMs) => {
    const f = globalThis.fixtureRenderer;
    f.setReducedMotion(true);
    f.setEnvironment(43_200_000, 0);
    const d = f.diagnostics;
    const capture = async () => {
      await new Promise(requestAnimationFrame);
      return f.capture();
    };
    d.pose(0);
    const idle = await capture();
    d.model.visible = false;
    const absent = await capture();
    d.model.visible = true;
    d.pose(poseMs.moving);
    const moving = await capture();
    d.pose(poseMs.loop);
    const looped = await capture();
    return {
      skinned: d.model.isSkinnedMesh,
      bones: d.model.skeleton.bones.length,
      clip: [d.clip.name, d.clip.duration],
      idle,
      absent,
      moving,
      looped,
      status: f.adapter.metrics.contentStatus,
    };
  }, { moving: idle.durationMs / 2, loop: idle.durationMs });

  const problems = [];
  if (rendered.skinned !== true) problems.push("the model has no SkinnedMesh");
  if (rendered.bones !== manifest.model.bones) problems.push(`the skeleton has ${rendered.bones} bones, the manifest says ${manifest.model.bones}`);
  if (rendered.clip[0] !== "idle") problems.push(`the clip is named "${rendered.clip[0]}", not idle`);
  if (Math.abs(rendered.clip[1] * 1000 - idle.durationMs) > 1e-3) problems.push(`the idle clip lasts ${rendered.clip[1] * 1000} ms, the manifest says ${idle.durationMs} ms`);
  if (rendered.status !== "ready") problems.push(`content status is ${rendered.status}`);
  if (rendered.idle === rendered.absent) problems.push("the idle frame equals the frame without the model");
  if (rendered.moving === rendered.idle) problems.push("the mid-clip frame equals the idle frame");
  if (rendered.looped !== rendered.idle) problems.push("the frame at the clip duration differs from the first frame (the clip does not loop)");
  if (problems.length > 0) fail(problems.join("; "));

  console.log(JSON.stringify({ status: "ok", skinned: rendered.skinned, bones: rendered.bones, clip: rendered.clip, contentStatus: rendered.status }));
} catch (error) {
  console.error(`model3d-render: FAILED: ${error instanceof Error ? error.message : error}`);
  code = 1;
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await rm(work, { recursive: true, force: true });
}
process.exit(code);
