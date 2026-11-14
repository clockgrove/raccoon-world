// The quality lab's overlay (issue 45): the scene's view and time, the presets, one control per knob grouped by what
// it changes, the runs, the results and the ways to copy the numbers back. Plain DOM over the page's LabHandle.
// Desktop: a panel on the left. Phone: a bottom sheet that starts folded, so the yard is what you see first.

import { KNOBS, KNOB_LABELS, LEVELS, MOTIONS, PRESETS, PRESET_ORDER } from "./config.ts";
import type { Coat, FurMode, Knob, LevelMode, LabConfig, Motion, LabHandle, PresetName, StateName, ViewName } from "./config.ts";
import { compactJson, compareFur, compareLevels, findCastBudget, findCeiling, findTriangleBudget, runSoak, runSweep, slimJson } from "./runner.ts";

const VIEW_TEXT: Record<ViewName, string> = { yard: "Yard", close: "Close-up", far: "Zoomed out" };
import type { AnyReport, CastOptions, CeilingOptions, CeilingReport, FurComparisonOptions, LevelsComparisonOptions, RunOptions, SoakOptions, StepResult, SweepReport, TriangleOptions } from "./runner.ts";

const CSS = `
.ql{--accent:#f5b453;--accent-ink:#1b1608;--line:rgba(255,255,255,.09);--fill:rgba(255,255,255,.06);--muted:rgba(236,235,230,.62);
position:fixed;z-index:10;box-sizing:border-box;display:flex;flex-direction:column;color:#ecebe6;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;
background:rgba(20,21,24,.78);-webkit-backdrop-filter:blur(20px) saturate(150%);backdrop-filter:blur(20px) saturate(150%);
border:1px solid var(--line);box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden}
.ql *{box-sizing:border-box}
@media (min-width:720px){.ql{top:12px;left:12px;bottom:12px;width:360px;border-radius:18px}
 .ql.collapsed{bottom:auto}}
@media (max-width:719px){.ql{left:0;right:0;bottom:0;max-height:82dvh;border-radius:20px 20px 0 0;border-bottom:0;padding-bottom:env(safe-area-inset-bottom)}}
.ql.collapsed .ql-scroll,.ql.collapsed .ql-actions{display:none}
.ql-head{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;padding:8px 14px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.ql-head .grip{display:none}
@media (max-width:719px){.ql-head{flex-wrap:wrap;padding-top:14px;position:relative}
 .ql-head .grip{display:block;position:absolute;top:6px;left:50%;width:36px;height:4px;margin-left:-18px;border-radius:2px;background:rgba(255,255,255,.22)}}
.ql-title{font-weight:650;font-size:15px}
.ql-sub{color:var(--muted);font-size:12px}
.ql-fps{margin-left:auto;padding:3px 9px;border-radius:999px;background:var(--fill);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.ql-meters{margin-left:auto;display:flex;gap:6px;align-items:center}
.ql-meters .ql-fps{margin-left:0}
.ql-tris{padding:3px 9px;border-radius:999px;background:var(--fill);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--muted)}
@media (max-width:719px){.ql-tris{display:none}.ql:not(.collapsed) .ql-tris{display:inline}}
.ql-fps.good{color:#9be29b}.ql-fps.ok{color:#f5d36b}.ql-fps.bad{color:#ff9b8f}
.ql-chev{width:20px;height:20px;flex:none;transition:transform .2s ease;opacity:.7}
.ql.collapsed .ql-chev{transform:rotate(180deg)}
@media (min-width:720px){.ql-chev{transform:rotate(-90deg)}.ql.collapsed .ql-chev{transform:rotate(90deg)}}
.ql-scroll{flex:1;overflow:auto;overscroll-behavior:contain;padding:0 14px 12px;-webkit-overflow-scrolling:touch}
.ql-device{margin:0 0 6px;color:var(--muted);font-size:12px;word-break:break-word}
.ql-device.err{color:#ff9b8f}
.ql section{padding:12px 0;border-top:1px solid var(--line)}
.ql h2{margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.ql .pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ql .seg{display:flex;padding:3px;gap:2px;border-radius:12px;background:var(--fill)}
.ql .seg button{flex:1;min-height:38px;min-width:0;padding:0 8px;border:0;border-radius:9px;background:none;color:inherit;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .15s ease,color .15s ease}
.ql .seg button[aria-pressed=true]{background:rgba(255,255,255,.16);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.ql .seg.accent button[aria-pressed=true]{background:var(--accent);color:var(--accent-ink)}
.ql .hint{margin:6px 2px 0;color:var(--muted);font-size:12px}
.ql details{border-radius:14px;background:rgba(255,255,255,.035);margin-bottom:8px}
.ql summary{display:flex;align-items:center;gap:8px;min-height:48px;padding:0 12px;cursor:pointer;list-style:none;font-weight:600}
.ql summary::-webkit-details-marker{display:none}
.ql summary .count{margin-left:auto;color:var(--muted);font-weight:400;font-size:12px}
.ql summary::after{content:"";width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);opacity:.5;margin:-4px 2px 0 4px;transition:transform .2s ease}
.ql details[open] summary::after{transform:rotate(225deg);margin-top:4px}
.ql .knobs{padding:0 12px 6px}
.ql .knob{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:46px;border-top:1px solid var(--line)}
.ql .knob:first-child{border-top:0}
.ql .knob.wide{flex-direction:column;align-items:stretch;gap:6px;padding:8px 0}
.ql .knob.wide .seg button{min-height:34px}
.ql .switch{appearance:none;-webkit-appearance:none;position:relative;flex:none;width:46px;height:28px;margin:0;border-radius:14px;background:rgba(255,255,255,.18);cursor:pointer;transition:background .18s ease}
.ql .switch::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.4);transition:transform .18s ease}
.ql .switch:checked{background:var(--accent)}
.ql .switch:checked::after{transform:translateX(18px)}
.ql .switch:focus-visible,.ql button:focus-visible,.ql a:focus-visible,.ql summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ql-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 14px 12px;border-top:1px solid var(--line);background:rgba(20,21,24,.6)}
.ql .btn{min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--fill);color:inherit;font:inherit;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none}
.ql .btn.primary{background:var(--accent);border-color:transparent;color:var(--accent-ink)}
.ql-actions .btn{padding:0 8px;font-size:13px;line-height:1.2;text-align:center}
.ql-actions .btn.apply{grid-column:span 2}
.ql .btn.stop{grid-column:1/-1;background:rgba(255,120,100,.16);border-color:rgba(255,120,100,.35);color:#ffb3a8}
.ql [hidden]{display:none!important}
.ql button:disabled,.ql .btn[aria-disabled=true],.ql .switch:disabled{opacity:.4;cursor:default;pointer-events:none}
.ql .run{grid-column:1/-1;display:none}
.ql.running .run{display:block}
.ql .run p{margin:0 0 6px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.ql .bar{height:4px;border-radius:2px;background:var(--fill);overflow:hidden}
.ql .bar>i{display:block;height:100%;width:0;background:var(--accent);transition:width .25s ease}
.ql .out{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.ql .out .btn{flex:1 1 auto}
.ql .tablewrap{overflow-x:auto;border-radius:12px;background:rgba(0,0,0,.2)}
.ql h3{margin:12px 0 8px;font-size:13px}
.ql table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}
.ql th,.ql td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:right;vertical-align:middle;white-space:nowrap}
.ql th{color:var(--muted);font-weight:500}
.ql th:first-child,.ql td:first-child{text-align:left;white-space:normal;min-width:140px}
.ql img{width:auto;height:auto;max-width:64px;max-height:40px;display:block;border-radius:4px}
.ql .sw{color:#f0b060}
.ql .err{color:#ff9b8f}
.ql .runall{margin:10px 0}
.ql .runall .btn{width:100%}
.ql .empty{color:var(--muted);font-size:12px;margin:0}
.ql-alert{display:flex;align-items:center;gap:10px;margin:0 14px 10px;padding:10px 12px;border-radius:12px;background:rgba(245,180,83,.13);border:1px solid rgba(245,180,83,.35);font-size:13px}
.ql-alert p{margin:0;flex:1}
.ql-alert .btn{min-height:36px;padding:0 12px;font-size:13px}
.ql-alert .x{min-width:36px;padding:0}
.ql.busy .ql-sub::before{content:"";display:inline-block;width:9px;height:9px;margin-right:6px;border:2px solid var(--accent);border-right-color:transparent;border-radius:50%;animation:qlspin .8s linear infinite;vertical-align:-1px}
@keyframes qlspin{to{transform:rotate(360deg)}}
.ql .knob.changed>:first-child::after{content:"";display:inline-block;width:7px;height:7px;margin-left:8px;border-radius:50%;background:var(--accent);vertical-align:middle}
.ql-chip{position:fixed;z-index:9;left:50%;top:max(56px,calc(env(safe-area-inset-top) + 56px));transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;
background:rgba(20,21,24,.82);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.1);color:#ecebe6;font:13px/1.3 system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.ql-chip::before{content:"";width:10px;height:10px;border:2px solid #f5b453;border-right-color:transparent;border-radius:50%;animation:qlspin .8s linear infinite}
.ql-chip[hidden]{display:none}
.ql-still{position:fixed;inset:0;z-index:1;width:100%;height:100%;object-fit:cover;filter:brightness(.8) saturate(.9);pointer-events:none}
.ql-still[hidden]{display:none}
@media (prefers-reduced-motion:reduce){.ql *{transition:none!important;animation:none!important}}
`;

