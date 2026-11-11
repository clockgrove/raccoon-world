// The quality lab's overlay (issue 45): view/state toggles, presets, one control per knob, the two run buttons, the
// results table and the ways to send the numbers back. Plain DOM over the page's LabHandle.

import { KNOBS, KNOB_LABELS, LEVELS, PRESETS, PRESET_ORDER } from "./config.ts";
import type { Knob, LabConfig, LabHandle, StateName, ViewName } from "./config.ts";
import { compactJson, findCeiling, issueUrl, runSweep } from "./runner.ts";
import type { CeilingOptions, CeilingReport, RunOptions, StepResult, SweepReport } from "./runner.ts";

const CSS = `
.ql{position:fixed;top:8px;left:8px;z-index:10;width:min(440px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;
background:rgba(14,16,20,.88);color:#e8e8ea;font:13px/1.35 system-ui,sans-serif;border-radius:10px;padding:8px}
.ql.collapsed>.ql-body{display:none}
.ql button,.ql a.ql-btn,.ql select{min-height:44px;min-width:44px;box-sizing:border-box;font:inherit;border-radius:8px;border:1px solid #556;background:#2a2f3a;color:inherit;padding:4px 10px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.ql button[aria-pressed=true]{background:#3d6fd1;border-color:#7fa6f0}
.ql button.big{flex:1;font-size:15px;font-weight:600}
.ql button:disabled,.ql select:disabled{opacity:.45;cursor:default}
.ql .row{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.ql label.knob{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;flex:1 1 200px}
.ql label.knob input[type=checkbox]{width:24px;height:24px}
.ql .status{font-size:12px;opacity:.8;word-break:break-word}
.ql table{border-collapse:collapse;width:100%;font-size:12px}
.ql th,.ql td{border-bottom:1px solid #334;padding:2px 4px;text-align:right;vertical-align:middle}
.ql th:first-child,.ql td:first-child{text-align:left}
.ql img{width:64px;height:auto;display:block;border-radius:3px}
.ql .sw{color:#f0b060}
.ql .err{color:#f08080}
.ql .tablewrap{overflow-x:auto}
`;

type Report = SweepReport | CeilingReport;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  node.append(...kids);
  return node;
}

const ms = (v: number | null | undefined) => (v == null ? "n/a" : v.toFixed(1));

function summarise(config: LabConfig): string {
  return KNOBS.map((k) => `${KNOB_LABELS[k]}: ${String(config[k])}`).join(", ");
}

