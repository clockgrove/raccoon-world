// The comparison page: one product renderer (ThreeWorldSceneAdapter) holding every arm as world content, shown
// one at a time, photographed through the renderer's own composer and streamed to scripts/stevie.mjs shot by shot
// (the #77 page posted one huge record at the end and hung Edge).
import { decodeSceneProjection } from "clockgrove-pin/packages/contracts/src/index.js";
import { ThreeWorldSceneAdapter } from "clockgrove-pin/apps/web/src/renderer.js";
import type { RendererContent } from "clockgrove-pin/apps/web/src/renderer-content.js";
import yard from "../yard.json";
import type { Arm, ArmInstance, Figure, Heading } from "./arm.js";
import { HEADINGS, STEVIE_HEIGHT } from "./arm.js";
import { ARMS } from "./arms.js";

type State = "dusk-rain" | "night";
const STATES: Record<State, { ms: number; rain: number }> = {
  "dusk-rain": { ms: 64_800_000, rain: 9000 },
  night: { ms: 79_200_000, rain: 0 },
};
const params = new URLSearchParams(location.search);
const backendWanted = params.get("backend") === "webgl2" ? "webgl2" : "webgpu";
const mode = params.get("mode") === "smoke" ? "smoke" : "full";
const post = params.get("post") ?? "/run";
const armNames = params.get("arms")?.split(",").filter(Boolean);
const arms: Arm[] = armNames
  ? armNames.map((name) => {
      const arm = ARMS.find((candidate) => candidate.name === name);
      if (!arm) throw new Error(`no arm "${name}"; known: ${ARMS.map((a) => a.name).join(", ")}`);
      return arm;
    })
  : // By default: the three arms in smoke mode (CI's check), every arm but the control in full mode.
    ARMS.filter((arm) => arm.name !== "stub" && (mode === "full" || !arm.name.startsWith("route:")));
if (backendWanted === "webgl2") Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });

async function send(kind: string, body: unknown): Promise<void> {
  const response = await fetch(`${post}/${kind}`, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`runner refused ${kind}: ${response.status}`);
}
const log = (line: string) => send("log", { line });
const fatal = (error: unknown) => {
  const e = error as { message?: string; stack?: string } | undefined;
  document.body.dataset.state = "failed";
  return send("fatal", { message: String(e?.message ?? error), stack: e?.stack ?? "" }).catch(() => {});
};
addEventListener("error", (event) => void fatal(event.error ?? event.message));
addEventListener("unhandledrejection", (event) => void fatal(event.reason));

const status = document.getElementById("status")!;
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

// ---- the renderer, with every requested arm as one content
const instances = new Map<string, ArmInstance>();
let creationError = "";
const content: RendererContent = {
  version: 1,
  async create(context) {
    try {
      const root = new context.THREE.Group();
      const textures: unknown[] = [];
      for (const arm of arms) {
        const started = performance.now();
        const instance = await arm.create(context);
        instance.root.visible = false;
        root.add(instance.root);
        instances.set(arm.name, instance);
        textures.push(...(instance.textures ?? []));
        await log(`created arm ${arm.name} in ${Math.round(performance.now() - started)} ms`);
      }
      return {
        root,
        textures: textures as never,
        update() {},
        dispose() {
          for (const instance of instances.values()) instance.dispose?.();
        },
      };
    } catch (error) {
      creationError = String((error as Error)?.stack ?? error);
      throw error;
    }
  },
};
let snapshot = decodeSceneProjection(yard);
let handles!: { resolve(): void; reject(e: Error): void };
const ready = new Promise<void>((resolve, reject) => {
  handles = { resolve, reject };
});
const adapter = new ThreeWorldSceneAdapter(
  document.getElementById("scene")!,
  () => handles.resolve(),
  (reason) => handles.reject(new Error(`renderer unavailable: ${reason}`)),
  () => {},
  content,
);
const internal = adapter as unknown as {
  composer: { render(): void };
  renderer: { domElement: HTMLCanvasElement; setPixelRatio(r: number): void; backend: any };
  camera: { position: { set(x: number, y: number, z: number): void }; zoom: number; updateProjectionMatrix(): void; updateMatrixWorld(): void };
  tier: string;
  dirty: boolean;
};

