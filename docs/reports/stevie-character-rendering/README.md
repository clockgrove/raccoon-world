# Stevie character rendering: the comparison in Clockgrove's product renderer (issue #11)

This report shows the evidence for the owner's pick of how Raccoon World draws its characters:

- **(a) real-time 3D**
- **(b) 3D rendered to sprites**
- **(c) 2D sprites**

It re-runs [clockgrove/clockgrove#77](https://github.com/clockgrove/clockgrove/issues/77) in the renderer that Clockgrove's live yard uses: `ThreeWorldSceneAdapter`, which is `WebGPURenderer` with its WebGL2 fallback (clockgrove/clockgrove#74, #93). The renderer comes from the exact Clockgrove commit this repository's CI pins, [`8bf1957ec223002277a88a0f0aaad52f6e8442af`](https://github.com/clockgrove/clockgrove/tree/8bf1957ec223002277a88a0f0aaad52f6e8442af). The characters enter through the renderer's extension point for world-supplied scene content (`RendererContent`, clockgrove/clockgrove#112, merged as #142). So the renderer's own lights, ACES grade, bloom, fog, camera and quality tiers shade every arm; the clockgrove/clockgrove#77 spike scene is not used. Every shot is taken at the `high` tier.

The decision record that sets out the options is [`docs/adr/character-rendering-decision.md`](../../adr/character-rendering-decision.md). The code and the commands are in [`spikes/stevie-3d/`](../../../spikes/stevie-3d/docs/stevie-3d.md).

## Where every image and number comes from

| What | Source |
| --- | --- |
| Every image in this report | One run on 2026-11-09 in the Factory sandbox, under a **software GPU** (SwiftShader). Command: `bash scripts/stevie-comparison.sh full`, then `node spikes/stevie-3d/scripts/publish.mjs`. |
| Backend and renderer string for every shot | [`results.json`](results.json), field `shots[].backend` / `shots[].renderer`. 184 shots per backend, every one with a visible character (fewest visible pixels: 468). |
| sha256, licence, credit and inputs of every image | [`provenance.json`](provenance.json), with the licence metadata in [`REUSE.toml`](../../../REUSE.toml). |
| Real-GPU frame times and screenshots | **Pending.** After merge, the maintainer runs the comparison on the owner's RTX 2060 SUPER (Windows Edge, and WSL Chromium with GPU acceleration) and posts frame times and screenshots on issue #11. The commands are in the [spike README](../../../spikes/stevie-3d/docs/stevie-3d.md#maintainer-step-real-gpu-after-merge). The software frame times in `results.json` are marked `performance: false` and are **not** performance numbers. |

| Backend | Renderer string (every shot on this backend) |
| --- | --- |
| WebGPU | `google / swiftshader` (WebGPU adapter vendor / architecture) |
| WebGL2 fallback | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` |

## The scene

- **The yard.** It is Raccoon World's yard as the product renderer draws it, built from this repository's pack (`worlds/raccoons/`) with its placeholder raccoons removed. No world session or database is used.
- **Lighting states.** The product renderer has two grades, day and night, and switches to night at 18:00. So:
  - **dusk in rain** is 18:00 with rain 9000, the first night-graded minute, with the lantern and window lit;
  - **night** is 22:00, dry.

  The two states share the night grade and differ by the rain and the wet ground. The renderer has no dusk grade of its own (Question 4).
- **The lit path.** The pack's `path` effect is not a role the product renderer draws: its `SceneEffect` roles are puddle, lantern and window. So the cohesion shot stands the characters on the lantern-lit ground in front of the porch (Question 5).
- **Characters.**
  - Stevie stands 22 px tall at zoom 1, the reviewed yard sprite's body height, in every arm.
  - Juniper is Stevie recoloured warm, and the kit is Stevie at 0.6 scale, in every arm, as in clockgrove/clockgrove#77.
  - The 3D arms tilt the model 30° towards the viewer, which is the 2:1 yard's camera elevation.
- **Shots.**

  | Shot | Zoom and framing |
  | --- | --- |
  | Cohesion | Zoom 2 (the product's closest), full 640×400 canvas |
  | Close stills (five headings), walk frames (8), idle frames (4) | 200×200 crops at the close-up zoom (6.06) |
  | Zoom test | Full canvas at three zooms (below), each at 1× and 2× device pixel ratio |

- **Zoom test.**
  - **Far** is 0.75, the product's minimum.
  - **Default** is 1, the yard's default view.
  - **Close** is 6.06, where Stevie fills about a third of the 400 px frame height.

  The product renderer clamps zoom to 0.75–2 and fixes the pixel ratio at 1. The run sets the adapter's camera zoom and the renderer's pixel ratio directly, through the same handle Clockgrove's own fixture page uses. `results.json` flags each such shot `zoomBeyondClamp` or `pixelRatioBeyondProduct` (Questions 2 and 3).

The reference mockup, [`docs/design/reference/raccoon-world-reference.png`](../../design/reference/raccoon-world-reference.png), is shown beside each arm's shots below:

<img src="../../design/reference/raccoon-world-reference.png" alt="Raccoon World reference mockup" width="640">

## (a) Real-time 3D: `meshy-fit`

**Why `meshy-fit`.** Cohesion comes first, and among the #77 routes it is a tie: every route is drawn as the same lit node-material mesh, under the same lights, grade and post (see the [routes](#the-other-77-routes) sheet). Likeness to the approved turnaround breaks the tie:

- The **Meshy** mesh is the most faithful: the mask and white brows, the ringed tail, and the grey-brown back over a tan belly.
- **`meshy-fit`** puts it on the spike's fitted quadruped rig. It walks without tearing.
- **Meshy's own rig** is a humanoid skeleton. Its walk rears the raccoon up and tears the mesh (#77 measured an edge stretch of p99 3.54, max 12.2).
- **Tripo** has the closest face and its own quadruped rig, but its walk stretches the mesh (p99 1.42, max 6.9).
- **fal**'s fur is darker and blotchy.

So the default holds.

**The model.**
- **Source:** `references/stevie/77-3d/ship-meshy-fit.glb`. It has 9,799 triangles and one 2048² base-colour texture (KTX2, 2.7 MiB as transcoded here).
- **Rig:** 18 joints fitted in 27 ms, playing the spike's idle (2.4 s) and walk (0.8 s) clips.
- **Material:** `MeshStandardNodeMaterial`, roughness 0.9, with no outline.

| Dusk in rain (WebGPU) | Night (WebGPU) |
| --- | --- |
| ![3D, dusk in rain](shots/sheet-3d-dusk-rain-webgpu.png) | ![3D, night](shots/sheet-3d-night-webgpu.png) |
| ![3D zoom test, dusk in rain](shots/zoom-3d-dusk-rain-webgpu.png) | ![3D zoom test, night](shots/zoom-3d-night-webgpu.png) |

3D model generated with Meshy (meshy.ai). These images are CC BY 4.0.

## (b) 3D rendered to sprites

The same `meshy-fit` model and clips are baked to sprite frames, with albedo, normal and depth maps taken from the geometry:

- **The bake:** 5 headings × (8 walk + 4 idle) frames, in 192 px cells. It ran on one offscreen renderer, which was released afterwards, and took 1.6 s on WebGPU and 3.6 s on WebGL2 (software).
- **Drawing:** each frame is a camera-facing quad with a `MeshStandardNodeMaterial`. The baked normals serve as its normal map and the baked depth as its depth, so the scene's lights shade it.
- **Resolution:** the cell covers 3.73 units around a Stevie 1.76 units tall, which gives **51 px per unit**.

| Dusk in rain (WebGPU) | Night (WebGPU) |
| --- | --- |
| ![3D to sprites, dusk in rain](shots/sheet-3d-sprites-dusk-rain-webgpu.png) | ![3D to sprites, night](shots/sheet-3d-sprites-night-webgpu.png) |
| ![3D to sprites zoom test, dusk in rain](shots/zoom-3d-sprites-dusk-rain-webgpu.png) | ![3D to sprites zoom test, night](shots/zoom-3d-sprites-night-webgpu.png) |

3D model generated with Meshy (meshy.ai). These images are CC BY 4.0.

## (c) 2D sprites: Stevie's comparison strips

The frames are cut from Stevie's comparison-only strips in `references/stevie/comparison-candidates/`, made by Assetforge from his approved turnaround (PR #8): idle candidate 3 (6 frames) and walk candidate 2 (8 frames), both picked by the owner. Jimothy's sheet is not used.

- **Cutting:** 192 px cells. Stevie is 132 px tall in the cell, which gives **75 px per unit**.
- **Maps:** the normal and depth maps are derived from the silhouette and luminance; they are not drawn.
- **Alpha:** small interior holes in the strips' alpha (eyes, mask) are filled, so the face stays solid under the alpha test.

**Headings.** The strips draw one view each:
- The idle strip faces **front-left** and the walk strip **front-right**, so one of the two clips is always mirrored.
- The sheets label every still that is not drawn: three-quarter is the idle strip mirrored, and right, front and back show the nearest drawn view.

**QA.** Both strips fail one Assetforge QA check, as recorded in their `qa.json`:
- the idle trips the identity-flicker check on the facial markings;
- the walk trips the footprint-drift check, which assumes two legs.

The strips are not approved game art.

| Dusk in rain (WebGPU) | Night (WebGPU) |
| --- | --- |
| ![2D, dusk in rain](shots/sheet-2d-dusk-rain-webgpu.png) | ![2D, night](shots/sheet-2d-night-webgpu.png) |
| ![2D zoom test, dusk in rain](shots/zoom-2d-dusk-rain-webgpu.png) | ![2D zoom test, night](shots/zoom-2d-night-webgpu.png) |

These images are MIT.

## The other #77 routes

The five headings for each route, with the chosen `meshy-fit` in the bottom row:

- **Meshy's own rig** is held at its first pose.
- **Tripo** keeps its quadruped rig, in its bind pose. Its model faces −x, so the page turns it by 90°.
- **fal TRELLIS.2** has the fitted rig.

| Dusk in rain (WebGPU) | Night (WebGPU) |
| --- | --- |
| ![routes, dusk in rain](shots/routes-dusk-rain-webgpu.png) | ![routes, night](shots/routes-night-webgpu.png) |

These sheets include Meshy renders, so they are CC BY 4.0. 3D model generated with Meshy (meshy.ai). Tripo and fal renders alone would be MIT.

## Cohesion (judged first)

| Criterion (owner, 2026-11-07) | (a) Real-time 3D | (b) 3D rendered to sprites | (c) 2D sprites |
| --- | --- | --- | --- |
| One lighting model, lit by the scene's own lights | **Yes.** The yard's ambient, sky and lantern point light shade the mesh, and the extension point refuses any material that isn't lit. | **Yes.** The albedo is baked unlit, and the geometry's normals let the scene's lights shade it. | **Partly.** The scene lights it through a derived normal map, but the strips' painted shading and highlights stay baked into the albedo. |
| One grade and post pass over the whole frame | Yes: the product's ACES grade, bloom and fog. The extension point requires `toneMapped` and `fog`. | Yes | Yes |
| Matched detail density | The fur is in the texture, with no real fur. | Same as (a). | The finest detail of the three: painted fur. |
| Consistent edges | Geometry edges. The product renders with `antialias: false`, so silhouettes stair-step at 1×. | Alpha-tested edges on the texel grid. They turn blocky once upscaled (see the zoom test). | Same as (b). |
| One camera and scale | Yes: the product camera, at Stevie's yard height, tilted to the yard's 30° view. | Yes, baked from the same tilt. | Yes in scale. The strips are drawn from a lower, near-eye-level view than the yard's 30°. |

**Detail density in every arm.** All three arms carry far more detail than the yard they stand in. Today's yard is drawn from 32 px pixel-art placeholders at 12.5 px per metre, so none of the arms matches its density. The real yard art (#2) decides this criterion. Arms (a) and (b) share one detail level, and so do Juniper and the kit in each arm.

**Closeness to the mockup (judged after cohesion).** The mockup's Stevie is a painterly, grey-brown raccoon, about a seventh of the frame high.
- (c) is closest in rendering style.
- (a) and (b) read as the same raccoon with smoother, warmer fur. The ACES grade and the warm lantern push all three arms browner than the turnaround.
- The product's placeholder yard is far from the mockup's painted yard in every arm. The environment is out of scope here.

## Zoom range (a deciding factor, Kirk 2026-11-09)

One content unit is 12.5 px at zoom 1. So a source holds detail on screen without blur up to the zoom where 12.5 × zoom × device-pixel-ratio reaches its source density.

| | Source density | Closest zoom without blur, 1× | Closest zoom without blur, 2× | At the close-up (6.06) at 2× |
| --- | --- | --- | --- | --- |
| (a) Real-time 3D | ≈ 439 texels per unit: a 2048² texture, estimated from UV area against surface area | ≈ 35 | ≈ 17.6 | Texture still sharp. Silhouette edges stair-step (no MSAA), finer at 2×. |
| (b) 3D to sprites | 51 px per unit: 192 px cells over 3.73 units | 4.1 | 2.1 | 2.9× upscaled: soft and blocky |
| (c) 2D sprites | 75 px per unit: Stevie 132 px tall in a 192 px cell | 6.0 | 3.0 | 2.0× upscaled: soft |

**At the product's own limits** (zoom 2 at 1×, or 25 px per unit), all three hold. The zoom range only separates the arms once the product allows a closer zoom or a higher pixel ratio.

**The cost of holding the close-up at 2×** (151.5 px per unit). No arm wins it by keeping a fixed small sprite size: the figures below are what each arm must carry at that density.

- **(c) 2D sprites:**
  - Cells grow 2.02× to about 388 px, which is 0.60 MB a frame for each map (RGBA8, uncompressed).
  - Memory is frames × directions × maps × cell². One animation of 8 frames × 8 directions × 3 maps is about 116 MB, or 72 MB with 3 of the directions mirrored.
  - Today's set (1 drawn direction a clip, 14 frames) is 7.1 MB at 192 px and about 29 MB at 388 px.
  - It scales linearly with animations, directions and characters. Six animations (#2's set) × 5 drawn directions × 3 maps is about 430 MB a character before GPU compression, or about 110 MB at 4:1.
- **(b) 3D to sprites:**
  - The same formula as (c). Each re-bake is free and takes seconds.
  - Framed tightly at 2.2 units a cell, the cell is about 333 px, which is 0.44 MB a frame for each map.
  - This run's bake (5 headings × 12 frames × 3 maps at 192 px) is 26.5 MB, and at the close-up density it would be about 78 MB.
  - It scales with animations × headings × characters, like (c).
- **(a) Real-time 3D:**
  - Nothing changes. One 2048² texture (2.7 MiB as transcoded here) and a 10K-triangle mesh hold up to zoom 17 at 2×.
  - One more animation is a clip of a few kilobytes, shared by every character on the same skeleton.
  - One more character is one more mesh and texture: 2.7–14 MB on the GPU across the routes measured here.
  - The open edge cost is aliasing: the product renders with `antialias: false`.

## Cost of one more animation and one more variant

"Measured" figures come from clockgrove/clockgrove#77's ledger, from PR #8's strip round, or from this run. "Estimated" figures are judgements, and say so.

| Arm | One more animation | One more variant |
| --- | --- | --- |
| (a) Real-time 3D | **$0** of generation for a keyframed or procedural clip, as in the spike. Meshy's library motions are humanoid; Tripo's preset quadruped walk fits only Tripo's own rig (its rig and walk cost 35 credits, about $0.35, measured in #77). **Operator: about 30–120 min** to keyframe or tune a quadruped clip (estimated). At runtime it is a few kilobytes and plays at every heading. | **A tint or a scale: $0 and 0 min** (measured: Juniper and the kit here). **A new shape: about $0.88**, which is a turnaround at $0.178 (measured) plus Meshy at 35 credits, about $0.70 (credits measured, dollars estimated at $0.02 a credit). **Generation wall clock: about 3.4 min** (turnaround 1.1 + Meshy mesh 2.3, measured; the fitted rig needs no Meshy rig), and the rig fit takes 27 ms (measured). Operator review is **about 10–15 min** (estimated). |
| (b) 3D rendered to sprites | (a)'s clip, plus a **re-bake** that took **1.6 s on WebGPU and 3.6 s on WebGL2 under software** for 60 frames × 3 maps (measured). **Operator: (a)'s time plus about 5 min** to check the frames (estimated). Memory grows by frames × headings × 3 maps × cell² (above). | **A tint or a scale: $0**. **A new shape:** (a)'s cost plus a re-bake. |
| (c) 2D sprites | One Assetforge `generate-sheet` round for each direction. PR #8's round of 4 idle and 4 walk candidates cost **$0.83** (measured), **about $0.10 a candidate strip** or $0.42 for four candidates of one animation in one direction (derived). **Operator: about 5 min** to pick a candidate for each direction (estimated). Each candidate can fail QA (both picked strips did). | **A tint or a scale: $0**. **A new shape:** a new turnaround ($0.178, measured), then every animation × direction regenerated. |

## Licences of shipped output

| Route | Licence of shipped output and of every render or conversion | Credit |
| --- | --- | --- |
| Meshy (Free plan), used by (a), (b) and the `meshy-rig` route | **CC BY 4.0** | "3D model generated with Meshy (meshy.ai)", in this report and in each image's licence metadata (`REUSE.toml`, `provenance.json`) |
| Tripo (paid credits) | MIT | none |
| fal TRELLIS.2 (MIT weights) | MIT; fal's own terms for the endpoint are a maintainer re-check (#77) | none |
| GPT-image turnaround, Assetforge strips, used by (c) | MIT | none |

Anything that ships needs either MIT-compatible output or the Meshy credit in the game's credits.

## What the pinned renderer cannot show (Questions)

These are raised in the PR as Questions. Clockgrove changes are made in clockgrove/clockgrove, never from here.

1. **The CI step.** It must be added to `.github/workflows/ci.yml`, a path this run may not edit. See the PR.
2. **Zoom beyond 2.** The renderer clamps camera zoom to 0.75–2 (`ZOOM`), so it cannot show the close-up where Stevie fills a third of the frame.
3. **Device pixel ratio above 1.** The renderer calls `setPixelRatio(1)` and offers no setting, so it cannot render at 2× DPR. On a 2× display, every arm is upscaled by the browser.
4. **A dusk grade.** The renderer has day and night only (`isNight`, night from 18:00).
5. **The path.** The pack's `path` effect is not drawn. `SceneEffect` roles are puddle, lantern and window.

Two findings need no Question:

- `placeContent` compresses content depth (z scale 0.01), and that flattens the lighting of a mesh's normals. The 3D arms counter-scale depth inside their anchor.
- The renderer's `WebGPURenderer` is created with `antialias: false`, so geometry edges alias at 1×.

## The two #77 GPU failures

Both are diagnosed in the [spike README](../../../spikes/stevie-3d/docs/stevie-3d.md#the-two-77-gpu-failures).

- **Windows Edge never returned.**
  - **Cause:** the #77 page posted one record of several hundred megabytes, holding every shot as base64, at the very end. It surfaced no error outside each arm, so any stall looked like 20 minutes of silence.
  - **Fix:** each shot is posted as soon as it is taken, and page errors are forwarded at once. The runner has a 3-minute stall timeout that names the last step, and it acknowledges a message only after storing it.
- **The WSL WebGL context error.**
  - **Cause:** the #77 page made one WebGL renderer for each arm (11 with four models), plus a probe renderer, and released none of them. That exhausted Chromium's context budget under WSL's d3d12 driver.
  - **Fix:** one product renderer for the whole run, with every arm in one content root, and one offscreen bake renderer that is disposed after use.

Both fixes run here: one page load per backend, 184 shots each, under SwiftShader. Whether they hold on the RTX 2060 SUPER is the maintainer step. If that step fails, issue #11 reopens.

## WebGL2 fallback shots

The same shot set on the WebGL2 fallback, with the same arms and states:

| | Dusk in rain (WebGL2) | Night (WebGL2) |
| --- | --- | --- |
| (a) | ![](shots/sheet-3d-dusk-rain-webgl2.png) ![](shots/zoom-3d-dusk-rain-webgl2.png) | ![](shots/sheet-3d-night-webgl2.png) ![](shots/zoom-3d-night-webgl2.png) |
| (b) | ![](shots/sheet-3d-sprites-dusk-rain-webgl2.png) ![](shots/zoom-3d-sprites-dusk-rain-webgl2.png) | ![](shots/sheet-3d-sprites-night-webgl2.png) ![](shots/zoom-3d-sprites-night-webgl2.png) |
| (c) | ![](shots/sheet-2d-dusk-rain-webgl2.png) ![](shots/zoom-2d-dusk-rain-webgl2.png) | ![](shots/sheet-2d-night-webgl2.png) ![](shots/zoom-2d-night-webgl2.png) |
| routes | ![](shots/routes-dusk-rain-webgl2.png) | ![](shots/routes-night-webgl2.png) |

Images of (a), (b) and the routes are CC BY 4.0: 3D model generated with Meshy (meshy.ai). Images of (c) are MIT.
