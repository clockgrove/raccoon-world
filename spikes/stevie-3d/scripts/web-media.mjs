#!/usr/bin/env node
// Web media: the owner's 3D standard (ship.mjs) applied to a finished model without touching its geometry. Textures
// become KTX2 (UASTC for normal and groom data maps, ETC1S for colour, mipmapped; 2048 px for the cast, 1024 for the set) and geometry gets
// EXT_meshopt_compression. No simplification, no renaming, no re-scaling: the shipped file draws what the source draws.
// The outputs and references/web-media/web-media.json are committed, so a page build stays fast and needs none of these
// tools. serve.mjs uses an output only while its recorded source sha256 still matches the source file.
//
//   node scripts/web-media.mjs <name>=<source.glb> ...   encode each source to references/web-media/<name>.glb
//                                                        (cast-<name> or stevie: cast textures; anything else: set)
//   node scripts/web-media.mjs stevie                    the approved Stevie model and nine manifest maps only
//   node scripts/web-media.mjs lab                       the quality lab's media (Stevie and the ceiling's props)
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@gltf-transform/core";
import * as extensions from "@gltf-transform/extensions";
import * as functions from "@gltf-transform/functions";
import { encodeToKTX2 } from "ktx2-encoder";
import { ktx2 } from "ktx2-encoder/gltf-transform";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const OUT = path.join(repo, "references/web-media");
const MANIFEST = path.join(OUT, "web-media.json");
/** Decision: the cast keeps 2048 px textures (Kirk: the cast rendered at very high quality); set pieces and props get
 * 1024, which is still above their on-screen size in the yard and close-up views (the environment look is painterly). */
const MAX_TEXTURE = { cast: 2048, set: 1024 };
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const TOOLS = Object.fromEntries(["@gltf-transform/core", "ktx2-encoder", "meshoptimizer", "sharp"].map((n) => [n, pkg.devDependencies[n]]));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (file) => path.relative(repo, file).split(path.sep).join("/");

const STEVIE = path.join(repo, "assets/models/stevie/stevie.glb");

/** The approved c1 Stevie and the ceiling's generated props. */
function labSources() {
  const props = path.join(repo, "references/ceiling-3d/props");
  const sources = { stevie: STEVIE };
  for (const file of readdirSync(props)) if (file.endsWith(".glb")) sources[`prop-${file.slice(0, -4)}`] = path.join(props, file);
  return sources;
}

