#!/usr/bin/env node
// Raccoon World's art checks, run by `bash scripts/assetforge.sh check`. No paid model call, no key:
// Assetforge and Clockgrove run for real from their pinned checkouts; only the model provider is
// scripted (art/proof/provider.mjs).
//
// 1. bible:       art/style-bible.json is exactly what art/tools/derive-bible.mjs derives from the
//                 Markdown bible, and the bible keeps its anchors and identity locks as decided.
// 2. style:       the target profile's style matches the Clockgrove style profile
//                 (reference/asset-style.json), and its palette value is the bible's palette.
// 3. inputs:      each of Stevie's six families has its spec, brief and run settings, and one run
//                 (up to 4 candidates) forecasts at no more than $5 in an offline dry run.
// 4. placeholders: Clockgrove's asset check accepts the approved placeholder set, its atlas, its
//                 licence report and its approved golden scene (in a throwaway copy).
// 5. proof:       an offline Assetforge run writes Stevie's shelter strip into a throwaway copy of
//                 this repository and Clockgrove's validator accepts it on the first try, with
//                 review pending and complete provenance; a short sheet is refused, never padded.
// 6. licences:    every committed manifest's licence is the licence REUSE.toml gives its source file,
//                 so a CC-BY-4.0 pick can't land under the `**` MIT annotation.
// 7. gracie:      Gracie's bible subject leads with her signature fur, her photos and approved views
//                 are her subject's references, her approved turnaround is Kirk's pick (c1) with its
//                 hashes and output grant, her character-3d spec names her subject and gait and the
//                 pinned Assetforge's character-3d reader accepts it, and her turnaround run forecasts within its $5 cap (issue 50).
//
// ASSETFORGE_DIR and CLOCKGROVE_DIR name the pinned checkouts (defaults .assetforge-src, .clockgrove).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { deriveBible, DERIVED } from "./derive-bible.mjs";
import { forecast, loadRun, pending, ROUTE, VIEWS } from "./turnaround.mjs";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const assetforgeDir = resolve(process.env.ASSETFORGE_DIR ?? join(root, ".assetforge-src"));
const clockgroveDir = resolve(process.env.CLOCKGROVE_DIR ?? join(root, ".clockgrove"));
export const FAMILIES = ["idle", "walk", "sniff", "eat", "play", "shelter"];
const MAX_RUN_USD = 5;
const MAX_CANDIDATES = 4;
const IPTC_GENERATED = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

const failures = [];
const fail = (check, message) => failures.push(`${check}: ${message}`);
const json = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const env = { ...process.env, NODE_NO_WARNINGS: "1", CLOCKGROVE_DIR: clockgroveDir };
delete env.AI_GATEWAY_API_KEY; // no paid call can be made, whatever the caller's environment holds

async function pinned(dir, pinFile, fetch) {
  const pin = (await readFile(join(root, pinFile), "utf8")).trim();
  const marker = await readFile(join(dir, ".raccoon-world-pin"), "utf8").catch(() => "");
  if (marker.trim() !== pin) throw new Error(`no ${pinFile} ${pin} checkout in ${dir}; run ${fetch}`);
}

/** Runs the pinned Assetforge CLI with --json; resolves to { code, doc, stderr } whatever the exit. */
async function assetforge(args, extraEnv = {}) {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [join(assetforgeDir, "src/cli.ts"), ...args, "--json"],
      { cwd: root, env: { ...env, ...extraEnv }, maxBuffer: 64 << 20 },
    );
    return { code: 0, doc: JSON.parse(stdout), stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    let doc;
    try {
      doc = JSON.parse(error.stdout);
    } catch {
      doc = undefined;
    }
    return { code: error.code, doc, stderr: error.stderr };
  }
}

