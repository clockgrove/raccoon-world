#!/usr/bin/env node
// Raccoon World's 3D target profile's own checker (issue 39). It is the profile's validator command
// (art/target-profile-3d.json -> validator.command), which Assetforge runs from the target repository
// root after it writes a model, and check.mjs imports its pure exports.
//
//   node art/tools/model3d.mjs validate <manifest> [--profile <path>] [--kind character|prop] [--json]
//
// Without --kind the kind comes from the manifest's own `kind` (`character-3d` -> character,
// `prop-3d` -> prop); a manifest with neither is checked as a character.
//   node art/tools/model3d.mjs map <manifest>      prints the manifest as Clockgrove's model manifest
//   node art/tools/model3d.mjs profile [<path>]
//
// A manifest that declares side files (model.groom, model.textures, model.eyes) is checked by this
// world's own checks in model3d-sidefiles.mjs instead, with its codes, until clockgrove/clockgrove#305.
//
// validate otherwise first maps the manifest and runs the pinned `clockgrove-assets validate` (CLOCKGROVE_COMMIT,
// checkout in .clockgrove or CLOCKGROVE_DIR) on a throwaway world whose model target is the desktop
// tier's budget for the kind (model3d.tiers.desktop.<kind>). The platform's checks (container, measures,
// budgets, content hash, bounds shape, provenance, grant) are not repeated here. If Clockgrove refuses,
// its lines are printed as `refused <code>: <line>` with its own stable codes (MODEL_BUDGET_EXCEEDED,
// ASSET_MANIFEST_INVALID, ...) and nothing else runs. If it accepts, only this world's checks run.
//
// validate exits 0 accepted, 1 refused, 2 usage, unreadable input or no Clockgrove checkout. profile
// exits 0 good, 1 problems.
//
// The hand-off stays format-neutral: an uncompressed .glb with PNG or JPEG textures inside the pixel
// limit. KTX2 and EXT_meshopt_compression are a target-side build step, never required here.
//
// Stable codes (a contract of this repository; do not rename):
//   refusals from this world's own checks
//     format:texture-media-type, manifest:bounds, manifest:provenance:digitalSourceType, grant:license,
//     rig:template, rig:joints, clip:not-generated:<family>
//     manifest:levels (a level file or side map of a tier's chain that is missing, unreadable, changed,
//       not a one-level GLB, or not the declared triangle count; see model3d-sidefiles.mjs)
//   refusals from Clockgrove carry Clockgrove's codes
//   flags (accepted, reported)
//     tier:<tier>:<key> (a level the tier draws is over that tier's budget, level by level), clip-missing:<family>
//   profile problems (checkProfile)
//     profile:format, profile:units, profile:budgets, profile:tiers, profile:lods,
//     profile:handoff, profile:rig, profile:clip-sets, profile:groom
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ACCEPTED_MEDIA, BUDGET_KEYS, declaresSideFiles, imageBytes, parseGlb, sha256, sniffMediaType, tierLevelChecks, validateSideFileModel } from "./model3d-sidefiles.mjs";

export { BUDGET_KEYS };

// --- the profile's shape ---

const isWhole = (v) => Number.isInteger(v) && v >= 0;
const isText = (v) => typeof v === "string" && v.trim() !== "";

