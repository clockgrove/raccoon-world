# Raccoon World art inputs

Raccoon World's art direction and Assetgrove inputs. The author guide, [docs/art/author-guide.md](../docs/art/author-guide.md), walks the whole path from here to the live yard. `bash scripts/assetgrove.sh check` checks all of it offline.

## Choices and why

**Style bible** (`style-bible.md`)
- It starts from the `cozy-storybook` preset axes and is written for the owner's mockup: painterly rendered storybook realism, a high three-quarter isometric camera, soft fur edges, full colour, and warm light against cool rain.
- **Positive anchors are approved material only** (issue 140). `references/approved.json` lists each approved file by its sha256, with who approved it and the record of that approval (a reference README or a provenance pick). `check` fails when a positive anchor's bytes are not an entry, wherever the file lives: an unpicked turnaround or 3D candidate fails in any folder, not only the three it used to deny by name. A new anchor needs the owner's approval recorded there first.
- The mockup is both a positive anchor and the perspective sample that Assetgrove's vision QA judges perspective against (owner decision 2026-11-08).
- `referenceLicense: NOASSERTION`: the references are the owner's photos, generated turnarounds and the mockup. Assetgrove records the value in provenance (`referenceLicenses`) and gates nothing on it. A reference that needs another value gets its own `license`.
- The Do's and Don'ts avoid Assetgrove's prompt-policy blocklist (`policy/blocklist.json`), which refuses phrases such as `imitate` in every prompt input (exit 9).

**Identity locks**
- These are exactly the set the 0.68 threshold was measured on:
  - Stevie's approved three-quarter turnaround view;
  - Jimothy's sheet cell 3, plus his painted portrait.
