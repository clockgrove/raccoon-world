// The quality lab's configuration model (issue 45): every effect as one knob, the four presets, the sweep and the
// step-down order of the ceiling search, and the page's `globalThis.lab` handle that the runner and the CI journey
// drive. Pure data and types: no three.js here, so the runner and the scripts can share it.

/** Fur shells drawn over Stevie's body (0 = none). */
export type Coat = "summer" | "winter";
export type FurMode = "groomed" | "uniform";
export type FurShells = 0 | 4 | 8 | 16;
export type Antialias = "none" | "msaa" | "traa";
/** Upscaling: the scene is drawn at RENDER_SCALE of the canvas and brought back up by TAAU or FSR 1. */
/** Geometry detail: the yard's static meshes at 1, 4, 16 or 64 times their triangles (src/detail.ts). */
export type Detail = 1 | 4 | 16 | 64;
/** The cast: how many raccoons walk the yard (Stevie and clones of his rig, each with his fur), for the per-raccoon cost. */
export type Cast = 1 | 3 | 10 | 20;
export type Upscale = "none" | "taau" | "fsr";

export interface LabConfig {
  coat: Coat;
  furMode: FurMode;
  /** Fur: shell count. */
  furShells: FurShells;
  /** Fur: silhouette fins. */
  furFins: boolean;
  /** Volumetric haze: a ray-marched fog volume lit by the lamps. */
  haze: boolean;
  /** Light shafts (god rays) from the porch lamp. */
  shafts: boolean;
  /** Ambient occlusion (GTAO). */
  ao: boolean;
  /** A baked light probe grid over the yard. */
  probes: boolean;
  /** Key light: cascaded shadow maps (off = one plain shadow map). */
  cascades: boolean;
  /** Shadow maps on the lamp point lights. */
  pointShadows: boolean;
  /** Rain streaks. */
  rainCount: number;
  /** Rain splashes on the ground. */
  splashes: boolean;
  /** Ripples on the puddles. */
  ripples: boolean;
  /** Planar reflections in the puddles. */
  reflections: boolean;
  bloom: boolean;
  /** The colour grade and vignette after tone mapping. */
  grade: boolean;
  antialias: Antialias;
  dpr: 1 | 2;
  upscale: Upscale;
  /** The triangle stress tier: same shapes, more triangles. Every preset draws the art as made (1). */
  detail: Detail;
  /** Raccoons walking the yard. Every preset draws one (Stevie); the cast budget run raises it. */
  cast: Cast;
}

export type Knob = Exclude<keyof LabConfig, "coat" | "furMode">;

/** The scale the scene pass draws at when an upscaler is on. */
export const RENDER_SCALE = 0.67;

/** Each knob's levels, best first, cheapest last. The ceiling search steps one knob one level at a time. */
export const LEVELS: { readonly [K in Knob]: readonly LabConfig[K][] } = {
  furShells: [16, 8, 4, 0],
  furFins: [true, false],
  haze: [true, false],
  shafts: [true, false],
  ao: [true, false],
  probes: [true, false],
  cascades: [true, false],
  pointShadows: [true, false],
  rainCount: [5000, 2600, 1600, 800],
  splashes: [true, false],
  ripples: [true, false],
  reflections: [true, false],
  bloom: [true, false],
  grade: [true, false],
  antialias: ["traa", "msaa", "none"],
  dpr: [2, 1],
  upscale: ["none", "taau", "fsr"],
  detail: [64, 16, 4, 1],
  cast: [20, 10, 3, 1],
};

/** Human labels for the results table and the report. */
export const KNOB_LABELS: { readonly [K in Knob]: string } = {
  furShells: "Fur shells",
  furFins: "Fur fins",
  haze: "Volumetric haze",
  shafts: "Light shafts",
  ao: "Ambient occlusion (GTAO)",
  probes: "Light probes",
  cascades: "Key-light cascades",
  pointShadows: "Point-light shadows",
  rainCount: "Rain particles",
  splashes: "Rain splashes",
  ripples: "Puddle ripples",
  reflections: "Puddle reflections",
  bloom: "Bloom",
  grade: "Grade",
  antialias: "Antialiasing",
  dpr: "Device pixel ratio",
  upscale: "Upscaling",
  detail: "Geometry detail",
  cast: "Raccoons",
};

export const KNOBS = Object.keys(LEVELS) as Knob[];

export type PresetName = "ultra" | "high" | "medium" | "low";

