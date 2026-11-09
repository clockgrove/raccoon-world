#!/usr/bin/env node
// Publishes a run's contact sheets into the report (docs/reports/stevie-character-rendering/): copies the sheets
// the report shows into shots/ and writes results.json (the run's record, every shot's backend, renderer string,
// zoom, pixel ratio, visible pixels and sha256) and provenance.json (each published image's sha256, inputs,
// licence, credit and IPTC digital source type).
//
// Usage: node spikes/stevie-3d/scripts/publish.mjs <run-dir>     (a `stevie.mjs --mode full` output directory)
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const report = path.join(repo, "docs/reports/stevie-character-rendering");
const run = path.resolve(process.argv[2] ?? "");
const results = JSON.parse(await readFile(path.join(run, "results.json"), "utf8"));
if (results.mode !== "full") throw new Error(`${run} is a ${results.mode} run; publish a full run`);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const MESHY_CREDIT = "3D model generated with Meshy (meshy.ai)";

// Arms and their records, from the first backend's summary (every backend runs the same arms).
const summary = Object.values(results.backends)[0];
const arms = new Map(summary.arms.map((arm) => [arm.name, arm]));
/** The arms a sheet shows: `sheet-<arm>-<state>-<backend>`, `zoom-<arm>-…`, or `routes-…` (every route arm). */
function sheetArms(name) {
  if (name.startsWith("routes-")) return [...arms.keys()].filter((arm) => arm.startsWith("route:"));
  const match = /^(?:sheet|zoom)-(.+)-(?:dusk-rain|night)-(?:webgpu|webgl2)$/u.exec(name);
  return match ? [match[1]] : [];
}

const shots = path.join(report, "shots");
await rm(shots, { recursive: true, force: true });
await mkdir(shots, { recursive: true });
const images = [];
for (const sheet of results.sheets) {
  const shown = sheetArms(sheet.name);
  if (shown.length === 0 || shown.some((arm) => !arms.has(arm))) continue; // the control arm is never published
  const file = `${sheet.name}.png`;
  await copyFile(path.join(run, sheet.path), path.join(shots, file));
  const bytes = await readFile(path.join(shots, file));
  const licences = new Set(shown.map((arm) => arms.get(arm).licence));
  const credits = [...new Set(shown.map((arm) => arms.get(arm).credit).filter(Boolean))];
  images.push({
    file: `shots/${file}`,
    sha256: sha256(bytes),
    width: sheet.width,
    height: sheet.height,
    arms: shown,
    inputs: Object.fromEntries(
      [...new Set(shown.flatMap((arm) => arms.get(arm).inputs))].map((input) => [input, results.inputs[input]]),
    ),
    // A sheet with any CC BY 4.0 render (Meshy) is CC BY 4.0 as a whole and carries Meshy's credit.
    license: licences.has("CC-BY-4.0") ? "CC-BY-4.0" : "MIT",
    credit: credits.length ? credits.join("; ") : null,
    digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia",
    madeBy: `spikes/stevie-3d/scripts/stevie.mjs, Clockgrove ${results.clockgrove}, ${results.label}`,
  });
}
for (const image of images)
  if (image.license === "CC-BY-4.0" && image.credit !== MESHY_CREDIT)
    throw new Error(`${image.file}: a CC BY 4.0 image must carry "${MESHY_CREDIT}"`);
const scrub = (value) => String(value).replaceAll(os.tmpdir(), "<tmp>").replaceAll(os.homedir(), "~");
await writeFile(
  path.join(report, "results.json"),
  `${JSON.stringify({ ...results, browserArgs: results.browserArgs?.map(scrub), browser: scrub(results.browser) }, null, 1)}\n`,
);
await writeFile(
  path.join(report, "provenance.json"),
  `${JSON.stringify({ run: { clockgrove: results.clockgrove, label: results.label, started: results.started, finished: results.finished }, images }, null, 2)}\n`,
);
console.log(`published ${images.length} sheets to ${path.relative(repo, shots)} (${(await readdir(shots)).length} files)`);
