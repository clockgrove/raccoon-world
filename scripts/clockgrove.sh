#!/usr/bin/env bash
# Checks this repository's world pack against Clockgrove at the commit pinned in CLOCKGROVE_COMMIT.
# CI, Factory and local runs all use this script, so they run the same check.
#
# Usage: bash scripts/clockgrove.sh fetch   clone the pinned commit and install its locked dependencies
#        bash scripts/clockgrove.sh check   fetch if needed, then run Clockgrove's world-pack check
#
# CLOCKGROVE_DIR names the checkout (default: .clockgrove in this repository, which Git ignores; inside
# the repository so that sandboxes which may write only the clone, such as Factory's local mode, can
# make it). The script only replaces a directory it made itself: one holding its marker file, or an
# empty one.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin="$(tr -d '[:space:]' < "$root/CLOCKGROVE_COMMIT")"
[[ "$pin" =~ ^[0-9a-f]{40}$ ]] || { echo "CLOCKGROVE_COMMIT must hold one full commit sha, not '$pin'" >&2; exit 2; }
dir="${CLOCKGROVE_DIR:-$root/.clockgrove}"
[[ "$dir" == /* ]] || dir="$PWD/$dir"
marker="$dir/.raccoon-world-pin" # "fetching" until the install finishes, then the commit it installed

ready() { [[ -f "$marker" && "$(cat "$marker")" == "$pin" ]]; }

pnpm=() # the pnpm command fetch runs (pick_pnpm)

# Clockgrove's own pnpm (its package.json packageManager) through Corepack. Where Corepack cannot fetch
# that version (Factory's local sandbox lets pnpm neither download nor switch versions), this machine's
# pnpm, told not to switch either, and the output says so.
pick_pnpm() {
  local want have path
  want="$(node -p 'require(process.argv[1]).packageManager || "pnpm"' "$dir/package.json")"
  if command -v corepack > /dev/null && (cd "$dir" && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm --version) > /dev/null 2>&1; then
    pnpm=(env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm)
    return
  fi
  # COREPACK_ENABLE_PROJECT_SPEC=0: a Corepack shim on PATH runs its default pnpm, not the unreachable pin.
  path="$(command -v pnpm || echo 'none on PATH')"
  pnpm=(env COREPACK_ENABLE_PROJECT_SPEC=0 pnpm_config_manage_package_manager_versions=false pnpm)
  if ! have="$(cd "$dir" && "${pnpm[@]}" --version 2> /dev/null)"; then
    echo "clockgrove: Corepack could not fetch $want, and this machine's pnpm ($path) did not run either; put $want on PATH" >&2
    exit 2
  fi
  echo "clockgrove: Corepack could not fetch $want; using this machine's pnpm $have ($path) instead"
}

pnpm_in() ( cd "$dir" && "${pnpm[@]}" "$@" )

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
  pick_pnpm
  pnpm_in install --frozen-lockfile --ignore-scripts
  printf '%s\n' "$pin" > "$marker"
}

check() {
  ready || fetch
  # The Node.js Clockgrove pins (package.json engines). CI's setup-node and FACTORY_NODE_VERSION must match it.
  local want have path
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