/** Ultra is every effect at its top level. No preset is reserved for phones. */
export const PRESETS: Readonly<Record<PresetName, LabConfig>> = {
  ultra: {
    coat: "summer",
    furMode: "groomed",
    furShells: 16,
    furFins: true,
    haze: true,
    shafts: true,
    ao: true,
    probes: true,
    cascades: true,
    pointShadows: true,
    rainCount: 5000,
    splashes: true,
    ripples: true,
    reflections: true,
    bloom: true,
    grade: true,
    antialias: "traa",
    dpr: 2,
    upscale: "none",
    detail: 1,
    cast: 1,
  },
  high: {
    coat: "summer",
    furMode: "groomed",
    furShells: 8,
    furFins: true,
    haze: false,
    shafts: false,
    ao: true,
    probes: true,
    cascades: true,
    pointShadows: true,
    rainCount: 2600,
    splashes: true,
    ripples: true,
    reflections: true,
    bloom: true,
    grade: true,
    antialias: "msaa",
    // DPR 1: MSAA at DPR 2 measured dearer than Ultra's TRAA at DPR 2 (raccoon-world#89: 53 vs 42 ms GPU on an
    // RTX 2060 SUPER), so High kept its MSAA and drops to full-HD resolution, between Medium and Ultra.
    dpr: 1,
    upscale: "none",
    detail: 1,
    cast: 1,
  },
  medium: {
    coat: "summer",
    furMode: "groomed",
    furShells: 4,
    furFins: false,
    haze: false,
    shafts: false,
    ao: false,
    probes: false,
    cascades: false,
    pointShadows: false,
    rainCount: 1600,
    splashes: false,
    ripples: true,
    reflections: false,
    bloom: true,
    grade: true,
    antialias: "msaa",
    dpr: 1,
    upscale: "none",
    detail: 1,
    cast: 1,
  },
  low: {
    coat: "summer",
    furMode: "groomed",
    furShells: 0,
    furFins: false,
    haze: false,
    shafts: false,
    ao: false,
    probes: false,
    cascades: false,
    pointShadows: false,
    rainCount: 800,
    splashes: false,
    ripples: false,
    reflections: false,
    bloom: false,
    grade: true,
    antialias: "none",
    dpr: 1,
    upscale: "none",
    detail: 1,
    cast: 1,
  },
};

export const PRESET_ORDER: readonly PresetName[] = ["ultra", "high", "medium", "low"];

export interface SweepStep {
  /** Stable id, for example "preset:ultra" or "medium+ao" or "medium-bloom". */
  readonly id: string;
  readonly label: string;
  readonly config: LabConfig;
  /** The knob this step isolates, for the "each effect on top of Medium" part. */
  readonly knob?: Knob;
  /** +1: the knob is raised above Medium (cost = this − Medium); −1: Medium already has it, so it is removed (cost = Medium − this). */
  readonly sign?: 1 | -1;
}

/**
 * The sweep: every preset, then each knob on top of Medium. A knob that Medium holds below its top level is raised
 * to each higher level (fur shells 8 and 16, rain 2600 and 5000, TRAA, DPR 2). Upscalers, which lower cost, are
 * added on top of Medium too. A knob that Medium already holds at its top (bloom, grade, ripples) is measured by
 * removing it from Medium.
 */
/** The highest Geometry detail the sweep measures. */
export const SWEEP_MAX_DETAIL = 16;
/** The largest cast the sweep measures; 20 raccoons is the cast budget run's last step only. */
export const SWEEP_MAX_CAST = 10;

export function sweepSteps(): SweepStep[] {
  const steps: SweepStep[] = PRESET_ORDER.map((name) => ({ id: `preset:${name}`, label: `${name.charAt(0).toUpperCase()}${name.slice(1)}`, config: { ...PRESETS[name] } }));
  const medium = PRESETS.medium;
  for (const knob of KNOBS) {
    const levels = LEVELS[knob] as readonly unknown[];
    const at = levels.indexOf(medium[knob]);
    if (knob === "upscale") {
      for (const level of levels.slice(1)) steps.push({ id: `medium+upscale=${level}`, label: `Medium + ${String(level).toUpperCase()}`, config: { ...medium, upscale: level as Upscale }, knob, sign: 1 });
      continue;
    }
    if (at > 0) {
      // Geometry detail 64× (millions of triangles) is the triangle budget run's last step only, never a sweep step.
      for (const level of levels.slice(0, at).reverse().filter((l) => (knob !== "detail" || (l as number) <= SWEEP_MAX_DETAIL) && (knob !== "cast" || (l as number) <= SWEEP_MAX_CAST))) {
        const id = typeof level === "boolean" ? `medium+${knob}` : `medium+${knob}=${level}`;
        const label = typeof level === "boolean" ? `Medium + ${KNOB_LABELS[knob]}` : `Medium + ${KNOB_LABELS[knob]} ${level}`;
        steps.push({ id, label, config: { ...medium, [knob]: level }, knob, sign: 1 });
      }
    } else {
      const off = levels[levels.length - 1];
      steps.push({ id: `medium-${knob}`, label: `Medium − ${KNOB_LABELS[knob]}`, config: { ...medium, [knob]: off }, knob, sign: -1 });
    }
  }
  return steps;
}

/** One knob stepped one level down, or null when it is already at its cheapest. Upscale steps "down" to taau, then fsr. */
export function stepDown(config: LabConfig, knob: Knob): LabConfig | null {
  const levels = LEVELS[knob] as readonly unknown[];
  const at = levels.indexOf(config[knob]);
  if (at < 0 || at >= levels.length - 1) return null;
  return { ...config, [knob]: levels[at + 1] } as LabConfig;
}

