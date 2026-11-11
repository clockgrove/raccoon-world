// The quality lab's runner (issue 45): the sweep and the ceiling search, as pure logic over a LabHandle. No DOM and
// no three.js, so the page UI, the CI journey and a node test can all drive it.

import { DEFAULT_COST_ORDER, KNOBS, KNOB_LABELS, LEVELS, PRESETS, budgetMs, stepDown, sweepSteps } from "./config.ts";
import type { Knob, LabConfig, LabHandle, LabStatus, Measurement, Platform, StateName, ViewName } from "./config.ts";

export interface StepResult {
  id: string;
  label: string;
  config: LabConfig;
  knob?: Knob;
  sign?: 1 | -1;
  /** Null on a software GPU: those times are never performance. */
  measurement: Measurement | null;
  softwareMs?: { p50: number | null; p95: number | null };
  backend: LabStatus["backend"];
  adapter: string;
  dpr: number;
  canvas: [number, number];
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
  budgetMs: number;
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

export interface RunOptions {
  warmupMs?: number;
  holdMs?: number;
  onStep?(r: StepResult, i: number, n: number): void;
  signal?: AbortSignal;
  /** Stops after this many configs (the CI journey's short runs). */
  maxSteps?: number;
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
    const m = await lab.measure({ warmupMs: opts.warmupMs ?? DEFAULT_WARMUP_MS, holdMs: opts.holdMs ?? DEFAULT_HOLD_MS });
    const status = lab.status();
    result.backend = status.backend;
    result.adapter = status.adapter;
    result.dpr = status.dpr;
    result.canvas = status.canvas;
    if (status.software) result.softwareMs = { p50: m.frameMsP50, p95: m.frameMsP95 };
    else result.measurement = m;
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

const stripShots = <T extends { steps: { screenshot: string }[] }>(r: T): unknown => ({
  ...r,
  steps: r.steps.map(({ screenshot: _s, ...rest }) => rest),
});

export function compactJson(report: SweepReport | CeilingReport | (SweepReport | CeilingReport)[]): string {
  return JSON.stringify(Array.isArray(report) ? report.map(stripShots) : stripShots(report));
}

export function issueUrl(reports: (SweepReport | CeilingReport)[], maxUrlLength = 7500): string {
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
