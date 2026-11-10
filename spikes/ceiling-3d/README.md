# 3D visual ceiling (issue 34)

This folder holds the page and scripts behind [the report](../../docs/design/3d-ceiling.md): the mockup's main frame rebuilt in real-time 3D at full strength. It uses Clockgrove's stack (Three.js with WebGPU and a WebGL2 fallback, at the version the pinned checkout locks) but is not limited by Clockgrove's renderer or its content seam: it owns its renderer, camera, lights and post. Stevie's rig code is shared with the look proof (`spikes/look-3d/src/stevie.ts`, `fit.ts`), which imports `THREE` from the seam module `apps/web/src/renderer-content.ts`, so that module is in the build graph. Nothing here ships.

- `index.html`, `src/main.ts`: the renderer, lights, post-processing and grade, and `globalThis.ceiling` (view, state, Stevie's clip and pose, rain, hidden objects, measurements).
- `src/look.ts`: the one camera, the mockup anchors and the three lighting states.
- `src/materials.ts`: the one material model: procedural node materials, wetness, the puddle ground and Stevie's fur.
- `src/set.ts`: the yard, laid out by mockup pixel.
- `src/props.ts`: the generated props, fitted into their slots.
- `src/stevie.ts`: Stevie on the #77 rig (reused from `spikes/look-3d`), with shell fur.
- `scripts/serve.mjs`: the Vite configuration over the pinned checkout's Three and Vite. `build` is a compile check; `serve` serves the page on 127.0.0.1 (`?backend=webgl2` forces WebGL2, `?dpr=2` sets the pixel ratio).
- `scripts/ceiling.mjs`: `journey` (the CI check, run by `bash scripts/clockgrove.sh slice`), `capture` (the report's shots and measurements) and `shot` (one frame).
- `scripts/generate.mjs`: the generation ledger for the props (Meshy and Tripo text-to-3D), capped at $75 and recorded in `references/ceiling-3d/provenance.json`.

Nothing is installed here. `CLOCKGROVE_DIR` names the pinned checkout, as in `scripts/clockgrove.sh`.
