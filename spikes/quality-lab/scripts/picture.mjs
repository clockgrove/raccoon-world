// Region-wise picture checks for the CI journey: pure functions over RGBA frames ({ data, width, height }), no DOM.
// A whole-frame mean lets a broken prop that covers 2% of the frame average away, so every check here looks at tiles.

/** A tile whose mean difference (of 255) is above this is a changed region; rasterisation noise stays well under it. */
export const TILE_LIMIT = 8;
/** A tile whose luminance spans at least this much (of 255) holds some detail, not a flat fill. */
export const DETAIL_RANGE = 6;
/** Ultra and Low must differ in at least this share of the tiles. */
export const MIN_CHANGED_SHARE = 0.02;

/** Per pixel of `a`, the smallest mean-RGB difference to any pixel within `radius` of it in `b`. */
function nearest(a, b, radius) {
  const { width, height } = a;
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let best = Infinity;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = (yy * width + xx) * 4;
          const d = (Math.abs(a.data[i] - b.data[j]) + Math.abs(a.data[i + 1] - b.data[j + 1]) + Math.abs(a.data[i + 2] - b.data[j + 2])) / 3;
          if (d < best) best = d;
        }
      }
      out[y * width + x] = best;
    }
  }
  return out;
}

/**
 * A frame box-filtered down to `width` × `height`, a whole-number fraction of its size: Ultra draws at DPR 2, so its
 * frame is twice Low's on each side, and the two are compared at Low's size. Alpha is kept as is.
 */
export function shrink(frame, width, height) {
  const fx = frame.width / width;
  const fy = frame.height / height;
  if (!Number.isInteger(fx) || !Number.isInteger(fy) || fx < 1 || fy < 1) throw new Error(`frames differ in size: ${frame.width}x${frame.height} is not a whole multiple of ${width}x${height}`);
  if (fx === 1 && fy === 1) return frame;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < fy; sy++) {
        for (let sx = 0; sx < fx; sx++) {
          const i = ((y * fy + sy) * frame.width + x * fx + sx) * 4;
          for (let c = 0; c < 4; c++) sum[c] += frame.data[i + c];
        }
      }
      for (let c = 0; c < 4; c++) data[(y * width + x) * 4 + c] = Math.round(sum[c] / (fx * fy));
    }
  }
  return { data, width, height };
}

/**
 * How two frames differ, tile by tile. Each pixel is compared with the best match within `radius`
 * pixels in the other frame, both ways round, so a one-pixel shift of an edge is not a difference. A frame that is a
 * whole multiple of the other's size (a higher DPR) is box-filtered down to it first.
 */
export function pictureDiff(a, b, { tile = 8, radius = 1 } = {}) {
  // Frames drawn at different DPRs are compared at the smaller one's size.
  const width0 = Math.min(a.width, b.width);
  const height0 = Math.min(a.height, b.height);
  a = shrink(a, width0, height0);
  b = shrink(b, width0, height0);
  const { width, height } = a;
  const ab = nearest(a, b, radius);
  const ba = nearest(b, a, radius);
  let plain = 0;
  for (let p = 0, i = 0; p < width * height; p++, i += 4) plain += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
  const worstTile = { score: 0, x: 0, y: 0 };
  let changedTiles = 0;
  let tiles = 0;
  for (let ty = 0; ty < height; ty += tile) {
    for (let tx = 0; tx < width; tx += tile) {
      let sum = 0;
      let count = 0;
      for (let y = ty; y < Math.min(height, ty + tile); y++) {
        for (let x = tx; x < Math.min(width, tx + tile); x++) {
          sum += Math.max(ab[y * width + x], ba[y * width + x]);
          count++;
        }
      }
      const score = sum / count;
      tiles++;
      if (score > TILE_LIMIT) changedTiles++;
      if (score > worstTile.score) Object.assign(worstTile, { score, x: tx, y: ty });
    }
  }
  return { meanDiff: plain / (width * height), worstTile, changedTiles, tiles, changedShare: changedTiles / tiles };
}

export const samePicture = (diff) => diff.worstTile.score <= TILE_LIMIT;

/** Ultra against Low: the pictures differ, and in more than one stray tile. */
export const clearlyDifferent = (diff) => !samePicture(diff) && diff.changedShare >= MIN_CHANGED_SHARE;

/** How much a frame shows: distinct colours (5 bits a channel) and the share of tiles that are not a flat fill. */
export function pictureDetail({ data, width, height }, { tile = 8 } = {}) {
  const seen = new Set();
  const luma = new Float32Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 4) {
    seen.add((data[i] >> 3) * 1024 + (data[i + 1] >> 3) * 32 + (data[i + 2] >> 3));
    luma[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  let detailed = 0;
  let tiles = 0;
  for (let ty = 0; ty < height; ty += tile) {
    for (let tx = 0; tx < width; tx += tile) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let y = ty; y < Math.min(height, ty + tile); y++) {
        for (let x = tx; x < Math.min(width, tx + tile); x++) {
          const l = luma[y * width + x];
          if (l < lo) lo = l;
          if (l > hi) hi = l;
        }
      }
      tiles++;
      if (hi - lo >= DETAIL_RANGE) detailed++;
    }
  }
  return { colours: seen.size, detailedShare: detailed / tiles };
}

/** Not blank: several colours and detail across a tenth of the frame, so a small drawn patch on a flat fill fails. */
export const notBlank = (detail) => detail.colours > 20 && detail.detailedShare >= 0.1;
