// The quality lab's runner (issue 45): the sweep and the ceiling search, as pure logic over a LabHandle. No DOM and
// no three.js, so the page UI, the CI journey and a node test can all drive it.

import { BUDGET_SLACK, DEFAULT_COST_ORDER, KNOBS, KNOB_LABELS, LEVELS, PRESET_ORDER, PRESETS, budgetMs, stepDown, targetMs, sweepSteps } from "./config.ts";
import type { Cast, DeviceInfo, DrawnLevel, Knob, LabConfig, LabHandle, LabStatus, Measurement, Platform, PresetName, StateName, ViewName } from "./config.ts";

export interface StepResult {
  id: string;
  label: string;
  config: LabConfig;
  knob?: Knob;
  sign?: 1 | -1;
  /** Null on a software GPU: those times are never performance. */
  measurement: Measurement | null;
  backend: LabStatus["backend"];
  adapter: string;
  dpr: number;
  canvas: [number, number];
  /** Triangles in the visible scene during the step, and drawn by the GPU per frame: counts, kept on software GPUs too. */
  triangles?: number;
  drawnTriangles?: number | null;
  /** The Stevie level file drawn at the end of the step, with its triangle count (kept on software GPUs too). */
  stevie?: DrawnLevel | null;
  /** JPEG data URL. */
  screenshot: string;
  error?: string;
}

export interface CostEntry {
  knob: Knob;
  id: string;
  label: string;
  frameMsP95: number | null;
  gpuMsP50: number | null;
}

export interface SweepReport {
  kind: "sweep";
  startedAt: string;
  platform: Platform;
  userAgent: string;
  backend: LabStatus["backend"];
  adapter: string;
  software: boolean;
  timestamps: boolean;
  view: ViewName;
  state: StateName;
  device?: DeviceInfo;
  steps: StepResult[];
  /** Per sweep step with a knob: sign * (step - medium). */
  costs: CostEntry[];
}

export interface Removed {
  knob: Knob;
  from: unknown;
  to: unknown;
  frameMsP95Saved: number | null;
  gpuMsSaved: number | null;
}

export interface CeilingReport {
  kind: "ceiling";
  startedAt: string;
  device?: DeviceInfo;
  platform: Platform;
  /** The p95 the search holds: the strict target interval plus BUDGET_SLACK for display jitter. */
  budgetMs: number;
  /** The strict target interval, 1000 / fps (16.7 ms desktop, 33.3 ms phone). */
  targetMs: number;
  /** The ceiling's measured p95, null when it was not measured. */
  ceilingP95Ms: number | null;
  /** Whether the ceiling's p95 is within the strict target, without the slack. */
  heldStrict: boolean;
  backend: LabStatus["backend"];
  adapter: string;
  software: boolean;
  /** Whether the last configuration held the budget. Always false on a software GPU, where it cannot be judged. */
  held: boolean;
  ceiling: LabConfig;
  /** Set on a software GPU. */
  note?: string;
  steps: (StepResult & { removed?: Removed })[];
}

export interface TriangleReport {
  kind: "triangles";
  startedAt: string;
  device?: DeviceInfo;
  platform: Platform;
  /** The fps this run holds: 60 everywhere (Kirk, 2026-11-12: "how much can we increase the triangle detail and keep 60fps"). */
  targetFps: number;
  budgetMs: number;
  backend: LabStatus["backend"];
  adapter: string;
  software: boolean;
  timestamps: boolean;
  view: ViewName;
  state: StateName;
  /** The effects config every step keeps; only Geometry detail changes. */
  base: LabConfig;
  steps: StepResult[];
  /** The highest detail step that held the budget, with its scene triangles; null when even the art as made missed it. */
  held: { detail: number; triangles: number; frameMsP95: number } | null;
  /** The first step that missed it, if any. */
  missed: { detail: number; triangles: number; frameMsP95: number } | null;
  /**
   * Scene triangles at which GPU time would reach 80% of the frame (leaving room for the CPU and the compositor),
   * from a straight-line fit of GPU p50 against triangles over the measured steps. Null without GPU timestamps or
   * with fewer than two steps.
   */
  estimatedTriangles: number | null;
  /**
   * Set instead of an estimate when the fit lands past MAX_EXTRAPOLATION times the most triangles measured: GPU time
   * barely grew, so no limit was found up to this many triangles.
   */
  noLimitUpTo: number | null;
  note?: string;
}

