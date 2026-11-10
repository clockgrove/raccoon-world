# 3D visual ceiling: the mockup's main frame in real-time 3D (issue 34)

**The question:** at its best, can real-time 3D look like the owner's mockup? The [3D look proof](3d-look-proof.md) (#26) showed the pipeline works but spent nothing: flat-coloured props in a renderer capped at 640×400 with two lighting states. This report spends what the look needs and shows the result next to [the mockup](reference/raccoon-world-reference.png), at the same camera, framing and time of day.

**Status:** the frame, its three times of day, the close-up, Stevie's idle and walk, and every shot are done. The shots were rendered on 2026-11-09 in Playwright's Chromium 153 under SwiftShader (a software GPU) on both backends. A software GPU draws the same picture as a real one, but its frame times say nothing about performance, so the table below reports none. **Pending:** the desktop mid-range GPU and recent-phone measurements, a maintainer step after merge (see [Maintainer steps](#maintainer-steps)).

## Side by side

The mockup is on the left, the real-time frame on the right: WebGPU, 1× DPR, 1672×941 (the mockup's size). The mockup's UI panels are not rebuilt; compare the scene behind them.

**The hero frame, 4:37 PM in rain (the mockup's time):**

![The mockup next to the real-time hero frame](../../references/ceiling-3d/vs-mockup-hero-webgpu.png)

**The same scene at dusk in rain (18:00):**

![The mockup next to the dusk frame](../../references/ceiling-3d/vs-mockup-dusk-webgpu.png)

**The same scene at night in rain (22:00):**

![The mockup next to the night frame](../../references/ceiling-3d/vs-mockup-night-webgpu.png)

## The shots

Every shot is the page's own camera and canvas: no magnification and no upscaling. The canvas is the full window at the device pixel ratio, so the 2× shots are 3344×1882 pixels drawn at that size. File names, sizes, hashes, backend, renderer string and canvas size for every image are in [`references/ceiling-3d/results.json`](../../references/ceiling-3d/results.json).

| View | 1× DPR (1672×941) | 2× DPR (3344×1882) |
| --- | --- | --- |
| Hero frame, 4:37 PM in rain | ![](../../references/ceiling-3d/hero-1x-webgpu.png) | ![](../../references/ceiling-3d/hero-2x-webgpu.png) |
| Dusk in rain, 18:00 | ![](../../references/ceiling-3d/dusk-1x-webgpu.png) | ![](../../references/ceiling-3d/dusk-2x-webgpu.png) |
| Night in rain, 22:00 | ![](../../references/ceiling-3d/night-1x-webgpu.png) | ![](../../references/ceiling-3d/night-2x-webgpu.png) |
| Close-up, Stevie about a third of the frame height, 4:37 PM | ![](../../references/ceiling-3d/close-1x-webgpu.png) | ![](../../references/ceiling-3d/close-2x-webgpu.png) |
| Close-up at night | ![](../../references/ceiling-3d/close-night-1x-webgpu.png) | ![](../../references/ceiling-3d/close-night-2x-webgpu.png) |

The WebGL2 backend draws the same frame (1× DPR):

| Hero | Dusk | Night | Close-up | Close-up at night |
| --- | --- | --- | --- | --- |
| ![](../../references/ceiling-3d/hero-1x-webgl2.png) | ![](../../references/ceiling-3d/dusk-1x-webgl2.png) | ![](../../references/ceiling-3d/night-1x-webgl2.png) | ![](../../references/ceiling-3d/close-1x-webgl2.png) | ![](../../references/ceiling-3d/close-night-1x-webgl2.png) |

### Stevie on his rig

Close-up, 4:37 PM, rain hidden so the motion reads. The idle at 0, 0.6, 1.2 and 1.8 s; the walk at every 0.1 s of its 0.8 s cycle.

| Backend | Idle | Walk |
| --- | --- | --- |
| WebGPU | ![](../../references/ceiling-3d/motion-idle-webgpu.png) | ![](../../references/ceiling-3d/motion-walk-webgpu.png) |
| WebGL2 | ![](../../references/ceiling-3d/motion-idle-webgl2.png) | ![](../../references/ceiling-3d/motion-walk-webgl2.png) |

## What is drawn, and how

The page is [`spikes/ceiling-3d/`](../../spikes/ceiling-3d/). It uses Clockgrove's stack, Three.js 0.187.0 (the version the pinned checkout, `CLOCKGROVE_COMMIT` 8bf1957, locks) with `WebGPURenderer` and its WebGL2 fallback, built with the pinned Vite. It is not limited by Clockgrove's renderer or its world-content seam: the page owns its renderer, camera, lights and post-processing. Stevie's rig code is shared with the look proof (`spikes/look-3d/src/stevie.ts` and `fit.ts`), which takes its `THREE` export from the seam module `apps/web/src/renderer-content.ts`, so that module is in the ceiling's build graph for its Three re-export (and a type); the frame does not draw through the seam. Nothing in it ships, and nothing in Clockgrove changes.

- **One camera.** An orthographic three-quarter camera (heading 54°, elevation 42°, 5.1 m frame height at zoom 1), fixed, no rotation. The set is laid out by mockup pixel: each piece is placed at the ground point under the pixel where the mockup paints it (`anchor` in [`look.ts`](../../spikes/ceiling-3d/src/look.ts)), so the composition holds whatever the camera's foreshortening. Stevie (0.53 m) lands at the mockup's size. The close-up is the same camera at zoom 3.3, centred on Stevie.
- **One scale:** yard metres, z up, as in the look proof, so Stevie's #77 rig fits unchanged.
- **One lighting model, three times of day.** A hemisphere sky light, a key light with a 2048² soft shadow map, a cool fill, and real lamp lights: the porch lantern and the lamp post are point lights with their own shadow maps, and the three house windows and the neighbour's window are point lights in front of glowing panes. All of it lights the ground, the props and Stevie. The states ([`STATES`](../../spikes/ceiling-3d/src/look.ts)) change only colours, intensities, fog and grade.
- **One material model.** Every surface is a Standard node material with procedural albedo and roughness from world-space noise ([`materials.ts`](../../spikes/ceiling-3d/src/materials.ts)): clapboard siding, weathered wood grain, flagstone with moss on its upper face, furrowed bark, galvanised metal. Nothing bakes light. The ground mixes mud, moss and grass from a layout mask painted at mockup anchors, plus noise.
- **Wet and reflective.** Rain darkens and glosses every exposed surface, more on upward faces. Puddles are mirror-smooth and show a planar reflection of the scene (Three's `reflector`), rippled by fine noise. The puddles in the shots reflect the porch, the lamps and Stevie.
- **Atmosphere:** distance fog per state, 2,600 instanced rain streaks, bloom on the lamps and windows.
- **One grade:** ACES tone mapping, then lift, gain, saturation, contrast and a soft vignette, set per state to the mockup's warm highlights and teal shadows.
- **Set dressing** ([`set.ts`](../../spikes/ceiling-3d/src/set.ts)): the house corner with siding, trim and lit windows; the porch with deck boards, balusters, steps, an upper balcony, the den opening and its lettered "Raccoon Den" sign; the big tree with displaced bark and roots; three fences; stepping stones; ferns (procedural fronds), shrubs, grass, flowers and fallen leaves; litter, a can and a bin lid; a second raised bed.
- **Generated props** ([`props.ts`](../../spikes/ceiling-3d/src/props.ts)): eight text-to-3D models, each fitted into its slot (turned z-up, scaled, set on the ground) and wetted like the rest. A prop whose GLB is missing falls back to a procedural stand-in.

  | Prop | Provider and route | Triangles |
  | --- | --- | --- |
  | Tipped trash can | Meshy text-to-3D (preview, refine) | 8,130 |
  | Raised garden bed | Meshy text-to-3D (preview, refine) | 10,989 |
  | Mailbox | Tripo text-to-model v3.1 | 5,663 |
  | Lamp post | Tripo text-to-model v3.1 | 5,652 |
  | Mushrooms | Tripo text-to-model v3.1 | 3,765 |
  | Tree base and roots | Tripo text-to-model v3.1 | 11,808 |
  | Bird feeder | Tripo text-to-model v3.1 | 4,740 |
  | Watering can | Tripo text-to-model v3.1 | 4,570 |

- **Stevie at his best** ([`stevie.ts`](../../spikes/ceiling-3d/src/stevie.ts)): the #77 Meshy mesh ([`ship-meshy-fit.glb`](../../references/stevie/77-3d/ship-meshy-fit.glb), 9,799 triangles) on the #77 quadruped rig fitted at load, with the #77 idle and walk clips, all reused from the look proof. The look proof's flat four-tone posterise is gone, because the mockup's Stevie is soft painted fur, not flat colour. Instead:
  - his own albedo is graded towards the mockup's palette (deep cool darks, warm grey-brown mids, creamy whites) with a soft fur sheen;
  - eight fur shells, skinned copies pushed out 1.2 cm along the normal, draw tapering strands, so his silhouette is soft fur rather than a polygon edge and lamp light catches the tips;
  - he stands in the same light as the set, casts a real shadow and shows in the puddles.

## Cohesion first

Judged first, as the owner asked (2026-11-07):

- **One lighting model, one grade:** every object, Stevie included, is lit only by the shared lights and passes through the same grade.
- **Matched detail density:** Stevie (9.8k triangles, fur shells) sits beside generated props of 3.8k to 12k triangles and a procedural set with noise-driven surface detail at every zoom.
- **Consistent edges:** no outlines anywhere. Silhouettes come from geometry, shadow and light, as in the mockup.
- **One camera and scale:** yes, by construction.

Where cohesion still breaks is in the [gap list](#gap-list).

## Gap list

What still differs from the mockup, ranked by visual impact, with what each would take.

| # | Gap | What it would take | Cost |
| --- | --- | --- | --- |
| 1 | **Painted richness of surfaces.** The mockup's every surface carries hand-painted detail: mossy cobbles, ivy on the porch, grain and wear on every board, clumped moss on the roots. The frame's procedural noise reads as clean CG at the close-up. | **Art:** a texture set per material (albedo, normal, roughness) painted or generated in the mockup's style, plus decals (moss clumps, ivy, stains). | About $10 to $20 of texture generation and about 2 days of art direction and review (estimate). |
| 2 | **Foliage.** The mockup's ferns, ivy and flowering shrubs are lush and soft. The frame's shrubs are untextured leaf cards and its ferns are simple fronds, so they read as confetti. | **Art and technique:** alpha-tested leaf and frond atlases (generated or painted), denser instancing, wind sway in the vertex stage. | About $5 of image generation and 1 to 2 days (estimate); frame cost grows with overdraw. |
| 3 | **Soft, bounced light and haze.** The mockup glows: warm light bleeds from the porch across the yard, shadows are filled, and a golden haze sits in the air. The frame has direct light only: no ambient occlusion, no bounce, no volumetric haze. | **Rendering technique:** screen-space AO (Three's GTAO node), SSGI or baked light probes for bounce, height fog or volumetric light for the haze. | No generation cost. About 1 to 2 days (estimate); GTAO and SSGI cost frame time and may need to be off on phones. |
| 4 | **The other characters.** Juniper and the kits at the den, the raccoon in the bin, and the bird on the fence are not in the frame. | **Art:** more raccoon meshes from turnarounds (as Stevie), placed and posed. | About $0.90 per raccoon variant, $1.80 with a retry (measured in #26 and #77), plus about 15 minutes each to approve and review. |
| 5 | **Generated props' fidelity and style.** Text-to-3D props come back at 4k to 12k triangles with soft, slightly photographic textures, and some miss the brief (the bin reads as a wooden tub). They sit in the light well but are not painted in the mockup's style. | **Art:** image-to-3D from a styled concept per prop (multi-view where the provider supports it), then a texture repaint. | About $1 to $2 per prop with one retry (measured: Tripo 20 credits, Meshy 30 credits per prop) and about 10 minutes each to pick and review. |
| 6 | **Proportions of the set.** Next to Stevie, the mockup's house, porch, tree and fences are a miniature diorama, and more of the yard fits in the frame. The frame's porch steps, tree trunk and right fence read about a quarter too large, so the frame shows less yard and less clutter than the mockup. | **Art (tuning):** scale the set pieces down about 25% around their anchors and fill the freed ground with more stones, puddles and clutter. | No generation cost; about half a day (estimate). |
| 7 | **Rain on water.** The puddles reflect, but have no ripple rings or splashes, and the rain has no splash particles on the ground. | **Rendering technique:** animated ripple normals in the puddle material, splash sprites. | About half a day (estimate). |
| 8 | **Stevie's face and fur colour at the close-up.** The shells give him a soft silhouette, but his albedo is still Meshy's photographic texture, graded, and his eyes have no catch-light. | **Art:** a painted albedo in the mockup's style, eye highlights, a groom map for fur length. | About half a day of art (estimate); regeneration would add about $0.90. |
| 9 | **Camera.** The mockup is not a true projection: its porch and fence lines imply a lower camera than its ground plane does. The frame matches the layout by anchoring props to mockup pixels, but uses one consistent orthographic camera, so some lines run at slightly different angles. | Nothing: an accepted difference of a real camera. | None. |

The mockup's UI panels and labels (the name tag, the selection ring, the chat) are out of this Objective's scope.

## Port list for the product renderer

Each technique this frame uses, against Clockgrove's product renderer and [clockgrove/clockgrove#184](https://github.com/clockgrove/clockgrove/issues/184) (full-resolution viewport at device pixel ratio, deep zoom, continuous time of day including dusk, content lights and shadows). #184 had not landed when this was written, so its column is read from that issue's scope.

| Technique | Where | Status |
| --- | --- | --- |
| Full window resolution at device pixel ratio | `main.ts` | **Already in #184** |
| Close-up zoom on the same camera | `look.ts` `VIEWS.close` | **Already in #184** (deep zoom) |
| Continuous time of day, with dusk as its own state | `look.ts` `STATES` | **Already in #184** |
| Lamp and window lights that light the surfaces around them | `set.ts` point lights | **Already in #184** (content lights) |
| Key light shadow map; point-light shadows for the two lamps | `main.ts`, `set.ts` | **Already in #184** (shadows); point-light shadows are 6 passes each, so #184 may cap them per tier |
| Distance fog, ACES tone mapping, bloom, rain streaks | `main.ts`, `set.ts` | **Already in #184** (in the pinned renderer today) |
| A per-state grade (lift, gain, saturation, contrast, vignette) matched to the mockup | `main.ts` | **Should join #184**: the renderer owns the grade; it needs these controls per time of day |
| Wetness: rain darkens and glosses exposed surfaces, more on upward faces | `materials.ts` `wetness` | **Should join #184**: one renderer-wide wetness input that content materials read |
| Planar puddle reflections of the scene | `main.ts` `reflector`, `materials.ts` `ground` | **Should join #184**: the pinned renderer reflects only its own atlas puddles, not content (gap 5 in the look proof) |
| A camera heading and elevation matched to the mockup | `look.ts` | **Should join #184**: the product camera's angle is fixed today |
| Instanced foliage and clutter (ferns, grass, leaves, shrubs, litter) | `set.ts` | **Should join #184**: the content library has no `InstancedMesh` today |
| MSAA antialiasing on the scene pass | `main.ts` | **Should join #184** |
| Procedural node materials (world-space noise albedo and roughness) | `materials.ts` | **Already in #184**: the content seam accepts Standard node materials today |
| Shell fur on a skinned character | `stevie.ts`, `materials.ts` `furShell` | **Already in #184** in principle: skinned meshes and node materials pass the seam; nine draws per raccoon is a per-tier budget question |
| Generated GLB props loaded and fitted | `props.ts` | **Already in #184**: the content context has a glTF loader today |
| A page-owned post pipeline and output node | `main.ts` | **Out of the product renderer's reach**: the content seam rejects post passes by design; what of it matters (the grade, bloom) is the renderer's own, above |
| Free choice of shadow map size, filter and light count per frame | `main.ts` | **Out of the product renderer's reach** as such: the renderer sets these per quality tier |

## Measurements

Frame times are the page's own animation-frame intervals; memory is the renderer's texture accounting and the browser's JS heap. Every row carries its backend and renderer string. Any software renderer (SwiftShader, llvmpipe and the like) is marked "software, not performance" and its times are never reported as performance; its raw figures are in `results.json` as `softwareFrameMs`. **Pending:** desktop with a mid-range GPU and a recent phone, a maintainer step after merge.

| Host | Backend | Renderer | Frame p50 / p95 (ms) | Memory |
| --- | --- | --- | --- | --- |
| Desktop, mid-range GPU | WebGPU and WebGL2 | pending | pending (maintainer step 1) | pending |
| Recent phone | WebGPU or WebGL2 | pending | pending (maintainer step 2) | pending |

The software-GPU run that made the shots:

<!-- ceiling:measurements:start -->
| Host | Backend | Renderer | DPR (canvas px) | Shot | Frame p50 / p95 (ms) | Texture MiB | JS heap MiB | Draw calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 1× (1672×941) | close | software, not performance | 534.7 | 496.9 | 1081 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | 1× (1672×941) | close | software, not performance | 534.7 | 595.1 | 1137 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | 2× (3344×1882) | close | software, not performance | 698.3 | 242.2 | 1137 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 1× (1672×941) | close-night | software, not performance | 534.7 | 496.9 | 1081 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | 1× (1672×941) | close-night | software, not performance | 534.7 | 595.1 | 1137 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | 2× (3344×1882) | close-night | software, not performance | 698.3 | 242.2 | 1137 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 1× (1672×941) | dusk | software, not performance | 534.7 | 496.9 | 1145 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | 1× (1672×941) | dusk | software, not performance | 534.7 | 595.1 | 1252 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | 2× (3344×1882) | dusk | software, not performance | 698.3 | 242.2 | 1252 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 1× (1672×941) | hero | software, not performance | 534.7 | 496.9 | 1145 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | 1× (1672×941) | hero | software, not performance | 534.7 | 595.1 | 1252 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | 2× (3344×1882) | hero | software, not performance | 698.3 | 242.2 | 1252 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 1× (1672×941) | night | software, not performance | 534.7 | 496.9 | 1145 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | 1× (1672×941) | night | software, not performance | 534.7 | 595.1 | 1252 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | 2× (3344×1882) | night | software, not performance | 698.3 | 242.2 | 1252 |
<!-- ceiling:measurements:end -->

**What the memory and draw-call figures already say,** even on a software GPU:

- **Texture memory is about 535 MiB at 1× and 700 MiB at 2×.** Most of it is the generated props' uncompressed textures (each provider returns 2048² or larger PNG or JPEG maps), plus the shadow maps and the post-processing targets. This is the ceiling's cost, not a shippable one. Converting the props to KTX2, as `spikes/stevie-3d/scripts/ship.mjs` does for Stevie, would cut most of it. A phone budget needs that conversion.
- **About 1,100 draw calls per frame.** The two point-light shadows render the scene six times each, and the reflection renders it once more. On a phone these are the first things to cap per quality tier.

## Generation spend and licences

**Spend:** about $2.80 of the $75 cap, measured from the providers' credit balances: Meshy 80 credits (two props at 30 each, plus the 20-credit preview of a trash-can attempt whose refine the provider refused), Tripo 120 credits (six props at 20 each). Credits are valued as in #77 ($0.02 per Meshy credit, $0.01 per Tripo credit, both estimates). Every call was reserved against the cap before it ran and recorded in [`references/ceiling-3d/provenance.json`](../../references/ceiling-3d/provenance.json) with provider, model, route, parameters, task ids, credits and cost, and every file with its sha256 and `outputGrant`. The ledger's "committed" total ($12.80) is higher than the spend because it keeps the $0.80 reservation of each of 13 failed Meshy calls (HTTP 429, the Free plan's queue limit, and HTTP 402 once the Meshy credits ran out); the measured balance diffs show that only one of them, the trash-can preview above, cost anything. Meshy's credits ran out after two props, so the other six came from Tripo, the route #77 measured.

**Licences:**

- **Credit: 3D models generated with Meshy (meshy.ai).** Stevie (#77) and the trash can and garden bed were generated on Meshy's Free plan, which makes them CC BY 4.0.
- **Credit: 3D models generated with Tripo (tripo3d.ai).** The mailbox, lamp post, mushrooms, tree base, bird feeder and watering can. The API does not say which Tripo plan the key is on, so the Free plan's terms, CC BY 4.0 with credit, are assumed and recorded in each file's `outputGrant`.
- Every shot shows these models, so the shots are CC BY 4.0 too; `REUSE.toml` annotates `references/ceiling-3d/`.
- Everything else (the page, the set, the materials, the scripts): MIT, as Raccoon World work.

Nothing here goes into `assets/`.

## CI

`bash scripts/clockgrove.sh slice`, the `ci` workflow's software-GPU step, now also runs `node spikes/ceiling-3d/scripts/ceiling.mjs journey`. On WebGPU and on forced WebGL2, under SwiftShader at a 480×270 canvas, it:

- builds and serves the page with the pinned Vite and Three;
- checks the frame reports ready on the requested backend, at the window size and DPR;
- checks the renderer string is SwiftShader;
- checks that hiding Stevie, the rain, or any of the set's groups (ground, house, porch, porch lamp, neighbour, fence, tree, path, plants, props, clutter) changes the picture;
- checks that the walk animates.

It takes about five minutes on the factory sandbox, inside the job's 20-minute limit. Its times are never reported as performance.

## Maintainer steps

1. **Desktop GPU shots and numbers.** On a desktop browser with a mid-range GPU, from the repository root, after `bash scripts/clockgrove.sh fetch`:

   ```sh
   node spikes/ceiling-3d/scripts/ceiling.mjs capture --label "<OS, browser, GPU>" \
     --browser "<path to Chrome or Edge>" --browser-arg=--enable-unsafe-webgpu
   ```

   It rewrites the shots, the side-by-sides, the motion strips and `results.json` in `references/ceiling-3d/`, and the software rows of the measurements table above. Check that each row's renderer string names the GPU, not SwiftShader, then replace the pending desktop row with the figures and commit the PNGs (Git LFS) with `results.json`.
2. **Recent phone.**
   - Serve the page with `node spikes/ceiling-3d/scripts/serve.mjs serve`. It binds to 127.0.0.1 only.
   - On Android, forward the port with `adb reverse tcp:<port> tcp:<port>` and open the URL in Chrome.
   - In remote DevTools, for each of `ceiling.set({ state: "hero" })`, `{ state: "night" }` and `{ view: "close" }`, record `await ceiling.measure(120)` and `await ceiling.rendererString()`.
   - Replace the pending phone row with the figures.
3. **When clockgrove/clockgrove#184 lands,** re-make this frame in the product renderer and compare the two (owner's decision, 2026-11-09).
4. **The owner judges** this report against the mockup. 3D versus 2D stays open until then; clockgrove/clockgrove#158 and #23 stay on hold.
