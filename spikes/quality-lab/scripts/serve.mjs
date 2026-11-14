// The quality lab's Vite configuration (issue 45), over the pinned Clockgrove checkout's Three and Vite, like the
// ceiling's (spikes/ceiling-3d/scripts/serve.mjs). The build is a static site with relative URLs, so it works under
// any path, such as GitHub Pages' /raccoon-world/: the page, plus the media it loads copied beside it.
//
//   node spikes/quality-lab/scripts/serve.mjs build [--out <dir>]   static site (default $TMPDIR/quality-lab-site)
//   node spikes/quality-lab/scripts/serve.mjs serve                 dev server on 127.0.0.1, prints its URL
//
// URL parameters: ?backend=webgl2 forces Three's WebGL2 backend, ?preset=ultra|high|medium|low the starting preset,
// ?view=close, ?state=night, ?platform=phone|desktop overrides the detected platform, ?ui=0 hides the panel.
// CLOCKGROVE_DIR names the checkout, as in scripts/clockgrove.sh (default: .clockgrove in this repository).
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const lab = fileURLToPath(new URL("..", import.meta.url));
export const repo = path.resolve(lab, "../..");
export const pinned = path.resolve(process.env.CLOCKGROVE_DIR ?? path.join(repo, ".clockgrove"));
/** Stevie: Kirk's approved look-dev c1, Assetforge f9dda1b (#107). */
export const STEVIE_GLB = path.join(repo, "assets/models/stevie/stevie.glb");
/** The ceiling's generated props (#34), as references/ceiling-3d/provenance.json records them. */
export const PROPS_DIR = path.join(repo, "references/ceiling-3d/props");

const tmp = process.env.TMPDIR ?? os.tmpdir();
export const SITE = path.join(tmp, "quality-lab-site");

export function pinnedThree() {
  return realpathSync(path.join(pinned, "apps/web/node_modules/three"));
}

export async function pinnedVite() {
  return import(pathToFileURL(path.join(pinned, "apps/web/node_modules/vite/dist/node/index.js")).href);
}

const isGlb = (bytes) => bytes && bytes.subarray(0, 4).toString() === "glTF";
const isMedia = (key, bytes) => bytes && (key.endsWith(".glb") ? isGlb(bytes) : !bytes.subarray(0, 42).toString().startsWith("version https://git-lfs.github.com/spec/v1"));
const mediaType = (key) => ({ ".glb": "model/gltf-binary", ".ktx2": "image/ktx2", ".png": "image/png", ".json": "application/json" })[path.extname(key)] ?? "application/octet-stream";

/** The web media (spikes/stevie-3d/scripts/web-media.mjs): KTX2 textures and meshopt geometry, same triangles. */
export const WEB_MEDIA = path.join(repo, "references/web-media");

/** The web-media file for a source, or null when there is none or its recorded source sha256 no longer matches. */
async function webMedia(name, source) {
  const manifest = JSON.parse(await readFile(path.join(WEB_MEDIA, "web-media.json"), "utf8").catch(() => '{"files":{}}'));
  const entry = manifest.files[`${name}.glb`];
  const bytes = await readFile(source).catch(() => null);
  if (!entry || !isGlb(bytes)) return null;
  let stale = createHash("sha256").update(bytes).digest("hex") !== entry.sourceSha256;
  for (const [dependency, expected] of Object.entries(entry.sourceDependencies ?? {})) {
    const dependencyBytes = await readFile(path.join(repo, dependency)).catch(() => null);
    if (!dependencyBytes || createHash("sha256").update(dependencyBytes).digest("hex") !== expected) stale = true;
  }
  if (stale) {
    console.warn(`quality-lab: references/web-media/${name}.glb is stale (its source changed); serving the source. Rerun web-media.mjs lab.`);
    return null;
  }
  const output = path.join(WEB_MEDIA, `${name}.glb`);
  const shipped = await readFile(output).catch(() => null);
  if (!isGlb(shipped) || createHash("sha256").update(shipped).digest("hex") !== entry.sha256) return null;
  return output;
}

