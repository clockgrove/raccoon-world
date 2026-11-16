// Facts the art and model tools decide from, read from a file's own structure or its manifest rather than its name.
// Dependency-free (node built-ins only, no side effects) so CI can import it without the spike's devDependencies.

/** Decision: the cast keeps 2048 px textures (Kirk: the cast rendered at very high quality); set pieces and props get
 * 1024, which is still above their on-screen size in the yard and close-up views (the environment look is painterly). */
export const MAX_TEXTURE = { cast: 2048, set: 1024 };

/** The JSON chunk of a GLB, parsed. Throws when the bytes are not a glTF 2 binary. */
export function glbJson(bytes) {
  const buffer = Buffer.from(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength);
  if (buffer.length < 20 || buffer.toString("latin1", 0, 4) !== "glTF") throw new Error("not a glTF binary");
  if (buffer.readUInt32LE(4) !== 2) throw new Error("not glTF version 2");
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first GLB chunk is not JSON");
  return JSON.parse(buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)));
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
 * otherwise MAX_TEXTURE.set). A file a `model.tiers.<tier>` entry names takes that tier's cap, the largest
 * `textureMaxPx` over the tier's levels; any other file takes `model.textureMaxPx`. A cap never exceeds the cast cap.
 * Returns `{ cap, tier, cast }`: `tier` is the tier name or undefined, `cast` the cast decision's cap.
 */
export function textureCap({ manifest, file } = {}) {
  const cast = manifest?.kind === "character-3d" ? MAX_TEXTURE.cast : MAX_TEXTURE.set;
  const model = manifest?.model;
  const tier = file === undefined ? undefined
    : Object.keys(model?.tiers ?? {}).find((name) => pathsIn(model.tiers[name]).includes(file));
  const declared = tier === undefined
    ? model?.textureMaxPx
    : Math.max(...Object.values(model.tiers[tier].levels ?? {}).map((l) => l.textureMaxPx ?? 0));
  return { cap: Math.min(declared > 0 ? declared : cast, cast), tier, cast };
}
