// The quality lab's runner (issue 45): the sweep and the ceiling search, as pure logic over a LabHandle. No DOM and
// no three.js, so the page UI, the CI journey and a node test can all drive it.

import { BUDGET_SLACK, DEFAULT_COST_ORDER, KNOBS, KNOB_LABELS, LEVELS, PRESETS, budgetMs, stepDown, targetMs, sweepSteps } from "./config.ts";
import type { Knob, LabConfig, LabHandle, LabStatus, Measurement, Platform, StateName, ViewName } from "./config.ts";

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

const DEFAULT_WARMUP_MS = 1500;
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
  const steps = sweepSteps().slice(0, opts.maxSteps ?? Number.POSITIVE_INFINITY);
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
    steps: [],
    costs: [],
  };
  try {
    for (let i = 0; i < steps.length; i++) {
      if (opts.signal?.aborted) break;
      const r = await measureStep(lab, steps[i]!, opts);
      report.steps.push(r);
      opts.onStep?.(r, i, steps.length);
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
  let config = { ...PRESETS.ultra };
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

export type AnyReport = SweepReport | CeilingReport | TriangleReport;

const stripShots = <T extends { steps: { screenshot: string }[] }>(r: T): unknown => ({
  ...r,
  steps: r.steps.map(({ screenshot: _s, ...rest }) => rest),
});

export function compactJson(report: AnyReport | AnyReport[]): string {
  return JSON.stringify(Array.isArray(report) ? report.map(stripShots) : stripShots(report));
}

export function issueUrl(reports: AnyReport[], maxUrlLength = 7500): string {
  const first = reports[0];
  const adapter = (first?.adapter ?? "unknown").slice(0, 40).trim();
  const title = `Quality lab results: ${first?.platform ?? "unknown"}, ${first?.backend ?? "unknown"}, ${adapter}`;
  const build = (json: string, truncated: boolean) => {
    const body =
      "Quality lab results from this device.\n\n```json\n" +
      json +
      "\n```\n" +
      (truncated ? "\nJSON truncated: use Copy JSON and paste it here.\n" : "");
    return `https://github.com/clockgrove/raccoon-world/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  };
  const full = compactJson(reports);
  const url = build(full, false);
  if (url.length <= maxUrlLength) return url;
  let lo = 0;
  let hi = full.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (build(full.slice(0, mid), true).length <= maxUrlLength) lo = mid;
    else hi = mid - 1;
  }
  return build(full.slice(0, lo), true);
}
