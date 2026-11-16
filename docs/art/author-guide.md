# Making Raccoon World's art with Assetgrove

This guide takes one of Stevie's animation families from the committed inputs to a strip in the live yard. Agents forecast, run QA and report. Only a person confirms spend, confirms a grouping, picks, writes into the repository, approves an asset or approves a golden.

Everything runs from this repository against two pinned checkouts:

- Clockgrove at `CLOCKGROVE_COMMIT`: `bash scripts/clockgrove.sh fetch` (into `.clockgrove/`);
- Assetgrove at `ASSETGROVE_COMMIT`: `bash scripts/assetgrove.sh fetch` (into `.assetgrove-src/`). `bash scripts/assetgrove.sh run <command> ...` runs its CLI.

Neither comes from npm. Each pin lives only in its file. Moving a pin is a reviewed PR that keeps `bash scripts/clockgrove.sh check` and `bash scripts/assetgrove.sh check` green. When a new pin changes an input format, the PR changes the inputs, tools and docs that follow from it together with the pin, since the old pin and the new formats can't both pass `check`. `CLOCKGROVE_COMMIT` and `scripts/clockgrove.sh` are Factory-protected paths, so only a maintainer moves the Clockgrove pin. `ASSETGROVE_COMMIT` and `scripts/assetgrove.sh` are not protected yet: until a maintainer adds them to `FACTORY_PROTECTED_PATHS` in `.github/workflows/factory.yml`, a reviewer must check that no Factory PR moves the Assetgrove pin by accident.

## What is committed

| Path | What it is |
| --- | --- |
| `art/style-bible.md` | The style bible: the one statement of the world's look (Assetgrove's Markdown format: DTCG tokens, prose, Do's and Don'ts, anchors, identity locks). |
| `art/style-bible.json` | Derived from the Markdown bible for the commands that read JSON (`generate-sheet`, `import`). Regenerate with `node art/tools/derive-bible.mjs`; never edit by hand. |
| `art/target-profile.json` | The target profile: Clockgrove's manifest v2 shape, frame grid, layout, licence rule, review field, identity and QA settings, and the validator. |
| `reference/asset-style.json` | The world's style profile as Clockgrove reads it (soft alpha, unrestricted colour). |
| `art/stevie/<family>/spec.json` | What to draw: Stevie, the family, 4 frames of 32×32, anchor (16, 30), quadruped gait. |
| `art/stevie/<family>/brief.json` | What the strip is for: where it appears, its neighbours, mood and the motion to show. |
| `art/stevie/<family>/run.json` | One run's options in Assetgrove's run-options shape (`--run-options`): up to 4 candidates, strictness and exploration. It carries no cap. A run's cap is $5: `check` holds each run to it, and the commands below pass `--cap` explicitly. |

`art/README.md` records why each value was chosen.

The shared files (the bible, both target profiles) start with Assetgrove's format line (`format: assetgrove-style-bible/1`, `"format": "assetgrove-target-profile/1"`). `assetgrove migrate <file> --kind <kind>` adds the line to a file that lacks it. The bible's `referenceLicense` is `NOASSERTION`: the references are the owner's photos, generated turnarounds and a mockup, and nothing is gated on the value. A reference may carry its own `license`. The bible's prompts must not use a phrase from Assetgrove's prompt-policy blocklist (`policy/blocklist.json` in the pinned checkout, for example `imitate` or `inspired by`); a run that finds one stops with exit 9 `prompt_refused` before any call.

Check everything offline, with no key and no spend:

```sh
bash scripts/clockgrove.sh fetch
bash scripts/assetgrove.sh check
```

`check` writes its own throwaway developer settings into a temporary directory outside the checkout. They are headless, configure only the scripted provider, and approve by hash the provider scripts and validators it runs. It removes them when it finishes, and it fails if anything new appears in the checkout.

## Developer settings (once per developer who spends)

Since Assetgrove 0.1, everything that steers money, code, endpoints, keys, routes or licence grants comes only from one per-user settings file. Shared files and request inputs can't. Assetgrove reads `$ASSETGROVE_CONFIG`, else `$XDG_CONFIG_HOME/assetgrove/settings.json`, else `~/.config/assetgrove/settings.json`. The file and its `stateDir` must sit outside every Git project: never in this repository. Assetgrove's `docs/settings.md` (in the pinned checkout) is the reference. With no settings file there is no provider, and even a `--dry-run` of a paid command exits 2 `route_unavailable`. A free local command (`import --no-propose`, `bible`) needs none.

