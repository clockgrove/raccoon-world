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
import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const lab = fileURLToPath(new URL("..", import.meta.url));
export const repo = path.resolve(lab, "../..");
export const pinned = path.resolve(process.env.CLOCKGROVE_DIR ?? path.join(repo, ".clockgrove"));
/** Stevie: Kirk's wave 0 pick c3, re-rigged on the shared raccoon rig with the generated walk (#54). */
export const STEVIE_GLB = path.join(repo, "references/stevie/3d-wave0-candidates/c3-rigged/c3-rigged.glb");
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

/** Every media file the page loads: URL path under media/ → file. A missing or un-smudged prop is left out. */
export async function mediaFiles() {
  const files = { "stevie.glb": STEVIE_GLB };
  for (const name of await readdir(PROPS_DIR).catch(() => [])) if (name.endsWith(".glb")) files[`props/${name}`] = path.join(PROPS_DIR, name);
  return files;
}

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
            const key = url.match(/^\/media\/((?:props\/)?[a-z0-9-]+\.glb)$/u)?.[1];
            if (!key) return next();
            const file = (await mediaFiles())[key];
            const bytes = file ? await readFile(file).catch(() => null) : null;
            if (!isGlb(bytes)) {
              // Missing, or an un-smudged Git LFS pointer: a prop falls back to its procedural stand-in.
              response.statusCode = 404;
              response.end();
              return;
            }
            response.setHeader("content-type", "model/gltf-binary");
            response.end(bytes);
          });
        },
      },
    ],
  };
}

/** Builds the static site into outDir and copies the media beside it. Refuses an LFS pointer for Stevie. */
export async function buildSite(outDir = SITE) {
  const { build } = await pinnedVite();
  await build(labConfig(outDir));
  const copied = [];
  for (const [key, file] of Object.entries(await mediaFiles())) {
    const bytes = await readFile(file).catch(() => null);
    if (!isGlb(bytes)) {
      if (key === "stevie.glb") throw new Error(`${file} is not a glTF binary (is Git LFS fetched?)`);
      continue;
    }
    const target = path.join(outDir, "media", key);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(file, target);
    copied.push(key);
  }
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
