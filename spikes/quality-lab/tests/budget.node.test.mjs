// The frame budget follows the display's measured refresh (#143): node --test spikes/quality-lab/tests/budget.node.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { budgetMs, frameBudget, targetMs } from "../src/config.ts";

const close = (a, b) => Math.abs(a - b) < 0.01;

test("60 fps on a 48 or 50 Hz panel holds at one frame per refresh", () => {
  for (const hz of [48, 50]) {
    const refresh = 1000 / hz;
    const b = frameBudget(60, refresh);
    assert.equal(b.intervals, 1);
    assert.ok(close(b.targetMs, refresh));
    // A page drawing on every refresh reports a p95 of one refresh (plus jitter): that holds.
    assert.ok(refresh * 1.05 <= b.budgetMs, `${hz} Hz: every-refresh p95 ${refresh} ms over the ${b.budgetMs} ms budget`);
    // One missed refresh in more than 5% of frames does not.
    assert.ok(refresh * 2 > b.budgetMs);
  }
});

test("whole refreshes per frame at 60, 120 and 144 Hz, and for the phone's 30 fps", () => {
  assert.deepEqual([60, 120, 144].map((hz) => frameBudget(60, 1000 / hz).intervals), [1, 2, 2]);
  assert.deepEqual([60, 90, 120].map((hz) => frameBudget(30, 1000 / hz).intervals), [2, 3, 4]);
  // Measurement jitter around 8.33 ms does not halve the 120 Hz cadence.
  assert.equal(frameBudget(60, 8.36).intervals, 2);
  assert.ok(close(frameBudget(60, 1000 / 60).budgetMs, 25));
  assert.ok(close(targetMs("phone", 1000 / 120), 33.33));
});

test("no measured refresh falls back to the nominal target plus 10%", () => {
  for (const r of [null, undefined, 0]) {
    const b = frameBudget(60, r);
    assert.equal(b.intervals, null);
    assert.ok(close(b.budgetMs, 18.33));
  }
  assert.ok(close(budgetMs("phone"), 36.67));
});