export function mountUi(lab: LabHandle, root: HTMLElement): void {
  root.append(el("style", { textContent: CSS }));
  const panel = el("div", { class: "ql" });
  const body = el("div", { class: "ql-body" });
  const toggle = el("button", { type: "button", textContent: "Quality lab", ariaExpanded: "true" });
  toggle.setAttribute("aria-expanded", "true");
  toggle.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });
  panel.append(toggle, body);
  root.append(panel);

  let running = false;
  const reports: Report[] = [];
  let lastSweep: SweepReport | undefined;

  const status = el("div", { class: "status", role: "status" });
  const refreshStatus = () => {
    const s = lab.status();
    status.textContent = s.failure
      ? `Failed: ${s.failure}`
      : `${s.backend}, ${s.adapter}, DPR ${s.dpr}, ${s.platform}${s.software ? ", software, not performance" : ""}${s.timestamps ? ", GPU timestamps" : ""}`;
  };

  // View and state
  const group = <T extends string>(label: string, options: [T, string][], get: () => T, set: (v: T) => Promise<void>) => {
    const row = el("div", { class: "row", role: "group", ariaLabel: label });
    row.setAttribute("aria-label", label);
    const buttons = options.map(([value, text]) => {
      const b = el("button", { type: "button", textContent: text });
      b.addEventListener("click", async () => {
        await set(value);
        sync();
      });
      return { value, b };
    });
    const sync = () => buttons.forEach(({ value, b }) => b.setAttribute("aria-pressed", String(get() === value)));
    row.append(...buttons.map((x) => x.b));
    return { row, sync };
  };
  const view = group<ViewName>("Camera view", [["yard", "Yard"], ["close", "Close-up"]], () => lab.status().view, (v) => lab.setView(v));
  const state = group<StateName>("Time of day", [["dusk", "Dusk"], ["night", "Night"]], () => lab.status().state, (v) => lab.setState(v));

  // Presets and knobs
  const presetRow = el("div", { class: "row", role: "group" });
  presetRow.setAttribute("aria-label", "Presets");
  const presetButtons = PRESET_ORDER.map((name) => {
    const b = el("button", { type: "button", textContent: name.charAt(0).toUpperCase() + name.slice(1) });
    b.addEventListener("click", async () => {
      await lab.apply({ ...PRESETS[name] });
      syncAll();
    });
    return b;
  });
  presetRow.append(...presetButtons);

  const knobRow = el("div", { class: "row" });
  const knobSyncs: (() => void)[] = [];
  const applyKnob = async (knob: Knob, value: unknown) => {
    await lab.apply({ ...lab.status().config, [knob]: value } as LabConfig);
    syncAll();
  };
  for (const knob of KNOBS) {
    const levels = LEVELS[knob] as readonly unknown[];
    const label = el("label", { class: "knob" });
    let input: HTMLInputElement | HTMLSelectElement;
    if (typeof levels[0] === "boolean") {
      const cb = el("input", { type: "checkbox" });
      cb.addEventListener("change", () => void applyKnob(knob, cb.checked));
      knobSyncs.push(() => (cb.checked = lab.status().config[knob] as boolean));
      input = cb;
    } else {
      const sel = el("select");
      for (const lv of levels) sel.append(el("option", { value: String(lv), textContent: String(lv) }));
      sel.addEventListener("change", () => {
        const picked = levels.find((lv) => String(lv) === sel.value);
        void applyKnob(knob, picked);
      });
      knobSyncs.push(() => (sel.value = String(lab.status().config[knob])));
      input = sel;
    }
    label.append(KNOB_LABELS[knob], input);
    knobRow.append(label);
  }
  const controls = [...presetButtons, ...knobRow.querySelectorAll<HTMLElement>("input,select")];

  // Run controls
  const sweepBtn = el("button", { type: "button", class: "big", textContent: "Run the sweep" });
  const ceilingBtn = el("button", { type: "button", class: "big", textContent: "Find the ceiling" });
  const stopBtn = el("button", { type: "button", textContent: "Stop", disabled: true });
  const progress = el("div", { class: "status", role: "status" });
  const runRow = el("div", { class: "row" }, sweepBtn, ceilingBtn, stopBtn);

  // Results
  const results = el("div", { class: "tablewrap" });
  const send = el("a", { class: "ql-btn", target: "_blank", rel: "noopener", textContent: "Send results" });
  send.setAttribute("aria-disabled", "true");
  const copyBtn = el("button", { type: "button", textContent: "Copy JSON", disabled: true });
  const downloadBtn = el("button", { type: "button", textContent: "Download JSON", disabled: true });
  const outRow = el("div", { class: "row" }, send, copyBtn, downloadBtn);

  const json = () => compactJson(reports.length === 1 ? reports[0]! : reports);
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(json());
      copyBtn.textContent = "Copied";
    } catch {
      copyBtn.textContent = "Copy failed";
    }
    setTimeout(() => (copyBtn.textContent = "Copy JSON"), 1500);
  });
  downloadBtn.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([json()], { type: "application/json" }));
    const a = el("a", { href: url, download: "quality-lab.json" });
    a.click();
    URL.revokeObjectURL(url);
  });

  const row = (cells: (string | Node)[], cls?: string) => {
    const tr = el("tr", cls ? { class: cls } : {});
    for (const c of cells) tr.append(el("td", {}, c));
    return tr;
  };
  const head = (...names: string[]) => el("thead", {}, el("tr", {}, ...names.map((n) => el("th", { scope: "col", textContent: n }))));
  const thumb = (r: StepResult) => (r.screenshot ? el("img", { src: r.screenshot, alt: `Screenshot: ${r.label}` }) : "");

  const stepCells = (r: StepResult): (string | Node)[] => {
    const m = r.measurement;
    if (r.error) return [r.label, el("span", { class: "err", textContent: r.error })];
    const times = m
      ? [ms(m.frameMsP50), ms(m.frameMsP95), ms(m.gpuMsP50), ms(m.gpuMsP95)]
      : [el("span", { class: "sw", textContent: "software, not performance" }), "", "", ""];
    return [r.label, ...times, r.backend, String(r.dpr), thumb(r)];
  };

  const render = () => {
    results.replaceChildren();
    for (const rep of reports) {
      const title = rep.kind === "sweep" ? "Sweep" : `Ceiling (budget ${rep.budgetMs.toFixed(1)} ms p95, strict target ${rep.targetMs.toFixed(1)} ms${rep.held ? `; p95 ${rep.ceilingP95Ms?.toFixed(1)} ms, ${rep.heldStrict ? "within" : "over"} the strict target` : ""})`;
      results.append(el("h3", { textContent: `${title}: ${rep.platform}, ${rep.backend}, ${rep.adapter}` }));
      if (rep.software) results.append(el("p", { class: "sw", textContent: "software, not performance" }));
      const table = el("table");
      const tbody = el("tbody");
      if (rep.kind === "sweep") {
        table.append(head("Config", "p50", "p95", "GPU p50", "GPU p95", "Backend", "DPR", "Shot"));
        for (const s of rep.steps) tbody.append(row(stepCells(s)));
      } else {
        table.append(head("Step", "p50", "p95", "GPU p50", "GPU p95", "Backend", "DPR", "Shot", "Removed", "Saved"));
        for (const s of rep.steps) {
          const cells = stepCells(s);
          while (cells.length < 8) cells.push("");
          const rm = s.removed;
          cells.push(rm ? `${KNOB_LABELS[rm.knob]}: ${String(rm.from)} to ${String(rm.to)}` : "");
          cells.push(rm ? (rm.gpuMsSaved != null ? `${ms(rm.gpuMsSaved)} ms GPU` : rep.software ? "n/a" : `${ms(rm.frameMsP95Saved)} ms p95`) : "");
          tbody.append(row(cells));
        }
      }
      table.append(tbody);
      results.append(table);
      if (rep.kind === "ceiling") {
        results.append(el("p", { textContent: `${rep.held ? "Highest sustainable configuration" : rep.software ? "Software, not performance: last configuration run" : "Budget not held; lowest configuration reached"}: ${summarise(rep.ceiling)}` }));
      }
    }
    const has = reports.length > 0;
    copyBtn.disabled = downloadBtn.disabled = !has;
    send.setAttribute("aria-disabled", String(!has));
    if (has) send.href = issueUrl(reports);
    else send.removeAttribute("href");
  };

  const setRunning = (on: boolean) => {
    running = on;
    sweepBtn.disabled = ceilingBtn.disabled = on;
    stopBtn.disabled = !on;
    for (const c of controls) (c as HTMLButtonElement).disabled = on;
  };
  function syncAll() {
    refreshStatus();
    view.sync();
    state.sync();
    knobSyncs.forEach((f) => f());
  }

  let abort: AbortController | null = null;
  stopBtn.addEventListener("click", () => abort?.abort());

  const track = async <R extends Report>(name: string, run: (o: RunOptions) => Promise<R>, userOpts: RunOptions = {}): Promise<R> => {
    if (running) throw new Error("a run is already in progress");
    abort = new AbortController();
    const signal = userOpts.signal ? AbortSignal.any([abort.signal, userOpts.signal]) : abort.signal;
    setRunning(true);
    progress.textContent = `${name}: starting`;
    try {
      const rep = await run({
        ...userOpts,
        signal,
        onStep: (r, i, n) => {
          progress.textContent = `${i + 1}/${n} ${r.label}`;
          userOpts.onStep?.(r, i, n);
          syncAll();
        },
      });
      reports.push(rep);
      if (rep.kind === "sweep") lastSweep = rep;
      progress.textContent = `${name}: ${signal.aborted ? "stopped" : "done"}`;
      render();
      return rep;
    } finally {
      setRunning(false);
      syncAll();
    }
  };

  const doSweep = (o: RunOptions = {}) => track("Sweep", (opts) => runSweep(lab, opts), o);
  const costsOf = (o: CeilingOptions) => {
    const costs = o.costs ?? lastSweep?.costs;
    return costs ? { costs } : {};
  };
  const doCeiling = (o: CeilingOptions = {}) =>
    track("Ceiling", (opts) => findCeiling(lab, { ...opts, ...costsOf(o), ...(o.maxSteps !== undefined ? { maxSteps: o.maxSteps } : {}) }), o);

  sweepBtn.addEventListener("click", () => void doSweep().catch((e) => (progress.textContent = String(e))));
  ceilingBtn.addEventListener("click", () => void doCeiling().catch((e) => (progress.textContent = String(e))));

  body.append(status, view.row, state.row, presetRow, knobRow, runRow, progress, outRow, results);
  syncAll();

  (globalThis as unknown as { labRunner: unknown }).labRunner = {
    runSweep: doSweep,
    findCeiling: doCeiling,
    reports: () => [...reports],
  };
}