/** How far past the largest measured count the GPU-time fit may be trusted. */
export const MAX_EXTRAPOLATION = 2;

/** Detail steps for the triangle budget: each four times the last. */
export const TRIANGLE_STEPS = [1, 4, 16, 64] as const;
/** Steps the triangle budget always measures (the GPU-time estimate needs two points). */
export const MIN_TRIANGLE_STEPS = 2;
/** The share of the frame the triangle estimate lets the GPU use. */
export const GPU_SHARE = 0.8;

export interface RunOptions {
  warmupMs?: number;
  holdMs?: number;
  onStep?(r: StepResult, i: number, n: number): void;
  signal?: AbortSignal;
  /** Stops after this many configs (the CI journey's short runs). */
  maxSteps?: number;
}

export interface TriangleOptions extends RunOptions {
  /** Measure every detail step, not just up to the first miss (a maintainer's full curve on a desktop GPU). */
  allSteps?: boolean;
}

export interface CeilingOptions extends RunOptions {
  costs?: SweepReport["costs"];
}

/** Warm-up after frames flow again: late shader variants, shadow maps' first use and GPU clocks settle before the hold. */
const DEFAULT_WARMUP_MS = 3000;
const DEFAULT_HOLD_MS = 4000;

const sub = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : a - b);

const scaled = (sign: number, v: number | null) => (v === null ? null : sign * v);