/** A throwaway copy of this repository's working tree: tracked and unignored files only. */
async function throwawayCopy(label) {
  const dir = await mkdtemp(join(tmpdir(), `raccoon-world-${label}-`));
  const { stdout } = await run("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: root,
    maxBuffer: 64 << 20,
  });
  for (const file of stdout.split("\0").filter(Boolean))
    await cp(join(root, file), join(dir, file), { recursive: true }).catch((error) => {
      if (error.code !== "ENOENT") throw error; // a tracked file deleted in the working tree
    });
  return dir;
}

async function checkBible() {
  const fresh = await deriveBible(assetforgeDir);
  const committed = await readFile(DERIVED, "utf8").catch(() => "");
  if (committed !== fresh)
    fail("bible", "art/style-bible.json differs from art/style-bible.md; run node art/tools/derive-bible.mjs");
  const described = await assetforge(["bible", "describe", "--bible", "art/style-bible.md"]);
  if (described.code !== 0) {
    fail("bible", `Assetforge refused art/style-bible.md: ${described.doc?.error?.message ?? described.stderr}`);
    return;
  }
  const bible = described.doc;
  const unapproved = ["references/stevie/77-3d/", "references/jimothy/assetforge-38-proof/", "references/stevie/comparison-candidates/"];
  for (const anchor of bible.anchors.positive)
    if (unapproved.some((prefix) => anchor.path.includes(prefix)))
      fail("bible", `unapproved material is a positive anchor: ${anchor.path}`);
  if (bible.perspective !== "../docs/design/reference/raccoon-world-reference.png")
    fail("bible", "the perspective reference must be the owner's mockup");
  const locks = bible.identities;
  const expected = {
    stevie: {
      turnaround: "../references/stevie/turnaround-three-quarter.png",
      references: [
        "../references/stevie/turnaround-front.png",
        "../references/stevie/turnaround-side.png",
        "../references/stevie/turnaround-back.png",
      ],
    },
    jimothy: {
      turnaround: "../references/jimothy/sheet-cell-03.png",
      references: ["../references/jimothy/jimothy-peanut-painted.png"],
    },
    // Kirk's pick, c1 (#50, 2026-11-11), its approved views only (photos stay subject anchors); not part of the 0.68 measurement, scored in shadow mode only.
    gracie: {
      turnaround: "../references/gracie/turnaround-three-quarter.png",
      references: [
        "turnaround-front.png", "turnaround-side.png", "turnaround-back.png",
      ].map((f) => `../references/gracie/${f}`),
    },
  };
  if (Object.keys(locks).sort().join() !== "gracie,jimothy,stevie")
    fail("bible", `identity locks must be exactly stevie, jimothy and gracie, not ${Object.keys(locks)}`);
  for (const [name, lock] of Object.entries(expected)) {
    const actual = locks[name];
    if (
      actual?.turnaround !== lock.turnaround ||
      JSON.stringify(actual?.references ?? []) !== JSON.stringify(lock.references)
    )
      fail("bible", `identity lock ${name} must be the decided set: ${lock.turnaround} ${lock.references}`);
  }
}

