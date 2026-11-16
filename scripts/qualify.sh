#!/usr/bin/env bash
# Raccoon World's Wave 4 visual qualification (#13) on the Clockgrove commit pinned in CLOCKGROVE_COMMIT.
# CI's `visual` job and local runs use this script, so they run the same commands.
#
# Usage: bash scripts/qualify.sh assets          Clockgrove's asset deploy gate on this world's art
#        bash scripts/qualify.sh capture [dir]   the §15.3 golden captures (default dir: tests/visual)
#        bash scripts/qualify.sh journey         the S6 browser journey (tests/journey)
#
# Each fetches the pinned checkout first if needed (scripts/clockgrove.sh fetch; CLOCKGROVE_DIR as
# there). capture and journey also need the pinned checkout's PostgreSQL 18.6 with pgvector 0.8.7 on
# PATH (Clockgrove's scripts/ci/toolchain.sh postgresql pgvector browser-deps) and install its
# Playwright Chromium when it is missing. They need the reviewed art hydrated from Git LFS.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin="$(tr -d '[:space:]' < "$root/CLOCKGROVE_COMMIT")"
dir="${CLOCKGROVE_DIR:-$root/.clockgrove}"
[[ "$dir" == /* ]] || dir="$PWD/$dir"
export CLOCKGROVE_DIR="$dir"

# The rail subjects of the captures: Stevie, the S6 story's raccoon, whose actions carry recorded Why
# evidence, and the den, a drawn object the world inspects without reacting (Clockgrove's
# "Inspection from world evidence" disclosure).
ACTOR=grove.stevie
OBJECT=grove.den

fetched() {
  if [[ ! -f "$dir/.raccoon-world-pin" || "$(cat "$dir/.raccoon-world-pin")" != "$pin" ]]; then
    bash "$root/scripts/clockgrove.sh" fetch
  fi
}

chromium() {
  # The Chromium the pinned Playwright drives; a no-op when it is already installed.
  node "$dir/node_modules/playwright/cli.js" install chromium
}

# Clockgrove's deploy gate (`clockgrove-assets check`): every manifest's licence, provenance and human
# review, assets/reviewed equal to a fresh build of the deployable manifests, a current licence report,
# and the approved golden scene. The gate looks for packs in every directory under the world, and the
# pinned checkouts inside this repository (.clockgrove, .assetgrove-src) hold Clockgrove's fixture
# packs, so it runs on a view of the world: a copy of worlds/ with assets/ and reference/ linked.
assets() {
  fetched
  view="$(mktemp -d "${TMPDIR:-/tmp}/raccoon-world-assets-XXXXXX")"
  trap 'rm -rf -- "$view"' EXIT
  cp -R "$root/worlds" "$view/worlds"
  ln -s "$root/assets" "$view/assets"
  ln -s "$root/reference" "$view/reference"
  NODE_NO_WARNINGS=1 node "$dir/packages/assets/bin/clockgrove-assets.mjs" check --world "$view"
}

# Clockgrove's external-world capture: both backends (WebGPU and forced WebGL2) at 1536x864, 1280x720
# and 390x844, with this world's pack, shell and reviewed static assets. It writes the PNGs,
# captures.json, webgl2/ and approval-status.json, and never approves. An approval whose digest no
# longer matches fails the run; captures not yet approved pass, and the output says so.
capture() {
  local out="${1:-$root/tests/visual}"
  fetched
  chromium
  node "$dir/scripts/capture-world.mjs" \
    --pack "$root/worlds/raccoons" \
    --shell "$root/worlds/raccoons/shell.json" \
    --assets "$root/assets/reviewed" \
    --actor "$ACTOR" --object "$OBJECT" \
    --out "$out" > /dev/null
  node - "$out/approval-status.json" << 'EOF'
const { reports } = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
const count = (status) => reports.filter((report) => report.approval === status).length;
for (const report of reports) console.log(`${report.approval}  ${report.sha256}  ${report.file}`);
console.log(`${reports.length} captures: ${count("approved")} approved, ${count("pending-human-approval")} pending, ${count("changed-needs-human-approval")} changed`);
if (count("changed-needs-human-approval") > 0) {
  console.error("An approved capture changed: review it again (tests/visual/README.md)");
  process.exit(1);
}
EOF
}

# The S6 journey runs through the pinned checkout's Vitest and native world-owner harness, as its own
# browser journeys do; CI=true is the browser-journey opt-in Clockgrove requires.
journey() {
  fetched
  chromium
  cd "$dir"
  CI=true RACCOON_WORLD_ROOT="$root" node "$dir/node_modules/vitest/vitest.mjs" run \
    --config "$root/tests/journey/vitest.config.mjs"
}

case "${1:-}" in
  assets) assets ;;
  capture) capture "${2:-}" ;;
  journey) journey ;;
  *) echo "Usage: bash scripts/qualify.sh assets|capture [dir]|journey" >&2; exit 2 ;;
esac