type Report = AnyReport;

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
  return [`Coat: ${config.coat}`, `Fur: ${config.furMode}`, ...KNOBS.map((k) => `${KNOB_LABELS[k]}: ${String(config[k])}`)].join(", ");
}

/** The knobs grouped by what they change, in the order a person reads them. Every knob is in exactly one group. */
const GROUPS: readonly { title: string; knobs: readonly Knob[] }[] = [
  { title: "Stevie", knobs: ["furShells", "furFins"] },
  { title: "Light and shadow", knobs: ["cascades", "pointShadows", "ao", "probes", "haze", "shafts"] },
  { title: "Rain", knobs: ["rainCount", "splashes", "ripples", "reflections"] },
  { title: "Image", knobs: ["antialias", "upscale", "dpr", "bloom", "grade"] },
  { title: "Geometry and cast", knobs: ["detail", "cast"] },
];
const LEVEL_TEXT: Partial<Record<string, string>> = { none: "Off", msaa: "MSAA", traa: "TRAA", taau: "TAAU", fsr: "FSR 1" };
const levelText = (knob: Knob, level: unknown) => (knob === "dpr" || knob === "detail" ? `${String(level)}×` : (LEVEL_TEXT[String(level)] ?? String(level)));
/** 1234567 → "1.23M", 182000 → "182k". */
const count = (n: number | null | undefined) => (n == null ? "n/a" : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const CHEVRON = '<svg class="ql-chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 12.5 10 7.5l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function mountUi(lab: LabHandle, root: HTMLElement): void {
  root.append(el("style", { textContent: CSS }));
  const phone = lab.status().platform === "phone" || matchMedia("(max-width: 719px)").matches;
  const panel = el("div", { class: "ql" });
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Quality lab");

  // Header: title, the preset in use, live frame rate, and the fold.
  const headTitle = el("span", { class: "ql-title", textContent: "Quality lab" });
  const headSub = el("span", { class: "ql-sub" });
  const fps = el("span", { class: "ql-fps", textContent: "– fps" });
  const tris = el("span", { class: "ql-tris", title: "Triangles in the scene" });
  fps.setAttribute("aria-hidden", "true");
  const toggle = el("button", { type: "button", class: "ql-head" });
  toggle.append(el("span", { class: "grip" }), el("span", {}, headTitle, el("br"), headSub), el("span", { class: "ql-meters" }, tris, fps));
  toggle.insertAdjacentHTML("beforeend", CHEVRON);
  const setCollapsed = (collapsed: boolean) => {
    panel.classList.toggle("collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
  };
  toggle.addEventListener("click", () => setCollapsed(!panel.classList.contains("collapsed")));

  const scroll = el("div", { class: "ql-scroll" });
  const actions = el("div", { class: "ql-actions" });
  // The health check: says plainly when the yard is slow on this device, and offers the fix.
  const alertText = el("p");
  const alertFix = el("button", { type: "button", class: "btn primary", textContent: "Switch to Low" });
  const alertClose = el("button", { type: "button", class: "btn x", textContent: "✕", ariaLabel: "Dismiss" });
  alertClose.setAttribute("aria-label", "Dismiss");
  const alertBox = el("div", { class: "ql-alert", hidden: true }, alertText, alertFix, alertClose);
  alertBox.setAttribute("role", "alert");
  panel.append(toggle, alertBox, scroll, actions);
  root.append(panel);
  setCollapsed(phone);

  let running = false;
  const reports: Report[] = [];
  let lastSweep: SweepReport | undefined;

  const status = el("p", { class: "ql-device" });
  status.setAttribute("role", "status");
  const refreshStatus = () => {
    const s = lab.status();
    status.classList.toggle("err", Boolean(s.failure));
    status.textContent = s.failure
      ? `Failed: ${s.failure}`
      : [s.backend === "webgpu" ? "WebGPU" : "WebGL2", s.adapter, `DPR ${s.dpr}`, s.platform, s.software ? "software, not performance" : "", s.timestamps ? "GPU timestamps" : ""].filter(Boolean).join(" · ");
  };

  // Draft and apply: the controls edit a draft, and Apply rebuilds the scene once for the whole batch. A rebuild
  // recompiles shaders, which takes seconds on a phone; the panel stays usable and the yard's last frame stays up.
  let draft: LabConfig = { ...lab.status().config };
  let applyingSince = 0;
  let applyingName = "";
  let applyError = "";
  let settledAt = performance.now();
  let sceneWanted: { view: ViewName; state: StateName } | null = null;
  const pending = () => [...KNOBS, "coat", "furMode", "levels", "motion" as const].filter((k) => draft[k as keyof LabConfig] !== lab.status().config[k as keyof LabConfig]);
  const edit = (next: LabConfig) => {
    draft = { ...next };
    applyError = "";
    syncAll();
  };
  // A still of the current frame covers the scene while it rebuilds (a pixel-ratio change clears the canvas).
  const still = el("img", { class: "ql-still", alt: "", hidden: true });
  root.append(still);
  const chip = el("div", { class: "ql-chip", hidden: true });
  chip.setAttribute("role", "status");
  root.append(chip);
  const applyDraft = async () => {
    if (applyingSince || running || pending().length === 0) return;
    const target = { ...draft };
    const name = presetOf(target);
    applyingName = name ? capital(name) : "your changes";
    applyingSince = performance.now();
    panel.classList.add("busy");
    syncAll();
    try {
      still.src = await lab.screenshot(Math.min(2400, Math.round(window.innerWidth * Math.min(2, window.devicePixelRatio))));
      still.hidden = false;
    } catch {
      // No still: the canvas keeps its last frame unless the pixel ratio changes.
    }
    try {
      await lab.apply(target);
    } catch (error) {
      applyError = String((error as Error)?.message ?? error);
    } finally {
      applyingSince = 0;
      still.hidden = true;
      still.removeAttribute("src");
      settledAt = performance.now();
      panel.classList.remove("busy");
      const wanted = sceneWanted;
      sceneWanted = null;
      if (wanted && wanted.view !== lab.status().view) await lab.setView(wanted.view);
      if (wanted && wanted.state !== lab.status().state) await lab.setState(wanted.state);
      syncAll();
    }
  };

  // Live frame rate from animation frames; paused during a run so it never touches a measurement.
  let frames = 0;
  let since = performance.now();
  let slowWindows = 0;
  let dismissed: string | null = null;
  const configKey = () => JSON.stringify(lab.status().config);
  const tick = (now: number) => {
    frames++;
    if (now - since >= 750) {
      const rate = (frames * 1000) / (now - since);
      const s = lab.status();
      const target = s.platform === "phone" ? 30 : 60;
      if (applyingSince) paintHead();
      else if (!running) {
        fps.textContent = `${Math.round(rate)} fps`;
        tris.textContent = `${count(s.triangles)} tris`;
        fps.className = `ql-fps ${rate >= target * 0.9 ? "good" : rate >= target * 0.6 ? "ok" : "bad"}`;
        // Judge only once a change has settled (shaders warm), and only after three slow readings in a row.
        slowWindows = now - settledAt > 2000 && rate < target * 0.6 ? slowWindows + 1 : 0;
        const atLowest = presetOf(s.config) === "low";
        if (s.software) {
          alertText.textContent = "This browser is drawing without the GPU (software graphics), so the yard is slow here and its times are not performance.";
          alertFix.hidden = true;
          alertBox.hidden = dismissed === "software";
        } else if (slowWindows >= 3 && dismissed !== configKey()) {
          alertText.textContent = `Slow on this device: ${Math.round(rate)} fps against a ${target} fps target.${atLowest ? " This is already the lowest preset." : ""}`;
          alertFix.hidden = atLowest;
          alertBox.hidden = false;
        } else if (rate >= target * 0.75) alertBox.hidden = true;
      }
      frames = 0;
      since = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  alertFix.addEventListener("click", () => {
    alertBox.hidden = true;
    slowWindows = 0;
    edit({ ...PRESETS.low, coat: draft.coat, furMode: draft.furMode, levels: draft.levels, motion: draft.motion });
    void applyDraft();
  });
  alertClose.addEventListener("click", () => {
    alertBox.hidden = true;
    dismissed = lab.status().software ? "software" : configKey();
  });

  // A segmented control: one pressed button among a few.
  const segmented = <T>(label: string, options: readonly [T, string][], get: () => T, set: (v: T) => Promise<void> | void, accent = false) => {
    const row = el("div", { class: accent ? "seg accent" : "seg" });
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", label);
    const buttons = options.map(([value, text]) => {
      const b = el("button", { type: "button", textContent: text });
      b.addEventListener("click", () => void Promise.resolve(set(value)).then(syncAll));
      return { value, b };
    });
    row.append(...buttons.map((x) => x.b));
    const sync = () => {
      for (const { value, b } of buttons) b.setAttribute("aria-pressed", String(get() === value));
    };
    return { row, sync, buttons: buttons.map((x) => x.b) };
  };

  // Scene
  // The view and time apply at once; during a rebuild they wait for it to finish.
  const wantedView = () => sceneWanted?.view ?? lab.status().view;
  const wantedState = () => sceneWanted?.state ?? lab.status().state;
  const view = segmented<ViewName>("Camera view", [["yard", "Yard"], ["close", "Close-up"], ["far", "Zoomed out"]], wantedView, (v) =>
    applyingSince ? void (sceneWanted = { view: v, state: wantedState() }) : lab.setView(v),
  );
  const state = segmented<StateName>("Time of day", [["dusk", "Dusk"], ["night", "Night"]], wantedState, (v) =>
    applyingSince ? void (sceneWanted = { view: wantedView(), state: v }) : lab.setState(v),
  );
  const sceneSection = el("section", {}, el("h2", { textContent: "Scene" }), el("div", { class: "pair" }, view.row, state.row));

  // Presets
  const presetOf = (config: LabConfig): PresetName | null =>
    PRESET_ORDER.find((name) => KNOBS.every((k) => PRESETS[name][k] === config[k])) ?? null;
  const preset = segmented<PresetName | null>(
    "Preset",
    PRESET_ORDER.map((name) => [name, capital(name)] as [PresetName, string]),
    () => presetOf(draft),
    (name) => {
      if (name) edit({ ...PRESETS[name], coat: draft.coat, furMode: draft.furMode, levels: draft.levels, motion: draft.motion });
    },
    true,
  );
  const presetHint = el("p", { class: "hint" });
  const presetSection = el("section", {}, el("h2", { textContent: "Quality" }), preset.row, presetHint);

  // Effects: one card per group, a switch per on/off knob and a segmented control per levelled knob.
  const setKnob = (knob: Knob, value: unknown) => edit({ ...draft, [knob]: value } as LabConfig);
  const knobSyncs: (() => void)[] = [];
  const knobControls: HTMLElement[] = [];
  const effects = el("section", {}, el("h2", { textContent: "Effects" }));
  for (const group of GROUPS) {
    const count = el("span", { class: "count" });
    const details = el("details", { open: !phone && group.title !== "Image" });
    const list = el("div", { class: "knobs" });
    details.append(el("summary", {}, group.title, count), list);
    for (const knob of group.knobs) {
      const levels = LEVELS[knob] as readonly unknown[];
      if (typeof levels[0] === "boolean") {
        const id = `ql-${knob}`;
        const cb = el("input", { type: "checkbox", id, class: "switch" });
        cb.setAttribute("role", "switch");
        cb.addEventListener("change", () => setKnob(knob, cb.checked));
        const row = el("div", { class: "knob" }, el("label", { htmlFor: id, textContent: KNOB_LABELS[knob] }), cb);
        knobSyncs.push(() => {
          cb.checked = draft[knob] as boolean;
          row.classList.toggle("changed", draft[knob] !== lab.status().config[knob]);
        });
        knobControls.push(cb);
        list.append(row);
      } else {
        // Cheapest first reads naturally left to right.
        const options = [...levels].reverse().map((lv) => [lv, levelText(knob, lv)] as [unknown, string]);
        const seg = segmented<unknown>(KNOB_LABELS[knob], options, () => draft[knob], (v) => setKnob(knob, v));
        const row = el("div", { class: "knob wide" }, el("span", { textContent: KNOB_LABELS[knob] }), seg.row);
        knobSyncs.push(seg.sync, () => row.classList.toggle("changed", draft[knob] !== lab.status().config[knob]));
        knobControls.push(...seg.buttons);
        list.append(row);
      }
    }
    knobSyncs.push(() => {
      const on = group.knobs.filter((k) => {
        const v = draft[k];
        return typeof v === "boolean" ? v : v !== (LEVELS[k] as readonly unknown[]).at(-1);
      }).length;
      const only = group.knobs.length === 1 ? group.knobs[0]! : null;
      count.textContent = only ? levelText(only, draft[only]) : `${on} of ${group.knobs.length} on`;
    });
    effects.append(details);
  }
  const coat = segmented<Coat>("Coat", [["summer", "Summer"], ["winter", "Winter"]], () => draft.coat, (v) => edit({ ...draft, coat: v }));
  const furMode = segmented<FurMode>("Fur material", [["groomed", "Groomed"], ["uniform", "Uniform shells"]], () => draft.furMode, (v) => edit({ ...draft, furMode: v }));
  const coatSection = el("section", {}, el("h2", { textContent: "Coat" }), coat.row, furMode.row,
    el("p", { class: "hint", textContent: "Summer and winter read Stevie’s groom maps. Uniform shells keep the earlier 12 mm material for comparison." }));
  const levelMode = segmented<LevelMode>("Stevie's levels", [["single", "Level 0 only"], ["phone", "Phone levels"]], () => draft.levels ?? "single", (v) => edit({ ...draft, levels: v }));
  coatSection.append(levelMode.row, el("p", { class: "hint", textContent: "Phone levels draw Stevie from his 1024 px phone files, a finer one while he is large on screen and a coarser one when he is small. Level 0 is the full model." }));
  const motion = segmented<Motion>("Stevie's motion", MOTIONS.map((m) => [m, capital(m)] as [Motion, string]), () => draft.motion ?? "walk", (v) => edit({ ...draft, motion: v }));
  coatSection.append(motion.row, el("p", { class: "hint", textContent: "Walk moves Stevie along the loop. Every other motion plays in place on repeat, on him and on the cast." }));
  const controls = [...preset.buttons, ...knobControls, ...coat.buttons, ...furMode.buttons, ...levelMode.buttons, ...motion.buttons];

  // Runs: the action bar stays in reach at the bottom of the panel.
  const sweepBtn = el("button", { type: "button", class: "btn primary", textContent: "Run the sweep" });
  const ceilingBtn = el("button", { type: "button", class: "btn", textContent: "Find the ceiling" });
  const trianglesBtn = el("button", { type: "button", class: "btn", textContent: "Triangle budget" });
  const castBtn = el("button", { type: "button", class: "btn", textContent: "Cast budget" });
  const soakBtn = el("button", { type: "button", class: "btn", textContent: "Soak (90 s)" });
  const furBtn = el("button", { type: "button", class: "btn", textContent: "Compare fur" });
  const levelsBtn = el("button", { type: "button", class: "btn", textContent: "Compare levels" });
  const stopBtn = el("button", { type: "button", class: "btn stop", textContent: "Stop", hidden: true });
  const progress = el("p", {});
  progress.setAttribute("role", "status");
  const runBar = el("i");
  const runBox = el("div", { class: "run" }, progress, el("div", { class: "bar" }, runBar));
  const applyBtn = el("button", { type: "button", class: "btn primary", hidden: true });
  const discardBtn = el("button", { type: "button", class: "btn", textContent: "Discard", hidden: true });
  applyBtn.addEventListener("click", () => void applyDraft());
  discardBtn.addEventListener("click", () => edit({ ...lab.status().config }));
  applyBtn.classList.add("apply");
  actions.append(runBox, applyBtn, discardBtn, sweepBtn, ceilingBtn, trianglesBtn, castBtn, soakBtn, furBtn, levelsBtn, stopBtn);

// Results
  const results = el("div", { class: "tablewrap" });
  const copyBtn = el("button", { type: "button", class: "btn primary", textContent: "Copy results", disabled: true });
  const downloadBtn = el("button", { type: "button", class: "btn", textContent: "Download JSON", disabled: true });
  const copyNote = el("p", { class: "hint", textContent: "Copy results puts every number on the clipboard in a compact form: paste it back to whoever asked for the run. Download JSON keeps each step's full settings." });
  const outRow = el("div", { class: "out" }, copyBtn, downloadBtn, copyNote);
  const empty = el("p", { class: "empty", textContent: "Run the sweep to time each effect on this device. Find the ceiling: the richest set of effects that holds the frame budget. Triangle budget: keeps your effects and raises geometry detail until 60 fps breaks. Then copy the results." });
  const runAllBtn = el("button", { type: "button", class: "btn primary", textContent: "Run everything (about 22–28 min)" });
  const runAllHint = el("p", { class: "hint", textContent: "Sweep (both framings), then ceiling, triangle budget, cast budget, paired fur and levels comparisons and a 90 s soak at the ceiling; then copy the results. Keep this page open and in front (on desktop, this tab visible; on a phone, unlocked). Landscape matches the game's framing." });
  const runAllBox = el("div", { class: "runall" }, runAllBtn, runAllHint);
  const resultsSection = el("section", {}, el("h2", { textContent: "Results" }), empty, runAllBox, outRow, results);

  const json = () => compactJson(reports.length === 1 ? reports[0]! : reports);
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(slimJson(reports));
      copyBtn.textContent = "Copied";
    } catch {
      copyBtn.textContent = "Copy failed";
    }
    setTimeout(() => (copyBtn.textContent = "Copy results"), 1500);
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

  const renderTriangles = (rep: Extract<Report, { kind: "triangles" }>) => {
    results.append(el("h3", { textContent: `Triangle budget at ${rep.targetFps} fps (p95 within ${rep.budgetMs.toFixed(1)} ms): ${rep.platform}, ${rep.backend}, ${rep.adapter}` }));
    if (rep.software) results.append(el("p", { class: "sw", textContent: "software, not performance" }));
    const table = el("table");
    const tbody = el("tbody");
    table.append(head("Detail", "Triangles", "Drawn/frame", "p50", "p95", "GPU p50", "GPU p95", "Shot"));
    for (const s of rep.steps) {
      const m = s.measurement;
      if (s.error) tbody.append(row([s.label, el("span", { class: "err", textContent: s.error })]));
      else tbody.append(row([s.label, count(s.triangles ?? m?.triangles), count(s.drawnTriangles ?? m?.drawnTriangles), ms(m?.frameMsP50), ms(m?.frameMsP95), ms(m?.gpuMsP50), ms(m?.gpuMsP95), thumb(s)]));
    }
    table.append(tbody);
    results.append(table);
    const lines = [
      rep.held ? `Held ${rep.targetFps} fps up to ${count(rep.held.triangles)} triangles (detail ${rep.held.detail}×, p95 ${ms(rep.held.frameMsP95)} ms).` : rep.software ? "" : `Missed ${rep.targetFps} fps even with the art as made.`,
      rep.missed ? `Missed at ${count(rep.missed.triangles)} triangles (detail ${rep.missed.detail}×, p95 ${ms(rep.missed.frameMsP95)} ms).` : "",
      rep.estimatedTriangles != null ? `Estimate from GPU time: about ${count(rep.estimatedTriangles)} triangles before the GPU uses 80% of a ${rep.targetFps} fps frame.` : "",
      rep.noLimitUpTo != null ? `GPU time barely grows with triangles here: no limit found up to ${count(rep.noLimitUpTo)} triangles. Effects and resolution set the frame time, not geometry.` : "",
    ].filter(Boolean);
    for (const line of lines) results.append(el("p", { textContent: line }));
  };

  const scaleTable = (rep: Extract<Report, { kind: "cast" | "soak" }>, first: string) => {
    const table = el("table");
    const tbody = el("tbody");
    table.append(head(first, "p50", "p95", "p99", "Missed", "GPU p50", "CPU p50", "Draw calls", "Shot"));
    for (const s of rep.steps) {
      const m = s.measurement;
      if (s.error) tbody.append(row([s.label, el("span", { class: "err", textContent: s.error })]));
      else tbody.append(row([s.label, ms(m?.frameMsP50), ms(m?.frameMsP95), ms(m?.frameMsP99), m?.missedPct != null ? `${m.missedPct}%` : "n/a", ms(m?.gpuMsP50), ms(m?.cpuMsP50), m?.drawCalls != null ? String(m.drawCalls) : "n/a", thumb(s)]));
    }
    table.append(tbody);
    results.append(table);
  };
  const renderCast = (rep: Extract<Report, { kind: "cast" }>) => {
    results.append(el("h3", { textContent: `Cast budget at ${rep.targetFps} fps (p95 within ${rep.budgetMs.toFixed(1)} ms): ${rep.platform}, ${rep.backend}, ${rep.adapter}` }));
    if (rep.software) results.append(el("p", { class: "sw", textContent: "software, not performance" }));
    scaleTable(rep, "Raccoons");
    const lines = [
      rep.held ? `Held ${rep.targetFps} fps with ${rep.held.cast} raccoon${rep.held.cast === 1 ? "" : "s"} (p95 ${ms(rep.held.frameMsP95)} ms).` : rep.software ? "" : "Missed the budget even with one raccoon.",
      rep.missed ? `Missed with ${rep.missed.cast} (p95 ${ms(rep.missed.frameMsP95)} ms).` : "",
      rep.gpuMsPerRaccoon != null ? `Each raccoon adds about ${rep.gpuMsPerRaccoon.toFixed(2)} ms of GPU time${rep.cpuMsPerRaccoon != null ? ` and ${rep.cpuMsPerRaccoon.toFixed(2)} ms of main-thread time` : ""}.` : "",
      rep.estimatedCast != null ? `About ${rep.estimatedCast} raccoons before the GPU uses 80% of the frame.` : "",
    ].filter(Boolean);
    for (const line of lines) results.append(el("p", { textContent: line }));
  };
  const renderSoak = (rep: Extract<Report, { kind: "soak" }>) => {
    results.append(el("h3", { textContent: `Soak: ${rep.steps.length * rep.windowS} s at one config, ${rep.windowS} s windows: ${rep.platform}, ${rep.backend}, ${rep.adapter}` }));
    if (rep.software) results.append(el("p", { class: "sw", textContent: "software, not performance" }));
    scaleTable(rep, "Window");
    if (rep.frameP95Drift != null || rep.gpuP50Drift != null)
      results.append(el("p", { textContent: `Last window against the first: frame p95 ×${rep.frameP95Drift ?? "n/a"}, GPU p50 ×${rep.gpuP50Drift ?? "n/a"} (above 1.1 means the device slowed down, usually heat).` }));
  };

  const render = () => {
    results.replaceChildren();
    for (const rep of reports) {
      if (rep.kind === "fur") {
        results.append(el("h3", { textContent: `Fur comparison · ${rep.coat} · ${rep.view}: ${rep.backend}, ${rep.adapter}` }));
        if (rep.software) results.append(el("p", { class: "sw", textContent: "software, not performance" }));
        const table = el("table");
        const body = el("tbody");
        table.append(head("Config", "GPU p50 ms", "GPU p95 ms", "CPU p50 ms", "CPU p95 ms", "Shot"), body);
        for (const step of rep.steps) body.append(row(step.error ? [step.label, step.error] : [step.label,
          ms(step.measurement?.gpuMsP50), ms(step.measurement?.gpuMsP95), ms(step.measurement?.cpuMsP50), ms(step.measurement?.cpuMsP95), thumb(step)]));
        results.append(table);
        for (const cost of rep.costs) results.append(el("p", { textContent: `${capital(cost.preset)} groomed − uniform: ${ms(cost.gpuMsP50)} ms GPU, ${ms(cost.cpuMsP50)} ms CPU.` }));
        for (const cast of rep.castBudgets) results.append(el("p", { textContent: `${cast.base.furMode} cast: ${cast.held ? `${cast.held.cast} held 60 fps` : "no measured budget held"}; each raccoon adds ${ms(cast.gpuMsPerRaccoon)} ms GPU, ${ms(cast.cpuMsPerRaccoon)} ms CPU.` }));
        continue;
      }
      if (rep.kind === "levels") {
        results.append(el("h3", { textContent: `Levels comparison · ${rep.coat} · ${rep.views.map((v) => VIEW_TEXT[v]).join(" and ")}: ${rep.backend}, ${rep.adapter}` }));
        if (rep.software) results.append(el("p", { class: "sw", textContent: "software, not performance" }));
        const table = el("table");
        const body = el("tbody");
        table.append(head("Config", "Drawn", "Frame p50 ms", "Frame p95 ms", "GPU p50 ms", "GPU p95 ms", "Shot"), body);
        for (const step of rep.steps) body.append(row(step.error ? [step.label, step.error] : [step.label, step.stevie ? `${step.stevie.file} (${count(step.stevie.triangles)} tris)` : "n/a",
          ms(step.measurement?.frameMsP50), ms(step.measurement?.frameMsP95), ms(step.measurement?.gpuMsP50), ms(step.measurement?.gpuMsP95), thumb(step)]));
        results.append(table);
        results.append(el("p", { textContent: `Download: level 0 ${rep.downloadMb.single ?? "n/a"} MB, phone levels ${rep.downloadMb.phone ?? "n/a"} MB.` }));
        for (const cost of rep.costs) results.append(el("p", { textContent: `${capital(cost.preset)} · ${VIEW_TEXT[cost.view]} · phone level ${cost.level ?? "n/a"} − level 0: ${ms(cost.frameMsP50)} ms frame p50, ${ms(cost.frameMsP95)} ms frame p95, ${ms(cost.gpuMsP50)} ms GPU p50, ${ms(cost.gpuMsP95)} ms GPU p95.` }));
        continue;
      }
      if (rep.kind === "triangles") {
        renderTriangles(rep);
        continue;
      }
      if (rep.kind === "cast") {
        renderCast(rep);
        continue;
      }
      if (rep.kind === "soak") {
        renderSoak(rep);
        continue;
      }
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
    empty.hidden = has;
    outRow.hidden = !has;
  };

  const setRunning = (on: boolean) => {
    running = on;
    sweepBtn.disabled = ceilingBtn.disabled = trianglesBtn.disabled = castBtn.disabled = soakBtn.disabled = furBtn.disabled = levelsBtn.disabled = runAllBtn.disabled = on;
    sweepBtn.hidden = ceilingBtn.hidden = trianglesBtn.hidden = castBtn.hidden = soakBtn.hidden = furBtn.hidden = levelsBtn.hidden = on;
    stopBtn.hidden = !on;
    panel.classList.toggle("running", on);
    if (!on) draft = { ...lab.status().config };
    if (!on) runBar.style.width = "0";
    for (const c of controls) (c as HTMLButtonElement).disabled = on;
  };
  function paintHead() {
    const s = lab.status();
    const changed = pending().length;
    const waited = applyingSince ? `${((performance.now() - applyingSince) / 1000).toFixed(1)} s` : "";
    if (applyingSince) headSub.textContent = `Applying ${applyingName} · ${waited}`;
    else {
      const name = presetOf(s.config);
      headSub.textContent = `${name ? capital(name) : "Custom"} · ${VIEW_TEXT[s.view]} · ${capital(s.state)}${changed ? ` · ${changed} pending` : ""}`;
    }
    chip.hidden = !applyingSince;
    chip.textContent = applyingSince ? `Applying ${applyingName} · ${waited}` : "";
    // The action bar: Apply and Discard while there is a draft or a rebuild, the runs otherwise.
    const drafting = !running && (changed > 0 || applyingSince > 0);
    applyBtn.hidden = !drafting;
    discardBtn.hidden = !drafting || changed === 0;
    sweepBtn.hidden = ceilingBtn.hidden = trianglesBtn.hidden = castBtn.hidden = soakBtn.hidden = furBtn.hidden = levelsBtn.hidden = drafting || running;
    runAllBtn.disabled = drafting || running;
    applyBtn.disabled = applyingSince > 0;
    applyBtn.textContent = applyingSince ? `Applying · ${waited}` : `Apply ${changed} change${changed === 1 ? "" : "s"}`;
  }
  function syncAll() {
    refreshStatus();
    view.sync();
    state.sync();
    preset.sync();
    coat.sync();
    furMode.sync();
    levelMode.sync();
    motion.sync();
    for (const f of knobSyncs) f();
    paintHead();
    const name = presetOf(draft);
    presetHint.textContent = name ? "" : "Custom: your switches no longer match a preset.";
  }

  let abort: AbortController | null = null;
  stopBtn.addEventListener("click", () => abort?.abort());

  // A phone that locks its screen suspends the page and kills a run: hold a screen wake lock while one is going.
  // biome-ignore lint/suspicious/noExplicitAny: WakeLockSentinel is not in every DOM lib yet.
  let wake: any = null;
  const holdScreen = async (on: boolean) => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: navigator.wakeLock is optional.
      if (on && !wake) wake = await (navigator as any).wakeLock?.request("screen");
      if (!on && wake) {
        await wake.release();
        wake = null;
      }
    } catch {
      // No wake lock (older browser, or the page is hidden): the run goes on, the hint says to keep the screen on.
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && running) void holdScreen(true);
  });

  const track = async <R extends Report>(name: string, run: (o: RunOptions) => Promise<R>, userOpts: RunOptions = {}): Promise<R> => {
    if (running) throw new Error("a run is already in progress");
    void holdScreen(true);
    abort = new AbortController();
    const signal = userOpts.signal ? AbortSignal.any([abort.signal, userOpts.signal]) : abort.signal;
    setRunning(true);
    progress.textContent = `${name}: starting`;
    try {
      const rep = await run({
        ...userOpts,
        signal,
        onStep: (r, i, n) => {
          progress.textContent = `${name}: ${i + 1} of ${n} · ${r.label}`;
          runBar.style.width = `${Math.round(((i + 1) / n) * 100)}%`;
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
      if (!chained) void holdScreen(false);
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

  // Run everything: the sweep, then the ceiling (ranked by the sweep's costs), then the triangle budget, then Send.
  let chained = false;
  const runAll = async () => {
    chained = true;
    try {
      await doSweep();
      const ceiling = abort?.signal.aborted ? null : await doCeiling();
      // The cast budget and the soak hold the ceiling's effects (the game's best case on this device) when it held.
      const best = ceiling?.held ? { ...ceiling.ceiling } : undefined;
      if (!abort?.signal.aborted) await doTriangles();
      if (!abort?.signal.aborted) await doCast(best ? { base: best } : {});
      if (!abort?.signal.aborted) await doFur(best ? { base: best } : {});
      if (!abort?.signal.aborted) await doLevels();
      if (!abort?.signal.aborted) await doSoak(best ? { config: best } : {});
    } finally {
      chained = false;
      void holdScreen(false);
    }
    copyBtn.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  runAllBtn.addEventListener("click", () => void runAll().catch((e) => (progress.textContent = String(e))));
  sweepBtn.addEventListener("click", () => void doSweep().catch((e) => (progress.textContent = String(e))));
  ceilingBtn.addEventListener("click", () => void doCeiling().catch((e) => (progress.textContent = String(e))));
  const doTriangles = (o: TriangleOptions = {}) => track("Triangle budget", (opts) => findTriangleBudget(lab, opts), o);
  trianglesBtn.addEventListener("click", () => void doTriangles().catch((e) => (progress.textContent = String(e))));
  const lastCeiling = () => [...reports].reverse().find((r): r is CeilingReport => r.kind === "ceiling" && r.held);
  const doCast = (o: CastOptions = {}) => track("Cast budget", (opts) => findCastBudget(lab, { ...o, ...opts }), o);
  castBtn.addEventListener("click", () => {
    const c = lastCeiling();
    void doCast(c ? { base: { ...c.ceiling } } : {}).catch((e) => (progress.textContent = String(e)));
  });
  const doSoak = (o: SoakOptions = {}) => track("Soak", (opts) => runSoak(lab, { ...o, ...opts }), o);
  soakBtn.addEventListener("click", () => {
    const c = lastCeiling();
    void doSoak(c ? { config: { ...c.ceiling } } : {}).catch((e) => (progress.textContent = String(e)));
  });

  const doFur = (o: FurComparisonOptions = {}) => track("Fur comparison", (opts) => compareFur(lab, { ...o, ...opts }), o);
  furBtn.addEventListener("click", () => void doFur().catch((e) => (progress.textContent = String(e))));

  const doLevels = (o: LevelsComparisonOptions = {}) => track("Levels comparison", (opts) => compareLevels(lab, { ...o, ...opts }), o);
  levelsBtn.addEventListener("click", () => void doLevels().catch((e) => (progress.textContent = String(e))));

  scroll.append(status, sceneSection, presetSection, coatSection, effects, resultsSection);
  render();
  syncAll();

  (globalThis as unknown as { labRunner: unknown }).labRunner = {
    runSweep: doSweep,
    findCeiling: doCeiling,
    findTriangleBudget: doTriangles,
    findCastBudget: doCast,
    runSoak: doSoak,
    compareFur: doFur,
    compareLevels: doLevels,
    reports: () => [...reports],
    /** Exactly what Copy results puts on the clipboard. */
    copied: () => slimJson(reports),
  };
}