The owner's file looks like this:

```json
{
  "format": "assetgrove-settings/1",
  "providers": {
    "vercel-ai-gateway": { "limit": { "kind": "key-budget", "usd": 25, "period": "monthly" } },
    "tripo": { "limit": { "kind": "prepaid", "usd": 20 } }
  }
}
```

- **Limits.** Every paid provider entry declares the spend limit set with the provider itself (`key-budget`, `team-budget`, `project-hard-limit`, `workspace-limit`, `prepaid`, or `unlimited` with `acceptUnlimited: true`). A paid call to an entry without one exits 3 `provider_limit_undeclared`. The provider's own limit is the hard money limit. Assetgrove's caps sit inside it: `caps.runUsd`, `caps.dailyUsd` and `caps.workItemUsd`, defaulting to $5, $10 and $5. `--cap` may only lower the run cap. The ledger is `<stateDir>/spend.jsonl`. When the ledger and the provider's usage disagree, every paid run exits 3 `spend_hold` until the owner acknowledges the hold (`assetgrove settings change --acknowledge-holds <id>`).
- **Keys.** A key comes from the environment, and only through a configured provider (`keyEnv`, default `AI_GATEWAY_API_KEY` for the gateway). Keep keys out of the agent's shell: register Assetgrove's MCP server at user scope with the key in the server's `env`, as Assetgrove's `docs/keys.md` shows for each harness. Never add a project-scope MCP config for Assetgrove to this repository: Assetgrove treats one as code to review, and a tracked file holding a key stops every paid command (exit 2 `key_tracked`).
- **Routes and grants.** Roles and routes come only from the settings (`roles.<role>`, `routes.<operation>`), never from a command-line option, a run's options or a plan. Every core default route carries its provider's output grant. A role or route you point at your own model must declare `outputGrant` and `providerTerms`, or `pick` and `write-families` refuse its output (exit 7 `license_refused`).
- **Proxies.** A paid command exits 2 `settings_invalid` when `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NODE_USE_ENV_PROXY`, `NODE_EXTRA_CA_CERTS` or `NODE_TLS_REJECT_UNAUTHORIZED` is set and the settings' `environment.allow` doesn't list it.
- **No `headless`** in a person's file. Headless settings let `pick`, `write-families` and `apply` run without a person. Only `check`'s throwaway settings use it.

