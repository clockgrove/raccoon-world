// The 2D arm's cutter for Stevie's comparison strips (references/stevie/comparison-candidates): the strips are
// RGBA with real alpha, so frames are cut by plain crop. The normal map is derived from a blurred-alpha dome mixed
// lightly with luminance (as in #77); the depth map is the dome itself. Atlas rows are stored top row first.

export const CELL = 192;
export const IDLE_FRAMES = 6;
export const WALK_FRAMES = 8;
export const STRIPS = {
  idle: "/repo/references/stevie/comparison-candidates/idle/strip.png",
  walk: "/repo/references/stevie/comparison-candidates/walk/strip.png",
} as const;

export interface CutSheet {
  readonly width: number;
  readonly height: number;
  /** RGBA8, top row first. Atlas row 0 is the idle strip, row 1 the walk strip. */
  readonly albedo: Uint8ClampedArray;
  readonly normal: Uint8ClampedArray;
  /** The dome as grey RGBA. */
  readonly depth: Uint8ClampedArray;
  readonly columns: number;
  readonly rows: number;
  /** Union of the opaque pixels of all frames, in cell pixels (top row 0); feetRow is the lowest opaque row. */
  readonly bounds: { left: number; right: number; top: number; feetRow: number };
  readonly stepMs: Readonly<Record<string, number>>;
}

async function loadPixels(url: string): Promise<ImageData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no 2D canvas context");
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** Separable box blur of a single-channel float image, `passes` times (about a Gaussian dome on alpha). */
function blur(src: Float32Array, w: number, h: number, radius: number, passes: number): Float32Array {
  let a = src;
  for (let pass = 0; pass < passes; pass++) {
    const tmp = new Float32Array(a.length);
    const out = new Float32Array(a.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += a[y * w + Math.min(w - 1, Math.max(0, x + k))] ?? 0;
        tmp[y * w + x] = sum / (2 * radius + 1);
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x] ?? 0;
        out[y * w + x] = sum / (2 * radius + 1);
      }
    a = out;
  }
  return a;
}

/**
 * Pixels inside the silhouette whose alpha is below the alpha test (eyes, mask) would show the background through
 * the face. Flood-fill the transparent area from the cell border; whatever transparent area it cannot reach is an
 * interior hole and is made opaque, taking the colour of the nearest opaque neighbours when it has none.
 */
function fillHoles(alpha: Float32Array, albedo: Uint8ClampedArray, row: number, column: number, width: number) {
  const outside = new Uint8Array(CELL * CELL);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * CELL + x;
    if (x < 0 || y < 0 || x >= CELL || y >= CELL || outside[i] || (alpha[i] ?? 0) >= 0.5) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let k = 0; k < CELL; k++) {
    push(k, 0);
    push(k, CELL - 1);
    push(0, k);
    push(CELL - 1, k);
  }
  for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
    const x = i % CELL;
    const y = Math.floor(i / CELL);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  const at = (x: number, y: number) => ((row * CELL + y) * width + column * CELL + x) * 4;
  const holes: number[] = [];
  for (let i = 0; i < CELL * CELL; i++) if (!outside[i] && (alpha[i] ?? 0) < 0.5) holes.push(i);
  // Colour from the opaque ring: repeat averaging of neighbours that are already solid.
  const solid = new Uint8Array(CELL * CELL);
  for (let i = 0; i < CELL * CELL; i++) solid[i] = (alpha[i] ?? 0) >= 0.5 ? 1 : 0;
  let pending = holes;
  while (pending.length) {
    const next: number[] = [];
    const done: [number, number[]][] = [];
    for (const i of pending) {
      const x = i % CELL;
      const y = Math.floor(i / CELL);
      let n = 0;
      const sum = [0, 0, 0];
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= CELL || ny >= CELL || !solid[ny * CELL + nx]) continue;
        const p = at(nx, ny);
        for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (albedo[p + c] ?? 0);
        n++;
      }
      if (n) done.push([i, sum.map((v) => v / n)]);
      else next.push(i);
    }
    if (!done.length) break;
    for (const [i, rgb] of done) {
      const p = at(i % CELL, Math.floor(i / CELL));
      for (let c = 0; c < 3; c++) albedo[p + c] = rgb[c] ?? 0;
      albedo[p + 3] = 255;
      alpha[i] = 1;
      solid[i] = 1;
    }
    pending = next;
  }
}

