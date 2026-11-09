# Stevie's shelter strip: wave 0 candidates

Review material for raccoon-world#2's first real run. Nothing here is approved art, and nothing is in `assets/` until Kirk picks.

- **Run:** 2026-11-09, Assetforge `644eb68` (`ASSETFORGE_COMMIT`), `generate-sheet` with `art/stevie/shelter/{spec,brief,run}.json`, `art/style-bible.json` and `art/target-profile.json`; 4 candidates at a $1.25 cap each.
- **Spend:** $0.22 in total, of the run's $5 cap. Four earlier attempts from a checkout without its LFS images were refused by the provider before any image was made (clockgrove/assetforge#63).
- **Import QA:** every candidate has all 4 frames, and every frame passes the matte checks (edge halo, leftover background).
- **Identity:** scored against Stevie's lock in shadow mode (cutoff 0.68). All four score below it; the score is recorded and nothing is filtered.
- **Not run yet:** the loop seam and footprint checks, and the vision checks (identity flicker, holes). They run when the pick is written with `write-families` and `animation-qa`. None of the four returns from frame 4 to frame 1 as a seamless loop, so the loop seam check is likely to flag the pick.

`review.png` shows all four over a dusk backdrop: one row per candidate (candidate 1 at the top), frames 1–4 from left to right. Each `candidate-N/` holds that candidate's four frames.

| Candidate | Import | Frames | Identity | Spend | Sheet model | Agent read |
| --- | --- | --- | --- | --- | --- | --- |
| Candidate 1 | `2026-11-09T19-32-45-605Z-fba2a9` | 4 of 4 | 0.59 | $0.054 | openai/gpt-image-2 | Frames 2–3 put Stevie's head inside a wooden barrel, a prop that is in neither the brief nor the bible; frame 4 stands again. |
| Candidate 2 | `2026-11-09T19-33-19-546Z-36a09a` | 4 of 4 | 0.65 | $0.059 | openai/gpt-image-2 | Stands (1), crouches low (2–3), then sits with the tail wrapped round (4). |
| Candidate 3 | `2026-11-09T19-34-02-832Z-166ced` | 4 of 4 | 0.62 | $0.055 | openai/gpt-image-2 | A barrel appears in frame 3 only, so a prop pops in and out of the cycle. |
| Candidate 4 | `2026-11-09T19-34-40-054Z-4f854b` | 4 of 4 | 0.62 | $0.053 | openai/gpt-image-2 | Stands (1), crouches (2), then curls up tight with the tail wrapped close (3–4): closest to the brief's "hunched low, tail wrapped close". |

**Agent recommendation:** candidate 4, with all four frames, or frames 2–4 if the standing frame should be dropped.

## Game-size previews

`previews/` shows each candidate the way the game would get it, made with Assetforge's own code at `644eb68`: `registerFrames` fits each candidate into Stevie's 32×32 frame (anchor 16,30, antialiased), and `loopPreview` writes the looping WebP at 250 ms a frame.

- `game-size.png`: one row per candidate, the four frames at true size (left) and at 4× (right).
- `candidate-N-loop.webp`: candidate N looping, at 6×.

At 32 px the painterly detail mostly goes. Candidate 4's curl and the barrels in candidates 1 and 3 still read. Each candidate shares one scale across its frames, so the barrel makes Stevie himself smaller in candidates 1 and 3 (scale 0.055 and 0.044, against 0.058 and 0.059 for candidates 2 and 4).