/**
 * Every media file the page loads: URL path under media/ → file. The page loads the web media; `source/…` keeps the
 * uncompressed sources beside them for `?media=source`. A missing or un-smudged prop is left out.
 */
export async function mediaFiles() {
  const prefix = "assets/models/stevie";
  const sourceManifest = path.join(repo, prefix, "manifest.json");
  const model = JSON.parse(await readFile(sourceManifest, "utf8")).model;
  const phone = model.tiers.phone;
  const sources = { "stevie.glb": ["stevie", STEVIE_GLB] };
  // The detail levels: the desktop's files, and the phone tier's with 1024 px textures.
  for (const [key, level] of Object.entries(model.levels))
    sources[`stevie.${key}.glb`] = [`stevie.${key}`, path.join(repo, level.path)];
  for (const [key, level] of Object.entries(phone.levels))
    sources[`stevie.phone.${key}.glb`] = [`stevie.phone.${key}`, path.join(repo, level.path)];
  for (const name of await readdir(PROPS_DIR).catch(() => []))
    if (name.endsWith(".glb")) sources[`props/${name}`] = [`prop-${name.slice(0, -4)}`, path.join(PROPS_DIR, name)];
  const files = {};
  for (const [key, [name, source]] of Object.entries(sources)) {
    files[key] = (await webMedia(name, source)) ?? source;
    files[`source/${key}`] = source;
  }
  const sideMaps = (side) => [side.textures.baseColor, side.textures.tint.winter, side.eyes,
    ...Object.values(side.groom).flatMap((coat) => Object.values(coat))].filter(Boolean);
  const maps = [...sideMaps(model), ...sideMaps(phone)];
  const webManifest = JSON.parse(await readFile(path.join(WEB_MEDIA, "web-media.json"), "utf8"));
  const manifestEntry = webManifest.files[`${prefix}/manifest.json`];
  let compressed = manifestEntry?.sourceSha256 === createHash("sha256").update(await readFile(sourceManifest)).digest("hex");
  for (const map of maps) {
    const key = map.path.replace(/\.png$/u, ".ktx2");
    const entry = webManifest.files[key];
    const bytes = await readFile(path.join(repo, map.path));
    const output = await readFile(path.join(WEB_MEDIA, key)).catch(() => null);
    if (!entry || entry.sourceSha256 !== createHash("sha256").update(bytes).digest("hex") || !isMedia(key, output)
      || createHash("sha256").update(output).digest("hex") !== entry.sha256) compressed = false;
  }
  // A level file served from its source keeps relative image URIs beside it.
  const servesSource = Object.entries(files).some(([key, file]) => /^stevie(\.\w+)*\.glb$/u.test(key) && !file.startsWith(WEB_MEDIA));
  for (const map of maps) {
    const key = compressed ? map.path.replace(/\.png$/u, ".ktx2") : map.path;
    files[key] = path.join(compressed ? WEB_MEDIA : repo, key);
    // The original GLB has relative external image URIs, including in ?media=source mode.
    files[`source/${path.basename(map.path)}`] = path.join(repo, map.path);
    if (servesSource) files[path.basename(map.path)] = path.join(repo, map.path);
  }
  files[`${prefix}/manifest.json`] = compressed ? path.join(WEB_MEDIA, prefix, "manifest.json") : sourceManifest;
  files[`${prefix}/source-manifest.json`] = sourceManifest;
  files[`${prefix}/stevie.glb.provenance.json`] = `${STEVIE_GLB}.provenance.json`;
  return files;
}

/** three's Basis Universal transcoder, which the page's KTX2 loader fetches from basis/. */
const basisFiles = () => ["basis_transcoder.js", "basis_transcoder.wasm"].map((f) => path.join(pinnedThree(), "examples/jsm/libs/basis", f));