async function measureStep(
  lab: LabHandle,
  base: { id: string; label: string; config: LabConfig; knob?: Knob; sign?: 1 | -1 },
  opts: RunOptions,
): Promise<StepResult> {
  const result: StepResult = {
    ...base,
    config: { ...base.config },
    measurement: null,
    backend: lab.status().backend,
    adapter: lab.status().adapter,
    dpr: lab.status().dpr,
    canvas: lab.status().canvas,
    screenshot: "",
  };
  try {
    await lab.apply(base.config);
    // A config that asks for light probes but got none would report a cost for an effect that was not applied.
    const probeError = base.config.probes ? lab.probeError?.() : null;
    if (probeError) throw new Error(`light probes did not bake: ${probeError}`);
    const m = await lab.measure({ warmupMs: opts.warmupMs ?? DEFAULT_WARMUP_MS, holdMs: opts.holdMs ?? DEFAULT_HOLD_MS });
    const status = lab.status();
    result.backend = status.backend;
    result.adapter = status.adapter;
    result.dpr = status.dpr;
    result.canvas = status.canvas;
    result.triangles = status.triangles;
    result.drawnTriangles = status.drawnTriangles;
    result.stevie = status.stevie;
    // Software GPUs never count as performance: their frame times are dropped, not kept.
    if (!status.software) result.measurement = m;
    result.screenshot = await lab.screenshot(320);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

export async function runSweep(lab: LabHandle, opts: RunOptions = {}): Promise<SweepReport> {
  const start = lab.status();
  const original = { ...start.config };
  const steps = sweepSteps().slice(0, opts.maxSteps ?? Number.POSITIVE_INFINITY).map((s) => ({ ...s, config: { ...s.config, coat: original.coat, furMode: original.furMode, levels: original.levels } }));
  const report: SweepReport = {
    kind: "sweep",
    startedAt: new Date().toISOString(),
    platform: start.platform,
    userAgent: start.userAgent,
    backend: start.backend,
    adapter: start.adapter,
    software: start.software,
    timestamps: start.timestamps,
    view: start.view,
    state: start.state,
    device: start.device,
    steps: [],
    costs: [],
  };
  // The presets again at the close-up zoom (Stevie at about a third of the frame), the game's other framing. A short
  // run (maxSteps) skips them.
  const close = opts.maxSteps === undefined ? PRESET_ORDER.map((name) => ({ id: `close:preset:${name}`, label: `Close-up ${name}`, config: { ...PRESETS[name], coat: original.coat, furMode: original.furMode, levels: original.levels } })) : [];
  const total = steps.length + close.length;
  try {
    for (let i = 0; i < steps.length; i++) {
      if (opts.signal?.aborted) break;
      const r = await measureStep(lab, steps[i]!, opts);
      report.steps.push(r);
      opts.onStep?.(r, i, total);
    }
    if (close.length && !opts.signal?.aborted) {
      await lab.setView("close");
      try {
        for (let i = 0; i < close.length; i++) {
          if (opts.signal?.aborted) break;
          const r = await measureStep(lab, close[i]!, opts);
          report.steps.push(r);
          opts.onStep?.(r, steps.length + i, total);
        }
      } finally {
        await lab.setView(start.view).catch(() => {});
      }
    }
  } finally {
    await lab.apply(original).catch(() => {});
  }
  const medium = report.steps.find((s) => s.id === "preset:medium");
  for (const s of report.steps) {
    if (!s.knob || !s.sign) continue;
    const a = s.measurement;
    const b = medium?.measurement;
    report.costs.push({
      knob: s.knob,
      id: s.id,
      label: s.label,
      frameMsP95: scaled(s.sign, sub(a?.frameMsP95, b?.frameMsP95)),
      gpuMsP50: scaled(s.sign, sub(a?.gpuMsP50, b?.gpuMsP50)),
    });
  }
  return report;
}

/** Knobs most expensive first: measured costs (GPU p50 when known, else frame p95; the largest per knob), then the default order. */
function rankKnobs(costs: SweepReport["costs"] | undefined): Knob[] {
  const best = new Map<Knob, number>();
  for (const c of costs ?? []) {
    const v = c.gpuMsP50 ?? c.frameMsP95;
    if (v == null) continue;
    const prev = best.get(c.knob);
    if (prev === undefined || v > prev) best.set(c.knob, v);
  }
  const costed = [...best.keys()].sort((a, b) => best.get(b)! - best.get(a)!);
  const rest = [...DEFAULT_COST_ORDER, ...KNOBS].filter((k, i, all) => !best.has(k) && all.indexOf(k) === i);
  return [...costed, ...rest];
}

export async function findCeiling(lab: LabHandle, opts: CeilingOptions = {}): Promise<CeilingReport> {
  const start = lab.status();
  const original = { ...start.config };
  const budget = budgetMs(start.platform);
  const ranking = rankKnobs(opts.costs);
  const maxSteps = opts.maxSteps ?? Infinity;
  const total = Math.min(maxSteps, 1 + KNOBS.reduce((n, k) => n + (LEVELS[k].length - 1), 0));
  const report: CeilingReport = {
    kind: "ceiling",
    startedAt: new Date().toISOString(),
    device: start.device,
    platform: start.platform,
    budgetMs: budget,
    targetMs: targetMs(start.platform),
    ceilingP95Ms: null,
    heldStrict: false,
    backend: start.backend,
    adapter: start.adapter,
    software: start.software,
    held: false,
    ceiling: original,
    steps: [],
  };
  let config = { ...PRESETS.ultra, coat: original.coat, furMode: original.furMode, levels: original.levels };
  let prev: StepResult | null = null;
  let removed: Removed | undefined;
  try {
    for (let i = 0; i < maxSteps; i++) {
      if (opts.signal?.aborted) break;
      const base = removed
        ? { id: `ceiling:${i}`, label: `Ceiling − ${KNOB_LABELS[removed.knob]} (${String(removed.to)})`, config }
        : { id: "ceiling:ultra", label: "Ultra", config };
      const r: StepResult & { removed?: Removed } = await measureStep(lab, base, opts);
      if (removed) {
        const a = prev?.measurement;
        const b = r.measurement;
        r.removed = { ...removed, frameMsP95Saved: sub(a?.frameMsP95, b?.frameMsP95), gpuMsSaved: sub(a?.gpuMsP50, b?.gpuMsP50) };
      }
      report.steps.push(r);
      report.ceiling = { ...config };
      opts.onStep?.(r, i, total);
      if (r.error) {
        // A failed step cannot be judged; keep stepping down so the search still ends.
      } else if (!start.software && r.measurement?.frameMsP95 != null && r.measurement.frameMsP95 <= budget) {
        report.held = true;
        report.ceilingP95Ms = r.measurement.frameMsP95;
        report.heldStrict = r.measurement.frameMsP95 <= report.targetMs;
        break;
      }
      let next: { knob: Knob; config: LabConfig } | null = null;
      for (const knob of ranking) {
        const lowered = stepDown(config, knob);
        if (lowered) {
          next = { knob, config: lowered };
          break;
        }
      }
      if (!next) break;
      removed = { knob: next.knob, from: config[next.knob], to: next.config[next.knob], frameMsP95Saved: null, gpuMsSaved: null };
      config = next.config;
      prev = r;
    }
  } finally {
    await lab.apply(original).catch(() => {});
  }
  if (start.software) report.note = "software, not performance: the budget cannot be judged, so the ceiling is the last configuration run and held is false";
  return report;
}

/**
 * The triangle budget: keeps the current effects and raises Geometry detail (1, 4, 16, 64 times the yard's static
 * triangles) until the p95 frame time misses the 60 fps budget. Frame intervals cannot show headroom past the display's
 * refresh, so where GPU timestamps exist it also fits GPU time against triangles and estimates the count at which the
 * GPU would use 80% of a 60 fps frame.
 */
export async function findTriangleBudget(lab: LabHandle, opts: TriangleOptions = {}): Promise<TriangleReport> {
  const start = lab.status();
  const original = { ...start.config };
  const fps = 60;
  const budget = (1000 / fps) * BUDGET_SLACK;
  const steps = TRIANGLE_STEPS.slice(0, opts.maxSteps ?? TRIANGLE_STEPS.length);
  const report: TriangleReport = {
    kind: "triangles",
    startedAt: new Date().toISOString(),
    device: start.device,
    platform: start.platform,
    targetFps: fps,
    budgetMs: budget,
    backend: start.backend,
    adapter: start.adapter,
    software: start.software,
    timestamps: start.timestamps,
    view: start.view,
    state: start.state,
    base: original,
    steps: [],
    held: null,
    missed: null,
    estimatedTriangles: null,
    noLimitUpTo: null,
  };
  try {
    for (let i = 0; i < steps.length; i++) {
      if (opts.signal?.aborted) break;
      const times = steps[i]!;
      const r = await measureStep(lab, { id: `triangles:${times}`, label: `Detail ${times}×`, config: { ...original, detail: times } }, opts);
      report.steps.push(r);
      opts.onStep?.(r, i, steps.length);
      const m = r.measurement;
      if (r.error || start.software || m?.frameMsP95 == null) continue;
      const point = { detail: times, triangles: m.triangles ?? 0, frameMsP95: m.frameMsP95 };
      if (m.frameMsP95 <= budget) report.held = point;
      else {
        report.missed ??= point;
        // At least two steps always run, so the GPU-time fit has two points even when the art as made misses.
        if (i >= MIN_TRIANGLE_STEPS - 1 && !opts.allSteps) break;
      }
    }
  } finally {
    await lab.apply(original).catch(() => {});
  }
  const points = report.steps
    .map((s) => s.measurement)
    .filter((m): m is Measurement => m?.gpuMsP50 != null && m.triangles != null)
    .map((m) => ({ x: m.triangles as number, y: m.gpuMsP50 as number }));
  if (points.length >= 2) {
    const n = points.length;
    const mx = points.reduce((a, p) => a + p.x, 0) / n;
    const my = points.reduce((a, p) => a + p.y, 0) / n;
    const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    const slope = sxx > 0 ? points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx : 0;
    const intercept = my - slope * mx;
    const room = (1000 / fps) * GPU_SHARE;
    const most = Math.max(...points.map((p) => p.x));
    const estimate = slope > 0 ? Math.max(0, Math.round((room - intercept) / slope)) : Number.POSITIVE_INFINITY;
    if (estimate > most * MAX_EXTRAPOLATION) report.noLimitUpTo = most;
    else report.estimatedTriangles = estimate;
  }
  if (start.software) report.note = "software, not performance: nothing held or missed, and no estimate";
  return report;
}

/** Raccoon counts the cast budget run steps through. */
export const CAST_STEPS: readonly Cast[] = [1, 3, 10, 20];

export interface CastReport {
  kind: "cast";
  startedAt: string;
  device?: DeviceInfo;
  platform: Platform;
  targetFps: number;
  budgetMs: number;
  backend: LabStatus["backend"];
  adapter: string;
  software: boolean;
  timestamps: boolean;
  view: ViewName;
  state: StateName;
  /** The effects every step keeps (the ceiling when one was found, else the page's config); only the cast changes. */
  base: LabConfig;
  steps: StepResult[];
  held: { cast: number; frameMsP95: number } | null;
  missed: { cast: number; frameMsP95: number } | null;
  /** Straight-line fits over the measured steps: GPU and main-thread milliseconds each extra raccoon adds. */
  gpuMsPerRaccoon: number | null;
  cpuMsPerRaccoon: number | null;
  /** Raccoons at which GPU time would reach 80% of the frame, from the GPU fit; null without timestamps. */
  estimatedCast: number | null;
  note?: string;
}

/** A long hold at one config, in windows: does the device slow down as it heats up? */
export interface SoakReport {
  kind: "soak";
  startedAt: string;
  device?: DeviceInfo;
  platform: Platform;
  backend: LabStatus["backend"];
  adapter: string;
  software: boolean;
  timestamps: boolean;
  view: ViewName;
  state: StateName;
  config: LabConfig;
  windowS: number;
  /** One step per window, in order. */
  steps: StepResult[];
  /** Last window over first: frame p95 and GPU p50 (1.0 = no slowdown; 1.3 = 30% slower by the end). */
  frameP95Drift: number | null;
  gpuP50Drift: number | null;
  note?: string;
}

/** Least-squares slope and intercept of y on x; null with fewer than two distinct x. */
function fit(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}

export interface CastOptions extends RunOptions {
  /** The effects to keep (Run everything passes the ceiling it found). Default: the page's current config. */
  base?: LabConfig;
  allSteps?: boolean;
}

/**
 * The cast budget: the same effects with 1, 3, 10 and 20 raccoons walking (each with the config's fur), at 60 fps.
 * Every step after the first that holds runs; it stops after the first miss past the second step.
 */
export async function findCastBudget(lab: LabHandle, opts: CastOptions = {}): Promise<CastReport> {
  const start = lab.status();
  const original = { ...start.config };
  const base = { ...(opts.base ?? original), cast: 1 as Cast };
  const fps = 60;
  const budget = (1000 / fps) * BUDGET_SLACK;
  const steps = CAST_STEPS.slice(0, opts.maxSteps ?? CAST_STEPS.length);
  const report: CastReport = {
    kind: "cast",
    startedAt: new Date().toISOString(),
    device: start.device,
    platform: start.platform,
    targetFps: fps,
    budgetMs: budget,
    backend: start.backend,
    adapter: start.adapter,
    software: start.software,
    timestamps: start.timestamps,
    view: start.view,
    state: start.state,
    base,
    steps: [],
    held: null,
    missed: null,
    gpuMsPerRaccoon: null,
    cpuMsPerRaccoon: null,
    estimatedCast: null,
  };
  try {
    for (let i = 0; i < steps.length; i++) {
      if (opts.signal?.aborted) break;
      const cast = steps[i]!;
      const r = await measureStep(lab, { id: `cast:${cast}`, label: `${cast} raccoon${cast === 1 ? "" : "s"}`, config: { ...base, cast } }, opts);
      report.steps.push(r);
      opts.onStep?.(r, i, steps.length);
      const m = r.measurement;
      if (r.error || start.software || m?.frameMsP95 == null) continue;
      const point = { cast, frameMsP95: m.frameMsP95 };
      if (m.frameMsP95 <= budget) report.held = point;
      else {
        report.missed ??= point;
        if (i >= 1 && !opts.allSteps) break;
      }
    }
  } finally {
    await lab.apply(original).catch(() => {});
  }
  const measured = report.steps.filter((s) => s.measurement && !s.error).map((s) => ({ cast: s.config.cast, m: s.measurement as Measurement }));
  const gpu = fit(measured.filter((p) => p.m.gpuMsP50 != null).map((p) => ({ x: p.cast, y: p.m.gpuMsP50 as number })));
  const cpu = fit(measured.filter((p) => p.m.cpuMsP50 != null).map((p) => ({ x: p.cast, y: p.m.cpuMsP50 as number })));
  const round = (v: number) => Math.round(v * 1000) / 1000;
  if (gpu) {
    report.gpuMsPerRaccoon = round(gpu.slope);
    if (gpu.slope > 0) report.estimatedCast = Math.max(0, Math.floor(((1000 / fps) * GPU_SHARE - gpu.intercept) / gpu.slope));
  }
  if (cpu) report.cpuMsPerRaccoon = round(cpu.slope);
  if (start.software) report.note = "software, not performance: nothing held or missed, and no estimate";
  return report;
}

export interface SoakOptions extends RunOptions {
  /** The config to hold (Run everything passes the ceiling it found). Default: the page's current config. */
  config?: LabConfig;
  /** Total seconds and seconds per window. */
  seconds?: number;
  windowS?: number;
}

/** Holds one config for `seconds` (default 90), measured in `windowS` (default 10) windows back to back. */
export async function runSoak(lab: LabHandle, opts: SoakOptions = {}): Promise<SoakReport> {
  const start = lab.status();
  const original = { ...start.config };
  const config = { ...(opts.config ?? original) };
  const windowS = opts.windowS ?? 10;
  const windows = Math.min(opts.maxSteps ?? Number.POSITIVE_INFINITY, Math.max(1, Math.round((opts.seconds ?? 90) / windowS)));
  const report: SoakReport = {
    kind: "soak",
    startedAt: new Date().toISOString(),
    device: start.device,
    platform: start.platform,
    backend: start.backend,
    adapter: start.adapter,
    software: start.software,
    timestamps: start.timestamps,
    view: start.view,
    state: start.state,
    config,
    windowS,
    steps: [],
    frameP95Drift: null,
    gpuP50Drift: null,
  };
  try {
    await lab.apply(config);
    for (let i = 0; i < windows; i++) {
      if (opts.signal?.aborted) break;
      const result: StepResult = { id: `soak:${(i + 1) * windowS}s`, label: `${i * windowS}–${(i + 1) * windowS} s`, config, measurement: null, backend: start.backend, adapter: start.adapter, dpr: start.dpr, canvas: start.canvas, screenshot: "" };
      try {
        // Back to back: the first window warms up as every step does, the rest only wait for frames.
        const m = await lab.measure({ warmupMs: i === 0 ? (opts.warmupMs ?? DEFAULT_WARMUP_MS) : 0, holdMs: opts.holdMs ?? windowS * 1000 });
        const status = lab.status();
        result.triangles = status.triangles;
        result.drawnTriangles = status.drawnTriangles;
        if (!status.software) result.measurement = m;
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
      }
      report.steps.push(result);
      opts.onStep?.(result, i, windows);
    }
  } finally {
    await lab.apply(original).catch(() => {});
  }
  const ok = report.steps.map((s) => s.measurement).filter((m): m is Measurement => Boolean(m));
  const first = ok[0];
  const last = ok[ok.length - 1];
  const ratio = (a?: number | null, b?: number | null) => (a && b ? Math.round((b / a) * 100) / 100 : null);
  if (first && last && ok.length > 1) {
    report.frameP95Drift = ratio(first.frameMsP95, last.frameMsP95);
    report.gpuP50Drift = ratio(first.gpuMsP50, last.gpuMsP50);
  }
  if (start.software) report.note = "software, not performance";
  return report;
}

export interface FurComparisonReport {
  kind: "fur";
  startedAt: string;
  device?: DeviceInfo;
  platform: Platform;
  backend: LabStatus["backend"];
  adapter: string;
  software: boolean;
  timestamps: boolean;
  view: ViewName;
  state: StateName;
  coat: LabConfig["coat"];
  steps: StepResult[];
  /** Groomed minus uniform, with every other setting held fixed. */
  costs: { preset: PresetName; gpuMsP50: number | null; cpuMsP50: number | null }[];
  castBudgets: Omit<CastReport, "steps">[];
}

export interface FurComparisonOptions extends RunOptions {
  /** Defaults to every preset; a short focused browser proof can select just Medium. */
  presets?: readonly PresetName[];
  /** Effects held by both cast runs; defaults to the page's current config. */
  base?: LabConfig;
}

export async function compareFur(lab: LabHandle, opts: FurComparisonOptions = {}): Promise<FurComparisonReport> {
  const start = lab.status();
  const original = { ...start.config };
  const presets = opts.presets ?? PRESET_ORDER;
  const report: FurComparisonReport = {
    kind: "fur", startedAt: new Date().toISOString(), device: start.device,
    platform: start.platform, backend: start.backend, adapter: start.adapter,
    software: start.software, timestamps: start.timestamps, view: start.view,
    state: start.state, coat: original.coat ?? "summer", steps: [], costs: [], castBudgets: [],
  };
  const total = presets.length * 2 + Math.min(opts.maxSteps ?? CAST_STEPS.length, CAST_STEPS.length) * 2;
  const append = (r: StepResult) => {
    report.steps.push(r);
    opts.onStep?.(r, report.steps.length - 1, total);
  };
  try {
    for (const preset of presets) {
      if (opts.signal?.aborted) break;
      const pair: StepResult[] = [];
      for (const furMode of ["uniform", "groomed"] as const) {
        if (opts.signal?.aborted) break;
        const config = { ...PRESETS[preset], coat: report.coat, furMode };
        const r = await measureStep(lab, { id: `fur:${preset}:${furMode}`, label: `${preset} · ${furMode} · ${report.coat}`, config }, opts);
        pair.push(r);
        append(r);
      }
      const [uniform, groomed] = pair;
      if (uniform && groomed) report.costs.push({ preset,
        gpuMsP50: sub(groomed.measurement?.gpuMsP50, uniform.measurement?.gpuMsP50),
        cpuMsP50: sub(groomed.measurement?.cpuMsP50, uniform.measurement?.cpuMsP50),
      });
    }
    for (const furMode of ["uniform", "groomed"] as const) {
      if (opts.signal?.aborted) break;
      const base = { ...(opts.base ?? original), coat: report.coat, furMode };
      // Both curves measure the same counts, including counts beyond a budget miss.
      const { steps, ...summary } = await findCastBudget(lab, { ...opts, base, allSteps: true,
        onStep: (r) => append({ ...r, id: `fur:${furMode}:${r.id}`, label: `${furMode} · ${r.label}` }),
      });
      report.castBudgets.push(summary);
    }
  } finally {
    await lab.apply(original).catch(() => {});
  }
  return report;
}

export interface LevelsComparisonReport {
  kind: "levels";
  startedAt: string;
  device?: DeviceInfo;
  platform: Platform;
  backend: LabStatus["backend"];
  adapter: string;
  software: boolean;
  timestamps: boolean;
  view: ViewName;
  state: StateName;
  coat: LabConfig["coat"];
  /** Each preset twice, single level 0 then the phone levels, on the same camera, coat and effects. */
  steps: StepResult[];
  /** Phone levels minus single level 0, per preset. Null where a time is missing (software GPUs report none). */
  costs: { preset: PresetName; frameMsP50: number | null; frameMsP95: number | null; gpuMsP50: number | null; gpuMsP95: number | null; cpuMsP50: number | null }[];
}

export interface LevelsComparisonOptions extends RunOptions {
  /** Defaults to every preset; a short focused browser proof can select just Medium. */
  presets?: readonly PresetName[];
}

/**
 * Each preset once with today's single level 0 and once with the phone levels, from the current view (the close-up
 * draws the phone's first level, the yard its last), so the report names what each step drew.
 */
export async function compareLevels(lab: LabHandle, opts: LevelsComparisonOptions = {}): Promise<LevelsComparisonReport> {
  const start = lab.status();
  const original = { ...start.config };
  const presets = opts.presets ?? PRESET_ORDER;
  const report: LevelsComparisonReport = {
    kind: "levels", startedAt: new Date().toISOString(), device: start.device,
    platform: start.platform, backend: start.backend, adapter: start.adapter,
    software: start.software, timestamps: start.timestamps, view: start.view,
    state: start.state, coat: original.coat ?? "summer", steps: [], costs: [],
  };
  const total = presets.length * 2;
  try {
    for (const preset of presets) {
      if (opts.signal?.aborted) break;
      const pair: StepResult[] = [];
      for (const levels of ["single", "phone"] as const) {
        if (opts.signal?.aborted) break;
        const config = { ...PRESETS[preset], coat: report.coat, furMode: original.furMode, levels };
        const r = await measureStep(lab, { id: `levels:${preset}:${levels}`, label: `${preset} · ${levels === "single" ? "level 0" : "phone levels"}`, config }, opts);
        pair.push(r);
        report.steps.push(r);
        opts.onStep?.(r, report.steps.length - 1, total);
      }
      const [single, phone] = pair;
      if (single && phone) report.costs.push({ preset,
        frameMsP50: sub(phone.measurement?.frameMsP50, single.measurement?.frameMsP50),
        frameMsP95: sub(phone.measurement?.frameMsP95, single.measurement?.frameMsP95),
        gpuMsP50: sub(phone.measurement?.gpuMsP50, single.measurement?.gpuMsP50),
        gpuMsP95: sub(phone.measurement?.gpuMsP95, single.measurement?.gpuMsP95),
        cpuMsP50: sub(phone.measurement?.cpuMsP50, single.measurement?.cpuMsP50),
      });
    }
  } finally {
    await lab.apply(original).catch(() => {});
  }
  return report;
}

export type AnyReport = SweepReport | CeilingReport | TriangleReport | CastReport | SoakReport | FurComparisonReport | LevelsComparisonReport;

const stripShots = <T extends { steps: { screenshot: string }[] }>(r: T): unknown => ({
  ...r,
  steps: r.steps.map(({ screenshot: _s, ...rest }) => rest),
});

export function compactJson(report: AnyReport | AnyReport[]): string {
  return JSON.stringify(Array.isArray(report) ? report.map(stripShots) : stripShots(report));
}

/** The columns of a slim step row. */
export const SLIM_COLUMNS = [
  "step",
  "frameMsP50",
  "frameMsP95",
  "frameMsP99",
  "missedPct",
  "gpuMsP50",
  "gpuMsP95",
  "cpuMsP50",
  "cpuMsP95",
  "triangles",
  "drawnTriangles",
  "drawCalls",
  "stallMs",
  "jsHeapMb",
  "error",
] as const;

/**
 * The reports as compact JSON for a link: one array row per step (SLIM_COLUMNS) and no per-step configs. A sweep
 * step's id names its config; a ceiling step names what it removed. The full reports stay in Copy and
 * Download.
 */
export function slimJson(reports: AnyReport[]): string {
  // A ceiling step reads "-knob=level": what it removed from the step before.
  const name = (s: StepResult & { removed?: Removed }) => (s.removed ? `-${s.removed.knob}=${String(s.removed.to)}` : s.id);
  const row = (s: StepResult & { removed?: Removed }) => [
    name(s),
    s.measurement?.frameMsP50 ?? null,
    s.measurement?.frameMsP95 ?? null,
    s.measurement?.frameMsP99 ?? null,
    s.measurement?.missedPct ?? null,
    s.measurement?.gpuMsP50 ?? null,
    s.measurement?.gpuMsP95 ?? null,
    s.measurement?.cpuMsP50 != null ? Math.round(s.measurement.cpuMsP50 * 100) / 100 : null,
    s.measurement?.cpuMsP95 != null ? Math.round(s.measurement.cpuMsP95 * 100) / 100 : null,
    s.triangles ?? s.measurement?.triangles ?? null,
    s.drawnTriangles ?? s.measurement?.drawnTriangles ?? null,
    s.measurement?.drawCalls ?? null,
    s.measurement?.stallMs ?? null,
    s.measurement?.jsHeapMb ?? null,
    s.error ?? null,
  ];
  // The device fields are the same in every report from one page: state them once.
  const device = ["platform", "userAgent", "backend", "adapter", "software", "timestamps"] as const;
  const first = reports[0] as unknown as Record<string, unknown> | undefined;
  const common: Record<string, unknown> = Object.fromEntries(device.map((k) => [k, k === "userAgent" ? String(first?.[k] ?? "").slice(0, 160) : first?.[k]]));
  // Refresh, cores, memory, screen and load times: once, from the first report that has them.
  const hardware = reports.map((r) => (r as { device?: DeviceInfo }).device).find(Boolean);
  if (hardware) common.hardware = hardware;
  const slim = reports.map((r) => {
    const { steps, ...head } = r as AnyReport & { costs?: unknown };
    const rest: Record<string, unknown> = { ...head };
    if (r.kind === "sweep") delete rest.costs; // derivable from the sweep rows
    delete rest.device; // stated once, as device.hardware
    for (const k of device) if (rest[k] === common[k] || k === "userAgent") delete rest[k];
    // Trailing nulls dropped from each row (no error, no GPU time...).
    const rows = steps.map((s) => {
      const cells = row(s);
      while (cells.length && cells[cells.length - 1] === null) cells.pop();
      return cells;
    });
    return { ...rest, steps: rows };
  });
  return JSON.stringify({ slim: 1, device: common, columns: SLIM_COLUMNS, reports: slim });
}