function setState(state: State) {
  const { ms, rain } = STATES[state];
  snapshot = { ...snapshot, simulationTime: BigInt(ms), weather: { rainIntensity: rain } };
  adapter.loadSnapshot(snapshot);
}

// ---- yard positions (metres): lantern-lit ground 32 px below the porch lantern at (8, 8), in a row across the screen
const AT = {
  stevie: { x: 10.9, y: 5.7 },
  juniper: { x: 12.0, y: 6.8 },
  kit: { x: 9.8, y: 4.6 },
};
const iso = (x: number, y: number) => ({ px: (x + y) * 12.5, py: (x - y) * 6.25 });
const BODY_LIFT_PX = (STEVIE_HEIGHT * 12.5) / 2;
const ZOOM_FAR = 0.75;
const ZOOM_DEFAULT = 1;
const ZOOM_CLOSE = 400 / 3 / 22;
const stevieFigure = (heading: Heading, clip: "idle" | "walk", phase: number): Figure[] => [
  { role: "stevie", heading, clip, phase, at: AT.stevie },
];
const group = (): Figure[] => [
  { role: "stevie", heading: "three-quarter", clip: "idle", phase: 0.25, at: AT.stevie },
  { role: "juniper", heading: "front", clip: "idle", phase: 0.25, at: AT.juniper },
  { role: "kit", heading: "right", clip: "walk", phase: 0.25, at: AT.kit },
];

// ---- identification of the renderer
function rendererString(): string {
  const backend = internal.renderer.backend;
  if (adapter.backend === "webgl2") {
    const gl = backend.gl as WebGL2RenderingContext;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  }
  const info = backend.device?.adapterInfo ?? {};
  return [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") || "unknown WebGPU adapter";
}

// ---- photography
interface Spec {
  name: string;
  figures: Figure[];
  zoom: number;
  ratio: number;
  /** Centre of the frame (metres) and a square crop (px at the shot's ratio) or the whole canvas. */
  centre: { x: number; y: number };
  crop?: number;
}
const copy = (source: HTMLCanvasElement): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = source.width;
  c.height = source.height;
  c.getContext("2d", { willReadFrequently: true })!.drawImage(source, 0, 0);
  return c;
};
const cropOf = (c: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement => {
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d", { willReadFrequently: true })!.drawImage(c, Math.round((c.width - w) / 2), Math.round((c.height - h) / 2), w, h, 0, 0, w, h);
  return out;
};
const pixels = (c: HTMLCanvasElement) => c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;

let currentRatio = 1;
function frameFor(spec: Spec) {
  if (currentRatio !== spec.ratio) {
    internal.renderer.setPixelRatio(spec.ratio);
    currentRatio = spec.ratio;
    adapter.setQuality("high");
  }
  if (internal.tier !== "high") adapter.setQuality("high");
  const { px, py } = iso(spec.centre.x, spec.centre.y);
  internal.camera.position.set(px, -(py - BODY_LIFT_PX), 1000);
  internal.camera.zoom = spec.zoom;
  internal.camera.updateProjectionMatrix();
  internal.camera.updateMatrixWorld();
}

interface ShotRecord {
  arm: string;
  state: State;
  shot: string;
  backend: string;
  renderer: string;
  software: boolean;
  zoom: number;
  pixelRatio: number;
  quality: string;
  width: number;
  height: number;
  visiblePixels: number;
  visible: boolean;
  zoomBeyondClamp: boolean;
  pixelRatioBeyondProduct: boolean;
  /** The product's reduced-motion mode, used so that frames are repeatable (rain and flicker frozen). */
  reducedMotion: boolean;
}
const SOFTWARE = /swiftshader|llvmpipe|lavapipe|software|basic render/i;

async function shoot(arm: Arm, state: State, spec: Spec): Promise<{ canvas: HTMLCanvasElement; record: ShotRecord }> {
  const instance = instances.get(arm.name)!;
  frameFor(spec);
  instance.show(spec.figures);
  instance.root.visible = true;
  const render = () => {
    internal.composer.render();
    return copy(internal.renderer.domElement);
  };
  // One scene pass runs per animation frame, so each state waits for the adapter's own frame; reduced motion
  // (set once in main) freezes rain and flicker, so the shown and hidden frames differ only by the arm.
  await nextFrame();
  await nextFrame();
  const shown = render();
  instance.root.visible = false;
  await nextFrame();
  await nextFrame();
  const hidden = render();
  const quality = internal.tier;
  const size = spec.crop ?? 0;
  const [a, b] = size ? [cropOf(shown, size, size), cropOf(hidden, size, size)] : [shown, hidden];
  const pa = pixels(a);
  const pb = pixels(b);
  let visiblePixels = 0;
  for (let i = 0; i < pa.length; i += 4)
    if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 24) visiblePixels++;
  const renderer = rendererString();
  const record: ShotRecord = {
    arm: arm.name,
    state,
    shot: spec.name,
    backend: adapter.backend,
    renderer,
    software: SOFTWARE.test(renderer),
    zoom: spec.zoom,
    pixelRatio: spec.ratio,
    quality,
    width: a.width,
    height: a.height,
    visiblePixels,
    visible: visiblePixels >= 40 * spec.ratio * spec.ratio,
    zoomBeyondClamp: spec.zoom < 0.75 || spec.zoom > 2,
    pixelRatioBeyondProduct: spec.ratio !== 1,
    reducedMotion: true,
  };
  return { canvas: a, record };
}

