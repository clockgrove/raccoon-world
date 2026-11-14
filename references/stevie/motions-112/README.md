# Stevie's idle, sniff, eat, play and shelter: previews for Kirk's pick (#112)

These five motions are now committed on Stevie's model, `assets/models/stevie/stevie.glb` (sha256 `c0345317…a73cb`), with `review.status: pending`. This folder is the review material for **Kirk's pick**. Nothing here ships.

- **Pick:** Kirk picked on 2026-11-13 at 10:32 PM Seattle time, after reviewing these previews. He keeps all five motions (idle, sniff, eat, play and shelter), and none goes back for a redo. The model's `review.status` stays `pending`, because approval is a separate step for Kirk.

- **Run:** 2026-11-14, `assetforge rig` at the pinned Assetforge (f7f31c0) on the approved model (`ac9b439c…f355`, #113) with its look-dev maps beside it. The rig template was `art/rig/raccoon.json` as committed here (sha256 `94d93e1e…f73d`), and the motions were `model3d.motions` from `art/target-profile-3d.json`. No model was called and nothing was spent ($0).
- **QA:** every check passed. Each of the six clips passed clip, contact, joint limits and skinning. The idle and the shelter also passed loop. Sniff, eat and play also passed `ends-<family>`: each starts and ends within 0.03° of the idle's first pose. The walk still passes its own QA.
- **Detail levels:** `assetforge lod` then rebuilt the chain and the phone rendition from that model, so every level file carries all six clips (`lod-1-clips`, `lod-2-clips`).

| Family | Kind | Length | Preview | Side view (8 frames) |
| --- | --- | --- | --- | --- |
| idle | looping | 4.0 s | `idle-preview.webp` | `idle-side.png` |
| sniff | one-shot from idle | 3.1 s | `sniff-preview.webp` | `sniff-side.png` |
| eat | one-shot from idle | 3.5 s | `eat-preview.webp` | `eat-side.png` |
| play | one-shot from idle | 2.4 s | `play-preview.webp` | `play-side.png` |
| shelter | looping | 2.4 s | `shelter-preview.webp` | `shelter-side.png` |

The previews are Assetforge's: looping, lossless animated WebP, shown from the turntable's three-quarter camera at 10 frames a second. Each one-shot starts and ends on the idle's pose, so it loops cleanly too. The side views show the left side, so eat's lifted right paw is behind the body there. The preview shows it.

Eat and play are larger than Assetforge's draft: with the draft's numbers, the lifted paw and the bow hardly showed. The rig template's fore legs were widened just enough for them; see `docs/art/3d-target-profile.md`.
