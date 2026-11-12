# Quality lab (issue 45)

The page and scripts behind [the report](../../docs/design/quality-lab.md). The page is the #34 ceiling's yard at dusk and night in rain, with Stevie (c3 on the shared raccoon rig, #54) walking a loop. Every effect has its own switch, there are four presets, and two buttons run the measurements: **Run the sweep** and **Find the ceiling**. It uses Clockgrove's stack at the pinned version (three.js WebGPU with the WebGL2 fallback, three's own TSL add-ons only). Nothing here ships.

- `index.html`, `src/main.ts`: the renderer, the scene (reused from `spikes/ceiling-3d/src`), the effects' scene-side switches, measurement (frame intervals, plus WebGPU timestamp queries), screenshots, and `globalThis.lab`.
- `src/config.ts`: the knobs and their levels, the presets, the sweep's steps, the ceiling's step-down and budgets, and the `LabHandle` type.
- `src/pipeline.ts`: the post graph, rebuilt per config: MSAA, GTAO, haze, god rays, TRAA, TAAU, FSR 1, bloom, tone mapping and grade.
- `src/stevie.ts`: c3-rigged with its `walk` clip, moving at `speedMps` round the loop, plus fur shells (0, 4, 8 or 16) and fins.
- `src/runner.ts`, `src/ui.ts`: the sweep and the ceiling search, and the panel (a side panel on desktop, a bottom sheet that starts folded on a phone): live fps; switches and presets edit a draft that **Apply** rebuilds once (the panel stays usable, and a still of the yard holds the screen meanwhile); a slow-device banner, the results table, send link, copy and download.
- Loading: `index.html` and `main.ts` show a checklist (graphics, the model downloads against `media/manifest.json`, shaders and first frame), each step timed, with a note and Try again after a stall.
- `scripts/serve.mjs`: `serve` (a dev server) and `build` (the static site with its media; relative URLs, so it works under GitHub Pages' sub-path).
- `scripts/lab.mjs`: `journey` (the CI check, run by `bash scripts/clockgrove.sh slice`), `shot`, and `shots` (the report's images).
- `scripts/report.mjs`: writes the report's tables from the results JSON saved under `results/`.
- `pages/pages.yml`: the GitHub Pages workflow, which the owner session installs as `.github/workflows/pages.yml` after this lands (publishing approved by Kirk, 2026-11-11).

Nothing is installed here. `CLOCKGROVE_DIR` names the pinned checkout, as in `scripts/clockgrove.sh`.
