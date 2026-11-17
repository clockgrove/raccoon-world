// The device tier policy (#143): node --test spikes/quality-lab/tests/tier.node.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { deviceTier } from "../src/config.ts";

const tier = (s) => deviceTier({ forced: null, cores: null, memoryGb: null, ...s }).platform;

test("phones, tablets and computers by what they are and can do", () => {
  // iPhone: touch-first, 390 px short side.
  assert.equal(tier({ touchFirst: true, shortSidePx: 390, cores: 6 }), "phone");
  // An Android phone in Chrome.
  assert.equal(tier({ touchFirst: true, shortSidePx: 412, cores: 8, memoryGb: 8 }), "phone");
  // An iPad (its Safari says "Macintosh"): touch-first, no memory reported and WebKit's capped core count, so its
  // cores are not trusted whatever they say; an M-series iPad Pro is placed by ?platform=desktop.
  assert.equal(tier({ touchFirst: true, shortSidePx: 1024, cores: 10 }), "phone");
  assert.equal(tier({ touchFirst: true, shortSidePx: 810, cores: 4 }), "phone");
  assert.equal(deviceTier({ forced: "desktop", touchFirst: true, shortSidePx: 1024, cores: 4, memoryGb: null }).platform, "desktop");
  assert.match(deviceTier({ forced: null, touchFirst: true, shortSidePx: 1024, cores: 10, memoryGb: null }).reason, /no memory/);
  // A flagship Android tablet (8 cores, 8 GB reported) and a mid-range one (8 cores, 4 GB).
  assert.equal(tier({ touchFirst: true, shortSidePx: 800, cores: 8, memoryGb: 8 }), "desktop");
  assert.equal(tier({ touchFirst: true, shortSidePx: 800, cores: 8, memoryGb: 4 }), "phone");
  // A desktop, and a touchscreen laptop whose primary pointer is its trackpad.
  assert.equal(tier({ touchFirst: false, shortSidePx: 1080, cores: 16, memoryGb: 8 }), "desktop");
  assert.equal(tier({ touchFirst: false, shortSidePx: 800, cores: 4, memoryGb: 4 }), "desktop");
});

test("?platform= wins and every placement says why", () => {
  assert.equal(tier({ forced: "phone", touchFirst: false, shortSidePx: 1440, cores: 16 }), "phone");
  assert.equal(tier({ forced: "desktop", touchFirst: true, shortSidePx: 390, cores: 6 }), "desktop");
  assert.match(deviceTier({ touchFirst: true, shortSidePx: 810, cores: 6, memoryGb: null }).reason, /tablet/);
});
