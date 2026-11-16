// The quality lab's configuration model (issue 45): every effect as one knob, the four presets, the sweep and the
// step-down order of the ceiling search, and the page's `globalThis.lab` handle that the runner and the CI journey
// drive. Pure data and types: no three.js here, so the runner and the scripts can share it.

/** Fur shells drawn over Stevie's body (0 = none). */
export type Coat = "summer" | "winter";
export type FurMode = "groomed" | "uniform";
/** Which of Stevie's files is drawn: today's single level 0, or the phone tier's levels chosen by his height on screen. */
export type LevelMode = "single" | "phone";
/** Stevie's motions: the families of his animation clips, each shown by the clip of the same name. */
export const MOTIONS = ["idle", "walk", "sniff", "eat", "play", "shelter"] as const;
export type Motion = (typeof MOTIONS)[number];
export const isMotion = (name: unknown): name is Motion => (MOTIONS as readonly unknown[]).includes(name);
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
  /** Stevie's levels. Left out, the page's default for its platform: the phone levels on a phone, else level 0. */
  levels?: LevelMode;
  /** Stevie's motion, on him and the cast. Left out, the page's own (`?motion=`, else walk). Only walk moves him along the loop. */
  motion?: Motion;
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

export type Knob = Exclude<keyof LabConfig, "coat" | "furMode" | "levels" | "motion">;

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
 * The order the ceiling search drops effects in only where nothing was measured: a software GPU, or a knob its cost
 * probe and the sweep could not measure. An estimate of the most expensive first (resolution, then full-screen
 * passes, then shadows, then per-object costs).
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
/** The frame rate the ceiling search aims for: 60 fps on desktop, 30 fps on phones. */
export const TARGET_FPS: Readonly<Record<Platform, number>> = { desktop: 60, phone: 30 };
/**
 * Only when the display's refresh was not measured: the budget allows this much over the nominal target interval,
 * since a display's frame interval jitters around its refresh period.
 */
export const BUDGET_SLACK = 1.1;

/** A frame budget fitted to the display: how many refreshes a frame may take, and the p95 line that holds it. */
export interface FrameBudget {
  /** The strict target interval: `intervals` display refreshes (or 1000 / fps when the refresh is unknown). */
  targetMs: number;
  /** The p95 the run holds: the target plus half a refresh, the line past which a frame has missed its refresh. */
  budgetMs: number;
  /** Whole refreshes per frame; null when the refresh was not measured (then the budget is the target plus 10%). */
  intervals: number | null;
  /** The measured refresh interval the budget was built from. */
  refreshMs: number | null;
}

/**
 * The frame budget for a target frame rate on a display whose refresh interval was measured. A frame can only be
 * shown on a refresh, so the target is the longest whole number of refreshes that still meets the target frame rate
 * (60 fps: 1 refresh at 60 Hz, 2 at 120 Hz, 2 at 144 Hz), and never less than one: a 48 or 50 Hz panel cannot show
 * 60 fps, so a page that draws on every one of its refreshes holds. The budget adds half a refresh, the same line
 * `missedPct` counts a missed frame by: a p95 under it means at least 95% of frames landed on the cadence.
 * With no refresh measured it falls back to the nominal target plus BUDGET_SLACK.
 */
export function frameBudget(fps: number, refreshMs: number | null | undefined): FrameBudget {
  const nominal = 1000 / fps;
  if (refreshMs == null || !(refreshMs > 0)) return { targetMs: nominal, budgetMs: nominal * BUDGET_SLACK, intervals: null, refreshMs: null };
  // The 0.05 absorbs the measurement's own jitter: a 120 Hz refresh measured at 8.34 ms is still two per 60 fps frame.
  const intervals = Math.max(1, Math.floor(nominal / refreshMs + 0.05));
  return { targetMs: intervals * refreshMs, budgetMs: (intervals + 0.5) * refreshMs, intervals, refreshMs };
}
export const targetMs = (platform: Platform, refreshMs?: number | null) => frameBudget(TARGET_FPS[platform], refreshMs).targetMs;
export const budgetMs = (platform: Platform, refreshMs?: number | null) => frameBudget(TARGET_FPS[platform], refreshMs).budgetMs;