async function checkGracie() {
  const bible = await json("art/style-bible.json");
  const description = bible.subjects?.gracie?.description ?? "";
  // Her signature leads: the first clause after her name is her lower-body fur.
  if (!/^Gracie, [^;]*lower body[^;]*lighter, greyer, noticeably longer and shaggier fur than her back;/.test(description))
    fail("gracie", `her subject description must lead with her signature lower-body fur: ${description}`);
  for (const trait of ["full dark eye mask", "pale brows", "pale muzzle", "pale-rimmed ears", "ringed tail"])
    if (!description.includes(trait)) fail("gracie", `her subject description lacks: ${trait}`);
  const references = bible.references.filter((r) => r.subject === "gracie").map((r) => r.path).sort();
  const expected = [
    "gracie-ice-cube.png", "gracie-lounging.png", "gracie-sleeping.png",
    "turnaround-back.png", "turnaround-front.png", "turnaround-side.png", "turnaround-three-quarter.png",
  ].map((f) => `../references/gracie/${f}`);
  if (JSON.stringify(references) !== JSON.stringify(expected))
    fail("gracie", `her references must be her photos and her four approved views: ${references}`);
  // Her approved turnaround is Kirk's pick, c1: the same bytes as the candidate, with its provenance.
  const approved = await json("references/gracie/provenance-turnaround.json");
  if (approved.approval?.picked !== "c1" || approved.call?.candidate !== "c1" || approved.call?.status !== "done")
    fail("gracie", "references/gracie/provenance-turnaround.json must record Kirk's pick, c1, and its call");
  if (approved.outputGrant?.license !== ROUTE.outputGrant?.license || approved.digitalSourceType !== IPTC_GENERATED)
    fail("gracie", "her approved turnaround must record its output grant and IPTC trainedAlgorithmicMedia");
  for (const name of ["turnaround.png", ...VIEWS.map((view) => `turnaround-${view}.png`)]) {
    const record = approved.files?.[name];
    const bytes = await readFile(join(root, "references/gracie", name)).catch(() => null);
    const candidate = await readFile(join(root, "references/gracie/turnaround-candidates/c1", name)).catch(() => null);
    const sha = (b) => b && createHash("sha256").update(b).digest("hex");
    if (!record || !bytes || sha(bytes) !== record.sha256 || sha(bytes) !== sha(candidate) || record.outputGrant?.license !== ROUTE.outputGrant?.license)
      fail("gracie", `references/gracie/${name} must be c1's ${name}, recorded with its hash and output grant`);
  }
  const spec = await json("art/gracie/character-3d/spec.json");
  if (spec.kind !== "character-3d" || spec.subject !== "gracie" || spec.gait !== "quadruped")
    fail("gracie", "art/gracie/character-3d/spec.json must be kind character-3d, subject gracie, gait quadruped");
  // The pinned Assetforge's own character-3d reader must accept the spec (gait, clips, height).
  const { characterSpec } = await import(pathToFileURL(join(assetforgeDir, "src/model3d/profile.ts")).href);
  try {
    characterSpec(spec);
  } catch (error) {
    fail("gracie", `Assetforge's character-3d reader refuses art/gracie/character-3d/spec.json: ${error.message}`);
  }
  const turnaround = await loadRun("gracie");
  if (turnaround.capUsd !== MAX_RUN_USD) fail("gracie", `the turnaround run's cap must be $${MAX_RUN_USD}`);
  try {
    forecast({ calls: [] }, turnaround, pending({ calls: [] }, turnaround.candidates));
  } catch (error) {
    fail("gracie", error.message);
  }
  if (ROUTE.outputGrant?.license !== "LicenseRef-openai-api" || ROUTE.outputGrant.relabel !== true || ROUTE.digitalSourceType !== IPTC_GENERATED)
    fail("gracie", "the turnaround route must record OpenAI's relabellable output grant and IPTC trainedAlgorithmicMedia");
  if (VIEWS.join() !== "front,three-quarter,side,back") fail("gracie", `the turnaround views must be the four views: ${VIEWS}`);
}

async function checkStyle() {
  const profile = await json("art/target-profile.json");
  const clockgrove = await json("reference/asset-style.json");
  const style = profile.style ?? {};
  const pairs = [
    ["alpha mode", style.alpha?.mode, clockgrove.alpha?.mode],
    ["alpha threshold (bounds)", style.alpha?.threshold, clockgrove.alpha?.boundsThreshold],
    ["colour rule", style.color?.rule === "full" ? "unrestricted" : style.color?.rule, clockgrove.colour?.mode],
  ];
  for (const [what, ours, theirs] of pairs)
    if (ours !== theirs)
      fail("style", `art/target-profile.json ${what} is ${ours}, reference/asset-style.json says ${theirs}`);
  if (style.edges !== "antialiased" || clockgrove.alpha?.mode !== "soft")
    fail("style", "antialiased edges need soft alpha in both profiles");
  const actor = clockgrove.sizes?.actor;
  if (!actor || profile.frames.width > actor.maxWidth || profile.frames.height > actor.maxHeight)
    fail("style", `the profile's ${profile.frames.width}x${profile.frames.height} frame exceeds the actor limit`);
  const bible = await json("art/style-bible.json");
  if (JSON.stringify(profile.values?.palette) !== JSON.stringify([...bible.palette].sort()))
    fail("style", "art/target-profile.json values.palette must be the bible's palette, sorted");
  if (profile.identity?.mode !== "shadow" || profile.identity?.threshold !== 0.68)
    fail("style", "identity scoring must stay in shadow mode at the owner's 0.68 threshold");
}

