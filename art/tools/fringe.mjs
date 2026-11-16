// World-owned matting-fringe check: a soft edge that is a blend of the figure and the known flat background.
// Assetgrove's edge-halo only measures distance from nearby opaque pixels and misses pale fur on a pale background.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cropRgba, decodePng } from "../../spikes/stevie-3d/scripts/png.mjs";

// Px within which a soft edge pixel finds the figure colours it fades from (as Assetgrove's halo).
const RADIUS = 3;
// RGB distance from a nearby opaque colour within which a soft pixel keeps the figure's own colour (not fringe).
const OWN = 12;
// Largest RGB residual from the figure-background line for a pixel to count as a blend of the two.
const BLEND = 10;
// Smallest background share (1 - t) of a blend for it to count as fringe rather than a faint tint.
const MIN_BG = 0.2;
// Smallest figure-background RGB distance at which the blend direction is measurable.
const MIN_SEP = 12;

const here = dirname(fileURLToPath(import.meta.url));
const dist = (d, i, c) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);

export function hex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) throw new Error(`not a #rrggbb colour: ${s}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
export { toHex };

/** Per-channel median of the image's border pixels. */
export function sheetBackground(image) {
  const { width, height, data } = image;
  const px = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) px.push((y * width + x) * 4);
  return [0, 1, 2].map((ch) => {
    const v = px.map((i) => data[i + ch]).sort((a, b) => a - b);
    return v[v.length >> 1];
  });
}

function neighbours(frame, x, y) {
  const { width, height, data } = frame;
  const out = [];
  for (let dy = -RADIUS; dy <= RADIUS; dy++)
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const j = (yy * width + xx) * 4;
      if (data[j + 3] === 255) out.push(j);
    }
  return out;
}

/** Soft edge pixels, and of those the ones that are a blend of a nearby figure colour and the background. */
export function frameFringe(frame, background) {
  const { width, height, data } = frame;
  let edgePixels = 0;
  let fringePixels = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a === 0 || a === 255) continue;
      const near = neighbours(frame, x, y);
      if (near.length === 0) continue;
      edgePixels++;
      const c = [data[i], data[i + 1], data[i + 2]];
      let blend = false;
      let own = false;
      for (const j of near) {
        if (dist(data, j, c) <= OWN) {
          own = true;
          break;
        }
        const F = [data[j], data[j + 1], data[j + 2]];
        const fb = F.map((v, k) => v - background[k]);
        const len2 = fb[0] ** 2 + fb[1] ** 2 + fb[2] ** 2;
        if (Math.sqrt(len2) < MIN_SEP) continue;
        const t = Math.min(1, Math.max(0, c.reduce((s, v, k) => s + (v - background[k]) * fb[k], 0) / len2));
        const residual = Math.hypot(...c.map((v, k) => v - (background[k] + t * fb[k])));
        if (residual <= BLEND && 1 - t >= MIN_BG) blend = true;
      }
      if (!own && blend) fringePixels++;
    }
  return { edgePixels, fringePixels };
}

export const fringeShare = (h) => (h.edgePixels === 0 ? 0 : h.fringePixels / h.edgePixels);

/** Splits a horizontal strip into `count` equal frames. */
export function stripFrames(image, count) {
  const w = Math.floor(image.width / count);
  return Array.from({ length: count }, (_, k) => cropRgba(image, k * w, 0, w, image.height));
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;

/** The `matting-fringe` reasons of a strip: one passing reason, or one failing reason per frame over the limit. */
export function fringeReasons(frames, background, limit) {
  const hs = frames.map((f) => frameFringe(f, background));
  const failing = hs.map((h, i) => ({ h, i, s: fringeShare(h) })).filter((x) => x.s > limit);
  if (failing.length === 0) {
    const worst = Math.max(0, ...hs.map(fringeShare));
    return [
      {
        check: "matting-fringe",
        passed: true,
        reason: `no frame's soft edge is a blend with the ${toHex(background)} background: at most ${pct(worst)} of it is (limit ${pct(limit)})`,
      },
    ];
  }
  return failing.map(({ h, i, s }) => ({
    check: "matting-fringe",
    passed: false,
    reason: `frame ${i + 1}: ${h.fringePixels} of ${h.edgePixels} soft edge pixels are a blend of the figure and the ${toHex(background)} background (${pct(s)}, limit ${pct(limit)})`,
    frames: [i + 1],
  }));
}

/** A counter-example: each soft edge pixel's colour mixed with the background, as a matte that kept it. */
export function fringed(frame, background) {
  const data = new Uint8Array(frame.data);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0 || a === 255) continue;
    for (let k = 0; k < 3; k++) data[i + k] = Math.round((a / 255) * data[i + k] + (1 - a / 255) * background[k]);
  }
  return { width: frame.width, height: frame.height, data };
}