/**
 * The order the ceiling search drops effects in when it has no measured costs from a sweep on this device: an
 * estimate of the most expensive first (resolution, then full-screen passes, then shadows, then per-object costs).
 */
export const DEFAULT_COST_ORDER: readonly Knob[] = [
  "dpr",
  "haze",
  "ao",
  "shafts",
  "reflections",
  "pointShadows",
  "antialias",
  "furShells",
  "cascades",
  "furFins",
  "rainCount",
  "probes",
  "splashes",
  "bloom",
  "ripples",
  "grade",
  "upscale",
  "detail",
  "cast",
];

export type Platform = "desktop" | "phone";
/** The frame budget the ceiling search holds: p95 frame time within 60 fps on desktop, 30 fps on phones. */
export const TARGET_FPS: Readonly<Record<Platform, number>> = { desktop: 60, phone: 30 };
/**
 * A display's frame interval jitters around its refresh period, so a page that holds 60 fps reports a p95 a little
 * above 16.7 ms. The budget allows this much over the target interval.
 */
export const BUDGET_SLACK = 1.1;
export const targetMs = (platform: Platform) => 1000 / TARGET_FPS[platform];
export const budgetMs = (platform: Platform) => targetMs(platform) * BUDGET_SLACK;

export type ViewName = "yard" | "close";
export type StateName = "dusk" | "night";

export interface Measurement {
  frames: number;
  frameMsP50: number | null;
  frameMsP95: number | null;
  /** GPU time per frame from WebGPU timestamp queries; null where the backend has none. */
  gpuMsP50: number | null;
  gpuMsP95: number | null;
  /** Triangles in the visible scene during the hold (Stevie's fur shells and the rain included). */
  triangles?: number;
  /** Triangles the GPU drew per frame across every pass (shadow maps, reflections and post included). */
  drawnTriangles?: number | null;
  drawCalls?: number | null;
  /** Milliseconds from the start of the measurement until frames flowed again (shader and pipeline compile stalls). */
  stallMs?: number | null;
  /** The slowest 1% of frame intervals. */
  frameMsP99?: number | null;
  /** Share of frame intervals longer than 1.5 display refreshes (a dropped frame or worse), in percent. */
  missedPct?: number | null;
  /** Main-thread time per frame spent in the lab's render call (scene update, culling, command encoding and submit). */
  cpuMsP50?: number | null;
  cpuMsP95?: number | null;
  /** JavaScript heap in use at the end of the hold (Chromium only). */
  jsHeapMb?: number | null;
}

/** What the page knows about the device, for comparing runs across devices. */
export interface DeviceInfo {
  /** The display's frame interval, measured with nothing drawn (about 16.7 ms at 60 Hz, 8.3 ms at 120 Hz). */
  refreshMs: number | null;
  /** Logical CPU cores and (Chromium only) device memory in GB, as the browser reports them. */
  cores: number | null;
  memoryGb: number | null;
  /** The canvas in device pixels at DPR 1, and the screen. */
  screen: [number, number];
  /** Seconds each loading step took: the renderer, the models (download and decode), the first shader compile. */
  loadS: { graphics: number | null; models: number | null; shaders: number | null };
  /** Bytes the models downloaded (compressed web media). */
  modelMb: number | null;
}

export interface LabStatus {
  ready: boolean;
  failure: string | null;
  backend: "webgpu" | "webgl2";
  /** Adapter or renderer string (WebGPU adapter info, or WebGL's unmasked renderer). */
  adapter: string;
  /** True for software rasterisers (SwiftShader, llvmpipe and the like): their times are never performance. */
  software: boolean;
  /** Whether GPU timestamps are available on this backend and adapter. */
  timestamps: boolean;
  platform: Platform;
  dpr: number;
  canvas: [number, number];
  /** Triangles in the visible scene now, and drawn by the GPU in the last frame (every pass). */
  triangles: number;
  drawnTriangles: number | null;
  config: LabConfig;
  view: ViewName;
  state: StateName;
  userAgent: string;
  device: DeviceInfo;
}

/** The page's handle, `globalThis.lab`: the runner UI and the CI journey drive the page through it. */
export interface LabHandle {
  status(): LabStatus;
  /** Rebuilds the scene and post for the config, compiles it and draws it; resolves once a frame is on screen. */
  apply(config: LabConfig): Promise<void>;
  setView(view: ViewName): Promise<void>;
  setState(state: StateName): Promise<void>;
  /** Lets the animation run for warmupMs, then records frame intervals (and GPU time) for holdMs. */
  measure(options?: { warmupMs?: number; holdMs?: number }): Promise<Measurement>;
  /** The current frame as a JPEG data URL, at most maxWidth pixels wide. */
  screenshot(maxWidth?: number): Promise<string>;
  /** Why the light probes failed to bake, or null; a config with probes on is then not measured. */
  probeError?(): string | null;
}
