# 3D look proof: Stevie and a yard corner in real-time 3D (issue 26)

**The question:** can Raccoon World look like the owner's mockup in real-time 3D? This report shows Stevie and a small corner of the yard as real-time 3D in Clockgrove's product renderer, next to the mockup, and records what matches, what doesn't, and what closing the gap costs.

**Status:** the slice, the renderer path, the CI check and the capture command are done. The shots and the device measurements are **pending**. The sandbox that built this proof could not install a browser, so no frame was rendered there. A maintainer runs one command to fill in every shot and number below (see [Maintainer steps](#maintainer-steps)). Until then, CI is the only renderer evidence: it draws the slice on both backends under SwiftShader (see [CI](#ci)). The decision record says which judgements wait for the shots.

The look target is [the mockup](reference/raccoon-world-reference.png). Its camera and devices come from [visual decisions](visual-decisions.md): a fixed isometric camera with deep zoom, on desktop plus recent phones.

![The mockup](reference/raccoon-world-reference.png)

## What is drawn, and how

- **Renderer:** Clockgrove's product renderer (`ThreeWorldSceneAdapter`, WebGPU with an automatic WebGL2 fallback) at the commit this repository pins (`CLOCKGROVE_COMMIT`, 8bf1957). Everything is added through the world-content seam, renderer content v1 ([clockgrove/clockgrove#112](https://github.com/clockgrove/clockgrove/issues/112)). The slice brings no light, camera, grade or post pass of its own, because the seam rejects them. Ambient and sky light, fog, ACES grade, bloom, rain streaks and the low, medium and high quality tiers all belong to the renderer. The page is [`spikes/look-3d/`](../../spikes/look-3d/).
- **Stevie:** the existing Meshy model from #77 ([`ship-meshy-fit.glb`](../../references/stevie/77-3d/ship-meshy-fit.glb): Meshy multi-image to 3D from the approved turnaround, reduced to 9,799 triangles with a 2048² KTX2 albedo). It is restyled in code, not regenerated:
  - the #77 quadruped skeleton (18 joints) is fitted to the mesh at load;
  - the #77 procedural idle (2.4 s) and walk (0.8 s) clips play on that rig;
  - his albedo goes through the slice's one storybook grade, and he gets the slice's one outline.
  
  Meshy's own rig is humanoid, and its walk rears the raccoon up and tears the mesh (#77), so it is not used.
- **The yard corner:** procedural geometry in [`yard.ts`](../../spikes/look-3d/src/yard.ts), about 13,500 triangles across 12 props:
  - the house corner (siding, trim, door, stepped roof) and a lit window;
  - the porch (deck boards, steps, posts, railings, roof) with a warm lantern;
  - a picket fence along two edges;
  - two bins, one tipped over with litter and its lid on the ground;
  - ferns and flowers, and shrubs;
  - ground in a mud, moss and grass patchwork, with a stepping-stone path;
  - puddles that show only while it rains.
  
  The palette is picked by eye from the mockup.
- **Cohesion first:**
  - **One camera:** the renderer's own content projection, extended to height.
  - **One scale:** yard metres.
  - **One lighting model:** the renderer's lights, with one view-space normal rule for every material.
  - **One material:** Standard node material, which the renderer turns into Lambert at the low tier, with one albedo grade.
  - **One edge:** an inverted-hull outline 1.25 screen pixels wide at every zoom.
  - **Matched detail density:** simple forms throughout. Stevie's 9.8k triangles sit beside about 13.5k for the whole yard corner.
- **Rain and wet:** the renderer draws the rain streaks, 192 at the high tier. While the projection's rain is above zero, the slice shows its puddles and lowers every surface's roughness.
- **Lamps:** the porch lantern and the window use the renderer's warm source colour (`0xffb966`) and its emissive bound (0.45). They light from 17:00 and bloom at the medium and high tiers.

## The shots

All shots use the high tier, reduced motion (held frames), and the camera at the product's zoom 1. Each shot appears once per backend (WebGPU and WebGL2). The tables show the WebGPU set; the WebGL2 files have the same names ending `-webgl2.png`. File names, sizes, hashes, backend, renderer string and tier for every image are in `references/look-3d/results.json`.

### Dusk in rain and night, next to the mockup

| Dusk in rain (17:30) | Night in rain (22:00) |
| --- | --- |
| ![dusk, yard view](../../references/look-3d/zoom-dusk-rain-yard-1x-webgpu.png) | ![night, yard view](../../references/look-3d/zoom-night-yard-1x-webgpu.png) |

### The zoom test

| View | 1× DPR | 2× DPR |
| --- | --- | --- |
| Whole slice (28 px/m) | ![](../../references/look-3d/zoom-dusk-rain-whole-1x-webgpu.png) | ![](../../references/look-3d/zoom-dusk-rain-whole-2x-webgpu.png) |
| Default yard view (90 px/m, Stevie ≈ 12% of the frame height, as in the mockup) | ![](../../references/look-3d/zoom-dusk-rain-yard-1x-webgpu.png) | ![](../../references/look-3d/zoom-dusk-rain-yard-2x-webgpu.png) |
| Close-up (250 px/m, Stevie ≈ a third of the frame height) | ![](../../references/look-3d/zoom-dusk-rain-close-1x-webgpu.png) | ![](../../references/look-3d/zoom-dusk-rain-close-2x-webgpu.png) |

The night set is `zoom-night-<view>-<dpr>x-<backend>.png`.

**How the zooms are made:** the pinned renderer's camera is fixed at 12.5 px/m, with zoom clamped to 0.75–2 on a 640×400 canvas, so Stevie (0.53 m) can be at most about 13 px tall. The proof therefore magnifies the whole slice uniformly about each view's focus, keeping the camera at zoom 1. This stands in for the deep zoom the pinned renderer lacks (see [Gaps](#gaps)). **2× DPR** is the browser at device scale factor 2. The pinned renderer always draws at pixel ratio 1, so the 2× shots show the 640×400 canvas upscaled, not a sharper render.

### Stevie in motion, from the five headings

Close-up, dusk in rain. Each strip is 240×240 crops: the idle at 0, 0.6, 1.2 and 1.8 s, and the walk at every 0.1 s of its 0.8 s cycle.

| Heading | Idle | Walk |
| --- | --- | --- |
| Three-quarter (facing east, down-right) | ![](../../references/look-3d/motion-three-quarter-idle-webgpu.png) | ![](../../references/look-3d/motion-three-quarter-walk-webgpu.png) |
| Right | ![](../../references/look-3d/motion-right-idle-webgpu.png) | ![](../../references/look-3d/motion-right-walk-webgpu.png) |
| Back | ![](../../references/look-3d/motion-back-idle-webgpu.png) | ![](../../references/look-3d/motion-back-walk-webgpu.png) |
| Left | ![](../../references/look-3d/motion-left-idle-webgpu.png) | ![](../../references/look-3d/motion-left-walk-webgpu.png) |
| Front | ![](../../references/look-3d/motion-front-idle-webgpu.png) | ![](../../references/look-3d/motion-front-walk-webgpu.png) |

## Measurements

Frame times are the adapter's own unsmoothed animation-frame intervals (the last 120). Memory is the renderer's texture accounting plus the browser's JS heap where it reports one. Every row carries its backend and renderer string. Any software renderer (SwiftShader, llvmpipe and the like) is marked "software, not performance", and its times are never reported as performance. **Pending:** desktop with a mid-range GPU, and a recent phone (maintainer step after merge).

<!-- look3d:measurements:start -->
| Host | Backend | Renderer | Tier | State | View | Frame p50 / p95 (ms) | Texture MiB | JS heap MiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Desktop, mid-range GPU | webgpu, webgl2 | pending | high | dusk-rain, night | whole, yard, close | pending | pending | pending |
| Recent phone | webgpu or webgl2 | pending | as chosen by the renderer | dusk-rain, night | whole, yard, close | pending | pending | pending |
<!-- look3d:measurements:end -->

## Decision record (draft until the shots are in)

### What should match the mockup, by construction

These are design facts of the slice. Whether they read as the mockup is for the owner to judge from the shots.

- **Camera and composition:** a fixed high three-quarter isometric view, no rotation. The house and porch are upper-left, the fence runs along the top and right, and the bins and path are in the yard, as in the mockup's layout.
- **Palette:** the mockup's mossy greens, warm wood, slate siding, wet mud and galvanised bins.
- **Wet, rainy evening:** rain streaks, puddles, wetter surfaces, a warm porch lantern and window from dusk, and the renderer's blue night grade.
- **Cohesion:** one light, grade, outline, material and scale for Stevie and every prop.
- **Stevie's identity:** the Meshy mesh keeps the mask, white brows and ringed tail of the approved turnaround (#77's likeness finding).

### What will not match yet (known before rendering)

- **Light falling on things:** in the mockup, warm lamp light pools on the ground and rim-lights the raccoons. World content cannot add a light in the pinned renderer, so the lantern and window glow but light nothing. A faint warm decal on the ground under the lantern stands in for the pool.
- **Shadows:** the mockup has soft cast shadows. The pinned renderer has no shadow maps for content, so the slice has only a contact ellipse under Stevie. Props sit on the ground with no shadow.
- **Dusk:** the mockup's 4:37 PM rain is a dusky, golden-and-blue grade. The pinned renderer has only a day state and a night state (night from 18:00), so 17:30 renders in the day state with the lamps lit.
- **Richness of detail:** the mockup is painterly, with moss, ferns, mushrooms, fine fur and textured wood. The slice is simple flat-coloured forms. That keeps the detail density matched, but it is sparse next to the mockup. Stevie's fur is his Meshy albedo, not strands.
- **Deep zoom and 2× DPR:** not possible in the pinned renderer (see How the zooms are made, above).
- **Puddle reflections:** the renderer's stencil-masked reflections apply to its own atlas puddles, not to content. The slice's puddles are dark, low-roughness discs.

### Gaps

Each is a Clockgrove change (clockgrove/clockgrove), not one for this repository:

1. **Deep zoom:** a zoom range reaching a raccoon close-up (about ×20 of today's 12.5 px/m), instead of the clamp at 2.
2. **Device pixel ratio:** the canvas follows `devicePixelRatio` (capped per tier), instead of a fixed 640×400 at pixel ratio 1.
3. **Lights from world content:** point or spot lights, or a projected light from a lit effect, so the porch lamp lights Stevie and the ground.
4. **Shadows for content:** soft shadows from the sky light, at least at the high tier.
5. **A dusk lighting state,** between day and night.
6. **Wet surfaces and reflections for content:** a rain-driven wetness input, and puddle reflections that include content.

### What it would take to close the gap

- **In the renderer:** gaps 1 to 4 are needed for the mockup's look; 5 and 6 are polish.
- **In the art:**
  - A painterly material layer within the renderer's lighting: texture-painted albedo with hand-drawn wood grain, moss and stone, rather than flat colours.
  - Props from generation or hand modelling, at about Stevie's density.
  - A fur treatment (texture strokes or shells) that holds up at the close-up.
- **In motion:** proper clips for idle, walk, sniff, eat and shelter on the quadruped rig. The procedural idle and walk only show the rig works.

### Cost of one more of each

Measured figures are from #77's recorded calls (`references/stevie/77-3d/provenance.json`); everything else is an estimate. No generation money was spent by this proof: $0 of the $25 cap (`references/look-3d/provenance.json`).

| One more… | Route | Dollars | Operator minutes |
| --- | --- | --- | --- |
| Prop, procedural (as in this proof) | Code in `yard.ts` | $0 generation (measured: this run spent nothing) | About 10 to review the shot (estimate) |
| Prop, generated | Meshy multi-image to 3D, then `ship.mjs` | $0.70 per call (measured: 35 credits at $0.02 each, which is an estimate of the credit price). Allow about $1.40 with one retry (estimate). | 2.9 min provider time per call (measured), plus about 10 to pick and review (estimate) |
| Animation, procedural | A keyframed clip on the fitted quadruped rig, as idle and walk here | $0 (estimate) | About 15 to review from the five headings (estimate) |
| Animation, provider | Tripo's preset quadruped walk on Tripo's rig | $0.35 to $0.40 per model with rig (measured: credits consumed, valued at $0.01 per credit, which is an estimate) | About 10 to review (estimate) |
| Raccoon variant, recolour | Tint or albedo edit of Stevie's mesh in code | $0 (estimate) | About 10 (estimate) |
| Raccoon variant, new mesh | New turnaround (AI Gateway image edit), then Meshy multi-image to 3D | $0.18 for the image (measured) plus $0.70 for Meshy (measured): about $0.90, or $1.80 with one retry each (estimate) | 1.1 + 2.9 min provider time (measured), plus about 15 to approve the turnaround and review (estimate) |

## Licences and credit

- **Stevie:** a 3D model generated with Meshy (meshy.ai) on Meshy's Free plan, CC BY 4.0. That is acceptable for this proof, which doesn't ship. Every render that shows him is CC BY 4.0 too: `REUSE.toml` annotates `references/look-3d/*.png`.
- **Everything else** (the yard geometry, rig, clips, page and scripts): MIT, as Raccoon World work.
- Each input's `outputGrant` (licence, plan, commercial use, relabel) is recorded in `references/look-3d/provenance.json`, alongside its sha256 and the call that made it.

## CI

`bash scripts/clockgrove.sh check`, CI's existing step, now also runs `slice`. That step:

- builds this page at the pinned commit with the pinned Vite;
- opens it in Playwright's Chromium under SwiftShader on WebGPU and on forced WebGL2, at the low and high tiers;
- checks the content reports `ready`;
- checks the renderer string is SwiftShader;
- checks that hiding Stevie, or any of the 12 props, changes the picture;
- checks that the walk animates.

Its times are never reported as performance.

## Maintainer steps

1. **Desktop GPU shots and numbers.** Use a desktop browser on a mid-range GPU. Run this from the repository root, after `bash scripts/clockgrove.sh fetch`:

   ```sh
   node spikes/look-3d/scripts/look.mjs capture --label "<OS, browser, GPU>" \
     --browser "<path to Chrome or Edge>" --browser-arg=--enable-unsafe-webgpu --browser-arg=--use-angle=d3d11
   ```

   It writes every shot above, the motion strips and `results.json` into `references/look-3d/`, and fills in the measurements table. Check that each row's renderer string names the GPU, not SwiftShader. Then commit the PNGs (they go to Git LFS) together with `results.json`.
2. **Recent phone.**
   - Serve the page with `node spikes/look-3d/scripts/serve.mjs serve`. It binds to 127.0.0.1 only.
   - On Android, forward the port with `adb reverse tcp:<port> tcp:<port>` and open the URL in Chrome.
   - In remote DevTools, call `look3d.setView("yard")`, wait 5 s, and record `look3d.metrics()` and `look3d.rendererString()` for each view.
   - Add a row to the table with the phone's name.
3. **The owner judges** this report against the mockup. The 2D options (#11) stay open until then. clockgrove/clockgrove#158 and #23 stay on hold.
