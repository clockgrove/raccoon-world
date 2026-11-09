#!/usr/bin/env bash
# Validates one written asset with Clockgrove's asset validation at the commit pinned in
# CLOCKGROVE_COMMIT: the target profile's validator command (art/target-profile.json), which
# Assetforge runs in the target directory after it writes a strip.
#
# Usage: bash scripts/validate-asset.sh assets/manifests/<assetId>/<family>.json
#
# The world is this repository's root (its assets/ and reference/asset-style.json). CLOCKGROVE_DIR
# names the pinned checkout, as for scripts/clockgrove.sh (default .clockgrove here); fetch it with
# `bash scripts/clockgrove.sh fetch`. Clockgrove's refusals are printed as it gives them.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin="$(tr -d '[:space:]' < "$root/CLOCKGROVE_COMMIT")"
dir="${CLOCKGROVE_DIR:-$root/.clockgrove}"
[[ $# -eq 1 ]] || { echo "Usage: bash scripts/validate-asset.sh <manifest>" >&2; exit 2; }
if [[ ! -f "$dir/.raccoon-world-pin" || "$(cat "$dir/.raccoon-world-pin")" != "$pin" ]]; then
  echo "validate-asset: no Clockgrove $pin checkout in $dir; run bash scripts/clockgrove.sh fetch" >&2
  exit 2
fi
# Node's notice about its experimental TypeScript stripping is not a refusal; keep stderr otherwise.
NODE_NO_WARNINGS=1 node "$dir/packages/assets/bin/clockgrove-assets.mjs" validate "$1" --world "$root"
