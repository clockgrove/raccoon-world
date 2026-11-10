# Raccoon World visual decisions

These are the owner's decisions about how Raccoon World looks and is drawn. Art work (generation, picks, commits to `assets/`) starts from these and never from inherited defaults such as the placeholder set's 32 px grid or a platform's fixed sprite scale.

## Decided

| Decision | Choice | Decided |
| --- | --- | --- |
| Look | The painterly isometric storybook of the owner's mockup (`reference/raccoon-world-reference.png`). Cohesion first: one lighting model, one grade and post pass, matched detail density, consistent edges, one camera and scale. | Kirk, 2026-11-07 |
| Camera | Fixed isometric angle, the mockup's high three-quarter view. No rotation. Deep zoom, from a whole-yard overview down to a close-up where one raccoon fills a good part of the screen. | Kirk, 2026-11-09 |
| Devices | Full look on desktop browsers with a mid-range GPU. Recent phones (about 2023 or newer) get the same scene at a lower quality tier, and older phones get the text path. | Kirk, 2026-11-09 |
| Characters | Real-time 3D: each character is a rigged model drawn by Clockgrove's live renderer, with an animation clip set per character family. Not 3D rendered to sprites, and not 2D sprites. | Kirk, 2026-11-10 |
| Environment | A 3D scene lit by the renderer, styled to the mockup. It follows the character choice (Kirk's rule of 2026-11-09). | Kirk, 2026-11-10 |

## Open, in order

1. **Detail and resolution:** polygon, texture and level-of-detail budgets per quality tier, set from the closest zoom and the device floor above.
2. **Animation:** which actions, how many facing directions, and how smooth, as clips per character family.

## Consequences

- The 3D look proof (#26, [3d-look-proof.md](3d-look-proof.md)) and the 3D visual ceiling (#34, [3d-ceiling.md](3d-ceiling.md)) are the evidence behind the character choice. clockgrove/clockgrove#184 is the product renderer work it depends on.
- Sprite scale no longer applies to characters or the yard: #11's three-way comparison, #23 (storybook sprite scale) and clockgrove/clockgrove#158 (per-world sprite scale) are closed as superseded. The 2D shelter candidates (PR #21) stay as the record of the 2D attempt.
- Shipped 3D art needs provider output whose licence the art pipeline accepts (clockgrove/assetforge#47 refuses free-plan CC BY or non-commercial output).
- Every art brief states the decided camera, zoom range, device floor and detail budget.