/** Problems with the profile's own shape; empty means good. */
export function checkProfile(profile) {
  const problems = [];
  const add = (code, detail) => problems.push({ code: `profile:${code}`, detail });
  const m = profile?.model3d;
  if (!m || typeof m !== "object") return [{ code: "profile:format", detail: "the profile has no model3d section" }];

  if (m.format !== "glb") add("format", `model3d.format is ${JSON.stringify(m.format)}, expected "glb"`);
  if (m.units !== "m") add("units", `model3d.units is ${JSON.stringify(m.units)}, expected "m"`);

  const budgetsOk = (b) => b && typeof b === "object" && BUDGET_KEYS.every((k) => isWhole(b[k]));
  if (!budgetsOk(m.budgets)) {
    add("budgets", `model3d.budgets needs whole numbers for ${BUDGET_KEYS.join(", ")}`);
  } else if (budgetsOk(m.tiers?.desktop?.character)) {
    for (const k of BUDGET_KEYS) {
      if (m.budgets[k] !== m.tiers.desktop.character[k]) {
        add("budgets", `model3d.budgets.${k} ${m.budgets[k]} differs from tiers.desktop.character.${k} ${m.tiers.desktop.character[k]}`);
      }
    }
  }

  const tiers = m.tiers ?? {};
  for (const tier of ["desktop", "phone"]) {
    const t = tiers[tier];
    if (!t || typeof t !== "object") {
      add("tiers", `model3d.tiers.${tier} is missing`);
      continue;
    }
    if (!["measured", "pending"].includes(t.status)) add("tiers", `tiers.${tier}.status is ${JSON.stringify(t.status)}, expected measured or pending`);
    for (const kind of ["character", "prop"]) {
      if (!budgetsOk(t[kind])) add("tiers", `tiers.${tier}.${kind} needs whole numbers for ${BUDGET_KEYS.join(", ")}`);
    }
  }
  if (tiers.desktop && tiers.phone) {
    for (const kind of ["character", "prop"]) {
      if (!budgetsOk(tiers.desktop[kind]) || !budgetsOk(tiers.phone[kind])) continue;
      for (const k of BUDGET_KEYS) {
        if (tiers.phone[kind][k] > tiers.desktop[kind][k]) {
          add("tiers", `tiers.phone.${kind}.${k} ${tiers.phone[kind][k]} is over the desktop ${tiers.desktop[kind][k]}`);
        }
      }
    }
  }

  const lods = m.lods;
  if (!Array.isArray(lods) || !isWhole(m.budgets?.lods) || lods.length !== m.budgets.lods) {
    add("lods", `model3d.lods needs ${m.budgets?.lods} entries, one per budgeted level`);
  } else {
    lods.forEach((l, i) => {
      if (l?.level !== i) add("lods", `lods[${i}].level is ${l?.level}, expected ${i}`);
    });
    if (lods[0]?.triangleRatio !== 1) add("lods", "lods[0].triangleRatio must be 1");
    if (lods.length && lods.at(-1)?.minScreenHeight !== 0) add("lods", "the last level's minScreenHeight must be 0");
    for (let i = 1; i < lods.length; i++) {
      if (!(lods[i]?.triangleRatio < lods[i - 1]?.triangleRatio)) add("lods", `lods[${i}].triangleRatio must be below the previous level's`);
      if (!(lods[i]?.minScreenHeight < lods[i - 1]?.minScreenHeight)) add("lods", `lods[${i}].minScreenHeight must be below the previous level's`);
    }
  }

  if (m.handoff?.lods !== undefined && !["embedded", "files"].includes(m.handoff.lods)) {
    add("handoff", `model3d.handoff.lods is ${JSON.stringify(m.handoff.lods)}, expected "embedded" or "files"`);
  }

  const media = m.handoff?.textureMediaTypes;
  for (const type of ACCEPTED_MEDIA) {
    if (!Array.isArray(media) || !media.includes(type)) add("handoff", `model3d.handoff.textureMediaTypes must include ${type}`);
  }

  if (!isText(m.rig?.template) || !isText(m.rig?.kind)) add("rig", "model3d.rig needs a template path and a kind");

  const set = m.clipSets?.[m.rig?.kind];
  if (!set || !Array.isArray(set.required) || set.required.length === 0) {
    add("clip-sets", `model3d.clipSets.${m.rig?.kind}.required must be a non-empty list`);
  } else {
    for (const family of [...Object.keys(m.gaits ?? {}), ...(set.generated ?? [])]) {
      if (!set.required.includes(family)) add("clip-sets", `"${family}" is a gait or generated family but not in clipSets.${m.rig.kind}.required`);
    }
  }

  const groom = m.groom;
  const seasons = groom?.seasons;
  if (!Array.isArray(seasons) || seasons.length === 0 || !seasons.every(isText) || new Set(seasons).size !== seasons.length) {
    add("groom", "groom.seasons must be a non-empty list of distinct names");
  } else {
    for (const s of seasons) if (!isText(groom.traits?.[s])) add("groom", `groom.traits has no entry for "${s}"`);
    const calendar = groom.calendar?.seasons ?? {};
    const months = Object.values(calendar).flat().sort((a, b) => a - b);
    if (months.length !== 12 || months.some((mo, i) => mo !== i + 1)) add("groom", "groom.calendar.seasons must cover months 1-12 exactly once");
    for (const name of Object.keys(calendar)) {
      if (!seasons.includes(groom.calendar?.coats?.[name])) add("groom", `groom.calendar.coats.${name} is not a declared groom season`);
    }
  }
  return problems;
}