export function labConfig(outDir = SITE) {
  const three = pinnedThree();
  return {
    root: lab,
    base: "./",
    configFile: false,
    logLevel: "warn",
    cacheDir: path.join(tmp, "quality-lab-vite"),
    resolve: {
      alias: [
        { find: /^three\/webgpu$/u, replacement: path.join(three, "build/three.webgpu.js") },
        { find: /^three\/tsl$/u, replacement: path.join(three, "build/three.tsl.js") },
        { find: /^three\/addons\//u, replacement: `${path.join(three, "examples/jsm")}/` },
        { find: /^@pin\//u, replacement: `${pinned}/` },
      ],
    },
    server: { host: "127.0.0.1", port: 0, fs: { strict: false } },
    build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 4000, target: "es2022" },
    plugins: [
      {
        name: "quality-lab-media",
        configureServer(vite) {
          vite.middlewares.use(async (request, response, next) => {
            const url = request.url?.split("?")[0] ?? "";
            if (url === "/media/manifest.json") {
              response.setHeader("content-type", "application/json");
              response.end(JSON.stringify(await mediaManifest()));
              return;
            }
            const basis = url.match(/^\/basis\/(basis_transcoder\.(?:js|wasm))$/u)?.[1];
            if (basis) {
              response.setHeader("content-type", basis.endsWith(".wasm") ? "application/wasm" : "text/javascript");
              response.end(await readFile(path.join(pinnedThree(), "examples/jsm/libs/basis", basis)));
              return;
            }
            const key = url.startsWith("/media/") ? url.slice("/media/".length) : null;
            if (!key) return next();
            const file = (await mediaFiles())[key];
            const bytes = file ? await readFile(file).catch(() => null) : null;
            if (!isMedia(key, bytes)) {
              // Missing, or an un-smudged Git LFS pointer: a prop falls back to its procedural stand-in.
              response.statusCode = 404;
              response.end();
              return;
            }
            response.setHeader("content-type", mediaType(key));
            response.end(bytes);
          });
        },
      },
    ],
  };
}

/** The media the page will download, file → bytes, for its loading checklist (only real glTF binaries count). */
export async function mediaManifest() {
  const manifest = {};
  for (const [key, file] of Object.entries(await mediaFiles())) {
    const bytes = await readFile(file).catch(() => null);
    if (isMedia(key, bytes)) manifest[key] = bytes.length;
  }
  return manifest;
}

/** Builds the static site into outDir and copies the media beside it. Refuses an LFS pointer for Stevie. */
export async function buildSite(outDir = SITE) {
  const { build } = await pinnedVite();
  await build(labConfig(outDir));
  const copied = [];
  for (const [key, file] of Object.entries(await mediaFiles())) {
    const bytes = await readFile(file).catch(() => null);
    if (!isMedia(key, bytes)) {
      if (!key.includes("props/")) throw new Error(`${file} is missing or a Git LFS pointer (is Git LFS fetched?)`);
      continue;
    }
    const target = path.join(outDir, "media", key);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(file, target);
    copied.push(key);
  }
  await writeFile(path.join(outDir, "media", "manifest.json"), JSON.stringify(await mediaManifest()));
  await mkdir(path.join(outDir, "basis"), { recursive: true });
  for (const file of basisFiles()) await copyFile(file, path.join(outDir, "basis", path.basename(file)));
  return { outDir, media: copied };
}

export async function serve() {
  const { createServer } = await pinnedVite();
  const server = await createServer(labConfig());
  await server.listen();
  const { port } = server.httpServer.address();
  return { server, url: `http://127.0.0.1:${port}/` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "build") {
    const at = rest.indexOf("--out");
    const out = at >= 0 ? path.resolve(rest[at + 1]) : SITE;
    const { media } = await buildSite(out);
    console.log(`quality-lab: built ${out} (media: ${media.join(", ")})`);
  } else if (command === "serve") {
    const { url } = await serve();
    console.log(`quality-lab: serving ${url} (add ?backend=webgl2 for the WebGL2 backend)`);
  } else {
    console.error("Usage: node spikes/quality-lab/scripts/serve.mjs build [--out <dir>] | serve");
    process.exit(2);
  }
}
