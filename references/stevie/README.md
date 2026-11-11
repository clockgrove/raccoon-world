# Stevie references

**Approved reference (owner, 2026-11-07):** the four-view turnaround `turnaround-front.png`, `turnaround-three-quarter.png`, `turnaround-side.png` and `turnaround-back.png` (and `turnaround.png`, all four on one sheet). Stevie is the lean, upright, long-bodied raccoon. The 57-frame contact sheet in `docs/design/reference/jimothy-sprite-sheet.png` is Jimothy, not Stevie.

**Real-life photo (Kirk, 2026-11-10):** `stevie-window-front.png` shows Stevie face-on, up against Kirk's porch window. It's the only real front view of his face: the mask, pale brows and muzzle, the rounded pale-rimmed ears, the whiskers, and a creamy grey ruff. It's a reference for his identity and look-dev, not part of the approved turnaround.

**With Gracie (Kirk, 2026-11-10):** `../gracie/gracie-and-stevie.png` shows Stevie at the front by the food bowl and Gracie behind (IDs as Kirk thinks they are). Next to her paler, greyer lower body, Stevie is an even brown-grey with a darker, streaked back and bold tail rings. His flat hind foot shows at the bowl.

The turnaround was made with `openai/gpt-image-2` through Vercel AI Gateway in clockgrove/clockgrove#77's first pass. `provenance-77-pass1.json` records the prompt, inputs and cost.

## 77-3d

The image-to-3D outputs of clockgrove/clockgrove#77, kept as inputs for the rerun (clockgrove/clockgrove#99). None of them is approved game art. `provenance.json` records every call, and `ship.json` records the conversions.

| Files | Made with | Licence |
| --- | --- | --- |
| `fal-*.glb`, `ship-fal.glb`, `preview-fal-*.png` | TRELLIS.2 on fal.ai (MIT weights) | MIT |
| `meshy-*.glb`, `ship-meshy*.glb`, `preview-meshy-*.png` | Meshy API, Free plan | **CC BY 4.0**: credit "3D model generated with Meshy (meshy.ai)" wherever used |
| `tripo-*.glb`, `ship-tripo*.glb`, `preview-tripo-*.png` | Tripo API, paid credits (outputs owned by the paid user under Tripo's terms) | MIT |

Anything that ships in the game needs a route whose output is MIT-compatible, or the Meshy credit in the game's credits.