// --- the world manifest as Clockgrove's model manifest ---

/** Clockgrove's model manifest for a world manifest. Missing values stay missing so Clockgrove refuses them. */
export function toClockgroveManifest(manifest) {
  const { digitalSourceType, ...provenance } = manifest?.provenance ?? {};
  const model = manifest?.model ?? {};
  const clips = model.clips?.map((c) => {
    const clip = { name: c?.name, durationMs: c?.durationMs, loop: c?.loop };
    if (c?.generated !== undefined) clip.generated = c.generated;
    return clip;
  });
  const output = {
    path: manifest?.source?.path,
    mediaType: manifest?.source?.mediaType,
    extension: model.extension,
    sha256: manifest?.contentHash,
    triangles: model.triangles,
    textureMaxPx: model.textureMaxPx,
    materials: model.materials,
    bones: model.bones,
    lods: model.lods,
    clips,
    bounds: model.bounds,
  };
  if (model.rig !== undefined) output.rig = model.rig;
  const chain = chainLevels(manifest);
  if (chain) {
    // Level files declared beside the .glb (clockgrove/clockgrove#304): levels[0] is the main file,
    // output.lods counts the files, and renditions name the chain levels each tier draws.
    output.levels = chain;
    output.lods = chain.length;
    const renditions = Object.fromEntries(
      (model.chain?.tiers ?? []).filter((t) => typeof t?.name === "string" && Array.isArray(t.levels) && !ownTierLevels(model, t.name)).map((t) => [t.name, t.levels]),
    );
    if (Object.keys(renditions).length > 0) output.renditions = renditions;
  }
  const semantic = manifest?.semantic
    ? { role: manifest.semantic.role, entity: manifest.semantic.entity ?? null, archetype: manifest.semantic.archetype ?? null }
    : undefined;
  const mapped = {
    kind: "model",
    assetManifestVersion: 2,
    assetId: manifest?.assetId,
    source: { kind: manifest?.source?.kind, path: manifest?.source?.path, creator: manifest?.source?.creator, tool: manifest?.source?.tool },
    license: manifest?.license,
    provenance,
    review: manifest?.review,
    semantic,
    accessibilityLabel: manifest?.accessibilityLabel,
    output,
  };
  for (const key of Object.keys(mapped)) if (mapped[key] === undefined) delete mapped[key];
  return mapped;
}

/** The manifest's level files as Clockgrove's output.levels (level 0 first), or undefined when it declares none. */
function chainLevels(manifest) {
  const model = manifest?.model ?? {};
  const entries = Object.values(model.levels ?? {}).filter((l) => Number.isInteger(l?.level) && l.level > 0).sort((a, b) => a.level - b.level);
  if (entries.length === 0) return undefined;
  return [
    { triangles: model.triangles, path: manifest?.source?.path, sha256: manifest?.contentHash },
    ...entries.map((l) => ({ triangles: l.triangles, path: l.path, sha256: l.sha256 })),
  ];
}

/** True when a tier draws its own level files (model.tiers.<tier>.levels), which Clockgrove's contract cannot express. */
function ownTierLevels(model, tier) {
  return Object.keys(model?.tiers?.[tier]?.levels ?? {}).length > 0;
}

/**
 * Clockgrove's model target: this world's desktop budget of a kind as the default limits, and every
 * tier's budget, except tiers the manifest gives their own level files (this world checks those).
 */
