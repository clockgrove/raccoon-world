// Issue #11: every arm draws a visible character in Clockgrove's product renderer, on WebGPU and on its WebGL2
// fallback, under a software GPU. Runs the same command as CI (`bash scripts/stevie-comparison.sh smoke`) and
// checks its record. Run: node --test spikes/stevie-3d/tests/stevie-3d.journey.browser.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));

test("each arm draws a visible character on each backend through the pinned product renderer", () => {
  const out = mkdtempSync(path.join(os.tmpdir(), "stevie-smoke-"));
  const run = spawnSync("bash", [path.join(repo, "scripts/stevie-comparison.sh"), "smoke", out], {
    encoding: "utf8",
    timeout: 600_000,
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const results = JSON.parse(readFileSync(path.join(out, "results.json"), "utf8"));
  assert.equal(results.clockgrove, readFileSync(path.join(repo, "CLOCKGROVE_COMMIT"), "utf8").trim());
  assert.equal(results.software, true);
  const seen = results.shots.map((shot) => `${shot.backend}/${shot.arm}`).sort();
  assert.deepEqual(seen, [
    "webgl2/2d",
    "webgl2/3d",
    "webgl2/3d-sprites",
    "webgpu/2d",
    "webgpu/3d",
    "webgpu/3d-sprites",
  ]);
  for (const shot of results.shots) {
    assert.equal(shot.backend === "webgpu" || shot.backend === "webgl2", true);
    assert.equal(shot.visible, true, `${shot.backend}/${shot.arm}`);
    assert.ok(shot.visiblePixels >= 40, `${shot.backend}/${shot.arm}: ${shot.visiblePixels} visible pixels`);
    assert.match(shot.renderer, /swiftshader/iu);
  }
  for (const timing of Object.values(results.backends).flatMap((backend) => backend.frameTimes ?? []))
    assert.equal(timing.performance, false);
});
