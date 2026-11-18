---
name: art-direction
description: Load when generating, reviewing or describing Raccoon World's art, or when reading or changing its style bible (art/style-bible.md), anchors or identity locks.
---

# Raccoon World art direction

The world's look is one file: [art/style-bible.md](../../../art/style-bible.md), Assetgrove's `BIBLE.md` format. Every Assetgrove command reads it with `--bible art/style-bible.md`, identity locks included. Read it before any art or UI work: its front matter, its positive and negative anchor images, and its prose (the look, perspective, characters and identity locks, the 3D characters, anchors, palette and lighting).

- **The format:** Assetgrove's [BIBLE.md reference](https://github.com/clockgrove/assetgrove/blob/main/skills/art-direction/references/bible-format.md) gives every field, which commands read which part, and how to change it safely.
- **Why each value is what it is:** [art/README.md](../../../art/README.md). **The whole path from inputs to the live yard:** [docs/art/author-guide.md](../../../docs/art/author-guide.md).
- **Run Assetgrove** through the pin, never from npm: `bash scripts/assetgrove.sh run <command> ...`.

## Changing the bible

1. Edit `art/style-bible.md`. Describe the look in plain visual words: never name or imitate an existing game, studio or living artist (Assetgrove's prompt policy refuses those with exit 9).
2. A new positive anchor must be approved material first: its file's sha256 needs an entry, with the owner's approval, in `references/approved.json` (`art/tools/anchors.mjs`). An unpicked candidate fails wherever it lives.
3. Gracie's identity lock must keep exactly her decided traits (`GRACIE_TRAITS` in `art/tools/check.mjs`). Changing a lock is the owner's decision.
4. Change `version` when the look changes, so the library can show what was made under the old one.
5. Run `bash scripts/assetgrove.sh run bible describe --bible art/style-bible.md` (validates, no model call), then `bash scripts/assetgrove.sh check` (offline, no key): the bible, style, inputs, proof, licences, Gracie, 3D, cost, fringe and facts checks must pass.

## Who decides

Agents forecast, run QA and report. Only a person confirms spend, picks a candidate, approves an anchor or an asset, or approves a golden. Pendulum workers never run a paid Assetgrove step: they run `check` and `--dry-run` forecasts only ([author guide](../../../docs/art/author-guide.md)).
