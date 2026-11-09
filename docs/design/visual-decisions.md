# Raccoon World visual decisions

These are the owner's decisions about how Raccoon World looks and is drawn. Art work (generation, picks, commits to `assets/`) starts from these and never from inherited defaults such as the placeholder set's 32 px grid or a platform's fixed sprite scale.

## Decided

| Decision | Choice | Decided |
| --- | --- | --- |
| Look | The painterly isometric storybook of the owner's mockup (`reference/raccoon-world-reference.png`). Cohesion first: one lighting model, one grade and post pass, matched detail density, consistent edges, one camera and scale. | Kirk, 2026-11-07 |
| Camera | Fixed isometric angle, the mockup's high three-quarter view. No rotation. Deep zoom, from a whole-yard overview down to a close-up where one raccoon fills a good part of the screen. | Kirk, 2026-11-09 |
| Devices | Full look on desktop browsers with a mid-range GPU. Recent phones (about 2023 or newer) get the same scene at a lower quality tier, and older phones get the text path. | Kirk, 2026-11-09 |

## Open, in order

1. **Character technology:** real-time 3D, 3D rendered to sprites, or 2D sprites. #11 compares the three in Clockgrove's product renderer, with a zoom test (far, default, close-up at 1× and 2× device pixel ratio). The owner picks from its report.
2. **Environment technology:** follows the character choice (Kirk, 2026-11-09). If characters are 3D, the yard is a painterly-lit 3D scene; if they are 2D sprites, the yard is painted 2.5D layers with depth and normal maps.
3. **Resolution and detail:** set from the closest zoom and the device floor above, once 1 and 2 are known. clockgrove/clockgrove#158 and #23 (sprite scale) wait for this.
4. **Animation:** which actions, how many facing directions, and how smooth, once 1 is known.

## Consequences

- No new art generation spend until open decisions 1 to 3 are made. The first shelter candidates (PR #21) stay as references.
- Every art brief states the decided camera, zoom range and device floor.
