# 3D look proof: Stevie and a yard corner in real-time 3D (issue 26)

**The question:** can Raccoon World look like the owner's mockup in real-time 3D? This report shows Stevie and a small corner of the yard as real-time 3D in Clockgrove's product renderer, next to the mockup, and records what matches, what doesn't, and what closing the gap costs.

**Status:** the slice, the renderer path, the slice's software-GPU journey and every shot are done. The shots below were rendered on 2026-11-09 by the pinned renderer in Playwright's Chromium 153 under SwiftShader (a software GPU), on both backends. A software GPU draws the same picture as a real one, but its frame times say nothing about performance, so the table below reports none. **Pending:** the desktop mid-range GPU and recent-phone measurements, maintainer steps after merge (see [Maintainer steps](#maintainer-steps)).

The look target is [the mockup](reference/raccoon-world-reference.png). Its camera and devices come from [visual decisions](visual-decisions.md): a fixed isometric camera with deep zoom, on desktop plus recent phones.

![The mockup](reference/raccoon-world-reference.png)

## What is drawn, and how

- **Renderer:** Clockgrove's product renderer (`ThreeWorldSceneAdapter`, WebGPU with an automatic WebGL2 fallback) at the commit this repository pins (`CLOCKGROVE_COMMIT`, 8bf1957). Everything is added through the world-content seam, renderer content v1 ([clockgrove/clockgrove#112](https://github.com/clockgrove/clockgrove/issues/112)). The slice brings no light, camera, grade or post pass of its own, because the seam rejects them. Ambient and sky light, fog, ACES grade, bloom, rain streaks and the low, medium and high quality tiers all belong to the renderer. The page is [`spikes/look-3d/`](../../spikes/look-3d/).
- **Stevie:** the existing Meshy model from #77 ([`ship-meshy-fit.glb`](../../references/stevie/77-3d/ship-meshy-fit.glb): Meshy multi-image to 3D from the approved turnaround, reduced to 9,799 triangles with a 2048² KTX2 albedo). It is restyled in code, not regenerated:
  - the #77 quadruped skeleton (18 joints) is fitted to the mesh at load;
  - the #77 procedural idle (2.4 s) and walk (0.8 s) clips play on that rig;
  - his albedo is repainted in the shader into four flat storybook tones (mask, dark coat, coat, cream; `flatAlbedo` in [`look.ts`](../../spikes/look-3d/src/look.ts)). The Meshy texture is blurred past its fur strands and posterised by luminance, so the mask, ear rims, tail rings and dark legs survive as flat regions and the photographic fur does not;
  - his outline is pushed out along a simplified hull: per-vertex directions welded across UV seams and smoothed over the surface, as the props' hull directions are, instead of his fur-scale vertex normals.
  
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
  - **Matched detail density:** simple forms and flat colour throughout. Stevie's 9.8k triangles and four flat tones sit beside about 13.5k vertex-coloured triangles for the whole yard corner.
- **Rain and wet:** the renderer draws the rain streaks, 192 at the high tier. While the projection's rain is above zero, the slice shows its puddles and lowers every surface's roughness.
- **Lamps:** the porch lantern and the window use the renderer's warm source colour (`0xffb966`) and its emissive bound (0.45). They light from 17:00 and bloom at the medium and high tiers.

## The shots

**Every shot below is an interim zoom:** magnified content, not the renderer's own camera, until [clockgrove/clockgrove#184](https://github.com/clockgrove/clockgrove/issues/184) lands (owner's answer, 2026-11-09). Each one is labelled so here, and each record in `results.json` carries `zoomMethod`. Re-capturing them once #184 lands is a follow-up.

Every shot and every motion-strip frame is taken at the high tier, with reduced motion (held frames) and the camera at the product's zoom 1. The renderer's own tiering steps the tier down when its frame p95 exceeds the budget, which a software GPU always triggers, so the capture holds the high tier for each shot (`look3d.holdQuality`) and fails if `status().qualityTier` reports anything else. All 44 records in `references/look-3d/results.json` say `high`. Each shot appears once per backend: the WebGPU set first, then the WebGL2 set. File names, sizes, hashes, backend, renderer string and tier for every image are in `results.json`.

### Dusk in rain and night, next to the mockup

| Dusk in rain (17:30, interim zoom, day state) | Night in rain (22:00, interim zoom) |
| --- | --- |
| ![dusk, yard view](../../references/look-3d/zoom-dusk-rain-yard-1x-webgpu.png) | ![night, yard view](../../references/look-3d/zoom-night-yard-1x-webgpu.png) |

### The zoom test

| View | 1× DPR | 2× DPR (interim: the 1× canvas upscaled) |
| --- | --- | --- |
| Whole slice (28 px/m; interim zoom ×2.2) | ![](../../references/look-3d/zoom-dusk-rain-whole-1x-webgpu.png) | ![](../../references/look-3d/zoom-dusk-rain-whole-2x-webgpu.png) |
| Default yard view (90 px/m, Stevie ≈ 12% of the frame height, as in the mockup; interim zoom ×7.2) | ![](../../references/look-3d/zoom-dusk-rain-yard-1x-webgpu.png) | ![](../../references/look-3d/zoom-dusk-rain-yard-2x-webgpu.png) |
| Close-up (250 px/m, Stevie ≈ a third of the frame height; interim zoom ×20) | ![](../../references/look-3d/zoom-dusk-rain-close-1x-webgpu.png) | ![](../../references/look-3d/zoom-dusk-rain-close-2x-webgpu.png) |

The same views at night (22:00, rain, interim zoom):

| View | 1× DPR | 2× DPR (interim: the 1× canvas upscaled) |
| --- | --- | --- |
| Whole slice (interim zoom ×2.2) | ![](../../references/look-3d/zoom-night-whole-1x-webgpu.png) | ![](../../references/look-3d/zoom-night-whole-2x-webgpu.png) |
| Default yard view (interim zoom ×7.2) | ![](../../references/look-3d/zoom-night-yard-1x-webgpu.png) | ![](../../references/look-3d/zoom-night-yard-2x-webgpu.png) |
| Close-up (interim zoom ×20) | ![](../../references/look-3d/zoom-night-close-1x-webgpu.png) | ![](../../references/look-3d/zoom-night-close-2x-webgpu.png) |

The WebGL2 backend, the same shots (interim zoom, magnified content):

| State and view | 1× DPR | 2× DPR (interim: the 1× canvas upscaled) |
| --- | --- | --- |
| Dusk in rain, whole slice (interim zoom ×2.2) | ![](../../references/look-3d/zoom-dusk-rain-whole-1x-webgl2.png) | ![](../../references/look-3d/zoom-dusk-rain-whole-2x-webgl2.png) |
| Dusk in rain, default yard view (interim zoom ×7.2) | ![](../../references/look-3d/zoom-dusk-rain-yard-1x-webgl2.png) | ![](../../references/look-3d/zoom-dusk-rain-yard-2x-webgl2.png) |
| Dusk in rain, close-up (interim zoom ×20) | ![](../../references/look-3d/zoom-dusk-rain-close-1x-webgl2.png) | ![](../../references/look-3d/zoom-dusk-rain-close-2x-webgl2.png) |
| Night in rain, whole slice (interim zoom ×2.2) | ![](../../references/look-3d/zoom-night-whole-1x-webgl2.png) | ![](../../references/look-3d/zoom-night-whole-2x-webgl2.png) |
| Night in rain, default yard view (interim zoom ×7.2) | ![](../../references/look-3d/zoom-night-yard-1x-webgl2.png) | ![](../../references/look-3d/zoom-night-yard-2x-webgl2.png) |
| Night in rain, close-up (interim zoom ×20) | ![](../../references/look-3d/zoom-night-close-1x-webgl2.png) | ![](../../references/look-3d/zoom-night-close-2x-webgl2.png) |

**How the zooms are made:** the pinned renderer's camera is fixed at 12.5 px/m, with zoom clamped to 0.75–2 on a 640×400 canvas, so Stevie (0.53 m) can be at most about 13 px tall. The proof therefore magnifies the whole slice uniformly about each view's focus, keeping the camera at zoom 1. This is the interim measure the owner accepted (2026-11-09) for the deep zoom the pinned renderer lacks, filed as [clockgrove/clockgrove#184](https://github.com/clockgrove/clockgrove/issues/184) (see [Gaps](#gaps)). **2× DPR** is the browser at device scale factor 2. The pinned renderer always draws at pixel ratio 1, so the 2× shots show the 640×400 canvas upscaled, not a sharper render.

### Stevie in motion, from the five headings

Close-up (interim zoom ×20, magnified content), dusk in rain. Each strip is 240×240 crops: the idle at 0, 0.6, 1.2 and 1.8 s, and the walk at every 0.1 s of its 0.8 s cycle.

WebGPU:

| Heading | Idle | Walk |
| --- | --- | --- |
| Three-quarter (facing east, down-right) | ![](../../references/look-3d/motion-three-quarter-idle-webgpu.png) | ![](../../references/look-3d/motion-three-quarter-walk-webgpu.png) |
| Right | ![](../../references/look-3d/motion-right-idle-webgpu.png) | ![](../../references/look-3d/motion-right-walk-webgpu.png) |
| Back | ![](../../references/look-3d/motion-back-idle-webgpu.png) | ![](../../references/look-3d/motion-back-walk-webgpu.png) |
| Left | ![](../../references/look-3d/motion-left-idle-webgpu.png) | ![](../../references/look-3d/motion-left-walk-webgpu.png) |
| Front | ![](../../references/look-3d/motion-front-idle-webgpu.png) | ![](../../references/look-3d/motion-front-walk-webgpu.png) |

WebGL2:

| Heading | Idle | Walk |
| --- | --- | --- |
| Three-quarter (facing east, down-right) | ![](../../references/look-3d/motion-three-quarter-idle-webgl2.png) | ![](../../references/look-3d/motion-three-quarter-walk-webgl2.png) |
| Right | ![](../../references/look-3d/motion-right-idle-webgl2.png) | ![](../../references/look-3d/motion-right-walk-webgl2.png) |
| Back | ![](../../references/look-3d/motion-back-idle-webgl2.png) | ![](../../references/look-3d/motion-back-walk-webgl2.png) |
| Left | ![](../../references/look-3d/motion-left-idle-webgl2.png) | ![](../../references/look-3d/motion-left-walk-webgl2.png) |
| Front | ![](../../references/look-3d/motion-front-idle-webgl2.png) | ![](../../references/look-3d/motion-front-walk-webgl2.png) |

## Measurements

Frame times are the adapter's own unsmoothed animation-frame intervals (the last 120). Memory is the renderer's texture accounting plus the browser's JS heap where it reports one. Every row carries its backend and renderer string. Any software renderer (SwiftShader, llvmpipe and the like) is marked "software, not performance", and its times are never reported as performance. **Pending:** desktop with a mid-range GPU, and a recent phone (maintainer step after merge).

The rows below are the software-GPU run that made the shots. They show the memory figures. Unlike the shots, the timed runs are released from the high-tier hold and run under the renderer's own tier policy, which steps down on a software GPU; each row records the tier it ran at. Their raw interval figures are in `results.json` as `softwareFrameMs`. They sit at the headless browser's 60 Hz frame clock (16.7 ms), so they are not a performance measure.

<!-- look3d:measurements:start -->
| Host | Backend | Renderer | Tier | State | View | Frame p50 / p95 (ms) | Texture MiB | JS heap MiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | high | dusk-rain | whole | software, not performance | 15.7 | 87.5 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | high | dusk-rain | yard | software, not performance | 15.7 | 87.5 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | medium | dusk-rain | close | software, not performance | 10.3 | 87.5 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | medium | night | whole | software, not performance | 10.3 | 87.5 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | low | night | yard | software, not performance | 8.3 | 87.5 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgpu | google / swiftshader | low | night | close | software, not performance | 8.3 | 87.5 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | high | dusk-rain | whole | software, not performance | 15.7 | 73.1 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | medium | dusk-rain | yard | software, not performance | 10.3 | 73.1 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | medium | dusk-rain | close | software, not performance | 10.3 | 73.1 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | low | night | whole | software, not performance | 8.3 | 73.1 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | low | night | yard | software, not performance | 8.3 | 73.1 |
| factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software) | webgl2 | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | low | night | close | software, not performance | 8.3 | 73.1 |

Captured on "factory sandbox, WSL2, headless Chromium 153 on SwiftShader (software)"; every number and image is in `references/look-3d/results.json`.
<!-- look3d:measurements:end -->

## Decision record

The owner makes the call from the shots. This record gives the builder's reading of them, against the mockup, with cohesion judged first (Kirk, 2026-11-07).

### What the shots show

- **Matches:**
  - **Camera and composition:** the whole-slice and yard views sit at the mockup's high three-quarter angle, and the house and porch, fence, path and bins land where the mockup has them.
  - **One light, one grade, one camera and scale:** every object shares the same light and grade on both backends. The props hold together as one diorama: same outline, same flat storybook shading, same palette.
  - **Palette:** the warm wood, slate siding, mossy ground and green shrubs carry the mockup's colours. Rain reads at every zoom.
- **Stevie, restyled:** the first capture drew his Meshy albedo as is: a photographic fur texture that read as a realistic animal in a toy yard, with an outline speckling across the fur. He is now repainted into four flat storybook tones and outlined from a smoothed hull (see [What is drawn](#what-is-drawn-and-how)). In the yard view he now reads as part of the same diorama: flat colour like the props, a clean dark silhouette, and the mask, brows, ear rims and tail rings as flat shapes. Close up, it is still rough:
  - The posterised tones follow Meshy's texture, so the coat carries some blotchy dark patches along the back where the fur shading crosses a band edge.
  - The bands are luminance thresholds on one texture. A hand-painted or regenerated flat albedo would give cleaner shapes.
  - In the walk strips a few outline flecks still show where the back and hips bend, because the hull follows the skinned normal rather than a separate low-poly cage.

  This meets "matched detail density", "consistent edges" and "stylised" at the default yard view. The close-up shows what a proper art pass would still improve.
- **Doesn't match, because of the renderer** (see [Gaps](#gaps)):
  - "Dusk in rain" is plain daylight.
  - At night the lantern and window glow, but nothing around them is lit, so the night yard is mostly dark green. The mockup's mood comes from warm light pooling on wet ground.
  - Nothing casts a shadow except Stevie's contact ellipse.
  - Puddles read as dark holes, not reflective water.
  - The 2× DPR shots are soft upscales.
- **Doesn't match, because of scope:** the mockup's richness (moss, ferns, mushrooms, clutter, textured wood) is far beyond this sparse corner. That is expected of a proof slice.

**Reading:** Stevie and the yard show that the renderer's lighting, grade and camera can carry a cohesive, mockup-coloured stylised diorama. It doesn't yet show the mockup's look. That needs the lit dusk and night mood that only #184 can give, and a cleaner hand-made flat albedo for Stevie at the close-up.

### What should match the mockup, by construction

These are design facts of the slice.

- **Camera and composition:** a fixed high three-quarter isometric view, no rotation. The house and porch are upper-left, the fence runs along the top and right, and the bins and path are in the yard, as in the mockup's layout.
- **Palette:** the mockup's mossy greens, warm wood, slate siding, wet mud and galvanised bins.
- **Wet, rainy evening:** rain streaks, puddles, wetter surfaces, a warm porch lantern and window from dusk, and the renderer's blue night grade.
- **Cohesion:** one light, grade, outline, material and scale for Stevie and every prop, and flat colour on both. The first capture showed this wasn't enough while Stevie kept his photographic albedo, so it is now repainted flat (above).
- **Stevie's identity:** the Meshy mesh keeps the mask, white brows and ringed tail of the approved turnaround (#77's likeness finding).

### What will not match yet (known before rendering)

- **Light falling on things:** in the mockup, warm lamp light pools on the ground and rim-lights the raccoons. World content cannot add a light in the pinned renderer, so the lantern and window glow but light nothing. A faint warm decal on the ground under the lantern stands in for the pool.
- **Shadows:** the mockup has soft cast shadows. The pinned renderer has no shadow maps for content, so the slice has only a contact ellipse under Stevie. Props sit on the ground with no shadow.
- **Dusk:** the mockup's 4:37 PM rain is a dusky, golden-and-blue grade. The pinned renderer has only a day state and a night state (night from 18:00), so 17:30 renders in the day state with the lamps lit.
- **Richness of detail:** the mockup is painterly, with moss, ferns, mushrooms, fine fur and textured wood. The slice is simple flat-coloured forms. That keeps the detail density matched, but it is sparse next to the mockup. Stevie's fur is four flat tones posterised from his Meshy albedo, not strands.
- **Deep zoom and 2× DPR:** not possible in the pinned renderer (see How the zooms are made, above).
- **Puddle reflections:** the renderer's stencil-masked reflections apply to its own atlas puddles, not to content. The slice's puddles are dark, low-roughness discs.

### Gaps

Each is a Clockgrove change, not one for this repository. The owner filed the first four as [clockgrove/clockgrove#184](https://github.com/clockgrove/clockgrove/issues/184) (full-resolution viewport at device pixel ratio, deep zoom, continuous time of day including dusk, content lights and shadows). Re-capturing this report once #184 lands is a follow-up.

| Gap | What this proof can show without it | What it can't show |
| --- | --- | --- |
| 1. **Deep zoom** (#184): a zoom range reaching a raccoon close-up (about ×20 of today's 12.5 px/m), instead of the clamp at 2 | The slice's forms, palette, outline and Stevie's silhouette at the mockup's scale and at a close-up, by magnifying the content (interim, labelled on every shot) | How the renderer's own layers (atlas ground, rain streaks, fog, bloom) hold up at those zooms; they stay at zoom 1 while the content is magnified, so their scale relative to Stevie is wrong in the yard and close-up views |
| 2. **Device pixel ratio** (#184): the canvas follows `devicePixelRatio` (capped per tier), instead of a fixed 640×400 at pixel ratio 1 | Composition and colour at 2× | Sharpness at 2×: the 2× shots are the 1× canvas upscaled, so edge quality, outline width and texture detail on a high-DPR screen are unproven, and so is the 2× frame cost |
| 3. **Dusk lighting state** (#184, continuous time of day) | The night grade, and the lamps lit at 17:30 | The mockup's golden-and-blue dusk: "dusk in rain" renders in the day state |
| 4. **Lights and shadows from world content** (#184) | The lantern and window glowing and blooming; a contact ellipse under Stevie; a warm decal for the light pool | Lamp light falling on Stevie and the ground, rim light, and soft cast shadows: the mockup's strongest mood cues |
| 5. **Wet surfaces and reflections for content** (not in #184) | Puddles as dark low-roughness discs, and lower roughness while it rains | Reflections in the puddles of Stevie, the lamps and the house |

### What it would take to close the gap

- **In the renderer:** gaps 1, 2 and 4 are needed for the mockup's look, and 3 for its time of day (all in #184); 5 is polish.
- **In the art:**
  - Stevie's restyle finished by hand: the shader posterise here proves the direction; a hand-painted flat albedo (or one regenerated from a stylised turnaround) and a low-poly outline cage would remove the blotches and the outline flecks at the close-up.
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

`bash scripts/clockgrove.sh slice` is the slice's CI check, its own step in the `ci` workflow after the world-pack check. It fetches the pinned checkout if needed, applies the shared Node version gate, then runs `node spikes/look-3d/scripts/look.mjs journey`, which:

- builds this page at the pinned commit with the pinned Vite;
- opens it in Playwright's Chromium under SwiftShader on WebGPU and on forced WebGL2, at the low and high tiers, each held and checked;
- checks the content reports `ready`;
- checks the renderer string is SwiftShader;
- checks that hiding Stevie, or any of the 12 props, changes the picture;
- checks that the walk animates.

Its times are never reported as performance. It is not part of `check`, so Factory's validation and local `check` runs never download a browser. The step downloads Playwright's Chromium (about 115 MiB for the headless shell) when it is missing and runs about two to three minutes.

## Maintainer steps

1. **Desktop GPU shots and numbers.** Use a desktop browser on a mid-range GPU. Run this from the repository root, after `bash scripts/clockgrove.sh fetch`:

   ```sh
   node spikes/look-3d/scripts/look.mjs capture --label "<OS, browser, GPU>" \
     --browser "<path to Chrome or Edge>" --browser-arg=--enable-unsafe-webgpu --browser-arg=--use-angle=d3d11
   ```

   It rewrites every shot above, the motion strips and `results.json` in `references/look-3d/` (replacing this run's SwiftShader set), and rewrites the measurements table. Check that each row's renderer string names the GPU, not SwiftShader. Then commit the PNGs (they go to Git LFS) together with `results.json`.
2. **Recent phone.**
   - Serve the page with `node spikes/look-3d/scripts/serve.mjs serve`. It binds to 127.0.0.1 only.
   - On Android, forward the port with `adb reverse tcp:<port> tcp:<port>` and open the URL in Chrome.
   - In remote DevTools, call `look3d.setView("yard")`, wait 5 s, and record `look3d.metrics()` and `look3d.rendererString()` for each view.
   - Add a row to the table with the phone's name.
3. **After clockgrove/clockgrove#184 lands:** bump `CLOCKGROVE_COMMIT`, replace the interim magnified zoom with the renderer's own zoom and DPR, and re-run step 1 (follow-up).
4. **The owner judges** this report against the mockup. The 2D options (#11) stay open until then. clockgrove/clockgrove#158 and #23 stay on hold.