export async function cutStrips(): Promise<CutSheet> {
  const stepMs: Record<string, number> = {};
  let start = performance.now();
  const [idle, walk] = await Promise.all([loadPixels(STRIPS.idle), loadPixels(STRIPS.walk)]);
  stepMs.decode = Math.round(performance.now() - start);
  if (idle.width !== IDLE_FRAMES * CELL || idle.height !== CELL) throw new Error("idle strip is not 6 × 192 px cells");
  if (walk.width !== WALK_FRAMES * CELL || walk.height !== CELL) throw new Error("walk strip is not 8 × 192 px cells");

  const columns = WALK_FRAMES;
  const rows = 2;
  const width = columns * CELL;
  const height = rows * CELL;
  const albedo = new Uint8ClampedArray(width * height * 4);
  const normal = new Uint8ClampedArray(width * height * 4);
  const depth = new Uint8ClampedArray(width * height * 4);
  const bounds = { left: CELL, right: 0, top: CELL, feetRow: 0 };
  const frames: { row: number; column: number; alpha: Float32Array }[] = [];

  start = performance.now();
  [
    { strip: idle, count: IDLE_FRAMES },
    { strip: walk, count: WALK_FRAMES },
  ].forEach(({ strip, count }, row) => {
    for (let column = 0; column < count; column++) {
      const alpha = new Float32Array(CELL * CELL);
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++) {
          const from = (y * strip.width + column * CELL + x) * 4;
          const to = ((row * CELL + y) * width + column * CELL + x) * 4;
          for (let c = 0; c < 4; c++) albedo[to + c] = strip.data[from + c] ?? 0;
          const a = (strip.data[from + 3] ?? 0) / 255;
          alpha[y * CELL + x] = a;
          if (a > 0.5) {
            bounds.left = Math.min(bounds.left, x);
            bounds.right = Math.max(bounds.right, x);
            bounds.top = Math.min(bounds.top, y);
            bounds.feetRow = Math.max(bounds.feetRow, y);
          }
        }
      fillHoles(alpha, albedo, row, column, width);
      frames.push({ row, column, alpha });
    }
  });
  stepMs.cut = Math.round(performance.now() - start);

  start = performance.now();
  for (const { row, column, alpha } of frames) {
    const dome = blur(alpha, CELL, CELL, 6, 3);
    const heightAt = (x: number, y: number) => {
      const cx = Math.min(CELL - 1, Math.max(0, x));
      const cy = Math.min(CELL - 1, Math.max(0, y));
      const at = ((row * CELL + cy) * width + column * CELL + cx) * 4;
      const luma = ((albedo[at] ?? 0) * 0.3 + (albedo[at + 1] ?? 0) * 0.59 + (albedo[at + 2] ?? 0) * 0.11) / 255;
      return 0.75 * (dome[cy * CELL + cx] ?? 0) + 0.25 * luma * (alpha[cy * CELL + cx] ?? 0);
    };
    let peak = 0;
    for (const v of dome) peak = Math.max(peak, v);
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        const to = ((row * CELL + y) * width + column * CELL + x) * 4;
        // Sobel gradient of height; +y of the normal is up the image.
        const dx =
          heightAt(x + 1, y - 1) + 2 * heightAt(x + 1, y) + heightAt(x + 1, y + 1) -
          heightAt(x - 1, y - 1) - 2 * heightAt(x - 1, y) - heightAt(x - 1, y + 1);
        const dy =
          heightAt(x - 1, y - 1) + 2 * heightAt(x, y - 1) + heightAt(x + 1, y - 1) -
          heightAt(x - 1, y + 1) - 2 * heightAt(x, y + 1) - heightAt(x + 1, y + 1);
        const strength = 6;
        const nx = -dx * strength;
        const ny = -dy * strength;
        const length = Math.hypot(nx, ny, 1);
        normal[to] = Math.round((nx / length) * 127.5 + 127.5);
        normal[to + 1] = Math.round((ny / length) * 127.5 + 127.5);
        normal[to + 2] = Math.round((1 / length) * 127.5 + 127.5);
        normal[to + 3] = 255;
        const d = Math.round(((dome[y * CELL + x] ?? 0) / (peak || 1)) * 255);
        depth[to] = depth[to + 1] = depth[to + 2] = d;
        depth[to + 3] = 255;
      }
  }
  stepMs.normals = Math.round(performance.now() - start);
  return { width, height, albedo, normal, depth, columns, rows, bounds, stepMs };
}
