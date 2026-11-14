// The world-side checks for a 3D model whose manifest declares side files (model.groom, model.textures or
// model.eyes: maps beside the .glb). Clockgrove refuses side images until clockgrove/clockgrove#305, so
// such a model (Stevie's committed look-dev model, #107) keeps the checks this world made before issue 82:
// the container, measures, budgets, content hash, source, bounds, provenance, grant, rig and clips, with
// this repository's codes. model3d.mjs `validate` routes here; every other hand-off goes to Clockgrove.
// When #305 lands, this module goes and those models move to Clockgrove's validator.
//
// Stable codes (a contract of this repository; do not rename):
//   refusals
//     format:container, format:texture-media-type, format:units
//     over-budget:triangles, over-budget:textureMaxPx, over-budget:materials, over-budget:bones,
//       over-budget:lods
//     manifest:content-hash, manifest:mismatch:<key> (the five budget keys), manifest:source,
//       manifest:bounds, manifest:provenance:<model|provider|route|outputGrant|digitalSourceType>
//     grant:license, grant:relabel, grant:non-commercial
//     rig:template, rig:joints
//     clip:not-generated:<family>, clip:mismatch
//   flags (accepted, reported)
//     tier:<tier>:<key>, clip-missing:<family>
import { createHash } from "node:crypto";

export const BUDGET_KEYS = ["triangles", "textureMaxPx", "materials", "bones", "lods"];
const PROVENANCE_FIELDS = ["model", "provider", "route", "outputGrant", "digitalSourceType"];
export const ACCEPTED_MEDIA = ["image/png", "image/jpeg"];

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** True when the manifest declares maps beside the .glb, which Clockgrove refuses until clockgrove#305. */
export function declaresSideFiles(manifest) {
  const model = manifest?.model ?? {};
  return ["groom", "textures", "eyes"].some((key) => model[key] !== undefined && model[key] !== null);
}

// --- GLB measures ---

function imageSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return undefined;
      const marker = bytes[at + 1];
      const length = view.getUint16(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
      }
      at += 2 + length;
    }
  }
  return undefined;
}

export function sniffMediaType(bytes, declared) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("latin1") === "\xabKTX") return "image/ktx2";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(8, 12)).toString("latin1") === "WEBP") return "image/webp";
  return declared ?? "application/octet-stream";
}

export function parseGlb(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20) throw new Error("not a GLB: shorter than the 20-byte header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB: the magic is not glTF");
  if (view.getUint32(4, true) !== 2) throw new Error(`not a GLB 2.0: version ${view.getUint32(4, true)}`);
  const total = view.getUint32(8, true);
  if (total > bytes.length) throw new Error(`GLB truncated: header says ${total} bytes, file has ${bytes.length}`);
  let json;
  let bin = new Uint8Array(0);
  let at = 12;
  while (at + 8 <= total) {
    const length = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    const start = at + 8;
    if (start + length > total) throw new Error("GLB chunk runs past the end of the file");
    if (type === 0x4e4f534a && json === undefined) {
      try {
        json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length)));
      } catch (error) {
        throw new Error(`GLB JSON chunk is not valid JSON: ${error.message}`);
      }
    } else if (type === 0x004e4942 && bin.length === 0) {
      bin = bytes.subarray(start, start + length);
    }
    at = start + length + ((4 - (length % 4)) % 4);
  }
  if (!json || typeof json !== "object") throw new Error("GLB has no JSON chunk");
  return { json, bin };
}

export function imageBytes({ json, bin }, image) {
  if (image.bufferView !== undefined) {
    const view = json.bufferViews?.[image.bufferView];
    if (!view) return undefined;
    const start = view.byteOffset ?? 0;
    return bin.subarray(start, start + view.byteLength);
  }
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(image.uri ?? "");
  if (!match) return undefined;
  return new Uint8Array(match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "latin1"));
}

function sceneRoots(json) {
  const scene = json.scenes?.[json.scene ?? 0];
  if (scene?.nodes) return scene.nodes;
  const children = new Set((json.nodes ?? []).flatMap((n) => n.children ?? []));
  return (json.nodes ?? []).map((_, i) => i).filter((i) => !children.has(i));
}

