# Stevie character-rendering comparison (issue #11)

This re-runs [clockgrove/clockgrove#77](https://github.com/clockgrove/clockgrove/issues/77)'s three-arm comparison in
**Clockgrove's product renderer**, the `ThreeWorldSceneAdapter` that Clockgrove's live yard uses (`WebGPURenderer`,
with a WebGL2 fallback). The renderer is taken from the Clockgrove commit pinned in [`CLOCKGROVE_COMMIT`](../../../CLOCKGROVE_COMMIT).
The report is [`docs/reports/stevie-character-rendering/`](../../../docs/reports/stevie-character-rendering/README.md) and the
decision record is [`docs/adr/character-rendering-decision.md`](../../../docs/adr/character-rendering-decision.md).

## How it is put together

- **The renderer.** `scripts/build.mjs` builds `stevie.html` with the pinned checkout's own Vite and `apps/web/vite.config.ts`.
  It composes them with Raccoon World's shell (`worlds/raccoons/shell.json`) and reviewed atlas (`assets/reviewed/`), the
  same way an external world composes Clockgrove's client. The page imports the renderer from the checkout through the
  `clockgrove-pin/` alias. Nothing is copied: no renderer code, no npm package and no tag. The lights, grade (ACES), bloom,
  fog, camera and quality tiers are the product's own, and every shot is taken at the `high` tier.
- **The yard.** `scripts/yard.mjs` writes `src/yard.json`, a `SceneProjection` built from this repository's pack
  (`worlds/raccoons/`). It holds every placed actor, the presentation bindings and the effects (window, lantern, puddle). The
  placeholder raccoons are left out. No world session or database is involved.
- **The characters.** Each arm (`src/stevie/arm*.ts`, contract in `src/stevie/arm.ts`) adds its characters through the
  renderer's extension point for world-supplied scene content (`RendererContent`,
  [clockgrove#112](https://github.com/clockgrove/clockgrove/issues/112)). Every arm uses lit `MeshStandardNodeMaterial`
  meshes placed with `context.place`, so the scene's own lights, fog, grade and bloom shade them. One page holds every arm
  in one `RendererContent` and shows one arm at a time, so a run uses **one** renderer context per backend.
  - `3d`: the `meshy-fit` model (`references/stevie/77-3d/ship-meshy-fit.glb`) with the spike's fitted quadruped rig and
    its idle and walk clips (`model.ts`, `fit.ts`).
  - `3d-sprites`: the same model and clips, baked to 192 px albedo, normal and depth frames taken from the geometry
    (`bake.ts`). The bake uses one offscreen renderer, which is released once the bake is done.
  - `2d`: Stevie's comparison-only idle and walk strips (`references/stevie/comparison-candidates/`), cut into frames with
    derived normal and depth maps (`sheet.ts`, `arm2d.ts`).
  - `route:*`: close stills of the other #77 routes (`arm-routes.ts`).
- **The runner.** `scripts/stevie.mjs` builds the page and serves it, along with read-only repository inputs under `/repo/`.
  It launches the browser itself and needs only Node built-ins (no Playwright), so the same command drives Windows Edge,
  WSL Chromium and CI's Chrome. The page posts each shot the moment it is taken. The runner writes every PNG, the contact
  sheets and `results.json`, which holds each shot's backend, renderer string, zoom, pixel ratio, visible-pixel count and
  sha256, plus the sha256 of every input.

The product renderer has fixed zoom limits (0.75–2) and a fixed pixel ratio of 1. To shoot the zoom test's close-up and its 2×
device-pixel-ratio frames, the page sets the adapter's camera zoom and renderer pixel ratio directly. It reaches them
through the same handle Clockgrove's own fixture page uses. Every shot made this way is flagged `zoomBeyondClamp` or
`pixelRatioBeyondProduct` in `results.json` and labelled in the report.

## Commands

```sh
bash scripts/clockgrove.sh fetch                     # the pinned Clockgrove checkout (.clockgrove/)
bash scripts/stevie-comparison.sh smoke              # CI's check: each arm draws a visible character on WebGPU
                                                     # and on WebGL2 under SwiftShader (a few minutes)
bash scripts/stevie-comparison.sh full <out-dir>     # the full shot set under SwiftShader
node spikes/stevie-3d/scripts/stevie.mjs --out <dir> --browser <exe> [--browser-arg=<flag>]... \
  [--software] [--backends webgpu,webgl2] [--arms 3d,3d-sprites,2d,...] [--mode full|smoke] --label "<host>"
```

`STEVIE_BROWSER` picks the browser for `stevie-comparison.sh`. `STEVIE_DIST` sends the build to another directory, so two
runs on one checkout don't share a build. Under a software renderer, frame times are recorded as `performance: false` and
printed as "software, not performance".

## The two #77 GPU failures

- **Windows Edge never returned a result within 20 minutes.** The #77 page ran every arm, then posted one record at the
  end. That record held every shot as a base64 PNG: 11 arms × 2 states × 18 shots, several hundred megabytes in one
  JSON string. The page caught errors only inside each arm. The runner learned nothing until that single POST arrived,
  so any stall, uncaught rejection or oversized body looked like a 20-minute silence.
  - **Fix:** the page posts each shot as soon as it is taken and awaits the reply, so memory stays flat. It logs every
    step and forwards `error` and `unhandledrejection` events at once. The runner keeps a stall timer (`--stall-ms`,
    3 minutes) that kills the browser and names the last step logged. It fails immediately when the page reports a fatal
    error or the browser exits. The runner acknowledges a message only after it has stored it, so a shot can't be
    overtaken by the page's final message.
- **WSL Chromium could not create a WebGL context for the Stevie page.** The #77 page made a new WebGL renderer for every
  arm, which with four models came to 11 renderers. It also made a throwaway `WebGLRenderer` to detect KTX2 support, and
  never released any of them. `dispose()` does not free a context. Chromium caps live WebGL contexts per page, and under
  WSL's Mesa d3d12 driver, behind `--use-angle=gl`, it has room for few. The bake-off page made one context and worked
  in the same setup.
  - **Fix:** one product renderer per backend for the whole run, with every arm in one content root. KTX2 support is
    detected on that renderer through the extension point's loaders. The sprite bake uses one offscreen renderer, which
    is disposed once the bake is done. If the renderer cannot start, the page fails the run at once with
    `renderer unavailable`. Otherwise it logs the backend and renderer string, and `results.json` records them for every
    shot.

These two diagnoses are drawn from the #77 code and the maintainer's report. The real-GPU step below confirms them.

## Maintainer step: real GPU (after merge)

Run on the owner's RTX 2060 SUPER. Post the frame times and screenshots on issue #11, along with each run's host label.

- **WSL Chromium with GPU acceleration:**
  `GALLIUM_DRIVER=d3d12 LD_LIBRARY_PATH=/usr/lib/wsl/lib node spikes/stevie-3d/scripts/stevie.mjs --browser <chromium> --browser-arg=--use-gl=angle --browser-arg=--use-angle=gl --browser-arg=--ignore-gpu-blocklist --out <dir> --label "RTX 2060 SUPER, WSL2 Chromium"`
  (for WebGPU, add `--browser-arg=--enable-features=Vulkan`).
- **Windows Edge:**
  `node spikes/stevie-3d/scripts/stevie.mjs --browser "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --browser-arg=--user-data-dir='C:\\Temp\\stevie-edge' --host 127.0.0.1 --out <dir> --label "RTX 2060 SUPER, Windows Edge"`.
  WSL2 forwards Windows `localhost` to the runner's server.

Both runs write `results.json`, with a `performance: true` frame-time record for each arm and state, and the contact
sheets under `sheets/`. If either run fails, issue #11 reopens. The runner's message names the last step the page reached.

## Generating the models (not used by this run)

`scripts/generate.mjs`, `scripts/ship.mjs` and `scripts/png.mjs` are #77's generation and ship scripts, restored by
PR #14. This run spends nothing. Every model, strip and turnaround it uses is already committed under `references/stevie/`.
