// The 3D look proof's Vite configuration (issue 26), composed over the pinned Clockgrove web config as
// Clockgrove's "external renderer composition" recipe describes: every library import (Three, the renderer,
// the contracts, Vite itself) resolves inside the pinned checkout's own frozen install.
//
//   node spikes/look-3d/scripts/serve.mjs build            type-free production build into $TMPDIR (a compile check)
//   node spikes/look-3d/scripts/serve.mjs serve [--webgl2] serve the page on 127.0.0.1 and print its URL
//
// CLOCKGROVE_DIR names the checkout, as in scripts/clockgrove.sh (default: .clockgrove in this repository).
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const spike = fileURLToPath(new URL("..", import.meta.url));
export const repo = path.resolve(spike, "../..");
export const pinned = path.resolve(process.env.CLOCKGROVE_DIR ?? path.join(repo, ".clockgrove"));
/** Stevie: the #77 Meshy multi-image mesh in ship form (KTX2 + meshopt), CC BY 4.0 (Meshy Free plan). */
export const STEVIE_GLB = path.join(repo, "references/stevie/77-3d/ship-meshy-fit.glb");
const BASIS = path.join(pinned, "apps/web/node_modules/three/examples/jsm/libs/basis");

/** The pinned Vite, loaded from the checkout's install so no second copy is used. */
export async function pinnedVite() {
  return import(pathToFileURL(path.join(pinned, "apps/web/node_modules/vite/dist/node/index.js")).href);
}

/** Inline config for `createServer`/`build`; `backend: "webgl2"` forces the renderer's WebGL2 backend. */
export function sliceConfig({ backend = "auto" } = {}) {
  const renderer = path.join(pinned, "apps/web/src/renderer.ts");
  return {
    root: spike,
    configFile: path.join(pinned, "apps/web/vite.config.ts"),
    logLevel: "warn",
    cacheDir: path.join(process.env.TMPDIR ?? os.tmpdir(), "look-3d-vite"),
    resolve: { alias: { "@pin": pinned } },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [spike, pinned, path.dirname(STEVIE_GLB)] } },
    build: { outDir: path.join(process.env.TMPDIR ?? os.tmpdir(), "look-3d-build"), emptyOutDir: true },
    plugins: [
      {
        name: "look-3d-media",
        configureServer(vite) {
          vite.middlewares.use(async (request, response, next) => {
            const url = request.url?.split("?")[0] ?? "";
            try {
              if (url === "/media/stevie.glb") {
                response.setHeader("content-type", "model/gltf-binary");
                response.end(await readFile(STEVIE_GLB));
                return;
              }
              const decoder = url.match(/^\/decoders\/basis\/(basis_transcoder\.(?:js|wasm))$/u)?.[1];
              if (decoder) {
                response.setHeader("content-type", decoder.endsWith(".wasm") ? "application/wasm" : "text/javascript");
                response.end(await readFile(path.join(BASIS, decoder)));
                return;
              }
            } catch (error) {
              next(error);
              return;
            }
            next();
          });
        },
        transform(code, id) {
          // The same switch Clockgrove's own renderer journey uses to run the product renderer on WebGL2.
          if (backend !== "webgl2" || id.split("?")[0] !== renderer) return;
          const forced = code.replace("new THREE.WebGPURenderer({", "new THREE.WebGPURenderer({ forceWebGL: true,");
          if (forced === code) throw new Error("look-3d: the pinned renderer no longer constructs WebGPURenderer as expected");
          return { code: forced, map: null };
        },
      },
    ],
  };
}

export async function serve(options) {
  const { createServer } = await pinnedVite();
  const server = await createServer(sliceConfig(options));
  await server.listen();
  const { port } = server.httpServer.address();
  return { server, url: `http://127.0.0.1:${port}/` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "build") {
    const { build } = await pinnedVite();
    await build(sliceConfig());
    console.log("look-3d: built");
  } else if (command === "serve") {
    const { url } = await serve({ backend: rest.includes("--webgl2") ? "webgl2" : "auto" });
    console.log(`look-3d: serving ${url}`);
  } else {
    console.error("Usage: node spikes/look-3d/scripts/serve.mjs build|serve [--webgl2]");
    process.exit(2);
  }
}