**Factory workers never run a paid Assetgrove step** (the owner's decision, 2026-11-15, on issue #131). Paid generation (`generate-sheet`, `look-dev`, `rig`, a paid `stage` and the like) runs only in the owner session, which has its own settings outside every checkout. A worker runs Assetgrove offline only: `bash scripts/assetgrove.sh check` and `--dry-run` forecasts. No provider settings, keys or approvals for paid routes are committed or handed to a worker. Assetgrove reads a provider endpoint only from `providers.<id>.baseURL` in the settings. `art/tools/turnaround.mjs` calls the gateway itself and is not an Assetgrove step. Each of its calls records the cost the gateway reports for that generation (the answer's `providerMetadata.gateway.cost`, else the gateway's generation record, read with the AI SDK's `getGenerationInfo` from the pinned Assetgrove's locked install, so run `bash scripts/assetgrove.sh fetch` first); with no exact cost, or one that rounds to $0 at the ledger's micro-dollar, the call's reservation stays its committed cost, so a call is never recorded as free and the run's cap holds. `check` proves this with recorded gateway answers (`art/proof/gateway/`) and no paid call.

## 1. Forecast the run

A run is up to 4 candidates of one family. On the sheet path a candidate is one generated sheet. Each `generate-sheet` call gets a quarter of the run's cap, so the four together can never pass $5. Forecast one candidate first. It spends nothing, needs no key and writes nothing, but it does need settings that configure a provider: with none it exits 2 `route_unavailable`, and with a proxy variable set that the settings don't allow it exits 2 `settings_invalid`.

- **In the owner session** the owner's own settings serve it. An agent there may run the command below.
- **In a Factory worker** there are no owner settings, and none are handed to it. A worker either reads the forecasts that `bash scripts/assetgrove.sh check` prints (one per family, made with check's throwaway scripted-only settings), or runs the command below the same way `check` does: it writes a scripted-only settings file (`format`, `stateDir`, `providers.scripted` with a `limit`, as in `art/tools/check.mjs`) in a temporary directory outside the checkout, sets `ASSETGROVE_CONFIG` to it, and unsets `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NODE_USE_ENV_PROXY`, `NODE_EXTRA_CA_CERTS` and `NODE_TLS_REJECT_UNAUTHORIZED` (both cases) for that one command. The scripted provider prices each job at the core default models' estimates, so the forecast matches the owner's default routes.

```sh
bash scripts/assetgrove.sh run generate-sheet \
  --spec art/stevie/shelter/spec.json --bible art/style-bible.json \
  --profile art/target-profile.json --lock-bible art/style-bible.md \
  --cap 1.25 --dry-run --json
```

The forecast (the WorkPlan's `jobs` and `forecastUsd`, and `plan.estimateUsd`) lists the prompt-policy check, the sheet, the grouping proposal and the identity score: about $0.32 in all. `bash scripts/assetgrove.sh check` prints each family's whole-run forecast: four of these plus four agent QA passes.

## 2. Generate up to four candidates

This is the step that spends money. It runs only in the owner session, under the owner's own settings, never in a Factory worker. Never commit a key or print it. A paid run needs a person's confirmation of its spend. At a terminal, Assetgrove asks inline. In an agent's shell, which has no terminal, the command stops with exit 8 `confirmation_required`, and `error.confirmation` names the run's id. The owner then runs `assetgrove confirm <id>` at a terminal (or confirms in the MCP client's form), and the same command runs again. A confirmation covers one run directory.

```sh
for candidate in 1 2 3 4; do
  bash scripts/assetgrove.sh run generate-sheet \
    --spec art/stevie/shelter/spec.json --bible art/style-bible.json \
    --profile art/target-profile.json --lock-bible art/style-bible.md \
    --cap 1.25 --imports .assetgrove/imports --round "$candidate" --json
done
```

`--round` makes each candidate its own run. A paid command's run directory is `.assetgrove/runs/r-<digest>/`, keyed by a digest of the request: the command, round, input bytes, options and cap. An identical request that finished is returned as it ended (`reused: true`, no call), and one that stopped resumes from its journal. Without `--round`, the loop would make one sheet and return it three more times. A later attempt at a candidate needs a new round number too.

Each candidate draws the whole cycle as one sheet, then Assetgrove slices, mattes (soft alpha, full colour) and registers it into `.assetgrove/imports/<import>/`. Git ignores that directory. Assetgrove proposes a grouping in `grouping.json` with status `proposed`. Identity is scored against Stevie's lock in shadow mode at 0.68: the score is recorded and nothing is filtered.

A sheet with the wrong number of figures is refused with exit 5 (`qa_found_nothing`). It is never padded. The sheet and its record stay in the import directory, and the attempt still counts as one of the four.

## 3. Agent QA, then the owner picks

Agent QA runs first. Each candidate's import already carries Assetgrove's import checks in `import.json` and in the command's JSON output:

- the frame count;
- each frame's matte checks (edge halo, leftover background);
- the world's matting-fringe check runs on every write, as part of the profile's validator (step 4): it flags a soft edge that is a blend of the figure and the flat background, the pale fringe Assetgrove's edge halo misses. To see a frame's score before writing, run `node art/tools/fringe.mjs <frame.png> --background <hex>` with the background the import recorded for it (`art/README.md` has the threshold and its calibration);
- the shadow-mode identity score.

The deterministic checks (frame count, transparency) filter. Model-backed checks (vision verdicts, identity flicker, holes, style score) are advisory in Assetgrove 0.1. They are recorded as `shadow` in the result's `filtering` list, never fail a candidate, and a person judges what they report.

The agent reports each candidate's import directory, `contact.png`, identity score and any failed frames. The owner then picks one candidate and confirms its grouping: edit that import's `grouping.json` (family name `shelter`, frames in play order, drop bad frames) and set `"status": "confirmed"`. Agents never set `confirmed`. A confirmed grouping alone doesn't authorise the write: `write-families` asks the owner too (step 4).

## 4. Write the pick into this repository

```sh
bash scripts/assetgrove.sh run write-families \
  --import .assetgrove/imports/<import> --target . --json
```

The owner runs or confirms this step. `write-families` and `pick` need a person's confirmation, as a paid run does: in an agent's shell they stop with exit 8 until the owner runs `assetgrove confirm <id>`. The profile's validator (`bash scripts/validate-asset.sh {{manifest}}`, and `node art/tools/model3d.mjs validate {{manifest}}` for 3D) runs only once the owner has approved that exact command. The approval is a hash of the argv, the working directory relative to the repository and the bytes of `scripts/validate-asset.sh` (or `art/tools/model3d.mjs`). The first run stops with exit 8, `error.confirmation.id` holds the hash, and `assetgrove confirm <hash>` approves it. Approve again only after either script changes.

The command writes, in Clockgrove's layout:

- `assets/source/stevie/shelter.png`, the strip;
- `assets/manifests/stevie/shelter.json`, replacing the placeholder's manifest, with `review.status: "pending"` and the atlas slot, accessibility label, semantic and footprint from `art/stevie/shelter/spec.json` (the family named in the confirmed grouping must be the spec's family);
- `assets/source/stevie/shelter.png.provenance.json`, the full provenance: models, route, prompt, references, request IDs, costs, provider terms, output grant, identity score, and IPTC Digital Source Type `trainedAlgorithmicMedia`. The PNG also embeds the disclosure in XMP.

It then runs Clockgrove's validator (`bash scripts/validate-asset.sh`). A refusal comes back as exit 6 with Clockgrove's reasons verbatim, and nothing is fixed silently. Frames that failed the matte checks are refused at write time. A licence the profile can't accept is refused with exit 7 before anything is written: MIT needs a commercial grant that allows relabelling, CC-BY-4.0 is accepted with its credit line, and non-commercial or provider-retained output is always refused. A call that recorded no output grant is refused the same way. The core default routes all carry one; a role or route in your own settings needs its own (see "Developer settings").

`write-families` also runs the pixel animation QA against the family's motion template (ground contact, anchor and footprint drift, silhouette, loop seam, edge halo; `art/target-profile.json` sets the quadruped gait). It writes the onion skin and looping preview into the import's `preview/`. Then the two vision checks, identity flicker and holes, run on what was written, within a small cap. They spend, so they run in the owner session. In Assetgrove 0.1 they are advisory: they record and name the frames they question, recorded as `shadow`, and the owner judges them. They don't exit 5:

```sh
bash scripts/assetgrove.sh run animation-qa --import .assetgrove/imports/<import> --cap 1 --json
```

Then commit the strip, manifest and provenance. `.gitattributes` puts the PNG in Git LFS, and `REUSE.toml`'s `**` annotation covers an MIT pick.

**Pick into a clone with Git LFS set up.** A clone made where Git LFS isn't installed globally has no LFS filters, so its media are pointer files and `git add` would commit picked media as plain blobs. Run `git lfs install --local` and `git lfs pull` in the clone before the pick. `git diff --cached` then shows each picked file as a three-line pointer.

**A new 3D model pick for Stevie** also changes what the quality lab ships. In the same PR:
- run `node spikes/stevie-3d/scripts/web-media.mjs stevie` to rebuild `references/web-media/`;
- move the lab's approved-model hash (`STEVIE_SHA256` in `spikes/quality-lab/scripts/lab.mjs`) and the coat lengths it checks to the new manifest's values.

Otherwise CI's lab step loads the stale web media and fails.

**A CC-BY-4.0 pick** needs its own REUSE annotation, in the same commit, the way `REUSE.toml` already does for the Meshy models. Add an `override` annotation for the strip and its provenance file, with the provider as copyright holder and the credit line Assetgrove recorded:

```toml
[[annotations]]
path = ["assets/source/stevie/shelter.png", "assets/source/stevie/shelter.png.provenance.json"]
precedence = "override"
SPDX-FileCopyrightText = "<year> <provider, as in the provenance's output grant>"
SPDX-License-Identifier = "CC-BY-4.0"
```

`bash scripts/assetgrove.sh check` fails (`licences:`) when any manifest's licence differs from the licence `REUSE.toml` gives its source file, so the strip can't land as CC-BY-4.0 in its manifest and MIT in its REUSE metadata.

The pick lands with review pending and full provenance, and CI stays green.

**Fallback: one bad frame.** Fix it with a reference-guided edit from an approved neighbour, within its own cap, then hand off the fixed strip:

```sh
bash scripts/assetgrove.sh run fix-frame --strip assets/source/stevie/shelter.png \
  --profile art/target-profile.json --family shelter --frame 3 --from 2 \
  --out .assetgrove/fixes/shelter --cap 2 --json
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

- **Clockgrove:** the manifest decoder requires a non-empty palette even for unrestricted-colour art. The profile records the bible's palette tokens, which `check` keeps equal to the bible.
- **Assetgrove:** the briefs are read by `plan` and its key-pose fallback, not by `generate-sheet` at the pinned commit. On the sheet path they are the author's statement of what the strip must show.
