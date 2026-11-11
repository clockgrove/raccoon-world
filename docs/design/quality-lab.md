# Quality lab: what the 3D look costs, per effect and per device (issue 45)

The quality lab is one page ([`spikes/quality-lab/`](../../spikes/quality-lab/README.md)). Open it on a desktop or a phone, press one button, and it measures what Raccoon World's 3D look costs on that device: every preset, every effect on its own, and the highest configuration the device can hold. It applies the owner's quality policy ([visual-decisions.md](visual-decisions.md), Kirk, 2026-11-10): maximum quality on every platform, phones included. A phone runs a lower tier only where it measurably can't hold the top one. Its runs replace the real-device measurements still pending from #26 and #34.

**Measured numbers come only from Kirk's own devices.** Until he runs the lab, every real-device row below is marked pending. CI renders every config on a software GPU and reports no times.

![The lab at dusk in rain: the yard view, High preset](../../references/quality-lab/yard-dusk.png)

| Night in rain | The close-up: Stevie walking, about a third of the frame height |
| --- | --- |
| ![The lab at night](../../references/quality-lab/yard-night.png) | ![The close-up at dusk](../../references/quality-lab/close-dusk.png) |

These are SwiftShader (software GPU) renders of the High preset at 1280 × 720 and DPR 2, made by `node spikes/quality-lab/scripts/lab.mjs shots`. They show the picture, not its cost. Provenance: [`references/quality-lab/provenance.json`](../../references/quality-lab/provenance.json).

## What the page draws

