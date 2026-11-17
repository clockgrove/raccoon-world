import assert from "node:assert/strict";
import test from "node:test";
import { clearlyDifferent, notBlank, pictureDetail, pictureDiff, samePicture, shrink, TILE_LIMIT } from "../scripts/picture.mjs";

const W = 320;
const H = 180;

function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const hash = (x, y, seed) => {
  const r = random(((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) | 0);
  return r();
};

/** A yard-like frame: a gradient, hard-edged boxes, a fine pattern on one of them. `shift` moves every edge sideways. */
function scene({ shift = 0, patch = null } = {}) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x - shift;
      let r = 40 + (sx / W) * 90;
      let g = 60 + (y / H) * 80;
      let b = 90;
      if (sx >= 40 && sx < 140 && y >= 30 && y < 120) [r, g, b] = [200, 90, 60];
      if (sx >= 180 && sx < 290 && y >= 80 && y < 160) {
        const stripe = (Math.floor(sx / 4) + Math.floor(y / 4)) % 2 ? 40 : 0;
        [r, g, b] = [70 + stripe, 160 + stripe, 80 + stripe];
      }
      if (patch && x >= patch.x && x < patch.x + 34 && y >= patch.y && y < patch.y + 34) {
        [r, g, b] = patch.paint(x, y, [r, g, b]);
      }
      const i = (y * W + x) * 4;
      data[i] = clamp(r);
      data[i + 1] = clamp(g);
      data[i + 2] = clamp(b);
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const blocks = (seed) => (x, y) => 40 + 160 * hash(Math.floor(x / 3), Math.floor(y / 3), seed);
const noisy = (frame, amount, seed) => {
  const next = random(seed);
  const data = Uint8ClampedArray.from(frame.data);
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) data[i + c] += Math.round((next() * 2 - 1) * amount);
  return { ...frame, data };
};

const PATCH_AT = { x: 200, y: 90 };
const textured = (seed) => ({ ...PATCH_AT, paint: (x, y) => [blocks(seed)(x, y), blocks(seed + 1)(x, y), blocks(seed + 2)(x, y)] });

test("the same picture, every edge one pixel off and a little noise: the same", () => {
  const diff = pictureDiff(scene(), noisy(scene({ shift: 1 }), 3, 7));
  assert.ok(samePicture(diff), JSON.stringify(diff));
});

test("a small patch (2% of the frame) with its shading changed is not the same", () => {
  const was = scene({ patch: textured(1) });
  const shaded = scene({ patch: { ...PATCH_AT, paint: (x, y, base) => textured(1).paint(x, y, base).map((v) => v + 30) } });
  const diff = pictureDiff(was, noisy(shaded, 3, 8));
  assert.ok(!samePicture(diff), JSON.stringify(diff));
  assert.ok(diff.meanDiff < 3, "the whole-frame mean would have missed it");
  assert.ok(diff.worstTile.score > TILE_LIMIT);
});

test("a small patch with its texture scrambled is not the same", () => {
  const diff = pictureDiff(scene({ patch: textured(1) }), noisy(scene({ patch: textured(50) }), 3, 9));
  assert.ok(!samePicture(diff), JSON.stringify(diff));
  assert.ok(diff.meanDiff < 3);
});

test("not blank: a flat frame, or a flat frame with a small patch, is blank; a textured frame is not", () => {
  const flat = { data: new Uint8ClampedArray(W * H * 4).fill(90), width: W, height: H };
  assert.ok(!notBlank(pictureDetail(flat)));
  const drawn = Uint8ClampedArray.from(flat.data);
  for (let y = 60; y < 94; y++) for (let x = 100; x < 134; x++) for (let c = 0; c < 3; c++) drawn[(y * W + x) * 4 + c] = clamp(40 + 160 * hash(x, y, c));
  const patched = pictureDetail({ ...flat, data: drawn });
  assert.ok(patched.colours > 20, "the patch alone has plenty of colours");
  assert.ok(!notBlank(patched), JSON.stringify(patched));
  assert.ok(notBlank(pictureDetail(scene({ patch: textured(1) }))));
});

test("clearly different: two different frames are, noise is not", () => {
  const a = scene();
  const inverted = { ...a, data: Uint8ClampedArray.from(a.data, (v, i) => (i % 4 === 3 ? 255 : 255 - v)) };
  assert.ok(clearlyDifferent(pictureDiff(a, inverted)));
  assert.ok(!clearlyDifferent(pictureDiff(a, noisy(a, 3, 5))));
  assert.ok(!clearlyDifferent(pictureDiff(a, a)));
});

/** The frame drawn at twice the size (DPR 2): every pixel repeated in a 2 × 2 block. */
function doubled(frame) {
  const data = new Uint8ClampedArray(frame.width * frame.height * 16);
  for (let y = 0; y < frame.height * 2; y++) {
    for (let x = 0; x < frame.width * 2; x++) {
      const i = ((y >> 1) * frame.width + (x >> 1)) * 4;
      data.set(frame.data.subarray(i, i + 4), (y * frame.width * 2 + x) * 4);
    }
  }
  return { data, width: frame.width * 2, height: frame.height * 2 };
}

test("a frame drawn at DPR 2 is compared at the other's size (Ultra against Low)", () => {
  const plain = scene();
  assert.deepEqual(shrink(doubled(plain), W, H).data, plain.data);
  assert.ok(samePicture(pictureDiff(doubled(plain), plain)));
  const spoiled = scene({ patch: { x: 150, y: 20, paint: () => [255, 255, 255] } });
  assert.ok(!samePicture(pictureDiff(plain, doubled(spoiled))));
  assert.throws(() => pictureDiff(plain, { data: new Uint8ClampedArray(100 * 100 * 4), width: 100, height: 100 }), /whole multiple/u);
});
