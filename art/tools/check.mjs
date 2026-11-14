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
// 8. model3d:     the 3D target profile's shape (art/tools/model3d.mjs profile) and the pinned Assetforge
//                 reads it, its rig and walk; Stevie's and Gracie's character-3d specs; Stevie's 3D run
//                 forecasts within $5; a scripted stage and pick write a rigged .glb with a generated idle
//                 (Assetforge's draft motion, throwaway copy only) and walk into a throwaway copy, and the
//                 profile's validator, Clockgrove's `clockgrove-assets validate`, accepts it on the first try;
//                 Clockgrove refuses the same model over lower budgets (MODEL_BUDGET_EXCEEDED); it renders
//                 through the pinned renderer's world-content seam (art/tools/model3d-render.mjs); a
//                 free-plan grant is refused with exit 7 (issues 39 and 82).
//
// ASSETFORGE_DIR and CLOCKGROVE_DIR name the pinned checkouts (defaults .assetforge-src, .clockgrove).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
async function assetforge(args, extraEnv = {}, cwd = root) {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [join(assetforgeDir, "src/cli.ts"), ...args, "--json"],
      { cwd, env: { ...env, ...extraEnv }, maxBuffer: 64 << 20 },
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

/**
 * The 3D target profile (issue 39): its shape, Stevie's and Gracie's character-3d specs, Stevie's run
 * forecast, and the offline hand-off: a scripted `stage` and a `pick` through the profile into a
 * throwaway copy, accepted by Clockgrove's validation on the first try; an over-budget model refused
 * with Clockgrove's code; the render through the world-content seam; a free-plan grant refused with exit 7.
 */
async function checkModel3d() {
  const PROFILE = "art/target-profile-3d.json";
  const SPEC = "art/stevie/character-3d/spec.json";
  const { checkProfile, validateModel } = await import(pathToFileURL(join(root, "art/tools/model3d.mjs")).href);
  const { characterSpec } = await import(pathToFileURL(join(assetforgeDir, "src/model3d/profile.ts")).href);
  const { model3dSettings } = await import(pathToFileURL(join(assetforgeDir, "src/model3d/profile.ts")).href);
  const { loadRig } = await import(pathToFileURL(join(assetforgeDir, "src/model3d/rig/template.ts")).href);
  const profile = await json(PROFILE);
  for (const problem of checkProfile(profile)) fail("model3d", `${PROFILE}: ${problem.code}: ${problem.detail}`);
  // The pinned Assetforge reads the profile, its rig template and its gaits.
  try {
    model3dSettings(profile);
    await loadRig(profile, join(root, "art"));
  } catch (error) {
    fail("model3d", `Assetforge refuses ${PROFILE}: ${error.message}`);
  }
  const m = profile.model3d;
  const walk = m.gaits?.walk ?? {};
  const decided = { backArchDeg: 22, hipHeightRatio: 1.1, headPitchDeg: 28, tailPitchDeg: 18, strideBodyLengths: 0.26 };
  for (const [key, value] of Object.entries(decided))
    if (walk[key] !== value) fail("model3d", `the walk's ${key} must be #88's ${value}, not ${walk[key]}`);
  const template = await json(`art/${m.rig?.template}`);
  for (const ear of ["ear_l", "ear_r"])
    if (template.joints?.find((j) => j.name === ear)?.parent !== "head") fail("model3d", `the rig needs ${ear} on the head`);
  if (!template.feet?.every((f) => f.plantigrade === true)) fail("model3d", "every raccoon foot must be plantigrade");
  if (JSON.stringify(m.groom?.seasons) !== JSON.stringify(["summer", "winter"]))
    fail("model3d", "model3d.groom.seasons must be summer and winter");
  if (m.tiers?.phone?.status !== "pending") fail("model3d", "the phone tier stays pending until Kirk's device run");
  if (profile.license !== "MIT" || (profile.acceptedLicenses ?? []).length !== 0)
    fail("model3d", "the 3D profile ships MIT only: Tripo paid-plan output, relabelled");

  const required = m.clipSets?.[m.rig?.kind]?.required ?? [];
  for (const name of ["stevie", "gracie"]) {
    const path = `art/${name}/character-3d/spec.json`;
    const spec = await json(path);
    try {
      characterSpec(spec);
    } catch (error) {
      fail("model3d", `Assetforge's character-3d reader refuses ${path}: ${error.message}`);
    }
    for (const clip of spec.clips ?? [])
      if (!required.includes(clip)) fail("model3d", `${path}: clip ${clip} is not in the raccoon clip set`);
  }
  const stevie = await json(SPEC);
  if (stevie.assetId !== "stevie" || stevie.subject !== "stevie" || stevie.gait !== "quadruped")
    fail("model3d", `${SPEC} must be Stevie's quadruped character-3d spec`);
  if (JSON.stringify(stevie.clips) !== JSON.stringify(required))
    fail("model3d", `${SPEC} must list the raccoon clip set: ${required}`);
  for (const clip of stevie.clips) {
    const source = stevie.fields?.clipSources?.[clip];
    const generated = (m.clipSets?.[m.rig?.kind]?.generated ?? []).includes(clip);
    if (source !== (generated ? "generated" : "library"))
      fail("model3d", `${SPEC}: clip ${clip} must come from ${generated ? "the generated gait" : "the provider's library"}`);
  }

  // Stevie's committed chain (#113) is checked level by level against the tier that draws it.
  const steviePath = "assets/models/stevie/manifest.json";
  const stevieManifest = await json(steviePath);
  const levelFiles = new Map();
  for (const entry of [...Object.values(stevieManifest.model?.levels ?? {}), ...Object.values(stevieManifest.model?.tiers ?? {}).flatMap((t) => Object.values(t.levels ?? {}))])
    levelFiles.set(entry.path, await readFile(join(root, entry.path)).catch(() => undefined));
  const sideMaps = async (node) => {
    if (node && typeof node === "object" && typeof node.path === "string") levelFiles.set(node.path, await readFile(join(root, node.path)).catch(() => undefined));
    else for (const value of Object.values(node ?? {})) if (value && typeof value === "object") await sideMaps(value);
  };
  await sideMaps(stevieManifest.model);
  const stevieInput = {
    glb: new Uint8Array(await readFile(join(root, stevieManifest.source.path))),
    templateBytes: new Uint8Array(await readFile(join(root, "art", m.rig.template))),
    readBytes: (path) => (levelFiles.has(path) ? levelFiles.get(path) : undefined),
  };
  const chained = validateModel({ profile, manifest: stevieManifest, ...stevieInput });
  if (!chained.accepted || chained.flags.some((f) => f.code.startsWith("tier:")))
    fail("model3d", `Stevie's chain must be accepted with no tier flag: ${JSON.stringify([...chained.refusals, ...chained.flags.filter((f) => f.code.startsWith("tier:"))])}`);
  const tight = structuredClone(profile);
  tight.model3d.tiers.phone.character.triangles = 15000;
  const tightened = validateModel({ profile: tight, manifest: stevieManifest, ...stevieInput });
  if (!tightened.flags.some((f) => f.code === "tier:phone:triangles" && f.detail.includes("level 1")))
    fail("model3d", "a phone triangle budget of 15000 must flag tier:phone:triangles naming level 1");
  const tampered = structuredClone(stevieManifest);
  tampered.model.tiers.phone.levels.lod1.sha256 = "0".repeat(64);
  if (!validateModel({ profile, manifest: tampered, ...stevieInput }).refusals.some((r) => r.code === "manifest:levels"))
    fail("model3d", "a phone level whose sha256 is wrong must be refused with manifest:levels");
  const uncovered = structuredClone(stevieManifest);
  delete uncovered.model.tiers.phone.levels.lod1;
  if (!validateModel({ profile, manifest: uncovered, ...stevieInput }).refusals.some((r) => r.code === "manifest:levels" && r.detail.includes("level 1")))
    fail("model3d", "a phone level model.chain.tiers lists with no file in model.tiers.phone.levels must be refused with manifest:levels");

  // Stevie's 3D run (up to 4 candidates) forecasts within its cap, offline, on the real routes.
  const settings = await json("art/stevie/character-3d/run.json");
  const runs = await mkdtemp(join(tmpdir(), "raccoon-world-runs3d-"));
  const target = await throwawayCopy("model3d");
  const base = ["--spec", SPEC, "--bible", "art/style-bible.json", "--profile", PROFILE, "--runs", runs];
  try {
    const dry = await assetforge([
      "stage", ...base, "--candidates", String(settings.candidates), "--cap", String(settings.capUsd), "--dry-run",
    ]);
    if (dry.code !== 0) fail("model3d", `Stevie's 3D run does not fit its $${settings.capUsd} cap: ${dry.doc?.error?.message ?? dry.stderr}`);
    if (!(settings.candidates <= MAX_CANDIDATES && settings.capUsd <= MAX_RUN_USD))
      fail("model3d", `art/stevie/character-3d/run.json: at most ${MAX_CANDIDATES} candidates and $${MAX_RUN_USD}`);

    // The hand-off Clockgrove takes (assetforge#137): Clockgrove's clip fields, look-dev maps embedded.
    const clipFields = { name: "name", durationMs: "durationMs", loop: "loop", generated: "generated" };
    if (m.motions?.idle?.loop !== true) fail("model3d", "model3d.motions.idle must declare the looping idle the hand-off generates");
    if (JSON.stringify(m.handoff?.clipFields) !== JSON.stringify(clipFields) || m.handoff?.sideImages !== "embedded")
      fail("model3d", `model3d.handoff must declare clipFields ${JSON.stringify(clipFields)} and sideImages "embedded" until clockgrove/clockgrove#305`);

    // The hand-off: scripted stage and pick in the throwaway copy, through #39's committed profile. Its
    // shared rig generates the idle (model3d.motions.idle) and the walk (model3d.gaits.walk). The
    // profile's validator, Clockgrove's `clockgrove-assets validate`, accepts it on the first try.
    const scripted = [...base, "--provider-script", "art/proof/model3d-provider.mjs", "--candidates", "1"];
    const staged = await assetforge(["stage", ...scripted, "--routes", "art/proof/model3d-routes.json"], {}, target);
    if (staged.code !== 0) {
      const reasons = (staged.doc?.rejections ?? []).flatMap((c) => c.reasons ?? []).filter((r) => !r.passed);
      fail("model3d", `scripted stage failed (exit ${staged.code}): ${reasons.map((r) => `${r.check}: ${r.reason}`).join("; ") || staged.doc?.error?.message || staged.stderr}`);
      return;
    }
    const picked = await assetforge(["pick", "--run", staged.doc.runDir, "--candidate", "c1", "--target", target]);
    if (picked.code !== 0 || picked.doc?.validator?.accepted !== true) {
      fail("model3d", `the profile's validator did not accept the pick on the first try (exit ${picked.code}):\n${picked.doc?.validator?.output ?? picked.doc?.error?.message ?? picked.stderr}`);
      return;
    }
    const manifestPath = "assets/models/stevie/manifest.json";
    const manifest = JSON.parse(await readFile(join(target, manifestPath), "utf8"));
    const provenance = JSON.parse(await readFile(join(target, "assets/models/stevie/stevie.glb.provenance.json"), "utf8"));
    const p = manifest.provenance ?? {};
    const walkClip = manifest.model?.clips?.find((c) => c.name === "walk");
    const idleClip = manifest.model?.clips?.find((c) => c.name === "idle");
    const expectations = [
      ["review pending", manifest.review?.status === "pending" && manifest.review?.reviewer === null],
      ["a rigged glb", manifest.source?.mediaType === "model/gltf-binary" && manifest.model?.bones > 0],
      ["the generated idle", idleClip?.generated === true && idleClip?.loop === true && idleClip?.durationMs > 0],
      ["the generated walk", walkClip?.generated === true && walkClip?.loop === true && walkClip?.durationMs > 0],
      ["only Clockgrove's clip fields", manifest.model?.clips?.every((c) => Object.keys(c).every((k) => k in clipFields))],
      ["no side images", ["groom", "textures", "eyes"].every((k) => manifest.model?.[k] === undefined)],
      ["the raccoon rig template and its hash", manifest.model?.rig?.template === m.rig.template && /^[0-9a-f]{64}$/.test(manifest.model?.rig?.sha256 ?? "")],
      ["MIT as Clockgrove work", manifest.license === "MIT" && manifest.source?.creator === "Clockgrove"],
      ["provider, model, route and output grant", p.provider === "tripo" && ["model", "route", "providerTermsVersion"].every((k) => typeof p[k] === "string" && p[k].length > 0) && p.outputGrant?.relabel === true],
      ["IPTC trainedAlgorithmicMedia", p.digitalSourceType === IPTC_GENERATED && provenance.digitalSourceType === IPTC_GENERATED],
      ["only scripted calls", provenance.calls.every((c) => c.route.startsWith("scripted:"))],
      ["bounds in metres, standing on the ground", Math.abs(manifest.model?.bounds?.min?.[1]) < 1e-3 && Math.abs(manifest.model?.bounds?.max?.[1] - stevie.heightM) < 1e-3],
    ];
    for (const [what, ok] of expectations) if (!ok) fail("model3d", `the written model lacks: ${what}`);
    const validator = picked.doc.validator.output;
    for (const flag of ["clip-missing:sniff", "tier:phone:triangles"])
      if (!validator.includes(flag)) fail("model3d", `the validator should flag ${flag}:\n${validator}`);
    if (validator.includes("clip-missing:idle")) fail("model3d", `the idle should not be missing:\n${validator}`);
    const { stdout: attr } = await run("git", ["check-attr", "filter", "--", manifest.source.path], { cwd: root });
    if (!attr.trim().endsWith(": lfs")) fail("model3d", `${manifest.source.path} is not stored in Git LFS by .gitattributes`);

    // Over budget: Clockgrove refuses the same model against this world's lower budgets, with its own code.
    const refusedBy = async (args, what) => {
      try {
        await run(process.execPath, ["art/tools/model3d.mjs", "validate", manifestPath, ...args], { cwd: target, env });
        fail("model3d", `${what} was accepted`);
      } catch (error) {
        if (error.code !== 1 || !String(error.stdout).includes("MODEL_BUDGET_EXCEEDED"))
          fail("model3d", `${what} must be refused by Clockgrove with MODEL_BUDGET_EXCEEDED (exit 1), got ${error.code}: ${error.stdout}${error.stderr}`);
      }
    };
    const lower = structuredClone(profile);
    lower.model3d.budgets.triangles = 50000;
    lower.model3d.tiers.desktop.character.triangles = 50000;
    await writeFile(join(target, "art/over-budget-3d.json"), JSON.stringify(lower));
    await refusedBy(["--profile", "art/over-budget-3d.json"], "a model over the hand-off triangle budget");
    // The same model checked as a prop is refused against the desktop prop budget, not the character's.
    await refusedBy(["--kind", "prop"], "a model over the desktop prop budget");

    // A chain without side files goes to Clockgrove (clockgrove/clockgrove#304) with its level files,
    // renditions and tier budgets: Clockgrove checks each level against the tier that draws it, and a
    // pending tier's excess comes back as this world's tier flag naming the level.
    const glbBytes = await readFile(join(target, manifest.source.path));
    const lodPath = manifest.source.path.replace(/\.glb$/, ".lod1.glb");
    await writeFile(join(target, lodPath), glbBytes);
    const chainManifest = structuredClone(manifest);
    chainManifest.model.levels = { lod1: { level: 1, triangles: manifest.model.triangles, path: lodPath, sha256: createHash("sha256").update(glbBytes).digest("hex") } };
    chainManifest.model.chain = { packaging: "files", tiers: [{ name: "desktop", levels: [0, 1] }, { name: "phone", levels: [1] }] };
    const validateChain = async (chain, what) => {
      await writeFile(join(target, "chain-manifest.json"), JSON.stringify(chain));
      try {
        const { stdout } = await run(process.execPath, ["art/tools/model3d.mjs", "validate", "chain-manifest.json", "--json"], { cwd: target, env });
        return JSON.parse(stdout);
      } catch (error) {
        if (error.code === 1) return JSON.parse(error.stdout);
        fail("model3d", `${what}: model3d.mjs exited ${error.code}: ${error.stderr}`);
      }
    };
    const viaClockgrove = await validateChain(chainManifest, "a chain without side files");
    if (!viaClockgrove?.accepted || viaClockgrove.route !== "clockgrove" || !viaClockgrove.flags.some((f) => f.code === "tier:phone:triangles" && f.detail.includes("level 1") && f.detail.includes("clockgrove-assets validate")))
      fail("model3d", `Clockgrove must accept the chain and its phone level 1 must come back as tier:phone:triangles: ${JSON.stringify(viaClockgrove)}`);
    const wrongLevel = structuredClone(chainManifest);
    wrongLevel.model.levels.lod1.sha256 = "0".repeat(64);
    const levelRefused = await validateChain(wrongLevel, "a chain level with a wrong sha256");
    if (levelRefused?.accepted !== false || !levelRefused.refusals.some((r) => r.platform && r.code === "MODEL_HASH_MISMATCH"))
      fail("model3d", `Clockgrove must refuse a chain level whose sha256 is wrong with MODEL_HASH_MISMATCH: ${JSON.stringify(levelRefused)}`);

    // It renders through the world-content seam (clockgrove/clockgrove#112) of the pinned renderer.
    let rendered;
    try {
      const { stdout } = await run(process.execPath, [join(root, "art/tools/model3d-render.mjs"), target, manifestPath], {
        cwd: root, env, maxBuffer: 16 << 20, timeout: 300_000,
      });
      rendered = JSON.parse(stdout.trim().split("\n").at(-1));
    } catch (error) {
      fail("model3d", `the handed-off model did not render through the world-content seam: ${error.stdout ?? ""}${error.stderr ?? error.message}`);
    }

    // A grant the profile can't accept (a free-plan CC BY model) is refused with exit 7, nothing written.
    const routes = join(runs, "free-plan-routes.json");
    const freePlan = { license: "CC-BY-4.0", plan: "free", commercial: true, relabel: false, attribution: "3D model generated with Meshy (meshy.ai)" };
    await writeFile(routes, JSON.stringify({ model3d: { forward: "+z", outputGrant: freePlan } }));
    const free = await assetforge(["stage", ...scripted, "--routes", routes]);
    const freeTarget = await mkdtemp(join(tmpdir(), "raccoon-world-free-"));
    try {
      const refused = free.code === 0
        ? await assetforge(["pick", "--run", free.doc.runDir, "--candidate", "c1", "--target", freeTarget])
        : free;
      if (refused.code !== 7 || refused.doc?.error?.code !== "license_refused")
        fail("model3d", `a free-plan CC BY grant must be refused with exit 7, got ${refused.code}`);
      if ((await readdir(freeTarget)).length !== 0) fail("model3d", "a refused grant wrote into the target");
    } finally {
      await rm(freeTarget, { recursive: true, force: true });
    }
    return { validator, triangles: manifest.model.triangles, idleMs: idleClip?.durationMs, walkMs: walkClip?.durationMs, rendered };
  } finally {
    await rm(target, { recursive: true, force: true });
    await rm(runs, { recursive: true, force: true });
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
  const model3d = await checkModel3d();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      JSON.stringify({ status: "ok", validator: proved.validator, placeholders, licensedManifests, runForecastUsd: forecasts, model3d }),
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