/** One run's forecast per family: candidates × one sheet's dry-run forecast, plus its QA calls. */
async function checkInputs(qaPerCandidateUsd) {
  const forecasts = {};
  for (const family of FAMILIES) {
    const dir = `art/stevie/${family}`;
    let spec, settings;
    try {
      [spec, settings] = [await json(`${dir}/spec.json`), await json(`${dir}/run.json`)];
      await json(`${dir}/brief.json`);
    } catch (error) {
      fail("inputs", `${dir}: ${error.message}`);
      continue;
    }
    if (spec.assetId !== "stevie" || spec.animationFamily !== family || spec.kind !== "sprite-sheet")
      fail("inputs", `${dir}/spec.json must be Stevie's ${family} sprite sheet`);
    if (spec.keyPose !== undefined) fail("inputs", `${dir}/spec.json: the sheet path takes no key pose`);
    if (!(settings.candidates >= 1 && settings.candidates <= MAX_CANDIDATES) || !(settings.capUsd <= MAX_RUN_USD))
      fail("inputs", `${dir}/run.json: at most ${MAX_CANDIDATES} candidates and $${MAX_RUN_USD}`);
    const perCandidateCap = settings.capUsd / settings.candidates;
    const dry = await assetforge([
      "generate-sheet", "--spec", `${dir}/spec.json`, "--bible", "art/style-bible.json",
      "--profile", "art/target-profile.json", "--lock-bible", "art/style-bible.md",
      "--cap", String(perCandidateCap), "--dry-run",
    ]);
    if (dry.code !== 0) {
      fail("inputs", `${family}: dry run refused: ${dry.doc?.error?.message ?? dry.stderr}`);
      continue;
    }
    const forecast = settings.candidates * (dry.doc.plan.estimateUsd + qaPerCandidateUsd);
    forecasts[family] = Math.round(forecast * 1000) / 1000;
    if (forecast > settings.capUsd + 1e-9)
      fail("inputs", `${family}: one run forecasts $${forecast.toFixed(3)}, over its $${settings.capUsd} cap`);
  }
  return forecasts;
}

async function checkPlaceholders() {
  const copy = await throwawayCopy("placeholders");
  try {
    const { stdout } = await run(
      process.execPath,
      [join(clockgroveDir, "packages/assets/bin/clockgrove-assets.mjs"), "check", "--world", copy],
      { env, maxBuffer: 16 << 20 },
    );
    return stdout.trim();
  } catch (error) {
    fail("placeholders", `Clockgrove's asset check refused:\n${error.stderr ?? error.message}`);
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
}

/** REUSE.toml's annotations, in file order: { paths: [glob], precedence, license }. */
export function reuseAnnotations(text) {
  return text.split(/^\[\[annotations\]\]\s*$/m).slice(1).map((block) => {
    const pathLine = block.match(/^path\s*=\s*(.+)$/m)?.[1] ?? "";
    return {
      paths: [...pathLine.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
      precedence: block.match(/^precedence\s*=\s*"([^"]+)"/m)?.[1] ?? "closest",
      license: block.match(/^SPDX-License-Identifier\s*=\s*"([^"]+)"/m)?.[1],
    };
  });
}

