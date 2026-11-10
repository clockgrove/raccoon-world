// The 3D visual ceiling's Vite configuration (issue 34). The frame uses Clockgrove's stack (Three.js with WebGPU
// and a WebGL2 fallback) at the version the pinned checkout locks, resolved inside that checkout's frozen install,
// but none of Clockgrove's renderer: the page builds its own renderer, camera, lights and post-processing.
//
//   node spikes/ceiling-3d/scripts/serve.mjs build    production build into $TMPDIR (a compile check)
//   node spikes/ceiling-3d/scripts/serve.mjs serve    serve the page on 127.0.0.1 and print its URL
//
// The page picks its backend from the URL: ?backend=webgl2 forces Three's WebGL2 backend (forceWebGL).
// CLOCKGROVE_DIR names the checkout, as in scripts/clockgrove.sh (default: .clockgrove in this repository).
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const spike = fileURLToPath(new URL("..", import.meta.url));
export const repo = path.resolve(spike, "../..");
export const pinned = path.resolve(process.env.CLOCKGROVE_DIR ?? path.join(repo, ".clockgrove"));
/** Stevie: the #77 Meshy multi-image mesh in ship form (KTX2 + meshopt), CC BY 4.0 (Meshy Free plan). */
export const STEVIE_GLB = path.join(repo, "references/stevie/77-3d/ship-meshy-fit.glb");
/** The generated props (Meshy text-to-3D, CC BY 4.0), as references/ceiling-3d/provenance.json records them. */
export const PROPS_DIR = path.join(repo, "references/ceiling-3d/props");

/** The Three.js the pinned web app locks (0.187.0), by its real path so Vite serves one copy. */
export function pinnedThree() {
  return realpathSync(path.join(pinned, "apps/web/node_modules/three"));
}

export async function pinnedVite() {
  return import(pathToFileURL(path.join(pinned, "apps/web/node_modules/vite/dist/node/index.js")).href);
}

export function ceilingConfig() {
  const three = pinnedThree();
  const basis = path.join(three, "examples/jsm/libs/basis");
  const tmp = process.env.TMPDIR ?? os.tmpdir();
  return {
    root: spike,
    configFile: false,
    logLevel: "warn",
    cacheDir: path.join(tmp, "ceiling-3d-vite"),
    resolve: {
      alias: [
        { find: /^three\/webgpu$/u, replacement: path.join(three, "build/three.webgpu.js") },
        { find: /^three\/tsl$/u, replacement: path.join(three, "build/three.tsl.js") },
        { find: /^three\/addons\//u, replacement: `${path.join(three, "examples/jsm")}/` },
        { find: /^@pin\//u, replacement: `${pinned}/` },
      ],
    },
    server: { host: "127.0.0.1", port: 0, fs: { strict: false } },
    build: { outDir: path.join(tmp, "ceiling-3d-build"), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
    plugins: [
      {
        name: "ceiling-3d-media",
        configureServer(vite) {
          vite.middlewares.use(async (request, response, next) => {
            const url = request.url?.split("?")[0] ?? "";
            try {
              if (url === "/media/stevie.glb") {
                response.setHeader("content-type", "model/gltf-binary");
                response.end(await readFile(STEVIE_GLB));
                return;
              }
              const prop = url.match(/^\/media\/props\/([a-z-]+\.glb)$/u)?.[1];
              if (prop) {
                const bytes = await readFile(path.join(PROPS_DIR, prop)).catch(() => null);
                if (!bytes || bytes.subarray(0, 4).toString() !== "glTF") {
                  // Missing, or an un-smudged Git LFS pointer: the page falls back to its procedural stand-in.
                  response.statusCode = 404;
                  response.end();
                  return;
                }
                response.setHeader("content-type", "model/gltf-binary");
                response.end(bytes);
                return;
              }
              const decoder = url.match(/^\/decoders\/basis\/(basis_transcoder\.(?:js|wasm))$/u)?.[1];
              if (decoder) {
                response.setHeader("content-type", decoder.endsWith(".wasm") ? "application/wasm" : "text/javascript");
                response.end(await readFile(path.join(basis, decoder)));
                return;
              }
            } catch (error) {
              next(error);
              return;
            }
            next();
          });
        },
      },
    ],
  };
}

export async function serve() {
  const { createServer } = await pinnedVite();
  const server = await createServer(ceilingConfig());
  await server.listen();
  const { port } = server.httpServer.address();
  return { server, url: `http://127.0.0.1:${port}/` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  if (command === "build") {
    const { build } = await pinnedVite();
    await build(ceilingConfig());
    console.log("ceiling-3d: built");
  } else if (command === "serve") {
    const { url } = await serve();
    console.log(`ceiling-3d: serving ${url} (add ?backend=webgl2 for the WebGL2 backend)`);
  } else {
    console.error("Usage: node spikes/ceiling-3d/scripts/serve.mjs build|serve");
    process.exit(2);
  }
}
