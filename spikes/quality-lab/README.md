# Quality lab (issue 45)

The page and scripts behind [the report](../../docs/design/quality-lab.md). The page is the #34 ceiling's yard at dusk and night in rain, with Stevie (c3 on the shared raccoon rig, #54) walking a loop. Every effect has its own switch, there are four presets, and two buttons run the measurements: **Run the sweep** and **Find the ceiling**. It uses Clockgrove's stack at the pinned version (three.js WebGPU with the WebGL2 fallback, three's own TSL add-ons only). Nothing here ships.

- `index.html`, `src/main.ts`: the renderer, the scene (reused from `spikes/ceiling-3d/src`), the effects' scene-side switches, measurement (frame intervals, plus WebGPU timestamp queries), screenshots, and `globalThis.lab`.
- `src/config.ts`: the knobs and their levels, the presets, the sweep's steps, the ceiling's step-down and budgets, and the `LabHandle` type.
- `src/pipeline.ts`: the post graph, rebuilt per config: MSAA, GTAO, haze, god rays, TRAA, TAAU, FSR 1, bloom, tone mapping and grade.
- `src/stevie.ts`: c3-rigged with its `walk` clip, moving at `speedMps` round the loop, plus fur shells (0, 4, 8 or 16) and fins.
- `src/runner.ts`, `src/ui.ts`: the sweep and the ceiling search, and the panel (a side panel on desktop, a bottom sheet that starts folded on a phone): live fps; switches and presets edit a draft that **Apply** rebuilds once (the panel stays usable, and a still of the yard holds the screen meanwhile); a slow-device banner, the results table, Copy results (every number, compact, for pasting back) and Download JSON.
- Loading: `index.html` and `main.ts` show a checklist (graphics, the model downloads against `media/manifest.json`, shaders and first frame), each step timed, with a note and Try again after a stall.
- `src/detail.ts`: Geometry detail, the triangle stress tier. The set and its props are drawn at 1, 4, 16 or 64 times their triangles (each step splits every triangle into four at its edge midpoints, so shapes, normals and UVs hold), plus the scene's triangle count. **Triangle budget** (`findTriangleBudget` in `src/runner.ts`) keeps the current effects and raises detail until the p95 frame time misses 60 fps. With GPU timestamps it also estimates the triangle count at which the GPU would use 80% of a 60 fps frame. The sweep stops at 16×; only this run goes to 64×, and only after 16× holds.
- **Run everything** (Results) runs, holding a screen wake lock so a phone doesn't suspend the page:
  - the sweep, in the yard view and then the four presets again at the close-up zoom;
  - the ceiling;
  - the triangle budget;
  - the **cast budget**: the ceiling's effects with 1, 3, 10 and 20 raccoons walking (clones of Stevie's rig, each with his fur), giving GPU and main-thread milliseconds per raccoon and how many fit at 60 fps;
  - a 90 s **soak** at the ceiling, in 10 s windows, whose last-to-first ratio shows a device slowing as it heats.

  Every step records frame time (p50, p95, p99 and the share of dropped frames), GPU time, main-thread time in the render call, draw calls, triangles, the shader-compile stall and the JS heap. Every report records the display's refresh, cores, memory, screen and load times.

**Copy results** copies every number as a slim table (`slimJson`: one row per step, device fields once) to paste back. A step whose page went into the background (no frames drawn) is measured again once the page is in front, and after three tries is an error, never blank times.

- `scripts/serve.mjs`: `serve` (a dev server) and `build` (the static site with its media; relative URLs, so it works under GitHub Pages' sub-path).
- `scripts/lab.mjs`: `journey` (the CI check, run by `bash scripts/clockgrove.sh slice`), `shot`, and `shots` (the report's images).
- `scripts/report.mjs`: writes the report's tables from the results JSON saved under `results/`.
- `pages/pages.yml`: the GitHub Pages workflow, which the owner session installs as `.github/workflows/pages.yml` after this lands (publishing approved by Kirk, 2026-11-11).

Nothing is installed here. `CLOCKGROVE_DIR` names the pinned checkout, as in `scripts/clockgrove.sh`.