- Jimothy's `references/jimothy/sheet-cell-03.png` was cut from `docs/design/reference/jimothy-sprite-sheet.png` by Assetgrove's own slicer at the pinned commit, with no model call:
  `bash scripts/assetgrove.sh run import --sheet docs/design/reference/jimothy-sprite-sheet.png --profile art/target-profile.json --asset jimothy --tool "ChatGPT image generation" --digital-source-type trainedAlgorithmicMedia --frames 57 --no-propose`.
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
- `proof/model3d-provider.mjs` is the 3D proof's scripted provider. `proof/c3-facing-plus-x.glb` is c3 facing +x, as a Tripo model faces and as Assetgrove's default Tripo route reads it (a settings route can't set `forward`). It is c3 with its root's yaw reset; the approved c3 itself is unchanged. Both are test data, and nothing they make is committed.
- The 2D `target-profile.json` below still describes the placeholder strips.

**Negative anchors**
- Unapproved material is a negative anchor and never a positive one:
  - the 3D spike renders (`references/stevie/77-3d`);
  - the Assetgrove #38 proof outputs;
  - the comparison-only Stevie strips (`references/stevie/comparison-candidates`).

**Style profile** (`../reference/asset-style.json`, Clockgrove's format)
- It lives where Clockgrove's external `--world .` commands read it. It sits outside `worlds/raccoons`, so the pack's content hash and simulation goldens are unchanged.
- **Alpha and colour:** soft alpha and unrestricted colour.
- **Bounds threshold: 16.** Faint fur wisps below 16/255 don't stretch an asset's declared bounds. The target profile's `alpha.threshold` must be the same value, because Assetgrove computes the bounds it writes from it.
- **Edges: `transparent-pixel`.** The approved placeholders touch their frame edges (Stevie's bounds reach row 31), so `transparent-border` would refuse them.
- **Role limits** are the largest frames the approved placeholder set uses: actor 32×32, object 64×96, effect 32×32, terrain 16×16.

**Target profile** (`target-profile.json`)
- **Style:** the same as Clockgrove's (soft, threshold 16, full colour, antialiased). `check` fails when they differ.
- **Manifest:** Clockgrove's manifest v2.
  - `license` is the licence Assetgrove derived from the output grant, so the profile never relabels. MIT needs a commercial grant that allows relabelling.
  - `acceptedLicenses` is `["CC-BY-4.0"]` only: it is on Clockgrove's permitted list and is published with its credit line. Non-commercial and provider-retained grants stay refused by Assetgrove (exit 7) and by Clockgrove's deploy gate.
- **Review:** always written as `pending`, with `reviewer: null`.
- **Provenance:**
  - The manifest carries Clockgrove's generated fields: model and route of the sheet call, provider `vercel-ai-gateway` (the gateway real runs use), provider-terms version and the combined output grant.
  - The full record goes beside the strip as `<strip>.provenance.json`.
  - IPTC `trainedAlgorithmicMedia` is in the provenance and the PNG's XMP.
- **Validator:** `bash scripts/validate-asset.sh {{manifest}}`, Clockgrove's `clockgrove-assets validate --world` at the pinned commit.
- **Identity:** shadow mode at the owner's 0.68 threshold. It scores and filters nothing.
- **Matting fringe** (`animation.matting`, issue 140): a world-owned check, `art/tools/fringe.mjs`, beside Assetgrove's edge halo. A soft edge pixel is fringe when its colour is a blend of a nearby opaque figure colour and the known flat background colour (the `background` Assetgrove records per frame in an import's provenance), with at least a fifth of it background, and is not the figure's own colour. So pale fur left on a pale background is caught, which the 64-distance edge halo misses, and soft strands that keep the fur's colour pass. A frame fails when more than `fringeShare` (0.15) of its soft edge is fringe. It runs on every write: the profile's validator, `scripts/validate-asset.sh`, which Assetgrove runs after `write-families` or `pick` writes a strip, runs `node art/tools/fringe.mjs --manifest <manifest>` after Clockgrove's validation. Each frame of the written strip is checked against the matte background its provenance sidecar records, and a failing frame makes the validator refuse the write (`validator.accepted: false`). A strip with no recorded matte background (a procedural placeholder) has nothing to check. The value is calibrated on facts, recorded in `calibration`: the repository's approved frames (every approved strip, and Jimothy's soft-alpha cell against its sheet's background) score at most 0.0115, and a fringed counter-example made at run time from that cell scores 0.65, as does a pale-fur one on a pale background. Of the 114 approved frames only Jimothy's cell has a soft edge; the approved strips have no partly transparent pixel and score 0, so the approved side of the calibration rests on that one cell (`softEdgeFrames: 1`). `check` recomputes these numbers and fails when the profile's record differs, and its offline proof shows the validator refusing a written strip whose soft edge kept its matte background. To score a frame by hand: `node art/tools/fringe.mjs <frame.png> --background <hex> [--frames N]` (exit 1 when a frame fails).
- **QA thresholds:** only `edgeHaloShare` is changed, to 0.3 from 0.22. Soft painterly fur keeps many partly transparent strands whose colour legitimately differs from the nearest opaque fur by more than 64, which is a fringe at the default share. `holeMinPx` (3) and `holeCutoff` (0.7) keep Assetgrove's defaults: nothing about soft alpha calls for other values before real shelter output has been seen.
- **Short sheets:** a sheet that slices into too few figures is refused loudly (exit 5) and never padded. `check` proves it.

**Stevie's frame**
- 32×32 px, anchor (16, 30), 4 frames: the approved placeholder's grid.
- The golden renderer draws frames 1:1 at 80 mm per pixel. This is the size at which Stevie already reads on his 700 × 400 mm footprint in the approved golden scene.
- A larger frame would draw him several times his footprint.
- Keeping 4 frames of 32×32 keeps each family's atlas slot, so a pick replaces its placeholder without moving the other strips.

**Runs**
- `run.json` uses Assetgrove 0.1's run-options shape (`candidates`, `strictness`, `exploration`; `--run-options`): up to 4 candidates. Run options can't carry a cap, so a run's $5 cap is `check`'s `MAX_RUN_USD`, the commands pass `--cap`, and the owner's settings keep `caps.runUsd` at $5 or below.
- On the sheet path each candidate is one `generate-sheet` call capped at $5 / candidates ($1.25), so the four together can't pass $5. Each candidate is its own `--round`.
- Paid steps run only in the owner session, under the owner's own developer settings. A Pendulum worker runs Assetgrove offline only: `check` and dry runs (owner decision 2026-11-15, issue #131).
- `check` forecasts each family's run as 4 × (one sheet's dry-run forecast + one agent QA pass) and requires at most $5. Today that is about $1.60.
- Agent QA is the import checks plus `animation-qa`'s vision checks.
- Assetgrove's `stage`/`pick` path is not used while it ignores the style profile.

**Proof test data** (`proof/`)
- `provider.mjs` is the scripted model provider. It draws a stand-in sheet at run time, and nothing it makes is committed.
- `gateway/` holds recorded gateway answers for `turnaround.mjs`'s cost path: an answer with its own cost, one whose cost comes from the generation record, and ones with no exact cost (none reported, a zero, an unknown generation), which keep the reservation. `check` replays them through a local stub; nothing is spent.
- `grouping.json` is a confirmed grouping over that scripted output. Both are test data, not art decisions, and no committed asset carries them.