/** Triangles and texture count from the GLB's own JSON, independent of glTF-Transform. */
function measure(bytes) {
  const buffer = Buffer.from(bytes);
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  let triangles = 0;
  for (const mesh of json.meshes ?? [])
    for (const p of mesh.primitives)
      if ((p.mode ?? 4) === 4) triangles += (p.indices != null ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3;
  return { bytes: buffer.length, triangles: Math.round(triangles), textures: (json.images ?? []).length };
}

const decoder = (max) => async (buffer) => {
  let image = sharp(buffer);
  const { width, height } = await image.metadata();
  if (Math.max(width, height) > max) image = image.resize({ width: max, height: max, fit: "inside" });
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
};
const encodings = [
  // Normal maps stay UASTC (ETC1S bands them); RDO plus Zstandard supercompression keep them small on the wire.
  { slots: /^normalTexture$/, isUASTC: true, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false, needSupercompression: true, enableRDO: true, rdoQualityLevel: 1 },
  { slots: /^(metallicRoughnessTexture|occlusionTexture)$/, isUASTC: false, isPerceptual: false, isSetKTX2SRGBTransferFunc: false },
  { slots: /^(baseColorTexture|emissiveTexture)$/, isUASTC: false, isPerceptual: true, isSetKTX2SRGBTransferFunc: true },
];
const encodingsFor = (max) => encodings.map((options) => ktx2({ ...options, generateMipmap: true, imageDecoder: decoder(max) }));

async function stevieMaps(manifest) {
  const sourceFile = path.join(repo, "assets/models/stevie/manifest.json");
  const source = JSON.parse(await readFile(sourceFile, "utf8"));
  const web = structuredClone(source);
  web.webMedia = { sourceManifest: "assets/models/stevie/source-manifest.json", sourceSha256: sha256(await readFile(sourceFile)) };
  const folder = path.join(OUT, "assets/models/stevie");
  await mkdir(folder, { recursive: true });
  const maps = [
    [web.model.textures.baseColor, true],
    [web.model.textures.tint.winter, true],
    [web.model.eyes, false],
    ...Object.values(web.model.groom).flatMap((coat) => Object.values(coat).map((map) => [map, false])),
  ];
  for (const [map, colour] of maps) {
    const bytes = await readFile(path.join(repo, map.path));
    if (sha256(bytes) !== map.sha256) throw new Error(`${map.path}: source hash does not match manifest`);
    const key = map.path.replace(/\.png$/u, ".ktx2");
    // Data maps use UASTC to retain vector components and mask gradients; colours follow the lab's ETC1S standard.
    const options = { isUASTC: !colour, isPerceptual: colour, isSetKTX2SRGBTransferFunc: colour,
      needSupercompression: !colour, generateMipmap: true, imageDecoder: decoder(MAX_TEXTURE.cast) };
    const output = await encodeToKTX2(new Uint8Array(bytes), options);
    await writeFile(path.join(OUT, key), output);
    manifest.files[key] = { source: map.path, sourceSha256: map.sha256, sha256: sha256(output),
      sourceBytes: bytes.length, bytes: output.length, colourSpace: colour ? "srgb" : "linear" };
    map.path = key;
    map.sha256 = sha256(output);
    console.log(`${key}: ${(bytes.length / 1e6).toFixed(2)} MB → ${(output.length / 1e6).toFixed(2)} MB`);
  }
  const webBytes = Buffer.from(`${JSON.stringify(web, null, 2)}\n`);
  await writeFile(path.join(folder, "manifest.json"), webBytes);
  manifest.files["assets/models/stevie/manifest.json"] = { source: rel(sourceFile),
    sourceSha256: sha256(await readFile(sourceFile)), sha256: sha256(webBytes), bytes: webBytes.length };
  await writeFile(path.join(folder, "source-manifest.json"), await readFile(sourceFile));
  await writeFile(path.join(folder, "stevie.glb.provenance.json"), await readFile(`${STEVIE}.provenance.json`));
}

async function main() {
  const args = process.argv.slice(2);
  const sources = args[0] === "lab" ? labSources() : args[0] === "stevie" ? { stevie: STEVIE } : Object.fromEntries(args.map((a) => a.split("=")).map(([n, f]) => [n, path.resolve(f)]));
  if (!Object.keys(sources).length) throw new Error("usage: web-media.mjs lab | <name>=<source.glb> ...");
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new core.NodeIO()
    .registerExtensions(extensions.ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  const manifest = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, "utf8")) : { tools: TOOLS, files: {} };
  manifest.tools = TOOLS;
  for (const [name, file] of Object.entries(sources)) {
    const bytes = new Uint8Array(await readFile(file));
    if (Buffer.from(bytes.subarray(0, 4)).toString() !== "glTF") throw new Error(`${rel(file)} is not a glTF binary (is Git LFS fetched?)`);
    const started = performance.now();
    const document = await io.read(file);
    // The picked GLB declares external groom images outside material slots; ship those through the manifest below.
    for (const texture of document.getRoot().listTextures())
      if (texture.listParents().every((parent) => parent === document.getRoot())) texture.dispose();
    await document.transform(...encodingsFor(name === "stevie" || name.startsWith("cast-") ? MAX_TEXTURE.cast : MAX_TEXTURE.set));
    await document.transform(functions.meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    const lookdev = document.getRoot().getAsset().extras?.lookdev;
    if (name === "stevie" && lookdev?.images) {
      for (const entry of Object.values(lookdev.images)) {
        delete entry.image;
        entry.uri = `assets/models/stevie/${entry.uri.replace(/\.png$/u, ".ktx2")}`;
      }
    }
    const shipped = new Uint8Array(await io.writeBinary(document));
    const target = path.join(OUT, `${name}.glb`);
    await writeFile(target, shipped);
    const source = measure(bytes);
    const output = measure(shipped);
    if (output.triangles !== source.triangles) throw new Error(`${name}: triangles changed (${source.triangles} → ${output.triangles})`);
    const sourceJson = JSON.parse(Buffer.from(bytes).subarray(20, 20 + Buffer.from(bytes).readUInt32LE(12)).toString());
    const sourceDependencies = {};
    for (const image of sourceJson.images ?? []) if (image.uri) {
      const dependency = path.resolve(path.dirname(file), image.uri);
      sourceDependencies[rel(dependency)] = sha256(await readFile(dependency));
    }
    manifest.files[`${name}.glb`] = { sourceDependencies, source: rel(file), sourceSha256: sha256(bytes), sha256: sha256(shipped), sourceBytes: source.bytes, bytes: output.bytes, triangles: output.triangles };
    console.log(`${name}: ${(source.bytes / 1e6).toFixed(2)} MB → ${(output.bytes / 1e6).toFixed(2)} MB, ${output.triangles} triangles (${((performance.now() - started) / 1000).toFixed(0)} s)`);
  }
  if (sources.stevie === STEVIE) await stevieMaps(manifest);
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

await main();