/** What the page can tell about the device, for its tier. */
export interface TierSignals {
  /** `?platform=phone|desktop`, which wins. */
  forced?: string | null;
  /** The primary pointer is coarse (a finger) and cannot hover: `(pointer: coarse) and (hover: none)`. */
  touchFirst: boolean;
  /** The screen's shorter side in CSS pixels. */
  shortSidePx: number;
  /** navigator.hardwareConcurrency and (Chromium only) navigator.deviceMemory; null where not reported. */
  cores: number | null;
  memoryGb: number | null;
}

/** A touch-first screen whose shorter side is at least this many CSS pixels is a tablet, not a phone. */
export const TABLET_MIN_SHORT_SIDE_PX = 600;
/** A tablet that reports at least this many logical cores, and (where reported) this much memory, is desktop class. */
export const DESKTOP_TABLET_MIN_CORES = 8;
export const DESKTOP_TABLET_MIN_MEMORY_GB = 8;

/**
 * The device's tier, by what it is and what it can do; the user agent is not read (an iPad's Safari says it is a
 * Mac, and an Android tablet's says Android like a phone). A device whose primary pointer can hover (a mouse or
 * trackpad: a desktop or laptop, touchscreen or not) is desktop. A touch-first device with a phone-sized screen is a
 * phone. A touch-first tablet is desktop when it reports laptop-class hardware (8 or more cores and, where the
 * browser says, 8 GB or more), else phone. `reason` says which rule placed it.
 */
export function deviceTier(s: TierSignals): { platform: Platform; reason: string } {
  if (s.forced === "phone" || s.forced === "desktop") return { platform: s.forced, reason: "?platform= override" };
  if (!s.touchFirst) return { platform: "desktop", reason: "primary pointer hovers (mouse or trackpad)" };
  if (s.shortSidePx < TABLET_MIN_SHORT_SIDE_PX) return { platform: "phone", reason: `touch-first, screen ${Math.round(s.shortSidePx)} px on its short side (phone)` };
  const cores = s.cores ?? 0;
  const memoryOk = s.memoryGb == null || s.memoryGb >= DESKTOP_TABLET_MIN_MEMORY_GB;
  const what = `${s.cores ?? "?"} cores${s.memoryGb == null ? "" : `, ${s.memoryGb} GB`}`;
  if (cores >= DESKTOP_TABLET_MIN_CORES && memoryOk) return { platform: "desktop", reason: `touch-first tablet with laptop-class hardware (${what})` };
  return { platform: "phone", reason: `touch-first tablet below laptop-class hardware (${what})` };
}

/** The yard as framed, the close-up, and the yard zoomed out to FAR_ZOOM (Stevie below his phone level 1's 5% of the height). */
export type ViewName = "yard" | "close" | "far";
/** The zoomed-out yard's zoom, as a fraction of the yard's: the yard puts Stevie at about 7% of the height, this at about 4%. */
export const FAR_ZOOM = 0.6;
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
  /** Bytes the models downloaded to start the page (compressed web media): the props and the page's own level set. */
  modelMb: number | null;
  /** Bytes each of Stevie's level sets downloaded (its model files and maps); null until the set is loaded. */
  levelsMb: Record<LevelMode, number | null>;
  /** Why the page placed the device in its tier (deviceTier's reason). */
  tier?: string;
}

/** The Stevie file the page draws now, for the report and the journey. */
export interface DrawnLevel {
  mode: LevelMode;
  level: number;
  file: string;
  triangles: number;
  textureMaxPx: number;
  /** The motion asked for, the clip playing it, that clip's length, and where Stevie stands on the ground (x, y in metres). */
  motion: Motion;
  clip: string;
  clipSeconds: number;
  position: [number, number];
  /** His height as a fraction of the viewport height at the last frame (the level switch's input). */
  screenHeight: number | null;
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
  /** The level file Stevie is drawn from, with its triangle count; null before he loads. */
  stevie: DrawnLevel | null;
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
  /** Switches Stevie and the cast to a motion without rebuilding the scene, and draws a frame. */
  setMotion(motion: Motion): Promise<void>;
  setState(state: StateName): Promise<void>;
  /** Lets the animation run for warmupMs, then records frame intervals (and GPU time) for holdMs. */
  measure(options?: { warmupMs?: number; holdMs?: number }): Promise<Measurement>;
  /** The current frame as a JPEG data URL, at most maxWidth pixels wide. */
  screenshot(maxWidth?: number): Promise<string>;
  /** Why the light probes failed to bake, or null; a config with probes on is then not measured. */
  probeError?(): string | null;
}