export function modelTarget(profile, kind, manifest) {
  const pick = (budgets) => Object.fromEntries(BUDGET_KEYS.map((k) => [k, budgets?.[k]]));
  const tiers = Object.fromEntries(
    Object.entries(profile.model3d?.tiers ?? {}).filter(([tier, t]) => t?.[kind] && !ownTierLevels(manifest?.model, tier)).map(([tier, t]) => [tier, pick(t[kind])]),
  );
  return { version: 1, limits: pick(profile.model3d?.tiers?.desktop?.[kind]), ...(Object.keys(tiers).length > 0 ? { tiers } : {}) };
}

// --- Clockgrove's validation ---

const ROOT = resolve(import.meta.dirname, "../..");

/**
 * Runs the pinned `clockgrove-assets validate` on a throwaway world, with the level files beside the
 * .glb. Returns its problem lines as refusals, except a tier budget Clockgrove finds exceeded on a tier
 * whose status is not "measured": that is the tier:<tier>:<key> flag, pending the tier's measurement.
 */
function clockgroveRefusals({ profile, manifest, glb, kind, readBytes }) {
  const pin = readFileSync(join(ROOT, "CLOCKGROVE_COMMIT"), "utf8").trim();
  const dir = process.env.CLOCKGROVE_DIR ?? join(ROOT, ".clockgrove");
  const pinFile = join(dir, ".raccoon-world-pin");
  if (!existsSync(pinFile) || readFileSync(pinFile, "utf8").trim() !== pin) {
    throw new UsageError(`no Clockgrove ${pin} checkout in ${dir}; run bash scripts/clockgrove.sh fetch`);
  }
  const world = mkdtempSync(join(tmpdir(), "model3d-"));
  try {
    const path = manifest?.source?.path;
    if (typeof path !== "string" || path === "" || isAbsolute(path) || path.split(/[\\/]/).includes("..")) {
      throw new UsageError(`source.path ${JSON.stringify(path)} is not a relative path inside the world`);
    }
    mkdirSync(dirname(join(world, path)), { recursive: true });
    writeFileSync(join(world, path), glb);
    for (const level of (chainLevels(manifest) ?? []).slice(1)) {
      const bytes = typeof level.path === "string" && !isAbsolute(level.path) && !level.path.split(/[\\/]/).includes("..") ? readBytes(level.path) : undefined;
      if (!bytes) continue; // Clockgrove refuses the missing file (MODEL_SOURCE_REQUIRED)
      mkdirSync(dirname(join(world, level.path)), { recursive: true });
      writeFileSync(join(world, level.path), bytes);
    }
    mkdirSync(join(world, "reference"), { recursive: true });
    writeFileSync(join(world, "reference/model-target.json"), JSON.stringify(modelTarget(profile, kind, manifest), null, 2));
    writeFileSync(join(world, "model.json"), JSON.stringify(toClockgroveManifest(manifest), null, 2));
    const run = spawnSync(process.execPath, [join(dir, "packages/assets/bin/clockgrove-assets.mjs"), "validate", join(world, "model.json"), "--world", world], {
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    if (run.status === 0) return { refusals: [], flags: [] };
    if (run.status !== 1) throw new UsageError(`clockgrove-assets exited ${run.status}: ${run.stderr || run.error?.message || ""}`.trim());
    const lines = run.stderr.split("\n").map((l) => l.trim()).filter(Boolean);
    const refusals = [];
    const flags = [];
    for (const line of lines) {
      const tier = /MODEL_BUDGET_EXCEEDED: ([A-Za-z0-9_-]+)\.([A-Za-z]+): (\d+) exceeds (\d+)( \(level (\d+)\))?/.exec(line);
      const status = tier ? profile.model3d?.tiers?.[tier[1]]?.status : undefined;
      if (tier && status !== undefined && status !== "measured") {
        flags.push({
          code: `tier:${tier[1]}:${tier[2]}`,
          detail: `level ${tier[6] ?? 0}: ${tier[2]} ${tier[3]} over the ${tier[1]} ${kind} budget of ${tier[4]}; the LOD chain must bring it within (${tier[1]} status: ${status}; clockgrove-assets validate)`,
        });
      } else {
        refusals.push({ code: /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/.exec(line)?.[1] ?? "CLOCKGROVE_REFUSED", detail: line, platform: true });
      }
    }
    return { refusals, flags };
  } finally {
    rmSync(world, { recursive: true, force: true });
  }
}

class UsageError extends Error {}

// --- one model against the profile ---

/**
 * Validates a written model: Clockgrove first, then the checks only this world makes. A manifest that
 * declares side files (Stevie's committed look-dev model) is refused by Clockgrove until
 * clockgrove/clockgrove#305, so it keeps this world's own checks (model3d-sidefiles.mjs) instead.
 */
export function validateModel({ profile, manifest, glb, templateBytes, kind = "character", readBytes = () => undefined }) {
  if (declaresSideFiles(manifest)) return { ...validateSideFileModel({ profile, manifest, glb, templateBytes, kind, readBytes }), route: "world-side" };
  const { refusals, flags } = clockgroveRefusals({ profile, manifest, glb, kind, readBytes });
  if (refusals.length > 0) return { accepted: false, refusals, flags, route: "clockgrove" };
  const refuse = (code, detail) => refusals.push({ code, detail });
  const m = profile.model3d ?? {};

  let parsed;
  try {
    parsed = parseGlb(glb);
  } catch (error) {
    throw new UsageError(error.message);
  }
  for (const image of parsed.json.images ?? []) {
    const data = imageBytes(parsed, image);
    const type = data ? sniffMediaType(data, image.mimeType) : (image.mimeType ?? "unknown");
    if (!ACCEPTED_MEDIA.includes(type)) refuse("format:texture-media-type", `texture media type ${type} is not image/png or image/jpeg; KTX2 is a target-side build step`);
  }

  const bounds = manifest?.model?.bounds;
  const height = bounds?.max?.[1] - bounds?.min?.[1];
  if (Math.abs(bounds?.min?.[1]) > 1e-3) refuse("manifest:bounds", `model stands at y ${bounds.min[1]}, expected 0 within 1e-3`);
  if (!(height >= 0.05 && height <= 5)) refuse("manifest:bounds", `model height ${height} m is outside 0.05 to 5 m`);

  const provenance = manifest?.provenance ?? {};
  const dst = provenance.digitalSourceType;
  if (typeof dst !== "string" || dst.trim() === "") refuse("manifest:provenance:digitalSourceType", "provenance.digitalSourceType is missing or empty");

  const license = manifest?.license;
  if (license !== profile.license && !(profile.acceptedLicenses ?? []).includes(license)) {
    refuse("grant:license", `license ${JSON.stringify(license)} is neither ${profile.license} nor an accepted licence`);
  }

  if (manifest?.model?.rig?.template !== m.rig?.template || manifest?.model?.rig?.sha256 !== sha256(templateBytes)) {
    refuse("rig:template", `manifest rig ${manifest?.model?.rig?.template} ${manifest?.model?.rig?.sha256} is not the profile's ${m.rig?.template} ${sha256(templateBytes)}`);
  }
  let expected = [];
  try {
    expected = JSON.parse(new TextDecoder().decode(templateBytes)).joints.map((j) => j.name);
  } catch {
    refuse("rig:template", "the rig template is not readable JSON with joints");
  }
  const nodes = parsed.json.nodes ?? [];
  const jointNames = (parsed.json.skins?.[0]?.joints ?? []).map((n) => nodes[n]?.name ?? `node ${n}`);
  if (jointNames.length !== expected.length || jointNames.some((n, i) => n !== expected[i])) {
    refuse("rig:joints", `model joints (${jointNames.length}) are not the template's ${expected.length} joints in template order`);
  }

  const set = m.clipSets?.[m.rig?.kind] ?? { required: [], generated: [] };
  const glbNames = (parsed.json.animations ?? []).map((a, i) => a.name ?? `animation ${i}`);
  const manifestClips = manifest?.model?.clips ?? [];
  for (const family of set.generated ?? []) {
    if (glbNames.includes(family) && manifestClips.find((c) => c.name === family)?.generated !== true) {
      refuse(`clip:not-generated:${family}`, `"${family}" must be the generated gait but the manifest does not mark it generated`);
    }
  }

  // Clockgrove checked every tier's levels; this world checks only tiers that draw their own level files.
  const levelChecks = tierLevelChecks({ profile, manifest, kind, measured: manifest?.model ?? {}, readBytes, tiers: (tier) => ownTierLevels(manifest?.model, tier) });
  refusals.push(...levelChecks.refusals);
  flags.push(...levelChecks.flags);
  for (const family of set.required) {
    if (!glbNames.includes(family)) flags.push({ code: `clip-missing:${family}`, detail: `no "${family}" clip in the model; never faked` });
  }

  return { accepted: refusals.length === 0, refusals, flags, route: "clockgrove" };
}

// --- command line ---

const USAGE = `usage: model3d.mjs validate <manifest> [--profile <path>] [--kind character|prop] [--json]
       model3d.mjs map <manifest>
       model3d.mjs profile [<path>]`;
const DEFAULT_PROFILE = "art/target-profile-3d.json";
const MANIFEST_KINDS = { "character-3d": "character", "prop-3d": "prop" };

/** The kind a manifest declares (`character-3d` or `prop-3d`), else character. */
export function kindOf(manifest) {
  return MANIFEST_KINDS[manifest?.kind] ?? "character";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readBytes(path) {
  try {
    return new Uint8Array(readFileSync(path));
  } catch {
    return undefined;
  }
}

function cli(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const options = { profile: DEFAULT_PROFILE, kind: undefined, json: false };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--json") options.json = true;
    else if (rest[i] === "--profile" || rest[i] === "--kind") options[rest[i].slice(2)] = rest[++i];
    else if (rest[i].startsWith("--")) return usage(`unknown option ${rest[i]}`);
    else positional.push(rest[i]);
  }
  try {
    if (command === "profile") {
      const path = positional[0] ?? options.profile;
      const problems = checkProfile(readJson(path));
      for (const p of problems) console.log(`problem ${p.code}: ${p.detail}`);
      if (problems.length === 0) console.log(`profile ${path} is good`);
      return problems.length === 0 ? 0 : 1;
    }
    if (command === "map" && positional.length === 1) {
      console.log(JSON.stringify(toClockgroveManifest(readJson(positional[0])), null, 2));
      return 0;
    }
    if (command !== "validate" || positional.length !== 1) return usage();
    if ((options.kind !== undefined && !["character", "prop"].includes(options.kind)) || !options.profile) return usage("bad --kind or --profile");
    const profile = readJson(options.profile);
    const manifest = readJson(positional[0]);
    options.kind ??= kindOf(manifest);
    const glb = new Uint8Array(readFileSync(manifest?.source?.path ?? ""));
    const templateBytes = new Uint8Array(readFileSync(resolve(dirname(resolve(options.profile)), profile.model3d?.rig?.template ?? "")));
    const result = validateModel({ profile, manifest, glb, templateBytes, kind: options.kind, readBytes });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.accepted ? "accepted" : "refused");
      if (result.route === "world-side") console.log("platform: not run; the manifest declares side files, which Clockgrove refuses until clockgrove/clockgrove#305, so this world's own checks ran");
      else if (result.accepted || !result.refusals.some((r) => r.platform)) console.log(`platform: accepted by clockgrove-assets validate at ${readFileSync(join(ROOT, "CLOCKGROVE_COMMIT"), "utf8").trim()}`);
      for (const r of result.refusals) console.log(`refused ${r.code}: ${r.detail}`);
      for (const f of result.flags) console.log(`flag ${f.code}: ${f.detail}`);
    }
    return result.accepted ? 0 : 1;
  } catch (error) {
    console.error(`model3d: ${error.message}`);
    return 2;
  }
}

function usage(message) {
  if (message) console.error(`model3d: ${message}`);
  console.error(USAGE);
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = cli(process.argv.slice(2));
}
