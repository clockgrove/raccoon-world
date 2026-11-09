#!/usr/bin/env node
// Builds the comparison page (stevie.html, src/stevie/page.ts) into dist/ with the pinned Clockgrove checkout's
// own Vite and its web app's Vite config, composed with Raccoon World's shell and reviewed atlas exactly as an
// external world composes Clockgrove's client (CLOCKGROVE_WORLD_SHELL, CLOCKGROVE_WORLD_ASSETS). The page
// imports the product renderer from that checkout through the `clockgrove-pin/` alias: no copy of renderer
// code, no npm package. Also copies the pinned Three's basis transcoder beside the page for KTX2 textures.
//
// Usage: node scripts/build.mjs   (CLOCKGROVE_DIR names the checkout; default <repo>/.clockgrove, made by
//                                   `bash scripts/clockgrove.sh fetch`)
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const repo = path.resolve(here, "../..");
export const clockgroveDir = path.resolve(process.env.CLOCKGROVE_DIR ?? path.join(repo, ".clockgrove"));
const pin = (await readFile(path.join(repo, "CLOCKGROVE_COMMIT"), "utf8")).trim();

export async function build() {
  const marker = await readFile(path.join(clockgroveDir, ".raccoon-world-pin"), "utf8").catch(() => "");
  if (marker.trim() !== pin)
    throw new Error(`${clockgroveDir} is not Clockgrove ${pin}; run \`bash scripts/clockgrove.sh fetch\` first`);
  process.env.CLOCKGROVE_WORLD_SHELL = path.join(repo, "worlds/raccoons/shell.json");
  process.env.CLOCKGROVE_WORLD_ASSETS = path.join(repo, "assets/reviewed");
  const web = path.join(clockgroveDir, "apps/web");
  const vite = await import(pathToFileURL(path.join(web, "node_modules/vite/dist/node/index.js")).href);
  // STEVIE_DIST: another output directory, so two runs on one checkout never share a build.
  const dist = path.resolve(process.env.STEVIE_DIST ?? path.join(here, "dist"));
  await vite.build({
    configFile: path.join(web, "vite.config.ts"),
    root: here,
    base: "./",
    logLevel: "warn",
    resolve: { alias: { "clockgrove-pin": clockgroveDir } },
    build: {
      outDir: dist,
      emptyOutDir: true,
      target: "es2022",
      chunkSizeWarningLimit: 4096,
      rollupOptions: { input: path.join(here, "stevie.html") },
    },
  });
  const basis = path.join(web, "node_modules/three/examples/jsm/libs/basis");
  await mkdir(path.join(dist, "decoders"), { recursive: true });
  for (const file of ["basis_transcoder.js", "basis_transcoder.wasm"])
    await copyFile(path.join(basis, file), path.join(dist, "decoders", file));
  await writeMeta(dist);
  return dist;
}

async function writeMeta(dist) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(dist, "build.json"), `${JSON.stringify({ clockgrove: pin }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dist = await build();
  console.log(`built ${path.relative(repo, dist)} against Clockgrove ${pin}`);
}