const isRoute = (arm: Arm) => arm.name.startsWith("route:");
const CLOSE_CROP = 200;
function specsFor(arm: Arm): Spec[] {
  const centre = AT.stevie;
  const close = (name: string, figures: Figure[]): Spec => ({ name, figures, zoom: ZOOM_CLOSE, ratio: 1, centre, crop: CLOSE_CROP });
  const stills = HEADINGS.map((h) => close(`still-${h}`, stevieFigure(h, "idle", 0.25)));
  if (mode === "smoke") return [{ name: "zoom-default-1x", figures: group(), zoom: ZOOM_DEFAULT, ratio: 1, centre }];
  if (isRoute(arm)) return stills;
  const zooms: Spec[] = [];
  for (const [label, zoom] of [["far", ZOOM_FAR], ["default", ZOOM_DEFAULT], ["close", ZOOM_CLOSE]] as const)
    for (const ratio of [1, 2]) zooms.push({ name: `zoom-${label}-${ratio}x`, figures: group(), zoom, ratio, centre });
  return [
    { name: "cohesion", figures: group(), zoom: 2, ratio: 1, centre },
    ...stills,
    ...Array.from({ length: 8 }, (_, i) => close(`walk-${i}`, stevieFigure("three-quarter", "walk", i / 8))),
    ...Array.from({ length: 4 }, (_, i) => close(`idle-${i}`, stevieFigure("three-quarter", "idle", i / 4))),
    ...zooms,
  ];
}

// ---- contact sheets
const LABEL_H = 28;
function sheetCanvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#12140e";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "top";
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}
function tile(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, x: number, y: number, lines: string[], w = image.width, h = image.height) {
  ctx.fillStyle = "#ece9d8";
  lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, x, y + i * 13, w));
  ctx.drawImage(image, x, y + LABEL_H, w, h);
}
async function sendSheet(name: string, canvas: HTMLCanvasElement) {
  await send("sheet", { name, width: canvas.width, height: canvas.height, png: canvas.toDataURL("image/png") });
}

