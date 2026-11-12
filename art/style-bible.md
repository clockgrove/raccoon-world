---
version: "1"
world: Raccoon World
preset: cozy-storybook
axes:
  rendering: painterly
  realism: high-quality illustrated realism, never photographic and never cartoon-flat; characters are naturalistic and the environment a touch painterly (see looks)
  proportions: true-to-life raccoon proportions; each character keeps the build of their identity lock
  outline:
    weight: none
    colour: "{outline}"
  shading: soft
  detailDensity: high where the eye lands, lower in the background
  texture: soft, believable surfaces; each look below sets its own texture
  lightingKey: warm amber lantern and window light against cool blue-grey dusk and rain; soft rim light separating fur from the background
looks:
  character:
    rendering: naturalistic
    realism: very high-quality naturalistic rendering like Stevie's approved turnaround; soft, believable fur and anatomy; never photographic and never painterly
    detailDensity: high on faces, masks and banded tails; medium on fur bodies
    texture: fine, soft, naturalistic fur with fur strands at every silhouette edge; no visible brushwork
  environment:
    rendering: painterly
    realism: painterly and deliberately less photorealistic than the cast, so the backyard never competes with the characters; believable materials
    detailDensity: medium on the house, porch, path and props; lower on background foliage
    texture: soft visible brushwork; a wet sheen on stone and wood
tone:
  audience: all-ages
  moodRange: [cosy, curious, calm, playful, rainy]
  contentLimits:
    - no graphic violence or injury
    - no sexual content
    - no hateful imagery
    - no text, logos or watermarks in the art
