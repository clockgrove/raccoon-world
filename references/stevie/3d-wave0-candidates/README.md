# Stevie in 3D: wave 0 candidates

**Kirk picked c3** (2026-11-10). It is the quality lab's Stevie (raccoon-world#45) until `assetforge pick` writes it through the 3D target profile (#39). Kirk's note on the pick: the walk needs work around the ankles and feet; see clockgrove/assetforge's follow-up.

Four real-time 3D candidates of Stevie for Kirk to pick from: Assetforge wave 0 ([clockgrove/assetforge#72](https://github.com/clockgrove/assetforge/issues/72), [PLAN](https://github.com/clockgrove/assetforge/blob/main/docs/PLAN.md)). This is review material, not approved art, and nothing is in `assets/`. The pick is written into the game once this repository's 3D target profile lands (raccoon-world#39).

- **Run:** 2026-11-10, `assetforge stage` with a `character-3d` spec: quadruped, the walk clip, 0.45 m tall. The inputs were Stevie's approved turnaround from `art/style-bible.json` (three-quarter, front and side) and a throwaway profile with desktop budgets: 60,000 triangles, 2048 px textures, 4 materials, 80 bones.
- **Route:** Tripo (paid plan, so the output is owned and declared under this repository's licence). Image-to-3D (`tripo/v2.5-20250123`), auto-rig (`animate-rig-v2.0`, quadruped), and the library walk retargeted onto the rig, with its loop closed.
- **Spend:** $2.60 for 4 candidates (260 Tripo credits), inside the $5 run cap and Assetforge's cross-run spend limits.
- **QA:** all 4 passed every check:
  - the Khronos glTF validator, with 0 errors;
  - every budget;
  - a skeleton is present, and the walk plays on it and loops;
  - turntable renders;
  - identity against Stevie's lock, in shadow mode at a 0.68 cutoff, so it is recorded and nothing is filtered.
- **Not yet:** the painted albedo in the mockup's style, fur groom maps and eye highlights (look-dev, clockgrove/assetforge#82). These models carry Tripo's own texture, which is darker and browner than the mockup.

| Candidate | Triangles | Bones | Texture | Identity | Walk loop error | Cost | Agent read |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c1 | 59,905 | 40 | 2048 px | 0.72 | 0.04° | $0.65 | Cleanest face and mask. The last walk frame over-stretches a hind leg. |
| c2 | 59,888 | 37 | 2048 px | 0.71 | 0.03° | $0.65 | Good tail rings; small stray geometry at the mouth. |
| c3 | 59,847 | 30 | 2048 px | 0.68 | 0.03° | $0.65 | Strongest mask and a clean walk. Agent recommendation. |
| c4 | 59,931 | 30 | 2048 px | 0.66 | 0.04° | $0.65 | Lowest identity score; small stray geometry at the mouth. |

## Files

- `review.png`: one row per candidate (c1 at the top), showing the front, three-quarter, side and back views, then 4 walk frames.
- `three-quarter-all.png`: the four three-quarter views at full size (c1 top left, c2 top right, c3 bottom left, c4 bottom right).
- `previews/cN-walk.webp`: candidate N walking, looped.
- `cN/`: the candidate's `.glb` (rigged, with the `walk` clip), its 8 turntable renders and `provenance.json` (models, routes, prompts and parameters, reference hashes, request IDs, costs, terms, output grant).
