# Making Raccoon World's art with Assetforge

This guide takes one of Stevie's animation families from the committed inputs to a strip in the live yard. Agents generate and stage; only a person confirms a grouping, picks, approves an asset or approves a golden.

Everything runs from this repository against two pinned checkouts:

- Clockgrove at `CLOCKGROVE_COMMIT`: `bash scripts/clockgrove.sh fetch` (into `.clockgrove/`);
- Assetforge at `ASSETFORGE_COMMIT`: `bash scripts/assetforge.sh fetch` (into `.assetforge-src/`). `bash scripts/assetforge.sh run <command> ...` runs its CLI.

Neither comes from npm. Each pin lives only in its file and moves only in a maintainer's PR.

## What is committed

| Path | What it is |
| --- | --- |
| `art/style-bible.md` | The style bible: the one statement of the world's look (Assetforge's Markdown format: DTCG tokens, prose, Do's and Don'ts, anchors, identity locks). |
| `art/style-bible.json` | Derived from the Markdown bible for the commands that read JSON (`generate-sheet`, `import`). Regenerate with `node art/tools/derive-bible.mjs`; never edit by hand. |
| `art/target-profile.json` | The target profile: Clockgrove's manifest v2 shape, frame grid, layout, licence rule, review field, identity and QA settings, and the validator. |
| `reference/asset-style.json` | The world's style profile as Clockgrove reads it (soft alpha, unrestricted colour). |
| `art/stevie/<family>/spec.json` | What to draw: Stevie, the family, 4 frames of 32×32, anchor (16, 30), quadruped gait. |
| `art/stevie/<family>/brief.json` | What the strip is for: where it appears, its neighbours, mood and the motion to show. |
| `art/stevie/<family>/run.json` | One run's settings: up to 4 candidates for at most $5 (Assetforge's run-settings shape). |

`art/README.md` records why each value was chosen.

Check everything offline, with no key and no spend:

```sh
bash scripts/clockgrove.sh fetch
bash scripts/assetforge.sh check
```

## 1. Forecast the run

A run is up to 4 candidates of one family. On the sheet path a candidate is one generated sheet. Each `generate-sheet` call gets a quarter of the run's cap, so the four together can never pass $5. Forecast one candidate first; it spends nothing and needs no key:

```sh
bash scripts/assetforge.sh run generate-sheet \
  --spec art/stevie/shelter/spec.json --bible art/style-bible.json \
  --profile art/target-profile.json --lock-bible art/style-bible.md \
  --cap 1.25 --dry-run --json
```

The forecast lists the sheet, the grouping proposal and the identity score (about $0.32). `bash scripts/assetforge.sh check` prints each family's whole-run forecast: four of these plus four agent QA passes.

## 2. Generate up to four candidates

This is the step that spends money. It runs outside Factory, in the owner's lead agent session, with the organisation's `AI_GATEWAY_API_KEY` in the environment. Never commit the key or print it.

```sh
for candidate in 1 2 3 4; do
  bash scripts/assetforge.sh run generate-sheet \
    --spec art/stevie/shelter/spec.json --bible art/style-bible.json \
    --profile art/target-profile.json --lock-bible art/style-bible.md \
    --cap 1.25 --imports .assetforge/imports --json
done
```

Each candidate draws the whole cycle as one sheet, then Assetforge slices, mattes (soft alpha, full colour) and registers it into `.assetforge/imports/<import>/`. Git ignores that directory. Assetforge proposes a grouping in `grouping.json` with status `proposed`. Identity is scored against Stevie's lock in shadow mode at 0.68: the score is recorded and nothing is filtered.

A sheet with the wrong number of figures is refused with exit 5 (`qa_found_nothing`). It is never padded. The sheet and its record stay in the import directory, and the attempt still counts as one of the four.

## 3. Agent QA, then the owner picks

Agent QA runs first. Each candidate's import already carries Assetforge's import checks in `import.json` and in the command's JSON output:

- the frame count;
- each frame's matte checks (edge halo, leftover background);
- the shadow-mode identity score.

The agent reports each candidate's import directory, `contact.png`, identity score and any failed frames. The owner then picks one candidate and confirms its grouping: edit that import's `grouping.json` (family name `shelter`, frames in play order, drop bad frames) and set `"status": "confirmed"`. Agents never set `confirmed`.

## 4. Write the pick into this repository

```sh
bash scripts/assetforge.sh run write-families \
  --import .assetforge/imports/<import> --target . --json
```

The command writes, in Clockgrove's layout:

- `assets/source/stevie/shelter.png`, the strip;
- `assets/manifests/stevie/shelter.json`, replacing the placeholder's manifest, with `review.status: "pending"`;
- `assets/source/stevie/shelter.png.provenance.json`, the full provenance: models, route, prompt, references, request IDs, costs, provider terms, output grant, identity score, and IPTC Digital Source Type `trainedAlgorithmicMedia`. The PNG also embeds the disclosure in XMP.