const globRegex = (glob) =>
  new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*")}$`);

/** The licence REUSE.toml gives a path: the last matching override, else the last match. */
export function reuseLicense(annotations, path) {
  const matches = annotations.filter((a) => a.paths.some((g) => globRegex(g).test(path)));
  const overrides = matches.filter((a) => a.precedence === "override");
  return (overrides.at(-1) ?? matches.at(-1))?.license;
}

/** Problems where a manifest's licence differs from REUSE.toml's licence for its source file. */
export function licenceMismatches(manifests, reuseText) {
  const annotations = reuseAnnotations(reuseText);
  return manifests
    .map((m) => ({ m, reuse: reuseLicense(annotations, m.source.path) }))
    .filter(({ m, reuse }) => reuse !== m.license)
    .map(({ m, reuse }) =>
      `${m.source.path} is ${m.license} in its manifest but ${reuse ?? "unannotated"} in REUSE.toml; add an override annotation for it`);
}

async function checkLicences() {
  const reuse = await readFile(join(root, "REUSE.toml"), "utf8");
  const manifests = [];
  for (const asset of await readdir(join(root, "assets/manifests")))
    for (const file of await readdir(join(root, "assets/manifests", asset)))
      if (file.endsWith(".json")) manifests.push(await json(`assets/manifests/${asset}/${file}`));
  for (const problem of licenceMismatches(manifests, reuse)) fail("licences", problem);
  // The check itself: a CC-BY-4.0 strip under only the `**` MIT annotation must be caught.
  const ccBy = { license: "CC-BY-4.0", source: { path: "assets/source/stevie/shelter.png" } };
  if (licenceMismatches([ccBy], reuse).length !== 1)
    fail("licences", "a CC-BY-4.0 strip without a REUSE override annotation was not caught");
  return manifests.length;
}