anchors:
  positive:
    - path: ../docs/design/reference/raccoon-world-reference.png
      role: world mockup and perspective sample (owner's reference)
    - path: ../references/stevie/turnaround.png
      role: character look anchor (owner, 2026-11-11)
      subject: stevie
      look: character
    - path: ../references/jimothy/jimothy-peanut-painted.png
      role: painted brushwork anchor for the environment
      subject: jimothy
      look: environment
    - path: ../references/stevie/turnaround-three-quarter.png
      role: approved turnaround, three-quarter view (identity lock)
      subject: stevie
      look: character
    - path: ../references/stevie/turnaround-front.png
      role: approved turnaround, front view
      subject: stevie
      look: character
    - path: ../references/stevie/turnaround-side.png
      role: approved turnaround, side view
      subject: stevie
      look: character
    - path: ../references/jimothy/sheet-cell-03.png
      role: contact sheet cell 3 (identity lock)
      subject: jimothy
      look: character
    - path: ../references/gracie/gracie-lounging.png
      role: owner's photo, likeness reference only (not the look); her long pale grey lower-body fur
      subject: gracie
      look: character
    - path: ../references/gracie/gracie-ice-cube.png
      role: owner's photo, likeness reference only (not the look); hand-like paws with dark palms and soles, ringed tail
      subject: gracie
      look: character
    - path: ../references/gracie/gracie-sleeping.png
      role: owner's photo, likeness reference only (not the look); rest pose, side-lying with her head tucked onto her front paws
      subject: gracie
      look: character
    - path: ../references/gracie/turnaround-three-quarter.png
      role: approved turnaround (Kirk, 2026-11-11), three-quarter view (identity lock)
      subject: gracie
      look: character
    - path: ../references/gracie/turnaround-front.png
      role: approved turnaround (Kirk, 2026-11-11), front view
      subject: gracie
      look: character
    - path: ../references/gracie/turnaround-side.png
      role: approved turnaround (Kirk, 2026-11-11), side view
      subject: gracie
      look: character
    - path: ../references/gracie/turnaround-back.png
      role: approved turnaround (Kirk, 2026-11-11), back view
      subject: gracie
      look: character
  negative:
    - path: ../references/stevie/77-3d/preview-fal-three-quarter-bind.png
      role: unapproved 3D spike render; not the look
    - path: ../references/stevie/77-3d/preview-meshy-bind.png
      role: unapproved 3D spike render; not the look
    - path: ../references/stevie/77-3d/preview-tripo-provider-render.png
      role: unapproved 3D spike render; not the look
    - path: ../references/jimothy/assetforge-38-proof/fix/idle.png
      role: unapproved Assetforge proof output; not a pick
    - path: ../references/stevie/comparison-candidates/idle/strip.png
      role: comparison-only strip; not a pick
    - path: ../references/stevie/comparison-candidates/walk/strip.png
      role: comparison-only strip; not a pick
colorRule: full
tokens:
  palette:
    $type: color
    night-ink:
      $value: { colorSpace: srgb, components: [0.11, 0.106, 0.122], hex: "#1c1b1f" }
    raccoon-grey:
      $value: { colorSpace: srgb, components: [0.42, 0.4, 0.384], hex: "#6b6662" }
    mask-black:
      $value: { colorSpace: srgb, components: [0.157, 0.137, 0.137], hex: "#282323" }
    muzzle-cream:
      $value: { colorSpace: srgb, components: [0.886, 0.843, 0.761], hex: "#e2d7c2" }
    tail-tan:
      $value: { colorSpace: srgb, components: [0.682, 0.588, 0.459], hex: "#ae9675" }
    lantern-amber:
      $value: { colorSpace: srgb, components: [0.949, 0.639, 0.282], hex: "#f2a348" }
    cedar-brown:
      $value: { colorSpace: srgb, components: [0.369, 0.239, 0.157], hex: "#5e3d28" }
    moss-green:
      $value: { colorSpace: srgb, components: [0.333, 0.408, 0.212], hex: "#556836" }
    wet-slate:
      $value: { colorSpace: srgb, components: [0.373, 0.42, 0.459], hex: "#5f6b75" }
    rain-blue:
      $value: { colorSpace: srgb, components: [0.494, 0.588, 0.663], hex: "#7e96a9" }
  light:
    $type: color
    $value: { colorSpace: srgb, components: [1, 0.808, 0.533], hex: "#ffce88" }
  rim:
    $type: color
    $value: { colorSpace: srgb, components: [0.729, 0.812, 0.878], hex: "#bacfe0" }
  fog:
    colour:
      $type: color
      $value: { colorSpace: srgb, components: [0.384, 0.443, 0.494], hex: "#62717e" }
    density:
      $type: number
      $value: 0.15
  outline:
    $type: color
    $value: "{palette.night-ink}"
  valueRange:
    min: { $type: number, $value: 0.06 }
    max: { $type: number, $value: 0.92 }
  saturation:
    min: { $type: number, $value: 0.15 }
    max: { $type: number, $value: 0.7 }
  lighting:
    warmKey:
      $type: color
      $value: "{palette.lantern-amber}"
    coolFill:
      $type: color
      $value: "{palette.rain-blue}"
    keyToFillRatio:
      $type: number
      $value: 2.5
adjustable:
  mood: [cosy, curious, calm, playful, rainy]
  saturation: { min: 0.2, max: 0.65 }
identities:
  stevie:
    version: "3"
    approved: true
    turnaround: ../references/stevie/turnaround-three-quarter.png
    references:
      - ../references/stevie/turnaround-front.png
      - ../references/stevie/turnaround-side.png
      - ../references/stevie/turnaround-back.png
    signatureFeatures:
      - stocky, rounded adult raccoon on short legs, with a rounded, gently arched back
      - grey-brown coat with a darker, streaked back and a warm tan underside
      - dark brown-black eye mask with cream brows and a cream muzzle
      - rounded ears with pale rims
      - full tail ringed with dark bands on tan, dark tip
      - dark brown lower legs and hand-like paws
    proportions: compact, rounded body on short legs with a gently arched back; stocky rather than lean; a sleeker, less fluffy coat than Jimothy
    palette: ["#6b6662", "#282323", "#e2d7c2", "#ae9675", "#3a3330"]
  jimothy:
    version: "1"
    approved: true
    turnaround: ../references/jimothy/sheet-cell-03.png
    references: [../references/jimothy/jimothy-peanut-painted.png]
    signatureFeatures:
      - short-spined, round, hunched raccoon
      - very fluffy coat with a warm brown cast
      - big fluffy tail with broad dark and tan bands
      - dark eye mask, cream brows and muzzle, bright round eyes
    proportions: short spine, round chubby body carried low, short legs, big tail
    palette: ["#5c5049", "#282323", "#e2d7c2", "#9c8064", "#3a3330"]
  gracie:
    version: "1"
    approved: true
    turnaround: ../references/gracie/turnaround-three-quarter.png
    references:
      - ../references/gracie/turnaround-front.png
      - ../references/gracie/turnaround-side.png
      - ../references/gracie/turnaround-back.png
    signatureFeatures:
      - lower body (belly, flanks and hindquarters, down over her legs) lighter, greyer, noticeably longer and shaggier than her back
      - shorter, darker grey-brown fur on her back
      - full dark eye mask with pale brows and a pale muzzle
      - rounded ears with pale rims
      - ringed tail with dark and tan bands, dark tip
      - long-fingered hand-like front paws with dark palms; plantigrade hind feet with dark soles and pale fur over the top
    proportions: true-to-life adult raccoon on all fours, back gently arched; her shaggy lower-body fur makes her look full and fluffy below a sleeker back
    palette: ["#6b6559", "#b3ab9e", "#282323", "#e2d7c2", "#ae9675"]
perspective: ../docs/design/reference/raccoon-world-reference.png
perspectiveDescription: high three-quarter isometric view from above, the camera looking down on the yard at roughly 30 to 35 degrees, ground plane receding to the upper right
subjects:
  stevie:
    description: Stevie, a stocky, rounded adult raccoon on short legs, grey-brown with a darker streaked back and a warm tan underside, dark legs and paws, a dark eye mask, cream muzzle and brows, rounded pale-rimmed ears and a full ringed tail with a dark tip
  jimothy:
    description: Jimothy, a short-spined, round, hunched and chubby raccoon with a very fluffy coat and a big fluffy banded tail
  gracie:
    description: Gracie, an adult raccoon whose lower body (belly, flanks and hindquarters, down over her legs) has lighter, greyer, noticeably longer and shaggier fur than her back; a full dark eye mask with pale brows and a pale muzzle, rounded pale-rimmed ears and a ringed tail
---
# Raccoon World art direction

This is the one statement of Raccoon World's look. Assetforge reads it as the world's constitution: briefs, specs and run settings can steer mood and pose but never override it. `art/style-bible.json` is derived from this file by `node art/tools/derive-bible.mjs`; never edit it by hand.

## The look

Raccoon World is a quiet Pacific Northwest garden at dusk in the rain. The owner's mockup (`docs/design/reference/raccoon-world-reference.png`) is the reference: painterly, rendered storybook realism seen from a high three-quarter isometric camera. Fur is painted, not drawn: soft edges, fine strands catching the rim light, no outline. Colour is full and natural, never quantised to a palette and never cut to hard on/off transparency, so every sprite keeps soft 8-bit alpha at its fur edge.

Light carries the mood. Warm amber light from lanterns, windows and the porch falls on wet stone, cedar and moss, against the cool blue-grey of dusk and rain. Characters sit in that light: a warm key on the side facing the nearest lamp, a cool fill and a pale rim separating the fur from the dark ground.

It is not pixel art, not flat cartoon and not photographic. Characters and environment differ a little (owner, 2026-11-11):

- **Characters** look like Stevie's approved turnaround (`references/stevie/turnaround.png`): high-quality, naturalistic illustrated fur, soft and believable. They are not photographic and not heavily painterly. The 3D characters are textured and lit to match it.
- **The environment** (the backyard) is a touch more painterly than the characters, so it never tries to be photo-accurate. Jimothy's painted portrait (`references/jimothy/jimothy-peanut-painted.png`) shows the kind of brushwork wanted there.
- **Quality stays high throughout,** without over-indexing on painterly.

The front matter's `looks` carry the split: `character` and `environment` each set their own realism, texture and detail, and every character spec sets `look: character`, so it is planned with the character look and its anchors. Shared axes (lighting, shading, palette and content limits) apply to both.

## Perspective

Every asset is drawn for the mockup's camera: a high three-quarter isometric view from above. Assetforge's vision QA uses the mockup as its perspective sample and judges perspective there (owner decision 2026-11-08; no separate decision-model perspective check). Characters on a sheet face along the ground plane's diagonals as the mockup's raccoons do.

## Characters and identity locks

Each identity lock's written text must agree with its own approved references: Assetforge's `identity-check` verifies it, and a record that disagrees is never used to filter.

- **Stevie:** the approved three-quarter turnaround view, `references/stevie/turnaround-three-quarter.png` (clockgrove/clockgrove#77 pass 1), plus the approved front, side and back views as references. One view alone rejects his other angles (Assetforge's identity lock bar, assetforge#92).
- **Jimothy:** cell 3 of the 57-frame contact sheet (`references/jimothy/sheet-cell-03.png`, cut from `docs/design/reference/jimothy-sprite-sheet.png` by Assetforge's slicer) plus his painted portrait.

- **Gracie:** the three-quarter view of her approved turnaround, `references/gracie/turnaround-three-quarter.png` (candidate c1, picked by Kirk on 2026-11-11), plus its approved front, side and back views as references, as Stevie's lock takes his four approved views. Kirk's photos of her stay subject anchors (likeness only) and are not part of her lock. The 0.68 threshold was measured on Stevie's and Jimothy's locks, not hers, so her score is a record only, like everyone's in shadow mode. Her lock has not yet been run through `identity-check`: that is an owner step (`bash scripts/assetforge.sh run identity-check --bible art/style-bible.md`, a paid call with the AI Gateway key, outside a Factory run).

Identity scoring runs in shadow mode at 0.68 (`art/target-profile.json`): it records a score beside QA and filters nothing. Bump a lock's `version` when it changes.

Stevie's subject references for generation are the three-quarter view (the lock) plus the approved front, side and back views. They fix his mask, ears, rounded back and stocky, short-legged build from every angle a sheet or a 3D turntable draws him in.

### Gracie

Her approved turnaround is candidate c1 of three generated from her photos (`node art/tools/turnaround.mjs gracie`; Kirk's pick, 2026-11-11): `references/gracie/turnaround.png` and its four views, with their provenance in `references/gracie/provenance-turnaround.json`. It shows her pale, silvery, shaggy lower body and legs most clearly against her darker back. Her identity lock is its three-quarter view, with the other three views as references. Her subject references for generation are all four approved views and her photos, as Stevie's are all four of his. Kirk's further photos of her refine the turnaround.

- **Signature, first:** her lower body has lighter, greyer, noticeably longer and shaggier fur than her back. This covers her belly, her flanks and her hindquarters, and runs down over her legs. In Kirk's words: "You can tell Gracie with the grey longer fur on lower body." Every image of her keeps it, and it is what sets her apart from Stevie.
- **Shared raccoon traits:** a full dark eye mask, pale brows and a pale muzzle, rounded ears with pale rims, and a ringed tail.
- **References:** Kirk's three photos in `references/gracie/` (`gracie-lounging.png`, `gracie-ice-cube.png`, `gracie-sleeping.png`). They fix her likeness only. The look is still this bible's character look, never photographic.
- **Rest pose** (for shelter and rest clips): she lies on her side, slightly curled, with her head tucked down onto her front paws, eyes closed and her tail lying along her body.
- **Paws:**
  - Her front paws are long-fingered and hand-like, with dark palms and pale fur over the tops. She holds and turns small things in one paw, which is the reference for `eat`.
  - Her hind feet are plantigrade: the whole dark sole is planted, the toes are pale, and pale fur covers the top of the foot.
- **Gait:** she uses the shared raccoon rig and the gait generated from it, as every raccoon does (`docs/design/visual-decisions.md`; `references/stevie/gait-reference/`). She is hunched with her rump high and her head low, her hand-like front paws plant flat, her tail sways low, and her feet stay on one ground line.

## Anchors

Positive anchors are approved material only: the mockup, Stevie's approved turnaround (the character look anchor) and its views, Jimothy's painted portrait (environment brushwork) and Jimothy's sheet cell 3, Gracie's approved turnaround views and Kirk's photos of Gracie (likeness references scoped to her subject, not style anchors). Unapproved material is listed as negative anchors and is never a positive one: the 3D spike outputs (`references/stevie/77-3d`), the Assetforge #38 proof outputs (`references/jimothy/assetforge-38-proof`) and the Stevie idle and walk strips made for the 3D comparison (`references/stevie/comparison-candidates`).

## Palette and lighting tokens

The palette tokens are the colours the mockup is built from: night ink, raccoon grey, mask black, muzzle cream, tail tan, lantern amber, cedar brown, moss green, wet slate and rain blue. They guide the prompt; the colour rule is `full`, so nothing is snapped to them. `light` is the warm key, `rim` the cool rim, and `lighting` names the warm key, cool fill and their ratio. Fog is a light blue-grey rain haze. Value and saturation bounds keep the scene dusky and natural: no pure white or black, no neon saturation.

## Do's and Don'ts

- Do paint soft fur edges with fine strands and soft 8-bit alpha.
- Do keep the high three-quarter isometric camera of the mockup.
- Do light characters warm from the nearest lamp and cool from the rainy sky, with a pale rim.
- Do keep each character's identity lock: Stevie stocky and round-backed with a sleek grey-brown coat, Jimothy short-spined, hunched and very fluffy, Gracie with her long, shaggy, paler grey lower-body fur.
- Do keep full, natural colour.
- Do give the set more detail where the cast touches it (deck boards, bark, the bowl rim, the den mouth) than in the far background, so there is no jump in detail where a character stands.
- Do compose the yard so the places where things happen (den mouth, bowl, bin, beds) face the camera, with tall occluders (the cedar, the fence, the house) toward the back.
- Do light and shade the cast and the set with the same lights, fog and grade, so the cast sits in the scene; keep the backyard's painterliness in its textures, never in a filter over the set alone.
- Don't make pixel art, hard binary transparency or a palette-quantised image.
- Don't draw outlines, cel shading or flat cartoon fills.
- Don't render plastic 3D-looking fur or follow the 3D spike's renders.
- Don't add text, labels, logos, signatures or frame numbers.
- Don't describe or imitate the look of any named game, studio or artist.