It then runs Clockgrove's validator (`bash scripts/validate-asset.sh`). A refusal comes back as exit 6 with Clockgrove's reasons verbatim, and nothing is fixed silently. Frames that failed the matte checks are refused at write time. A licence the profile can't accept is refused with exit 7 before anything is written: MIT needs a commercial grant that allows relabelling, CC-BY-4.0 is accepted with its credit line, and non-commercial or provider-retained output is always refused.

**Before committing,** restore the two values Assetforge can't carry yet (see "Known gaps"):

- set `atlas` back to the placeholder's slot (`git diff assets/manifests/stevie/shelter.json` shows it; the 32×32×4 grid keeps the slot unchanged);
- if you like, set `accessibilityLabel` back to its earlier wording.

`write-families` also runs the pixel animation QA against the family's motion template (ground contact, anchor and footprint drift, silhouette, loop seam, edge halo; `art/target-profile.json` sets the quadruped gait). It writes the onion skin and looping preview into the import's `preview/`. Then the agent runs the two vision checks, identity flicker and holes, on what was written, within a small cap. A failing check exits 5 and names its frame:

```sh
bash scripts/assetforge.sh run animation-qa --import .assetforge/imports/<import> --cap 1 --json
```

Then commit the strip, manifest and provenance. `.gitattributes` puts the PNG in Git LFS, and `REUSE.toml` covers it as MIT. The pick lands with review pending and full provenance, and CI stays green.

**Fallback: one bad frame.** Fix it with a reference-guided edit from an approved neighbour, within its own cap, then hand off the fixed strip:

```sh
bash scripts/assetforge.sh run fix-frame --strip assets/source/stevie/shelter.png \
  --profile art/target-profile.json --family shelter --frame 3 --from 2 \
  --out .assetforge/fixes/shelter --cap 2 --json
```

A strip made from a key pose needs a key pose the owner approved.

## 5. Approval (a person)

The owner reviews the strip, its onion skin (`preview/shelter.onion.png` in the import) and its loop (`preview/shelter.webp`). To approve, the owner edits the manifest:

```json
"review": { "status": "approved", "reviewer": "<their login>", "reviewedAt": "<UTC time>", "notes": "..." }
```

A `[bot]` reviewer is refused by Clockgrove's deploy gate.

## 6. Atlas and licence report

Clockgrove's asset commands treat the repository root as the world. They also scan everything under it for `presentation.json`, so run them with the Clockgrove checkout outside the repository. Set `CLOCKGROVE_DIR=../clockgrove-pinned` for `bash scripts/clockgrove.sh fetch` and use that path below:

```sh
node "$CLOCKGROVE_DIR/packages/assets/bin/clockgrove-assets.mjs" build --world .
```

This rebuilds `assets/reviewed/` (approved assets only) and `assets/license-report.md`.

## 7. Re-render the golden scene (a person approves)

```sh
node "$CLOCKGROVE_DIR/packages/assets/bin/clockgrove-assets.mjs" update-golden --world .
```

When the scene changes, its record `assets/goldens/worlds-raccoons.scene.json` resets to pending. The owner looks at `worlds-raccoons.scene.png`, then sets `approval` to `approved` with their login and `approvedSceneSha256` equal to the new `sceneSha256`. Never hand-edit a scene image.

Then check the whole set:

```sh
node "$CLOCKGROVE_DIR/packages/assets/bin/clockgrove-assets.mjs" check --world .
```

The golden renderer doesn't blend soft alpha yet (clockgrove/clockgrove#137), so painterly fur edges look harder in the golden than in the game.

## 8. The live yard

Start the local session from this repository against the pinned Clockgrove. It needs Clockgrove's PostgreSQL toolchain; see Clockgrove's `docs/protocols/world-presentation.md`.

```sh
node "$CLOCKGROVE_DIR/scripts/dev-world.mjs" \
  --pack worlds/raccoons --shell worlds/raccoons/shell.json --assets assets/reviewed
```

The local shell loads a single atlas for now (clockgrove/clockgrove#137).

The atlas, golden and live-yard changes after the picks land as one direct PR with the owner's approvals.

## Measuring the waves

- **Wave 0:** one real run of the shelter family, as above.
- **Wave 1:** the other five families, once the owner has read the shelter strip.
- **Cost per approved strip:** the sum of `costUsd` in the committed provenance files and run records.
- **Requests that end in a pick:** count picks against `generate-sheet` runs; at least 70% should end in one.
- **Author minutes:** the owner records them per approved strip.

## Known gaps

These sit in the platform tools, not in this repository:

- **Assetforge:** `write-families` doesn't pass the spec's `fields` to the manifest template. So the per-family atlas slot and accessibility label can't come from `art/stevie/<family>/spec.json` (the spec keeps them for when it does). Until then the profile writes Stevie's character values and atlas slot (0, 0), and the author restores the slot before committing (step 4).
- **Clockgrove:** the manifest decoder requires a non-empty palette even for unrestricted-colour art. The profile records the bible's palette tokens, which `check` keeps equal to the bible.
- **Assetforge:** the briefs are read by `plan` and its key-pose fallback, not by `generate-sheet` at the pinned commit. On the sheet path they are the author's statement of what the strip must show.