// Assetgrove's edge-halo share (halo.ts, 64 distance), for comparison only.
function assetgroveHalo(frame) {
  let edge = 0;
  let halo = 0;
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++) {
      const i = (y * frame.width + x) * 4;
      const a = frame.data[i + 3];
      if (a === 0 || a === 255) continue;
      const near = neighbours(frame, x, y);
      if (near.length === 0) continue;
      edge++;
      const c = [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
      if (Math.min(...near.map((j) => dist(frame.data, j, c))) > 64) halo++;
    }
  return edge === 0 ? 0 : halo / edge;
}

const PALE_FUR = hex("#e2d7c2");
const PALE_BACKGROUND = hex("#f2efe8");

// Pale-fur version of a frame: each colour 70% toward the pale fur, alpha unchanged.
function paleFur(frame) {
  const data = new Uint8Array(frame.data);
  for (let i = 0; i < data.length; i += 4)
    for (let k = 0; k < 3; k++) data[i + k] = Math.round(data[i + k] * 0.3 + PALE_FUR[k] * 0.7);
  return { width: frame.width, height: frame.height, data };
}

// Soft strands: transparent pixels beside the figure take the nearest opaque colour at alpha 96.
function softStrands(frame) {
  const out = new Uint8Array(frame.data);
  const { width, height, data } = frame;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] !== 0) continue;
      let best = null;
      let bd = Infinity;
      for (const j of neighbours(frame, x, y)) {
        const p = j / 4;
        const d = Math.hypot((p % width) - x, Math.floor(p / width) - y);
        if (d < bd) [bd, best] = [d, j];
      }
      if (best === null) continue;
      out.set([data[best], data[best + 1], data[best + 2], 96], i);
    }
  return { width, height, data: out };
}

const read = (root, p) => decodePng(readFileSync(join(root, p)));
const worst = (frame, backgrounds) => Math.max(...backgrounds.map((b) => fringeShare(frameFringe(frame, b))));

/** Recomputes the calibration numbers from the repository's approved frames and run-time counter-examples. */
export async function calibrate(root) {
  const sheet = sheetBackground(read(root, "docs/design/reference/jimothy-sprite-sheet.png"));
  const cell = read(root, "references/jimothy/sheet-cell-03.png");
  const approved = [];
  const manifests = join(root, "assets/manifests");
  for (const dir of readdirSync(manifests).sort())
    for (const file of readdirSync(join(manifests, dir)).filter((f) => f.endsWith(".json")).sort()) {
      const m = JSON.parse(readFileSync(join(manifests, dir, file), "utf8"));
      if (m.review?.status !== "approved") continue;
      const frames = stripFrames(read(root, m.source.path), m.frames.count);
      frames.forEach((f, k) =>
        approved.push({ source: m.source.path, frame: k + 1, share: worst(f, [sheet, hex("#e0e0e0"), hex("#ffffff")]) }),
      );
    }
  approved.push({ source: "references/jimothy/sheet-cell-03.png", frame: 1, share: worst(cell, [sheet]) });
  const pale = fringed(paleFur(cell), PALE_BACKGROUND);
  return {
    approved,
    worstShare: Math.max(...approved.map((a) => a.share)),
    fringed: fringeShare(frameFringe(fringed(cell, sheet), sheet)),
    paleFringed: fringeShare(frameFringe(pale, PALE_BACKGROUND)),
    softStrands: fringeShare(frameFringe(softStrands(cell), sheet)),
    assetgroveHaloPale: assetgroveHalo(pale),
    background: toHex(sheet),
  };
}

function cli(argv) {
  const args = argv.slice(2);
  const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--background" && args[args.indexOf(a) - 1] !== "--frames");
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const bg = opt("--background");
  const count = opt("--frames") === undefined ? 1 : Number(opt("--frames"));
  if (!file || !bg || !/^#[0-9a-f]{6}$/i.test(bg) || !Number.isInteger(count) || count < 1) {
    console.error("usage: node art/tools/fringe.mjs <png> --background #rrggbb [--frames N]");
    return 2;
  }
  const profile = JSON.parse(readFileSync(resolve(here, "../target-profile.json"), "utf8"));
  const limit = profile.animation.matting.fringeShare;
  const frames = stripFrames(decodePng(readFileSync(file)), count);
  const reasons = fringeReasons(frames, hex(bg), limit);
  const shares = frames.map((f) => fringeShare(frameFringe(f, hex(bg))));
  const passed = reasons.every((r) => r.passed);
  console.log(JSON.stringify({ passed, reasons, shares }, null, 2));
  return passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = cli(process.argv);
