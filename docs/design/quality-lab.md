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
- **Stevie:** Kirk's approved look-dev pick ([manifest](../../assets/models/stevie/manifest.json): c1 of #107 with the cleaner face of #114, Assetgrove f7f31c0: 59,847 triangles, 0.45 m, 30 joints, one generated `walk` clip of 743 ms, played in place). He walks a 0.65 m-radius loop over the puddles and stepping stones in front of the porch steps. He moves at the clip's recorded 0.268 m/s, so his feet stay planted. The page reads the manifest's recorded 0.267756 m/s speed, retaining the legacy fallback for older files.
- **Three cameras:** the yard view (the ceiling's main frame), a close-up that follows Stevie at the zoom where he fills about a third of the frame height, so his walk can be judged, and the yard zoomed out to 60% (**Zoomed out**, `?view=far`), where he is small enough that a phone draws his coarsest level.
- **Stack:** three.js r187 (the version the pinned Clockgrove locks), WebGPU with the WebGL2 fallback (`?backend=webgl2`), and only three's own TSL add-ons. There's no pmndrs postprocessing, N8AO or three-good-godrays.

## Effects, presets and how they're measured

Each effect is one switch (one knob in [`config.ts`](../../spikes/quality-lab/src/config.ts)), with its levels listed best first:

| Effect | Levels | three.js add-on or code | Ultra | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- |
| Fur shells | 16, 8, 4, 0 | Skinned shells reading manifest groom maps; uniform `furShell` comparison | 16 | 8 | 4 | 0 |
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
- **Find the ceiling** starts at Ultra on every device. It drops the most expensive effect one level at a time until the p95 frame time holds the budget. The budget follows the display's refresh interval, measured at load (#143): the strict target is the longest whole number of refreshes that still meets 60 fps on desktop or 30 fps on phones (one refresh at 60 Hz, two at 120 or 144 Hz, and one on a 48 or 50 Hz panel, which can't show 60 fps, so a page that draws on every refresh holds there), and the budget adds half a refresh, the line past which a frame has missed its target cadence. At 60 Hz that is a 16.7 ms target and a 25.0 ms budget. `missedPct` is a different line: it counts frames longer than 1.5 of the display's own refreshes, so the two agree only at one refresh per frame. At two refreshes per frame (60 fps on a 120 or 144 Hz panel, 30 fps on a 60 Hz phone) every frame of a ceiling that holds counts as "missed", and the budget is what says it held. Only when no refresh was measured does it fall back to the nominal 16.7 or 33.3 ms target plus 10% (18.3 and 36.7 ms). Each ceiling records the budget, the strict target, the refresh and the refreshes per frame, its measured p95, and whether that p95 meets the strict target. "Most expensive" is measured on the device (#143): when Ultra misses, a **cost probe** runs Ultra with each effect one level down and ranks the effects by what each saved (GPU p50 where the adapter has timestamps, else frame p50, else p95, the same measure for every effect). A saving under 0.25 ms is not a measurement: without timestamps, frame times under vsync are whole refreshes, so an effect that doesn't cross a refresh saves 0 whatever it costs, and such an effect is ranked by the sweep or the default order instead. So where volumetric haze is the bottleneck, haze goes before device pixel ratio. The sweep's costs (measured on top of Medium) and the estimated default order rank only the effects the probe couldn't measure, and a software GPU skips the probe. The ceiling report keeps the probe's steps, its costs, the ranking and what ranked it. It records the highest sustainable configuration and what each removed step saved.
- **What changed against the numbers on #89 (#143).** The measured p95s, GPU times, `missedPct` and refresh mean what they did. What moved: the budget lines, which now follow the refresh. On a desktop, 60 Hz goes from 18.3 to 25.0 ms, 120 Hz to 20.8 ms and 144 Hz to 17.4 ms (two refreshes plus half). On the phone tier, 36.7 ms becomes 41.7 ms at 60 Hz and 37.5 ms at 120 Hz. Under vsync, frame intervals are whole refreshes, so a p95 between an old and a new line is rare and the held verdicts mostly read the same; a run on #89 whose p95 sits between them would now hold. The tier moved for tablets only (see Device tier below): an Android tablet was phone tier by its user agent and an iPad desktop tier (its Safari says Mac), and now each is placed by its pointer, screen, cores and memory (an iPad, whose WebKit reports no memory and caps its cores, is phone tier), so a tablet run on #89 may have been judged against the other tier's target (30 against 60 fps) and drawn the other tier's Stevie levels; its JSON's user agent tells which. Phone and desktop runs keep their tier; the ceiling's trim order comes from the cost probe, so a device can reach a different ceiling than the sweep-ranked one; and the refresh probe now takes the lower quartile of 120 idle intervals instead of the median of 60, so a busy loading thread can't read a 60 Hz display as 30 Hz.
- **Send results** opens a prefilled new issue on this repository with the JSON. Screenshots are left out so it fits a URL, and **Copy JSON** and **Download JSON** carry the full JSON if it has to be truncated. There's no login and no upload service.
- **Software GPUs never count.** When the adapter is SwiftShader, llvmpipe or another software rasteriser (or a WebGPU fallback adapter), the page reports "software, not performance" and puts no frame times in its results: they are dropped, not kept, so the JSON, the send link and the downloads carry none.
- **A config whose effect did not apply is not measured.** If the light probes fail to bake, every config with probes on records the error in place of a cost.

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
- Stevie is the approved model on the 30-joint rig with the `walk` clip at 0.267756 m/s;
- on WebGPU, all 24 configs (every preset and every sweep config) draw a frame with no page error; on the WebGL2 fallback, Ultra and Low do;
- each frame is not blank: more than 20 colours, and detail (a luminance range of 6/255 or more) in at least 10% of its 8 × 8 tiles, so a flat fill with one small drawn patch fails;
- Ultra and Low clearly differ (at least 2% of tiles changed; Ultra draws at DPR 2, so its frame is box-filtered to Low's size first), the walk moves Stevie in the close-up, and night differs from dusk;
- Geometry detail 4× draws the same picture as the art as made, compared tile by tile (`scripts/picture.mjs`): each pixel is matched to the best pixel within one pixel in the other frame, both ways, so rasterisation noise and one-pixel edge shifts pass, and any 8 × 8 tile whose mean difference passes 9/255 fails (calibrated on SwiftShader: detail 4× peaks at 6.7, a prop's scrambled UVs at 12.1). The journey proves the check sees a small break: it spoils the normals, then the UVs, of a prop chosen by the pixels it really shows (`lab.breakProp` hides each candidate for one frame and picks the one whose hiding changes nearest 2% of the frame, at least 0.5%, among those whose break visibly moves at least 0.2% of the pixels, so a prop with a flat base colour, which scrambled UVs can't change, is not picked), and requires each to fail;
- the runner's sweep and ceiling search run from the page's panel, report no frame times on the software GPU, and produce a send link.

## Device tier (#143)

The page puts each device in the **phone** or **desktop** tier (the phone tier aims for 30 fps, draws Stevie's phone levels and folds the panel into a bottom sheet) by what the device is and what it can do. It doesn't read the user agent: an iPad's Safari says it is a Mac, and an Android tablet's says Android like a phone. The rule (`deviceTier` in [`config.ts`](../../spikes/quality-lab/src/config.ts)):

1. `?platform=phone|desktop` wins.
2. A device whose primary pointer can hover (a mouse or trackpad: a desktop, or a laptop with or without a touchscreen) is **desktop**.
3. A touch-first device (primary pointer coarse, no hover, touch points reported) whose screen is under 600 CSS px on its short side is a **phone**.
4. A touch-first tablet is **desktop** when it reports laptop-class hardware: at least 8 logical cores and at least 8 GB of memory. Both must be reported. Only Chromium reports memory (`navigator.deviceMemory`). WebKit, which every iPadOS browser uses, reports none, and it caps `navigator.hardwareConcurrency` below the real core count, so an iPad's core count says nothing about what it can do. Every other touch-first tablet is a **phone**. So an iPad, M-series or not, is phone tier; open it with `?platform=desktop` to measure it against the desktop target. A flagship Android tablet in Chrome that reports 8 cores and 8 GB is desktop, and a mid-range one that reports 4 GB is phone. These examples are the rule applied to the values each browser is documented to report; no tablet's own report is recorded on #89 yet.

The status's `device.tier` records which rule placed the device. Phones and desktops place as they did before; tablets are what moved.

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

- **The public page:** `https://clockgrove.github.io/raccoon-world/quality-lab/`, once the Pages workflow is installed. This change can't write `.github/`, so the workflow is delivered as [`spikes/quality-lab/pages/pages.yml`](../../spikes/quality-lab/pages/pages.yml) for the owner session to copy to `.github/workflows/pages.yml` after merge (its Pages actions pinned to commit SHAs), with Pages set to deploy from GitHub Actions. Kirk approved publishing the lab publicly on 2026-11-11. It uses only the workflow's own token.
- **Locally:** `bash scripts/clockgrove.sh fetch`, then `node spikes/quality-lab/scripts/serve.mjs serve` (a dev server on 127.0.0.1) or `node spikes/quality-lab/scripts/serve.mjs build` (the static site, in `$TMPDIR/quality-lab-site`).
- **URL options:** `?backend=webgl2`, `?preset=ultra|high|medium|low` (the starting preset; Medium by default), `?view=close`, `?state=night`, `?platform=phone|desktop` (overrides the device tier), `?ui=0`.
- **After a run:** save the JSON from the results issue as `spikes/quality-lab/results/<device>.json`, then run `node spikes/quality-lab/scripts/report.mjs` to fill in the tables above.

## Media and licences

- The page itself, Stevie's approved model (Tripo, paid plan, MIT as Clockgrove work) and the screenshots' code are MIT.
- The yard's generated props are #34's text-to-3D models from Meshy and Tripo, under CC BY 4.0 with credit: "3D models generated with Meshy (meshy.ai) and Tripo (tripo3d.ai)". The page shows this credit, and `REUSE.toml` marks the three screenshots CC BY 4.0.
- No generation spend: the lab only reuses models already in the repository.

## Groomed coat measurements (issue 81)

The lab defaults to **Summer / Groomed**. Its coat control selects summer or winter manifest maps; winter also applies the tint texture's alpha toward the tips. The eyes mask excludes eye pixels from fur. Both the yard and close-up use this same skinned coat. The source manifest, source-map hashes and full provenance accompany the compressed web media; generation and approval remain the source asset's records.

**Compare fur** isolates the groom cost: each unchanged preset runs once with the earlier uniform 12 mm shells and once with groomed shells, on the same approved model, camera, shell count, fins and effects. The table shows GPU and CPU p50/p95 ms per step, followed by groomed-minus-uniform p50 costs. Two cast budget curves then hold the same effects and selected coat, measuring 1, 3, 10 and 20 raccoons for each material. They retain the budget result and GPU/CPU milliseconds per extra raccoon. Copy results and Download JSON include these results; software GPU timings remain null. Actual device costs are pending until Kirk runs the page on his devices.

Run `node spikes/quality-lab/scripts/lab.mjs groom --backend both` for the focused static-site browser proof of the approved Stevie in the yard, distinct summer/winter/uniform coats at a fixed close-up pose, coat controls, paired measurements and exported results. The existing broader journey still checks all presets and effects.

## Stevie's detail levels on phones (issue 113)

Stevie's chain ([manifest](../../assets/models/stevie/manifest.json), built by `assetgrove lod` from the approved model) gives the phone tier its own files: `stevie.phone.lod1.glb` (19,747 triangles) and `stevie.phone.lod2.glb` (5,975 triangles), with 1024 px textures and 1024 px groom, tint and eye maps. The desktop levels (`stevie.lod1.glb`, `stevie.lod2.glb`) are built and committed too, but the lab doesn't draw them yet.

- **On a phone** (the phone tier, or `?platform=phone`), every preset draws Stevie from the phone levels. Phone level 1 is drawn while his height on screen is at least the manifest's `minScreenHeight` for it (0.05 of the viewport height), and level 2 below that. In the close-up he is about 0.22 of the height, so level 1. In the yard as framed he is about 0.07, also level 1. The camera is orthographic, so every raccoon in the cast is that height too; the **Zoomed out** view (`?view=far`, about 0.04) is the framing that draws level 2. The desktop keeps today's single level 0 (59,847 triangles, 2048 px).
- **Loading:** a page downloads only its own level set: a phone the two phone files and their maps (6.7 MB of web media, 12.0 MB with the props), a desktop `stevie.glb` and its nine 2048 px maps (17.6 MB). The other set loads only when the panel or Compare levels asks for it. The status reports each set's download on its own (`device.levelsMb`), and `device.modelMb` is what the page loaded to start.
- **Override:** `?levels=phone|single`, or the panel's **Stevie's levels** control (Level 0 only, Phone levels). The page's status reports the file drawn, its level, triangles, texture size and Stevie's screen height.
- **Compare levels** measures what the phone levels save. Each preset runs twice on the same coat and effects: once with today's single level 0, then once with the phone levels, in two framings: the start view as framed (phone level 1) and the zoomed-out yard (phone level 2). It records frame-time and GPU p50/p95 (and CPU p50) for each run, the phone-minus-single cost per preset and framing with the phone level it drew, and each level set's download. Like Compare fur, the results are in Copy results, Download JSON and the send link, and software GPUs record no times. **Measured costs are pending Kirk's phone run.**
- **Web media:** `spikes/stevie-3d/scripts/web-media.mjs stevie` also encodes the four level files (meshopt; KTX2 capped at 1024 px for the phone files and 2048 px for the desktop ones) and the phone maps, recorded in `references/web-media/web-media.json`.
- **Proof:** `node spikes/quality-lab/scripts/lab.mjs levels --backend both` runs these checks on SwiftShader, and the CI journey runs them at its end. With `?platform=phone`, only the phone set is downloaded, a phone level file with 1024 px textures is drawn, and it switches from level 1 to level 2 in the zoomed-out view. The panel's level and view controls work, level 0 loads on demand and is reported on its own, Compare levels measures both phone levels against level 0 and exports with no times, and the desktop still draws the 59,847-triangle main file.

## Stevie's motions (issue 112)

Stevie's file carries six clips: `idle`, `walk`, `sniff`, `eat`, `play` and `shelter`. The lab plays any of them on him and on every clone of the cast, with `?motion=<family>` (default `walk`; an unknown name is walk) or the panel's **Stevie's motion** control, which edits the draft and applies with **Apply** like **Stevie's levels**. `walk` moves along the loop at the clip's `speedMps`, as before. Every other motion plays in place: Stevie stands where he is on the loop, facing along it, and the clip repeats (each one-shot starts and ends on the idle's first pose). Switching back to walk resumes from where he stopped, and a level switch keeps the motion. The status reports the motion, the clip playing, its length and Stevie's position.

**Proof:** `node spikes/quality-lab/scripts/lab.mjs motions --backend both` checks, on each backend and for each of the six families, that the clip named is the one playing, that frames draw with no page or console error, that the canvas differs between two times, that Stevie moves only for walk, and that `?motion=eat` starts on eat. It also checks the panel control, the walk stopping and resuming in place, and that a phone level switch keeps the motion. The CI journey ends with a short version (the six families on the desktop page). It records no times: it runs on a software GPU.
