---
version: "1"
world: Raccoon World
preset: cozy-storybook
axes:
  rendering: painterly
  realism: characters in naturalistic illustrated realism like Stevie's approved turnaround (soft, believable fur and anatomy, high quality, never photographic and never heavily painterly); the environment a touch more painterly than the characters, never photo-accurate; never cartoon-flat
  proportions: true-to-life raccoon proportions; each character keeps the build of their identity lock
  outline:
    weight: none
    colour: "{outline}"
  shading: soft
  detailDensity: high on the characters' faces, masks and banded tails; medium on fur bodies; lower on background foliage
  texture: characters with fine, soft, naturalistic fur and fur strands at every silhouette edge, no visible brushwork; environment with soft visible brushwork and a wet sheen on stone and wood
  lightingKey: warm amber lantern and window light against cool blue-grey dusk and rain; soft rim light separating fur from the background
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
    - path: ../references/jimothy/jimothy-peanut-painted.png
      role: painted brushwork anchor for the environment; characters follow the turnaround's look
      subject: jimothy
    - path: ../references/stevie/turnaround-three-quarter.png
      role: approved turnaround, three-quarter view (identity lock)
      subject: stevie
    - path: ../references/stevie/turnaround-front.png
      role: approved turnaround, front view
      subject: stevie
    - path: ../references/stevie/turnaround-side.png
      role: approved turnaround, side view
      subject: stevie
    - path: ../references/jimothy/sheet-cell-03.png
      role: contact sheet cell 3 (identity lock)
      subject: jimothy
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
    version: "1"
    approved: true
    turnaround: ../references/stevie/turnaround-three-quarter.png
    signatureFeatures:
      - lean, upright, long-bodied adult raccoon
      - dark brown-black eye mask with cream brows and a cream muzzle
      - rounded ears with pale rims
      - full tail with five dark rings on tan, dark tip
      - dark brown lower legs and hand-like paws
    proportions: long body and legs for a raccoon, upright chest, head carried high; lean rather than round
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
perspective: ../docs/design/reference/raccoon-world-reference.png
perspectiveDescription: high three-quarter isometric view from above, the camera looking down on the yard at roughly 30 to 35 degrees, ground plane receding to the upper right
subjects:
  stevie:
    description: Stevie, a lean, upright, long-bodied adult raccoon with a dark eye mask, cream muzzle and brows, rounded pale-rimmed ears and a full tail with five dark rings
  jimothy:
    description: Jimothy, a short-spined, round, hunched and chubby raccoon with a very fluffy coat and a big fluffy banded tail
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

## Perspective

Every asset is drawn for the mockup's camera: a high three-quarter isometric view from above. Assetforge's vision QA uses the mockup as its perspective sample and judges perspective there (owner decision 2026-11-08; no separate decision-model perspective check). Characters on a sheet face along the ground plane's diagonals as the mockup's raccoons do.

## Characters and identity locks

The identity locks are exactly the set the owner's 0.68 threshold was measured on (Assetforge decision "Identity lock v1"):

- **Stevie:** the approved three-quarter turnaround view, `references/stevie/turnaround-three-quarter.png` (clockgrove/clockgrove#77 pass 1).
- **Jimothy:** cell 3 of the 57-frame contact sheet (`references/jimothy/sheet-cell-03.png`, cut from `docs/design/reference/jimothy-sprite-sheet.png` by Assetforge's slicer) plus his painted portrait.

Identity scoring runs in shadow mode at 0.68 (`art/target-profile.json`): it records a score beside QA and filters nothing. Bump a lock's `version` when it changes.

Stevie's subject references for generation are the three-quarter view (the lock) plus the approved front and side views. The front and side fix his mask, ears and lean long body from the angles a sheet draws him in. They are subject references only, not identity locks: the 0.68 threshold was not measured on them. The back view is left out: a high three-quarter camera never shows it, and it was one of the false rejects in the threshold measurement.

## Anchors

Positive anchors are approved material only: the mockup, Stevie's approved turnaround (the character look anchor) and its views, Jimothy's painted portrait (environment brushwork) and Jimothy's sheet cell 3. Unapproved material is listed as negative anchors and is never a positive one: the 3D spike outputs (`references/stevie/77-3d`), the Assetforge #38 proof outputs (`references/jimothy/assetforge-38-proof`) and the Stevie idle and walk strips made for the 3D comparison (`references/stevie/comparison-candidates`).

## Palette and lighting tokens

The palette tokens are the colours the mockup is built from: night ink, raccoon grey, mask black, muzzle cream, tail tan, lantern amber, cedar brown, moss green, wet slate and rain blue. They guide the prompt; the colour rule is `full`, so nothing is snapped to them. `light` is the warm key, `rim` the cool rim, and `lighting` names the warm key, cool fill and their ratio. Fog is a light blue-grey rain haze. Value and saturation bounds keep the scene dusky and natural: no pure white or black, no neon saturation.

## Do's and Don'ts

- Do paint soft fur edges with fine strands and soft 8-bit alpha.
- Do keep the high three-quarter isometric camera of the mockup.
- Do light characters warm from the nearest lamp and cool from the rainy sky, with a pale rim.
- Do keep each character's identity lock: Stevie lean and upright, Jimothy short-spined and round.
- Do keep full, natural colour.
- Don't make pixel art, hard binary transparency or a palette-quantised image.
- Don't draw outlines, cel shading or flat cartoon fills.
- Don't render plastic 3D-looking fur or follow the 3D spike's renders.
- Don't add text, labels, logos, signatures or frame numbers.
- Don't describe or imitate the look of any named game, studio or artist.
