#!/usr/bin/env bash
# Checks this repository's world pack against Clockgrove at the commit pinned in CLOCKGROVE_COMMIT.
# CI, Factory and local runs all use this script, so they run the same check.
#
# Usage: bash scripts/clockgrove.sh fetch   clone the pinned commit and install its locked dependencies
#        bash scripts/clockgrove.sh check   fetch if needed, then run Clockgrove's world-pack check
#
# CLOCKGROVE_DIR names the checkout (default: ~/.cache/raccoon-world/clockgrove). The script only
# replaces a directory it made itself: one holding its marker file, or an empty one.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin="$(tr -d '[:space:]' < "$root/CLOCKGROVE_COMMIT")"
[[ "$pin" =~ ^[0-9a-f]{40}$ ]] || { echo "CLOCKGROVE_COMMIT must hold one full commit sha, not '$pin'" >&2; exit 2; }
dir="${CLOCKGROVE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/raccoon-world/clockgrove}"
[[ "$dir" == /* ]] || dir="$PWD/$dir"
marker="$dir/.raccoon-world-pin" # "fetching" until the install finishes, then the commit it installed

ready() { [[ -f "$marker" && "$(cat "$marker")" == "$pin" ]]; }

pnpm_in() ( # Clockgrove's own pnpm (its package.json packageManager), through Corepack when it is there
  cd "$dir"
  if command -v corepack > /dev/null; then COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm "$@"; else pnpm "$@"; fi
)

fetch() {
  if ready; then echo "clockgrove: $pin already installed in $dir"; return; fi
  if [[ -e "$dir" ]]; then
    if [[ ! -f "$marker" && -n "$(ls -A "$dir")" ]]; then
      echo "clockgrove: $dir is not a checkout this script made; set CLOCKGROVE_DIR to another directory" >&2
      exit 2
    fi
    rm -rf -- "$dir"
  fi
  mkdir -p "$dir"
  echo fetching > "$marker"
  echo "clockgrove: fetching $pin into $dir"
  git -C "$dir" init -q
  git -C "$dir" remote add origin https://github.com/clockgrove/clockgrove.git
  GIT_LFS_SKIP_SMUDGE=1 git -C "$dir" fetch -q --depth 1 origin "$pin"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$dir" -c advice.detachedHead=false checkout -q --detach FETCH_HEAD
  # Clockgrove's documented install for external worlds: locked dependencies, lifecycle scripts off.
  pnpm_in install --frozen-lockfile --ignore-scripts
  printf '%s\n' "$pin" > "$marker"
}

check() {
  ready || fetch
  # The Node.js Clockgrove pins (package.json engines). CI's setup-node and FACTORY_NODE_VERSION must match it.
  local want have
  want="$(node -p 'require(process.argv[1]).engines.node' "$dir/package.json")"
  have="$(node --version)"
  if [[ "v$want" != "$have" ]]; then
    echo "clockgrove: Node $have, but Clockgrove $pin pins $want; use that version (CI's setup-node and FACTORY_NODE_VERSION too)" >&2
    exit 2
  fi
  cd "$root"
  # The optional Cloudflare geolocation fetch is off: the check needs no network once installed.
  CLOUDFLARE_CF_FETCH_ENABLED=false node "$dir/scripts/check-world-pack.mjs" --pack worlds/raccoons --assets assets/manifests
}

case "${1:-}" in
  fetch) fetch ;;
  check) check ;;
  *) echo "Usage: bash scripts/clockgrove.sh fetch|check" >&2; exit 2 ;;
esac
