#!/usr/bin/env bash
# The Stevie character-rendering comparison (issue #11) through Clockgrove's product renderer at the commit
# pinned in CLOCKGROVE_COMMIT. The page and runner are in spikes/stevie-3d/ (docs/stevie-3d.md).
#
# Usage: bash scripts/stevie-comparison.sh smoke [<out-dir>]
#          CI's check: builds the comparison at the pinned commit and shows that every arm draws a visible
#          character on WebGPU and on its WebGL2 fallback under a software GPU (SwiftShader). A few minutes.
#          Times from software rendering are never reported as performance.
#        bash scripts/stevie-comparison.sh full <out-dir> [runner options...]
#          The full shot set for the report (docs/reports/stevie-character-rendering/), under SwiftShader
#          unless runner options say otherwise; see the maintainer step in the report for a real GPU.
#
# STEVIE_BROWSER names a Chromium-family executable (default: google-chrome, chromium or chromium-browser on
# PATH). Needs the pinned Clockgrove checkout (fetched here if missing, as scripts/clockgrove.sh does).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-}"
shift || true

browser="${STEVIE_BROWSER:-}"
if [[ -z "$browser" ]]; then
  for candidate in google-chrome chromium chromium-browser; do
    if command -v "$candidate" > /dev/null; then browser="$(command -v "$candidate")"; break; fi
  done
fi
[[ -n "$browser" ]] || { echo "stevie-comparison: no Chromium-family browser on PATH; set STEVIE_BROWSER" >&2; exit 2; }

bash "$root/scripts/clockgrove.sh" fetch

# --no-sandbox: the page is this repository's own, served on 127.0.0.1; hosted Linux runners and container
# sandboxes refuse Chromium's own sandbox (unprivileged user namespaces), as Playwright's launcher also assumes.
software=(--software --browser "$browser" --browser-arg=--no-sandbox --label "software GPU (SwiftShader), not performance")

case "$mode" in
  smoke)
    out="${1:-$(mktemp -d)}"
    exec node "$root/spikes/stevie-3d/scripts/stevie.mjs" "${software[@]}" --mode smoke --out "$out"
    ;;
  full)
    out="${1:?Usage: bash scripts/stevie-comparison.sh full <out-dir> [runner options...]}"
    shift
    exec node "$root/spikes/stevie-3d/scripts/stevie.mjs" "${software[@]}" --mode full --out "$out" "$@"
    ;;
  *) echo "Usage: bash scripts/stevie-comparison.sh smoke [<out-dir>] | full <out-dir> [runner options...]" >&2; exit 2 ;;
esac
