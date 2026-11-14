# Raccoon World art inputs

Raccoon World's art direction and Assetforge inputs. The author guide, [docs/art/author-guide.md](../docs/art/author-guide.md), walks the whole path from here to the live yard. `bash scripts/assetforge.sh check` checks all of it offline.

## Choices and why

**Style bible** (`style-bible.md`)
- It starts from the `cozy-storybook` preset axes and is written for the owner's mockup: painterly rendered storybook realism, a high three-quarter isometric camera, soft fur edges, full colour, and warm light against cool rain.
- The mockup is both a positive anchor and the perspective sample that Assetforge's vision QA judges perspective against (owner decision 2026-11-08).

**Identity locks**
- These are exactly the set the 0.68 threshold was measured on:
  - Stevie's approved three-quarter turnaround view;
  - Jimothy's sheet cell 3, plus his painted portrait.
- Jimothy's `references/jimothy/sheet-cell-03.png` was cut from `docs/design/reference/jimothy-sprite-sheet.png` by Assetforge's own slicer at the pinned commit, with no model call:
  `bash scripts/assetforge.sh run import --sheet docs/design/reference/jimothy-sprite-sheet.png --profile art/target-profile.json --asset jimothy --tool "ChatGPT image generation" --digital-source-type trainedAlgorithmicMedia --frames 57 --no-propose`.
  It is frame `f003.png`: cell 3 in reading order, background removed to soft alpha.

**Stevie's subject references**
- These are the three-quarter view (the lock) plus the approved front and side views. They fix his mask, ears and lean body from the angles a sheet draws.
- They are subject references, not identity locks.
- The back view is left out:
  - the high three-quarter camera never shows it;
  - it was a false reject in the threshold measurement.

**Gracie** (issue 50)
- She is the bible subject `gracie`. Her description leads with her signature: long, shaggy, paler grey fur on her lower body.
- Kirk's photos of her are positive anchors scoped to her subject. They are likeness references, not the look.
- Her identity lock is the three-quarter view of her approved turnaround, candidate c1 of the three that `node art/tools/turnaround.mjs gracie` generated (Kirk's pick, 2026-11-11), plus her photos.
- `references/gracie/README.md` has the run, the budget, the pick and its provenance.
- `art/gracie/character-3d/` holds her `character-3d` spec and run settings for the 3D target profile (#39).

**3D target profile** (`target-profile-3d.json`, issue 39)
- Real-time 3D characters target this profile. [docs/art/3d-target-profile.md](../docs/art/3d-target-profile.md) has the budgets per tier, the measured numbers, the format-neutral hand-off next to the shipped format, the rig, the walk, the clip set and the seasonal coats.
- `rig/raccoon.json` is the shared raccoon skeleton template.
- `stevie/character-3d/` holds Stevie's `character-3d` spec and run settings.
- `tools/model3d.mjs` is the 3D profile's validator: it maps the manifest and runs Clockgrove's pinned `clockgrove-assets validate` (platform refusals keep Clockgrove's codes), then this world's own checks, and flags the rest.
- `tools/model3d-render.mjs` draws a handed-off model and its idle through the pinned renderer's world-content seam (clockgrove/clockgrove#112), on Clockgrove's fixture renderer page under a software GPU; the 3D proof runs it.
- `proof/model3d-provider.mjs` and `proof/model3d-routes.json` are the 3D proof's scripted provider and its routes. They are test data, and nothing they make is committed.
- The 2D `target-profile.json` below still describes the placeholder strips.

**Negative anchors**
- Unapproved material is a negative anchor and never a positive one:
  - the 3D spike renders (`references/stevie/77-3d`);
  - the Assetforge #38 proof outputs;
  - the comparison-only Stevie strips (`references/stevie/comparison-candidates`).

**Style profile** (`../reference/asset-style.json`, Clockgrove's format)
- It lives where Clockgrove's external `--world .` commands read it. It sits outside `worlds/raccoons`, so the pack's content hash and simulation goldens are unchanged.
- **Alpha and colour:** soft alpha and unrestricted colour.
- **Bounds threshold: 16.** Faint fur wisps below 16/255 don't stretch an asset's declared bounds. The target profile's `alpha.threshold` must be the same value, because Assetforge computes the bounds it writes from it.
- **Edges: `transparent-pixel`.** The approved placeholders touch their frame edges (Stevie's bounds reach row 31), so `transparent-border` would refuse them.
- **Role limits** are the largest frames the approved placeholder set uses: actor 32×32, object 64×96, effect 32×32, terrain 16×16.

**Target profile** (`target-profile.json`)
- **Style:** the same as Clockgrove's (soft, threshold 16, full colour, antialiased). `check` fails when they differ.
- **Manifest:** Clockgrove's manifest v2.
  - `license` is the licence Assetforge derived from the output grant, so the profile never relabels. MIT needs a commercial grant that allows relabelling.
  - `acceptedLicenses` is `["CC-BY-4.0"]` only: it is on Clockgrove's permitted list and is published with its credit line. Non-commercial and provider-retained grants stay refused by Assetforge (exit 7) and by Clockgrove's deploy gate.
- **Review:** always written as `pending`, with `reviewer: null`.
- **Provenance:**
  - The manifest carries Clockgrove's generated fields: model and route of the sheet call, provider `vercel-ai-gateway` (the gateway real runs use), provider-terms version and the combined output grant.
  - The full record goes beside the strip as `<strip>.provenance.json`.
  - IPTC `trainedAlgorithmicMedia` is in the provenance and the PNG's XMP.
- **Validator:** `bash scripts/validate-asset.sh {{manifest}}`, Clockgrove's `clockgrove-assets validate --world` at the pinned commit.
- **Identity:** shadow mode at the owner's 0.68 threshold. It scores and filters nothing.
- **QA thresholds:** only `edgeHaloShare` is changed, to 0.3 from 0.22. Soft painterly fur keeps many partly transparent strands whose colour legitimately differs from the nearest opaque fur by more than 64, which is a fringe at the default share. `holeMinPx` (3) and `holeCutoff` (0.7) keep Assetforge's defaults: nothing about soft alpha calls for other values before real shelter output has been seen.
- **Short sheets:** a sheet that slices into too few figures is refused loudly (exit 5) and never padded. `check` proves it.

**Stevie's frame**
- 32×32 px, anchor (16, 30), 4 frames: the approved placeholder's grid.
- The golden renderer draws frames 1:1 at 80 mm per pixel. This is the size at which Stevie already reads on his 700 × 400 mm footprint in the approved golden scene.
- A larger frame would draw him several times his footprint.
- Keeping 4 frames of 32×32 keeps each family's atlas slot, so a pick replaces its placeholder without moving the other strips.

**Runs**
- `run.json` uses Assetforge's run-settings shape: up to 4 candidates for $5.
- On the sheet path each candidate is one `generate-sheet` call capped at `capUsd / candidates` ($1.25), so the four together can't pass $5.
- `check` forecasts each family's run as 4 × (one sheet's dry-run forecast + one agent QA pass) and requires at most $5. Today that is about $1.60.
- Agent QA is the import checks plus `animation-qa`'s vision checks.
- Assetforge's `stage`/`pick` path is not used while it ignores the style profile.

**Proof test data** (`proof/`)
- `provider.mjs` is the scripted model provider. It draws a stand-in sheet at run time, and nothing it makes is committed.
- `grouping.json` is a confirmed grouping over that scripted output. Both are test data, not art decisions, and no committed asset carries them.