function accessorMax(glb, index) {
  const accessor = glb.json.accessors?.[index];
  if (!accessor) return 0;
  if (accessor.max?.[0] !== undefined) return accessor.max[0];
  const view = glb.json.bufferViews?.[accessor.bufferView];
  if (!view || accessor.componentType !== 5126) return 0;
  const data = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? 4;
  let max = 0;
  for (let i = 0; i < accessor.count; i++) max = Math.max(max, data.getFloat32(start + i * stride, true));
  return max;
}

/** The numbers the manifest records, read the way the pinned Assetforge reads them. */
export function measureGlb(bytes) {
  const glb = parseGlb(bytes);
  const { json } = glb;

  let triangles = 0;
  const seen = new Set();
  const visit = (index, depth) => {
    if (depth > 256 || seen.has(index)) return;
    const node = json.nodes?.[index];
    if (!node) return;
    seen.add(index);
    const mesh = node.mesh === undefined ? undefined : json.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives ?? []) {
      const mode = primitive.mode ?? 4;
      const count =
        primitive.indices !== undefined
          ? (json.accessors?.[primitive.indices]?.count ?? 0)
          : (json.accessors?.[primitive.attributes?.POSITION ?? -1]?.count ?? 0);
      if (mode === 4) triangles += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
    }
    for (const child of node.children ?? []) visit(child, depth + 1);
  };
  for (const root of sceneRoots(json)) visit(root, 0);

  let textureMaxPx = 0;
  const textureMediaTypes = new Set();
  for (const image of json.images ?? []) {
    const data = imageBytes(glb, image);
    textureMediaTypes.add(data ? sniffMediaType(data, image.mimeType) : (image.mimeType ?? "unknown"));
    const size = data && imageSize(data);
    if (size) textureMaxPx = Math.max(textureMaxPx, size.width, size.height);
  }

  let lods = 1;
  for (const node of json.nodes ?? []) {
    const ids = node.extensions?.MSFT_lod?.ids;
    if (ids) lods = Math.max(lods, 1 + ids.length);
  }

  const skins = json.skins ?? [];
  return {
    triangles,
    textureMaxPx,
    textureMediaTypes: [...textureMediaTypes],
    materials: json.materials?.length ?? 0,
    bones: new Set(skins.flatMap((s) => s.joints)).size,
    lods,
    clips: (json.animations ?? []).map((animation, index) => {
      let duration = 0;
      for (const sampler of animation.samplers ?? []) duration = Math.max(duration, accessorMax(glb, sampler.input));
      return { name: animation.name ?? `animation ${index}`, durationMs: Math.round(duration * 1000) };
    }),
    jointNames: (skins[0]?.joints ?? []).map((n) => json.nodes?.[n]?.name ?? `node ${n}`),
    extensionsUsed: json.extensionsUsed ?? [],
    extensionsRequired: json.extensionsRequired ?? [],
  };
}

// --- one side-file model against the profile ---

