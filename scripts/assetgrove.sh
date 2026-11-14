#!/usr/bin/env bash
# Runs Assetgrove from a source checkout at the commit pinned in ASSETGROVE_COMMIT, and Raccoon
# World's art checks with it. Assetgrove is never taken from npm (Clockgrove's external-world rule).
#
# Usage: bash scripts/assetgrove.sh fetch          clone the pinned commit and install its locked dependencies
#        bash scripts/assetgrove.sh run <args...>  run the pinned Assetgrove CLI in this directory
#        bash scripts/assetgrove.sh check          the art checks: derived bible copy, style profile match,
#                                                  run forecasts and the offline proof (art/tools/check.mjs)
#
# ASSETGROVE_DIR names the checkout (default: .assetgrove-src in this repository, which Git ignores).
# The script only replaces a directory it made itself: one holding its marker file, or an empty one.
# `check` also needs the pinned Clockgrove (bash scripts/clockgrove.sh fetch); it makes no paid model
# call and needs no key: only the model provider is scripted.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin="$(tr -d '[:space:]' < "$root/ASSETGROVE_COMMIT")"
[[ "$pin" =~ ^[0-9a-f]{40}$ ]] || { echo "ASSETGROVE_COMMIT must hold one full commit sha, not '$pin'" >&2; exit 2; }
dir="${ASSETGROVE_DIR:-$root/.assetgrove-src}"
[[ "$dir" == /* ]] || dir="$PWD/$dir"
marker="$dir/.raccoon-world-pin" # "fetching" until the install finishes, then the commit it installed

ready() { [[ -f "$marker" && "$(cat "$marker")" == "$pin" ]]; }

pnpm=()
# Assetgrove's own pnpm (its packageManager) through Corepack, else this machine's pnpm, told not to switch.
pick_pnpm() {
  local want have path
  want="$(node -p 'require(process.argv[1]).packageManager || "pnpm"' "$dir/package.json")"
  if command -v corepack > /dev/null && (cd "$dir" && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm --version) > /dev/null 2>&1; then
    pnpm=(env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm)
    return
  fi
  path="$(command -v pnpm || echo 'none on PATH')"
  pnpm=(env COREPACK_ENABLE_PROJECT_SPEC=0 pnpm_config_manage_package_manager_versions=false pnpm)
  if ! have="$(cd "$dir" && "${pnpm[@]}" --version 2> /dev/null)"; then
    echo "assetgrove: Corepack could not fetch $want, and this machine's pnpm ($path) did not run either; put $want on PATH" >&2
    exit 2
  fi
  echo "assetgrove: Corepack could not fetch $want; using this machine's pnpm $have ($path) instead"
}

fetch() {
  if ready; then echo "assetgrove: $pin already installed in $dir"; return; fi
  if [[ -e "$dir" ]]; then
    if [[ ! -f "$marker" && -n "$(ls -A "$dir")" ]]; then
      echo "assetgrove: $dir is not a checkout this script made; set ASSETGROVE_DIR to another directory" >&2
      exit 2
    fi
    rm -rf -- "$dir"
  fi
  mkdir -p "$dir"
  echo fetching > "$marker"
  echo "assetgrove: fetching $pin into $dir"
  git -C "$dir" init -q
  git -C "$dir" remote add origin https://github.com/clockgrove/assetgrove.git
  GIT_LFS_SKIP_SMUDGE=1 git -C "$dir" fetch -q --depth 1 origin "$pin"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$dir" -c advice.detachedHead=false checkout -q --detach FETCH_HEAD
  # Locked dependencies, lifecycle scripts off, as Assetgrove's own CI installs them.
  pick_pnpm
  (cd "$dir" && "${pnpm[@]}" install --frozen-lockfile --ignore-scripts)
  printf '%s\n' "$pin" > "$marker"
}

case "${1:-}" in
  fetch) fetch ;;
  run)
    shift
    ready || fetch > /dev/null
    exec node "$dir/src/cli.ts" "$@"
    ;;
  check)
    ready || fetch
    cd "$root"
    ASSETGROVE_DIR="$dir" exec node art/tools/check.mjs
    ;;
  *) echo "Usage: bash scripts/assetgrove.sh fetch|run <args...>|check" >&2; exit 2 ;;
esac
