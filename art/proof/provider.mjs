// The offline proof's scripted model provider (Assetforge `--provider-script`). It never calls a
// model and nothing it makes is committed: the proof writes into a throwaway copy of the repository.
//
// - image: draws a contact sheet of soft-edged four-legged figures on a flat pale background, one per
//   frame the sheet prompt asks for (`... animation cycle of N frames`). PROOF_SHEET_FIGURES draws
//   another number instead, so the proof can show a short sheet being refused.
// - vision: proposes one family holding every frame, in order (the grouping proposal).
// - decide: an identity score in the middle of the rubric, recorded in shadow mode.
//
// Not art: a stand-in for a model's sheet, so Assetforge's real slicing, matting, registration, QA,
// hand-off and Clockgrove's real validator run on it.
import { deflateSync } from "node:zlib";

const CELL = 256;
const BACKGROUND = [236, 230, 216];

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC = crcTable();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** An 8-bit RGB PNG (a model's sheet has no alpha; Assetforge removes the background). */
function encodeRgbPng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Coverage (0..1) of an ellipse at a pixel, with a one-pixel soft edge. */
function ellipse(px, py, cx, cy, rx, ry) {
  const d = Math.hypot((px - cx) / rx, (py - cy) / ry);
  const edge = (d - 1) * Math.min(rx, ry);
  return Math.max(0, Math.min(1, 0.5 - edge));
}

/** One figure: body, head with a dark mask and cream muzzle, ringed tail, four legs. */
function figure(px, py, ox, oy, step, count) {
  const t = (step / count) * Math.PI * 2;
  const breathe = Math.sin(t) * 1.5;
  const layers = [];
  for (const lx of [-34, -16, 18, 36]) {
    const c = ellipse(px, py, ox + lx, oy - 18, 6, 18);
    if (c > 0) layers.push([c, [58, 51, 48]]);
  }
  layers.push([ellipse(px, py, ox, oy - 46 - breathe, 50, 26 + breathe), [107, 102, 98]]);
  const tail = ellipse(px, py, ox - 62, oy - 54, 22, 11);
  if (tail > 0) layers.push([tail, Math.floor((px - ox) / 7) % 2 ? [174, 150, 117] : [40, 35, 35]]);
  layers.push([ellipse(px, py, ox + 52, oy - 66 - breathe, 20, 18), [107, 102, 98]]);
  layers.push([ellipse(px, py, ox + 56, oy - 68 - breathe, 15, 5), [40, 35, 35]]);
  layers.push([ellipse(px, py, ox + 66, oy - 60 - breathe, 7, 5), [226, 215, 194]]);
  for (const ex of [40, 60])
    layers.push([ellipse(px, py, ox + ex, oy - 84 - breathe, 6, 7), [107, 102, 98]]);
  return layers;
}

function sheet(count) {
  const columns = Math.min(count, 4);
  const rows = Math.ceil(count / columns);
  const width = columns * CELL;
  const height = rows * CELL;
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      let colour = BACKGROUND;
      const step = Math.floor(y / CELL) * columns + Math.floor(x / CELL);
      if (step < count) {
        const ox = (step % columns) * CELL + CELL / 2;
        const oy = Math.floor(step / columns) * CELL + CELL - 40;
        for (const [c, fill] of figure(x + 0.5, y + 0.5, ox, oy, step, count))
          colour = colour.map((v, k) => v + (fill[k] - v) * c);
      }
      rgb.set(colour.map(Math.round), i);
    }
  return encodeRgbPng(width, height, rgb);
}

function framesAsked(prompt) {
  const match = /cycle of (\d+) frames/.exec(prompt);
  if (!match) throw new Error("the scripted provider found no frame count in the sheet prompt");
  return Number(match[1]);
}

export default {
  image(request) {
    const asked = framesAsked(request.prompt);
    const drawn = Number(process.env.PROOF_SHEET_FIGURES ?? asked);
    return { images: [{ mediaType: "image/png", bytes: sheet(drawn) }], costUsd: 0 };
  },
  vision(request) {
    const family = /Suggested family names[^:]*: ([\w-]+)/.exec(request.prompt)?.[1] ?? "family";
    const ids = /The frame numbers are: ([\d, ]+)\./.exec(request.prompt)?.[1] ?? "";
    const frames = ids.split(",").map(Number).filter(Number.isInteger);
    return {
      text: JSON.stringify({
        families: [{ name: family, frames, reason: "scripted proposal: every frame, in order" }],
        unassigned: [],
      }),
      costUsd: 0,
    };
  },
  decide() {
    return { answer: { type: "score", score: 3 }, confidence: 0.6, costUsd: 0 };
  },
};
