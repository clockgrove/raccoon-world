// Writes the quality lab's measured tables into docs/design/quality-lab.md (issue 45) from the JSON the page sends
// back (its "Send results" issue, "Copy JSON" or "Download JSON"), saved under spikes/quality-lab/results/.
//
//   node spikes/quality-lab/scripts/report.mjs [file.json ...]   (default: every spikes/quality-lab/results/*.json)
//
// Per platform: the effects ranked by cost (from the sweep), the presets' frame times, and the ceiling (from the
// ceiling search); then the gap between the desktop and phone ceilings. Software-GPU runs never count: they are
// skipped. A platform with no real-device run is marked pending.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const lab = fileURLToPath(new URL("..", import.meta.url));
const repo = path.resolve(lab, "../..");
const DOC = path.join(repo, "docs/design/quality-lab.md");
const RESULTS = path.join(lab, "results");
const { KNOB_LABELS, KNOBS, LEVELS, budgetMs } = await import(pathToFileURL(path.join(lab, "src/config.ts")).href);

const ms = (v) => (v == null ? "n/a" : `${Math.round(v * 100) / 100}`);
const PLATFORMS = [
  ["desktop", "Desktop (Kirk's)"],
  ["phone", "Phone (Kirk's)"],
];

async function load(files) {
  const reports = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    for (const r of Array.isArray(parsed) ? parsed : [parsed]) if (r && (r.kind === "sweep" || r.kind === "ceiling")) reports.push({ ...r, file: path.relative(repo, file) });
  }
  return reports.filter((r) => !r.software);
}

/** The knobs a ceiling holds below their top level, as "Fur shells 8" or "no Volumetric haze". */
function trimmed(config) {
  return KNOBS.filter((k) => config[k] !== LEVELS[k][0]).map((k) => (typeof config[k] === "boolean" ? `no ${KNOB_LABELS[k]}` : `${KNOB_LABELS[k]} ${config[k]}`));
}

function platformSection(platform, title, reports) {
  const sweep = reports.filter((r) => r.kind === "sweep" && r.platform === platform).at(-1);
  const ceiling = reports.filter((r) => r.kind === "ceiling" && r.platform === platform).at(-1);
  const out = [`### ${title}`, ""];
  if (!sweep && !ceiling) {
    out.push(`_Pending: Kirk's ${platform} run. Open the lab on the ${platform}, press **Run the sweep** and **Find the ceiling**, then **Send results**._`, "");
    return { out, ceiling: null };
  }
  const source = sweep ?? ceiling;
  out.push(`${source.backend}, ${source.adapter}${sweep?.userAgent ? `; ${sweep.userAgent}` : ""} (from \`${source.file}\`).`, "");
  if (sweep) {
    out.push("Effects ranked by cost (each on top of Medium; GPU ms where the adapter has timestamp queries):", "", "| Rank | Effect | Config | GPU ms | p95 frame ms |", "| --- | --- | --- | --- | --- |");
    const costs = [...sweep.costs].sort((a, b) => (b.gpuMsP50 ?? b.frameMsP95 ?? -1e9) - (a.gpuMsP50 ?? a.frameMsP95 ?? -1e9));
    costs.forEach((c, i) => out.push(`| ${i + 1} | ${KNOB_LABELS[c.knob]} | ${c.label} | ${ms(c.gpuMsP50)} | ${ms(c.frameMsP95)} |`));
    out.push("", "| Config | Frame p50 / p95 ms | GPU p50 / p95 ms | DPR |", "| --- | --- | --- | --- |");
    for (const s of sweep.steps.filter((s) => s.id.startsWith("preset:"))) {
      const m = s.measurement;
      out.push(`| ${s.label} | ${m ? `${ms(m.frameMsP50)} / ${ms(m.frameMsP95)}` : s.error ?? "n/a"} | ${m ? `${ms(m.gpuMsP50)} / ${ms(m.gpuMsP95)}` : "n/a"} | ${s.dpr} |`);
    }
    out.push("");
  } else out.push("_Sweep pending._", "");
  if (ceiling) {
    const removed = ceiling.steps.filter((s) => s.removed);
    out.push(
      `Ceiling (budget p95 ≤ ${ms(ceiling.budgetMs ?? budgetMs(platform))} ms): ${ceiling.held ? "held" : "**not held** even at the cheapest config"} at ${trimmed(ceiling.ceiling).length ? `Ultra trimmed to: ${trimmed(ceiling.ceiling).join(", ")}` : "full Ultra (nothing removed)"}.`,
      "",
    );
    if (removed.length) {
      out.push("| Step | Removed | p95 saved ms | GPU saved ms |", "| --- | --- | --- | --- |");
      removed.forEach((s, i) => out.push(`| ${i + 1} | ${KNOB_LABELS[s.removed.knob]}: ${s.removed.from} → ${s.removed.to} | ${ms(s.removed.frameMsP95Saved)} | ${ms(s.removed.gpuMsSaved)} |`));
      out.push("");
    }
  } else out.push("_Ceiling pending._", "");
  return { out, ceiling };
}

export async function writeReport(files) {
  const reports = await load(files);
  const lines = [];
  const ceilings = {};
  for (const [platform, title] of PLATFORMS) {
    const { out, ceiling } = platformSection(platform, title, reports);
    lines.push(...out);
    ceilings[platform] = ceiling;
  }
  lines.push("### The gap between the desktop and phone ceilings", "");
  if (ceilings.desktop && ceilings.phone) {
    const gap = KNOBS.filter((k) => ceilings.desktop.ceiling[k] !== ceilings.phone.ceiling[k]);
    if (!gap.length) lines.push("None: the phone holds the desktop's ceiling.", "");
    else {
      lines.push("| Effect | Desktop | Phone |", "| --- | --- | --- |");
      for (const k of gap) lines.push(`| ${KNOB_LABELS[k]} | ${ceilings.desktop.ceiling[k]} | ${ceilings.phone.ceiling[k]} |`);
      lines.push("");
    }
  } else lines.push("_Pending until both ceilings are measured._", "");
  const doc = await readFile(DOC, "utf8");
  const next = doc.replace(/<!-- lab:results:start -->[\s\S]*<!-- lab:results:end -->/u, `<!-- lab:results:start -->\n${lines.join("\n").trim()}\n<!-- lab:results:end -->`);
  await writeFile(DOC, next);
  return reports.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let files = process.argv.slice(2).map((f) => path.resolve(f));
  if (!files.length) files = (await readdir(RESULTS).catch(() => [])).filter((f) => f.endsWith(".json")).map((f) => path.join(RESULTS, f));
  const used = await writeReport(files);
  console.log(`quality-lab report: ${used} real-device report(s) from ${files.length} file(s) written to docs/design/quality-lab.md`);
}