async function proof() {
  const target = await throwawayCopy("proof");
  const imports = await mkdtemp(join(tmpdir(), "raccoon-world-imports-"));
  const sheetArgs = [
    "generate-sheet", "--spec", "art/stevie/shelter/spec.json", "--bible", "art/style-bible.json",
    "--profile", "art/target-profile.json", "--lock-bible", "art/style-bible.md",
    "--cap", "1.25", "--imports", imports, "--provider-script", "art/proof/provider.mjs",
  ];
  try {
    // A short sheet is refused loudly (exit 5) and nothing reaches the target.
    const short = await assetforge(sheetArgs, { PROOF_SHEET_FIGURES: "3" });
    if (short.code !== 5 || short.doc?.error?.code !== "qa_found_nothing")
      fail("proof", `a 3-figure sheet for a 4-frame spec must be refused with exit 5, got ${short.code}`);

    const sheet = await assetforge(sheetArgs);
    if (sheet.code !== 0) {
      fail("proof", `generate-sheet failed: ${sheet.doc?.error?.message ?? sheet.stderr}`);
      return;
    }
    const importDir = sheet.doc.importDir;
    if (sheet.doc.grouping?.status !== "proposed") fail("proof", "Assetforge must only propose a grouping");
    const written = await assetforge([
      "write-families", "--import", importDir, "--grouping", "art/proof/grouping.json", "--target", target,
    ]);
    const family = written.doc?.families?.[0];
    if (written.code !== 0 || family?.result?.validator?.accepted !== true) {
      fail(
        "proof",
        `Clockgrove did not accept the strip on the first try (exit ${written.code}):\n` +
          (family?.result?.validator?.output ?? written.doc?.error?.message ?? written.stderr),
      );
      return;
    }
    const manifest = JSON.parse(await readFile(join(target, "assets/manifests/stevie/shelter.json"), "utf8"));
    const provenance = JSON.parse(
      await readFile(join(target, "assets/source/stevie/shelter.png.provenance.json"), "utf8"),
    );
    const png = await readFile(join(target, manifest.source.path));
    const spec = await json("art/stevie/shelter/spec.json");
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const p = manifest.provenance;
    const expectations = [
      ["review pending", manifest.review.status === "pending" && manifest.review.reviewer === null],
      ["generated source", manifest.source.kind === "generated"],
      ["MIT as Clockgrove work", manifest.license === "MIT" && manifest.source.creator === "Clockgrove"],
      ["model, provider, route, terms version", ["model", "provider", "route", "providerTermsVersion"].every((k) => typeof p[k] === "string" && p[k].length > 0)],
      ["commercial grant that allows relabelling", p.outputGrant?.commercial === true && p.outputGrant?.relabel === true],
      ["IPTC trainedAlgorithmicMedia in provenance", provenance.digitalSourceType === IPTC_GENERATED],
      ["IPTC trainedAlgorithmicMedia in the PNG", png.includes(Buffer.from("trainedAlgorithmicMedia"))],
      ["identity scored in shadow mode at 0.68, nothing filtered", provenance.identity?.mode === "shadow" && provenance.identity?.threshold === 0.68 && provenance.identity?.filtered === false],
      ["only scripted calls, nothing spent", provenance.calls.every((c) => c.route.startsWith("scripted:")) && provenance.costUsd === 0],
      ["the spec's atlas slot", same(manifest.atlas, spec.fields.atlas)],
      ["the spec's accessibility label", manifest.accessibilityLabel === spec.fields.accessibilityLabel],
      ["the spec's semantic and footprint", same(manifest.semantic, spec.fields.semantic) && same(manifest.footprint, spec.fields.footprint)],
      ["the strip's frame grid", manifest.frames.width === 32 && manifest.frames.height === 32 && manifest.frames.count === 4],
    ];
    for (const [what, ok] of expectations) if (!ok) fail("proof", `the written strip lacks: ${what}`);
    const { stdout: attr } = await run("git", ["check-attr", "filter", "--", manifest.source.path], { cwd: root });
    if (!attr.trim().endsWith(": lfs")) fail("proof", `${manifest.source.path} is not stored in Git LFS by .gitattributes`);
    const reuse = await readFile(join(root, "REUSE.toml"), "utf8");
    if (!/path = "\*\*"[\s\S]*?SPDX-License-Identifier = "MIT"/.test(reuse))
      fail("proof", "REUSE.toml no longer covers generated assets as MIT");
    for (const problem of licenceMismatches([manifest], reuse)) fail("proof", problem);
    // Agent QA's vision checks for one candidate, forecast offline on the written strip.
    const qa = await assetforge([
      "animation-qa", "--strip", join(target, manifest.source.path), "--profile", "art/target-profile.json",
      "--family", "shelter", "--spec", "art/stevie/shelter/spec.json", "--out", join(imports, "qa"), "--dry-run",
    ]);
    if (qa.code !== 0) fail("proof", `animation-qa dry run refused: ${qa.doc?.error?.message ?? qa.stderr}`);
    return { validator: family.result.validator.output, qaPerCandidateUsd: qa.doc?.plan?.estimateUsd ?? 0 };
  } finally {
    await rm(target, { recursive: true, force: true });
    await rm(imports, { recursive: true, force: true });
  }
}

try {
  await pinned(assetforgeDir, "ASSETFORGE_COMMIT", "bash scripts/assetforge.sh fetch");
  await pinned(clockgroveDir, "CLOCKGROVE_COMMIT", "bash scripts/clockgrove.sh fetch");
  await checkBible();
  await checkStyle();
  await checkGracie();
  const proved = await proof();
  const forecasts = await checkInputs(proved?.qaPerCandidateUsd ?? 0);
  const placeholders = await checkPlaceholders();
  const licensedManifests = await checkLicences();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      JSON.stringify({ status: "ok", validator: proved.validator, placeholders, licensedManifests, runForecastUsd: forecasts }),
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