/** Validates a model with side files, world-side only: refusals stop the hand-off, flags are accepted and reported. */
export function validateSideFileModel({ profile, manifest, glb, templateBytes, kind = "character" }) {
  const refusals = [];
  const flags = [];
  const refuse = (code, detail) => refusals.push({ code, detail });
  const m = profile.model3d ?? {};
  const budgets = m.tiers?.desktop?.[kind] ?? m.budgets ?? {};

  if (m.units !== "m") refuse("format:units", `profile units are ${JSON.stringify(m.units)}, expected "m"`);

  let measured;
  try {
    measured = measureGlb(glb);
  } catch (error) {
    refuse("format:container", error.message);
    return { accepted: false, refusals, flags, measured: undefined };
  }

  for (const type of measured.textureMediaTypes) {
    if (!ACCEPTED_MEDIA.includes(type)) refuse("format:texture-media-type", `texture media type ${type} is not image/png or image/jpeg; KTX2 is a target-side build step`);
  }
  for (const key of BUDGET_KEYS) {
    if (measured[key] > budgets[key]) refuse(`over-budget:${key}`, `${key} ${measured[key]} over the hand-off ${kind} budget of ${budgets[key]}`);
  }

  if (manifest?.contentHash !== sha256(glb)) refuse("manifest:content-hash", `manifest contentHash ${manifest?.contentHash} is not the sha256 of the model ${sha256(glb)}`);
  for (const key of BUDGET_KEYS) {
    if (manifest?.model?.[key] !== measured[key]) refuse(`manifest:mismatch:${key}`, `manifest model.${key} is ${manifest?.model?.[key]}, measured ${measured[key]}`);
  }
  if (manifest?.source?.mediaType !== "model/gltf-binary" || manifest?.source?.kind !== "generated") {
    refuse("manifest:source", `source is ${manifest?.source?.kind} ${manifest?.source?.mediaType}, expected generated model/gltf-binary`);
  }
  const bounds = manifest?.model?.bounds;
  const finite = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  if (!finite(bounds?.min) || !finite(bounds?.max)) {
    refuse("manifest:bounds", "model.bounds is missing or not finite");
  } else {
    const height = bounds.max[1] - bounds.min[1];
    if (Math.abs(bounds.min[1]) > 1e-3) refuse("manifest:bounds", `model stands at y ${bounds.min[1]}, expected 0 within 1e-3`);
    if (!(height >= 0.05 && height <= 5)) refuse("manifest:bounds", `model height ${height} m is outside 0.05 to 5 m`);
  }
  const provenance = manifest?.provenance ?? {};
  for (const field of PROVENANCE_FIELDS) {
    const v = provenance[field];
    const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (typeof v === "object" && Object.keys(v).length === 0);
    if (empty) refuse(`manifest:provenance:${field}`, `provenance.${field} is missing or empty`);
  }

  const license = manifest?.license;
  const grant = provenance.outputGrant;
  if (license !== profile.license && !(profile.acceptedLicenses ?? []).includes(license)) {
    refuse("grant:license", `license ${JSON.stringify(license)} is neither ${profile.license} nor an accepted licence`);
  } else if (license === profile.license && grant?.relabel !== true) {
    refuse("grant:relabel", `the output grant does not allow relabelling to ${profile.license}`);
  }
  if (grant?.commercial !== true) refuse("grant:non-commercial", "the output grant does not allow commercial use");

  if (manifest?.model?.rig?.template !== m.rig?.template || manifest?.model?.rig?.sha256 !== sha256(templateBytes)) {
    refuse("rig:template", `manifest rig ${manifest?.model?.rig?.template} ${manifest?.model?.rig?.sha256} is not the profile's ${m.rig?.template} ${sha256(templateBytes)}`);
  }
  let expected = [];
  try {
    expected = JSON.parse(new TextDecoder().decode(templateBytes)).joints.map((j) => j.name);
  } catch {
    refuse("rig:template", "the rig template is not readable JSON with joints");
  }
  if (measured.jointNames.length !== expected.length || measured.jointNames.some((n, i) => n !== expected[i])) {
    refuse("rig:joints", `model joints (${measured.jointNames.length}) are not the template's ${expected.length} joints in template order`);
  }

  const set = m.clipSets?.[m.rig?.kind] ?? { required: [], generated: [] };
  const glbNames = measured.clips.map((c) => c.name);
  const manifestClips = manifest?.model?.clips ?? [];
  for (const family of set.generated ?? []) {
    if (glbNames.includes(family) && manifestClips.find((c) => c.name === family)?.generated !== true) {
      refuse(`clip:not-generated:${family}`, `"${family}" must be the generated gait but the manifest does not mark it generated`);
    }
  }
  const sameNames = (a, b) => a.length === b.length && [...a].sort().every((n, i) => n === [...b].sort()[i]);
  if (!sameNames(manifestClips.map((c) => c.name), glbNames)) {
    refuse("clip:mismatch", `manifest clips [${manifestClips.map((c) => c.name)}] differ from the model's [${glbNames}]`);
  }

  for (const [tier, t] of Object.entries(m.tiers ?? {})) {
    if (tier === "desktop" || !t?.[kind]) continue;
    for (const key of BUDGET_KEYS) {
      if (measured[key] > t[kind][key]) {
        flags.push({
          code: `tier:${tier}:${key}`,
          detail: `${key} ${measured[key]} over the ${tier} ${kind} budget of ${t[kind][key]}; the LOD chain must bring it within (${tier} status: ${t.status})`,
        });
      }
    }
  }
  for (const family of set.required) {
    if (!glbNames.includes(family)) flags.push({ code: `clip-missing:${family}`, detail: `no "${family}" clip in the model; never faked` });
  }

  return { accepted: refusals.length === 0, refusals, flags, measured };
}