// ---- the run
async function waitForContent() {
  for (;;) {
    const status = adapter.metrics.contentStatus;
    if (status === "ready") return;
    if (status === "failed") throw new Error(`content failed: ${adapter.metrics.contentFailure}\n${creationError}`);
    await nextFrame();
  }
}

async function frameTiming(arm: Arm, state: State) {
  const instance = instances.get(arm.name)!;
  adapter.setReducedMotion(false);
  instance.root.visible = true;
  frameFor({ name: "timing", figures: [], zoom: ZOOM_DEFAULT, ratio: 1, centre: AT.stevie });
  adapter.setQuality("high");
  const intervals: number[] = [];
  const start = await nextFrame();
  let last = start;
  for (let now = start; now - start < 2000; ) {
    now = await nextFrame();
    intervals.push(now - last);
    last = now;
    instance.show(stevieFigure("right", "walk", ((now - start) / 1000) % 1));
    internal.dirty = true;
  }
  instance.root.visible = false;
  adapter.setReducedMotion(true);
  const samples = adapter.metrics.frameMs.slice(-Math.min(intervals.length, adapter.metrics.frameMs.length));
  const sorted = [...samples].sort((p, q) => p - q);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
  const m = adapter.metrics;
  return {
    arm: arm.name,
    state,
    performance: !SOFTWARE.test(rendererString()),
    qualityAfter: internal.tier,
    rafIntervalsMs: { count: intervals.length, mean: mean(intervals), max: Math.max(0, ...intervals) },
    adapterFrameMs: { count: samples.length, mean: mean(samples), p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0 },
    contentUpdateMs: m.contentUpdateMs,
    firstRenderMs: m.firstRenderMs,
    textureBytes: m.textureBytes,
    contentObjects: m.contentObjects,
    entityCount: m.entityCount,
  };
}

