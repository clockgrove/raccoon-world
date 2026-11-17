// Facts the art and model tools decide from, read from a file's own structure or its manifest rather than its name.
// Dependency-free (node built-ins and the world's own GLB reader, no side effects) so CI can import it without the
// spike's devDependencies.
import { parseGlb } from "../../../art/tools/model3d-sidefiles.mjs";

/** Decision: the cast keeps 2048 px textures (Kirk: the cast rendered at very high quality); set pieces and props get
 * 1024, which is still above their on-screen size in the yard and close-up views (the environment look is painterly). */
export const MAX_TEXTURE = { cast: 2048, set: 1024 };

/** The JSON chunk of a GLB, parsed by the world's one GLB reader (art/tools/model3d-sidefiles.mjs). Throws on a non-GLB. */
export function glbJson(bytes) {
  return parseGlb(new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength)).json;
}

/** True when the GLB holds a mesh with triangles and declares no animations: a mesh to rank, not an armature-only
 * file or a provider's separate walk or running clip. */
export function isCandidateMesh(bytes) {
  const json = glbJson(bytes);
  if ((json.animations ?? []).length) return false;
  return (json.meshes ?? []).some((mesh) =>
    (mesh.primitives ?? []).some((p) => (p.mode ?? 4) === 4 && p.attributes?.POSITION != null));
}

const pathsIn = (value) => {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, v]) => (key === "path" && typeof v === "string" ? [v] : pathsIn(v)));
};

/**
 * Texture cap in pixels for the output made from `file` (repository-relative path of a glb or map, or undefined),
 * from its model `manifest` (or undefined). The cast decision is the manifest's kind (character-3d: MAX_TEXTURE.cast,
 * otherwise MAX_TEXTURE.set). A file a `model.tiers.<tier>` entry names takes that tier's declared cap: the tier's own
 * `textureMaxPx`, else the largest `textureMaxPx` over its levels; a tier that declares neither throws, so a tier file
 * never falls back to the desktop cap. Any other file takes `model.textureMaxPx`, else the cast decision. A cap never
 * exceeds the cast cap. Returns `{ cap, tier, cast }`: `tier` is the tier name or undefined, `cast` the cast decision's cap.
 */
export function textureCap({ manifest, file } = {}) {
  const cast = manifest?.kind === "character-3d" ? MAX_TEXTURE.cast : MAX_TEXTURE.set;
  const model = manifest?.model;
  const tier = file === undefined ? undefined
    : Object.keys(model?.tiers ?? {}).find((name) => pathsIn(model.tiers[name]).includes(file));
  if (tier === undefined) {
    const declared = model?.textureMaxPx;
    return { cap: Math.min(declared > 0 ? declared : cast, cast), tier, cast };
  }
  const entry = model.tiers[tier];
  const levelCaps = Object.values(entry.levels ?? {}).map((l) => l?.textureMaxPx).filter((px) => px > 0);
  const declared = entry.textureMaxPx > 0 ? entry.textureMaxPx : levelCaps.length ? Math.max(...levelCaps) : undefined;
  if (declared === undefined)
    throw new Error(`${file}: the manifest's ${tier} tier declares no textureMaxPx (on the tier or its levels), so its texture cap is unknown`);
  return { cap: Math.min(declared, cast), tier, cast };
}
