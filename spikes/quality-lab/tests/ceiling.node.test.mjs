// The ceiling search trims what measures most expensive on the device (#143): node --test spikes/quality-lab/tests/ceiling.node.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { KNOBS, PRESETS } from "../src/config.ts";
import { findCeiling, rankKnobs } from "../src/runner.ts";

/** A fake device: GPU time is a base plus each knob's cost at its level; frames are whole 60 Hz refreshes. */
function fakeLab(costOf, { software = false, refreshMs = 1000 / 60 } = {}) {
  let config = { ...PRESETS.medium };
  const gpu = (c) => 2 + KNOBS.reduce((sum, k) => sum + costOf(k, c[k]), 0);
  return {
    status: () => ({ ready: true, failure: null, backend: "webgpu", adapter: "fake", software, timestamps: true, platform: "desktop", dpr: 1, canvas: [1, 1], triangles: 0, drawnTriangles: 0, stevie: null, config: { ...config }, view: "yard", state: "dusk", userAgent: "", device: { refreshMs, cores: 8, memoryGb: 8, screen: [1, 1], loadS: { graphics: 0, models: 0, shaders: 0 }, modelMb: 0, levelsMb: { single: 0, phone: null } } }),
    apply: async (c) => {
      config = { ...c };
    },
    setView: async () => {},
    setMotion: async () => {},
    setState: async () => {},
    measure: async () => {
      const g = gpu(config);
      const frame = Math.ceil(g / refreshMs - 1e-9) * refreshMs;
      return { frames: 100, frameMsP50: frame, frameMsP95: frame, gpuMsP50: g, gpuMsP95: g };
    },
    screenshot: async () => "data:image/jpeg;base64,",
  };
}

// Haze is the bottleneck here: 12 ms at Ultra. DPR 2 costs 3 ms, and the rest a little each.
const hazeBound = (knob, level) => {
  if (knob === "haze") return level ? 12 : 0;
  if (knob === "dpr") return level === 2 ? 3 : 0;
  if (knob === "furShells") return level / 16;
  return typeof level === "boolean" && level ? 0.2 : 0;
};

test("where haze is the bottleneck, the ceiling trims haze before DPR", async () => {
  const report = await findCeiling(fakeLab(hazeBound), { warmupMs: 0, holdMs: 0 });
  assert.equal(report.rankedBy, "probe");
  assert.equal(report.ranking[0], "haze");
  assert.ok(report.ranking.indexOf("haze") < report.ranking.indexOf("dpr"));
  const trims = report.steps.filter((s) => s.removed).map((s) => s.removed.knob);
  assert.equal(trims[0], "haze");
  assert.equal(report.held, true);
  // Ultra minus haze is 2 + 3 + 1 + 9 × 0.2 = 7.8 ms GPU: one 60 Hz refresh, so the ceiling keeps DPR 2.
  assert.equal(report.ceiling.dpr, 2);
  assert.equal(report.ceiling.haze, false);
  assert.ok(report.probe.length > 0 && Math.abs(report.costs.find((c) => c.knob === "haze").gpuMsP50 - 12) < 1e-9);
});

test("a sweep's costs (on top of Medium) do not outrank what the probe measured at Ultra", async () => {
  const sweep = [{ knob: "dpr", id: "medium+dpr=2", label: "", frameMsP95: 20, gpuMsP50: 20 }];
  const report = await findCeiling(fakeLab(hazeBound), { warmupMs: 0, holdMs: 0, costs: sweep });
  assert.equal(report.steps.find((s) => s.removed).removed.knob, "haze");
});

test("a software GPU skips the probe and falls back to the sweep or the default order", async () => {
  const report = await findCeiling(fakeLab(hazeBound, { software: true }), { warmupMs: 0, holdMs: 0, maxSteps: 2 });
  assert.equal(report.probe.length, 0);
  assert.equal(report.rankedBy, "default");
  assert.equal(rankKnobs(undefined, [{ knob: "ao", id: "", label: "", frameMsP95: 1, gpuMsP50: null }]).ranking[0], "ao");
});

test("on a 50 Hz panel, Ultra drawing on every refresh holds", async () => {
  const report = await findCeiling(fakeLab(() => 0, { refreshMs: 20 }), { warmupMs: 0, holdMs: 0 });
  assert.equal(report.held, true);
  assert.equal(report.steps.length, 1);
  assert.equal(report.intervals, 1);
});

test("the triangle and cast budgets fit the same refresh", async () => {
  const { findCastBudget, findTriangleBudget } = await import("../src/runner.ts");
  const lab = fakeLab(() => 0, { refreshMs: 20 });
  for (const report of [await findTriangleBudget(lab, { warmupMs: 0, holdMs: 0 }), await findCastBudget(lab, { warmupMs: 0, holdMs: 0 })]) {
    assert.equal(report.intervals, 1);
    assert.equal(report.budgetMs, 30);
    assert.ok(report.held);
  }
});