async function main() {
  await ready;
  setState("dusk-rain");
  await waitForContent();
  const backend = adapter.backend;
  if (backend === "initializing") throw new Error("renderer never initialised");
  await log(`renderer ready: backend ${backend}, ${rendererString()}`);
  adapter.setReducedMotion(true);
  const states: State[] = mode === "smoke" ? ["dusk-rain"] : ["dusk-rain", "night"];
  const timings: unknown[] = [];
  let shots = 0;
  for (const state of states) {
    setState(state);
    for (let i = 0; i < 3; i++) await nextFrame();
    const routeRows: { arm: Arm; tiles: Map<string, HTMLCanvasElement> }[] = [];
    for (const arm of arms) {
      const tiles = new Map<string, HTMLCanvasElement>();
      const regions = new Map<string, HTMLCanvasElement>();
      for (const spec of specsFor(arm)) {
        status.textContent = `${arm.name} ${state} ${spec.name}`;
        const { canvas, record } = await shoot(arm, state, spec);
        const full = spec.name.startsWith("zoom-") || spec.name === "cohesion";
        if (spec.name.startsWith("zoom-")) {
          const w = spec.ratio === 2 ? 320 : 160;
          const h = spec.ratio === 2 ? 200 : 100;
          regions.set(spec.name, cropOf(canvas, w, h));
        } else if (full || spec.crop) tiles.set(spec.name, canvas);
        await send("shot", { ...record, png: canvas.toDataURL("image/png") });
        await log(`${arm.name} ${state} ${spec.name}: ${record.visiblePixels} visible px`);
        shots++;
      }
      if (mode === "smoke") continue;
      if (isRoute(arm)) {
        routeRows.push({ arm, tiles });
        timings.push(await frameTiming(arm, state));
        continue;
      }
      const instance = instances.get(arm.name)!;
      const renderer = rendererString();
      const title = `${arm.label} | ${state} | ${backend} | ${renderer}`;
      const WALK = 8;
      const cell = CLOSE_CROP + 4;
      const width = Math.max(WALK * cell, 644);
      const { c, ctx } = sheetCanvas(width, 16 + LABEL_H + 400 + 3 * (LABEL_H + cell));
      ctx.fillStyle = "#ece9d8";
      ctx.fillText(title, 2, 2);
      let y = 18;
      tile(ctx, tiles.get("cohesion")!, 0, y, ["cohesion: Stevie (3/4), Juniper (front), kit (right, walk); zoom 2"]);
      y += LABEL_H + 400;
      HEADINGS.forEach((h, i) => {
        const source = instance.headingSource(h);
        tile(ctx, tiles.get(`still-${h}`)!, i * cell, y, [`still-${h}`, source.drawn ? "drawn" : `not drawn: ${source.shown}`]);
      });
      y += LABEL_H + cell;
      for (let i = 0; i < 8; i++) tile(ctx, tiles.get(`walk-${i}`)!, i * cell, y, [`walk-${i} (3/4)`]);
      y += LABEL_H + cell;
      for (let i = 0; i < 4; i++) tile(ctx, tiles.get(`idle-${i}`)!, i * cell, y, [`idle-${i} (3/4)`]);
      await sendSheet(`sheet-${arm.name}-${state}-${backend}`, c);

      const zw = 324;
      const zh = LABEL_H + 200 + 4;
      const z = sheetCanvas(3 * zw, 18 + 2 * zh);
      z.ctx.fillStyle = "#ece9d8";
      z.ctx.fillText(`${title} | centre region, 1x upscaled x2 (nearest) above, native 2x below`, 2, 2);
      [["far", ZOOM_FAR], ["default", ZOOM_DEFAULT], ["close", ZOOM_CLOSE]].forEach(([label, zoom], col) => {
        [1, 2].forEach((ratio, row) => {
          const image = regions.get(`zoom-${label}-${ratio}x`)!;
          tile(z.ctx, image, col * zw, 18 + row * zh, [`${label} zoom ${(zoom as number).toFixed(2)}, ratio ${ratio}`, ratio === 1 ? "1x region, nearest x2" : "2x native pixels"], 320, 200);
        });
      });
      await sendSheet(`zoom-${arm.name}-${state}-${backend}`, z.c);
      timings.push(await frameTiming(arm, state));
    }
    if (mode === "full" && routeRows.length) {
      const cell = CLOSE_CROP + 4;
      const { c, ctx } = sheetCanvas(HEADINGS.length * cell, 18 + routeRows.length * (LABEL_H + cell));
      ctx.fillStyle = "#ece9d8";
      ctx.fillText(`Routes | ${state} | ${backend} | ${rendererString()}`, 2, 2);
      routeRows.forEach(({ arm, tiles }, row) =>
        HEADINGS.forEach((h, i) => tile(ctx, tiles.get(`still-${h}`)!, i * cell, 18 + row * (LABEL_H + cell), [`${arm.name}: ${h}`, instances.get(arm.name)!.headingSource(h).shown])),
      );
      await sendSheet(`routes-${state}-${backend}`, c);
    }
  }
  await send("done", {
    mode,
    backend,
    renderer: rendererString(),
    software: SOFTWARE.test(rendererString()),
    shots,
    arms: arms.map((arm) => {
      const instance = instances.get(arm.name)!;
      return {
        name: arm.name,
        label: arm.label,
        licence: arm.licence,
        credit: arm.credit ?? null,
        inputs: arm.inputs,
        notes: instance.notes,
        stepMs: instance.stepMs,
        budget: instance.budget,
        headingSource: Object.fromEntries(HEADINGS.map((h) => [h, instance.headingSource(h)])),
      };
    }),
    metrics: { ...adapter.metrics, frameMs: undefined },
    frameTimes: timings,
  });
  document.body.dataset.state = "done";
  status.textContent = "done";
}

main().catch(fatal);