- **The scene:** the #34 ceiling's yard (house corner, porch and lantern, tree, fences, stepping stones, puddles, foliage and the generated props), reused from `spikes/ceiling-3d/src`. It uses the ceiling's camera, lighting model, materials and grade, at **dusk in rain** and at **night in rain**.
- **Stevie:** Kirk's wave 0 pick, c3, re-rigged on the shared raccoon rig ([`c3-rigged.glb`](../../references/stevie/3d-wave0-candidates/c3-rigged/README.md), #54: 0.45 m, 30 joints, one generated `walk` clip of 743 ms, played in place). He walks a 0.65 m-radius loop over the puddles and stepping stones in front of the porch steps. He moves at the clip's recorded 0.268 m/s, so his feet stay planted. The GLB doesn't store `speedMps` yet, so the page reads it when present and falls back to that recorded value.
- **Two cameras:** the yard view (the ceiling's main frame) and a close-up that follows Stevie at the zoom where he fills about a third of the frame height, so his walk can be judged.
- **Stack:** three.js r187 (the version the pinned Clockgrove locks), WebGPU with the WebGL2 fallback (`?backend=webgl2`), and only three's own TSL add-ons. There's no pmndrs postprocessing, N8AO or three-good-godrays.

## Effects, presets and how they're measured

Each effect is one switch (one knob in [`config.ts`](../../spikes/quality-lab/src/config.ts)), with its levels listed best first:

| Effect | Levels | three.js add-on or code | Ultra | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- |
| Fur shells | 16, 8, 4, 0 | Skinned shells, ceiling `furShell` | 16 | 8 | 4 | 0 |
| Fur fins | on, off | Spike code: skinned edge quads | on | on | off | off |
| Volumetric haze | on, off | `VolumeNodeMaterial` ray-march, quarter-resolution pass, `gaussianBlur` | on | off | off | off |
| Light shafts | on, off | `GodraysNode` from the porch lantern | on | off | off | off |
| Ambient occlusion | on, off | `GTAONode`, half resolution | on | on | off | off |
| Light probes | on, off | `LightProbeGrid`, a 4 × 4 × 2 grid baked once | on | on | off | off |
| Key-light cascades | on, off (one 2048² map) | `CSMShadowNode`, 3 cascades | on | on | off | off |
| Point-light shadows | on, off | Lantern and lamp-post cube shadows | on | on | off | off |
| Rain particles | 5000, 2600, 1600, 800 | Ceiling `rain` (instanced streaks) | 5000 | 2600 | 1600 | 800 |
| Rain splashes | on, off | Spike code: 600 instanced rings, TSL-animated | on | on | off | off |
| Puddle ripples | on, off | Ceiling ground material, `rippleStrength` | on | on | on | off |
| Puddle reflections | on, off | `reflector` (half resolution) | on | on | off | off |
| Bloom | on, off | `BloomNode` | on | on | on | off |
| Grade | on, off | Ceiling grade (lift, gain, saturation, contrast, vignette) | on | on | on | on |
| Antialiasing | TRAA, MSAA, none | `TRAANode`, or 4× MSAA on the scene pass | TRAA | MSAA | MSAA | none |
| Device pixel ratio | 2, 1 | `setPixelRatio` | 2 | 2 | 1 | 1 |
| Upscaling | none, TAAU, FSR 1 | `TAAUNode` or `FSR1Node`, scene drawn at 0.67 | none | none | none | none |

No preset is reserved for phones. Each device's tier comes from its own measured ceiling.

- **Run the sweep** measures every preset (Ultra included, on every device), then each effect on top of Medium. Fur 8 and 16, rain 2,600 and 5,000, TRAA, DPR 2, TAAU and FSR are each measured separately. Bloom, grade and ripples are already in Medium, so each is measured by removing it. For each config the lab warms up for 1.5 s and then holds for 4 s. It records frame time p50 and p95 (requestAnimationFrame intervals), and GPU time p50 and p95 where the adapter offers WebGPU timestamp queries. It also records the backend, adapter string and DPR, and one screenshot. An effect's cost is its config minus Medium.
- **Find the ceiling** starts at Ultra on every device. It drops the most expensive effect one level at a time until the p95 frame time holds the budget: 60 fps on desktop and 30 fps on phones, with 10% slack for display jitter (18.3 ms and 36.7 ms). "Most expensive" uses this session's sweep costs (GPU ms where present, else p95), and falls back to an estimated order when no sweep has run. It records the highest sustainable configuration and what each removed step saved.
- **Send results** opens a prefilled new issue on this repository with the JSON. Screenshots are left out so it fits a URL, and **Copy JSON** and **Download JSON** carry the full JSON if it has to be truncated. There's no login and no upload service.
- **Software GPUs never count.** When the adapter is SwiftShader, llvmpipe or another software rasteriser (or a WebGPU fallback adapter), the page reports "software, not performance" and puts no frame times in its results.

## Results

These tables are written by `node spikes/quality-lab/scripts/report.mjs` from the JSON Kirk's runs send back, saved under `spikes/quality-lab/results/`.

<!-- lab:results:start -->
### Desktop (Kirk's)

_Pending: Kirk's desktop run. Open the lab on the desktop, press **Run the sweep** and **Find the ceiling**, then **Send results**._

### Phone (Kirk's)

_Pending: Kirk's phone run. Open the lab on the phone, press **Run the sweep** and **Find the ceiling**, then **Send results**._

### The gap between the desktop and phone ceilings

_Pending until both ceilings are measured._
<!-- lab:results:end -->

### CI (software GPU, not performance)

The required check's 3D step (`bash scripts/clockgrove.sh slice`) runs `node spikes/quality-lab/scripts/lab.mjs journey` on SwiftShader. It builds the static site that Pages would serve and serves it under a sub-path, which proves its URLs are relative. It then checks the following, recording no times:

- the adapter is SwiftShader and the page flags itself as software;
- Stevie is c3 on the 30-joint rig with the `walk` clip at 0.268 m/s;
- on WebGPU, all 24 configs (every preset and every sweep config) draw a frame with no page error; on the WebGL2 fallback, Ultra and Low do;
- Ultra and Low differ, the walk moves Stevie in the close-up, and night differs from dusk;
- the runner's sweep and ceiling search run from the page's panel, report no frame times on the software GPU, and produce a send link.

## What should move into the platform

The product renderer at the pinned Clockgrove commit (clockgrove/clockgrove#184 in progress) provides bloom (three's `BloomNode`) and a three-tier `SCENE_QUALITY` table inside its scene adapter. Neither can be imported without the whole adapter, so the lab builds every effect itself, from three's own add-ons, as spike code. It should be re-run once #184 lands. Recommendations, which the measured costs will confirm or reorder:

| Effect | Recommendation |
| --- | --- |
| Grade, bloom, DPR, MSAA | **Into the renderer's tiers now.** These are cheap, universal and already partly there (bloom). The grade's per-state controls are already on #34's port list. |
| Key-light cascades, point-light shadows | **Into the renderer, as tier settings:** cascade count, and which lamps cast shadows (6 passes each). |
| Puddle reflections, ripples, rain splashes, rain count | **Into the renderer's weather:** one wetness and rain input with a per-tier particle count and an on/off reflection. |
| GTAO, light probes | **Into the renderer as tier options.** Light probes bake once per scene and are cheap to sample. GTAO is a full-screen pass. |
| TRAA, TAAU, FSR 1 upscaling | **Into the renderer** as its antialiasing and resolution scaling. Which one depends on the phone's measured gap. |
| Fur shells and fins | **Content-side (the character's material),** with the shell count set by the renderer's tier. |
| Volumetric haze, light shafts | **Spike only until measured.** They are the most likely to fall out of the phone ceiling. They join the renderer only if the desktop holds them with room to spare. |

## How to run it

- **The public page:** `https://clockgrove.github.io/raccoon-world/quality-lab/`, once the Pages workflow is installed. This change can't write `.github/`, so the workflow is delivered as [`spikes/quality-lab/pages/pages.yml`](../../spikes/quality-lab/pages/pages.yml) for a maintainer to copy to `.github/workflows/pages.yml`, with Pages set to deploy from GitHub Actions. It uses only the workflow's own token.
- **Locally:** `bash scripts/clockgrove.sh fetch`, then `node spikes/quality-lab/scripts/serve.mjs serve` (a dev server on 127.0.0.1) or `node spikes/quality-lab/scripts/serve.mjs build` (the static site, in `$TMPDIR/quality-lab-site`).
- **URL options:** `?backend=webgl2`, `?preset=ultra|high|medium|low` (the starting preset; Medium by default), `?view=close`, `?state=night`, `?platform=phone|desktop` (overrides the detected platform), `?ui=0`.
- **After a run:** save the JSON from the results issue as `spikes/quality-lab/results/<device>.json`, then run `node spikes/quality-lab/scripts/report.mjs` to fill in the tables above.

## Media and licences

- The page itself, Stevie's c3 model (Tripo, paid plan, MIT as Clockgrove work) and the screenshots' code are MIT.
- The yard's generated props are #34's text-to-3D models from Meshy and Tripo, under CC BY 4.0 with credit: "3D models generated with Meshy (meshy.ai) and Tripo (tripo3d.ai)". The page shows this credit, and `REUSE.toml` marks the three screenshots CC BY 4.0.
- No generation spend: the lab only reuses models already in the repository.
