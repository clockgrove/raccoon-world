import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { mediaFiles, repo, serve } from "../scripts/serve.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const glbJson = (bytes) => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));

test("approved Stevie ships meshopt geometry and all nine compressed manifest maps with source provenance", async () => {
  const files = await mediaFiles();
  assert.equal(files["stevie.glb"], path.join(repo, "references/web-media/stevie.glb"));
  const glb = glbJson(await readFile(files["stevie.glb"]));
  assert.ok(glb.extensionsRequired.includes("EXT_meshopt_compression"));
  assert.ok(glb.extensionsRequired.includes("KHR_texture_basisu"));
  const triangles = glb.meshes
    .flatMap((mesh) => mesh.primitives)
    .reduce((sum, primitive) => sum + glb.accessors[primitive.indices].count / 3, 0);
  assert.equal(triangles, 59847);
  assert.equal(glb.images.length, 4);
  for (const entry of Object.values(glb.asset.extras.lookdev.images)) {
    assert.equal(entry.image, undefined);
    assert.ok(entry.uri.endsWith(".ktx2"));
  }
  const originalGlb = glbJson(await readFile(files["source/stevie.glb"]));
  for (const image of originalGlb.images.filter((image) => image.uri))
    assert.ok(files[`source/${image.uri}`], `source GLB dependency ${image.uri}`);
  const prefix = "assets/models/stevie";
  const manifest = JSON.parse(await readFile(files[`${prefix}/manifest.json`], "utf8"));
  const source = JSON.parse(await readFile(files[`${prefix}/source-manifest.json`], "utf8"));
  assert.equal(manifest.model.groom.summer.length.maxLengthM, 0.04);
  assert.equal(manifest.model.groom.winter.length.maxLengthM, 0.08);
  const maps = [
    manifest.model.textures.baseColor,
    manifest.model.textures.tint.winter,
    manifest.model.eyes,
    ...Object.values(manifest.model.groom).flatMap(Object.values),
  ];
  assert.equal(maps.length, 9);
  for (const map of maps) {
    assert.ok(map.path.endsWith(".ktx2"));
    const bytes = await readFile(files[map.path]);
    assert.deepEqual(
      [...bytes.subarray(0, 12)],
      [171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10],
    );
    assert.equal(sha256(bytes), map.sha256);
    assert.ok(bytes.readUInt32LE(40) > 1, `${map.path} has mipmaps`);
  }
  assert.deepEqual(
    source,
    JSON.parse(await readFile(path.join(repo, prefix, "manifest.json"), "utf8")),
  );
  assert.deepEqual(
    await readFile(files[`${prefix}/stevie.glb.provenance.json`]),
    await readFile(path.join(repo, prefix, "stevie.glb.provenance.json")),
  );
});

test("development media serves compressed map and manifest URLs", async () => {
  const { server, url } = await serve();
  try {
    const response = await fetch(`${url}media/assets/models/stevie/manifest.json`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/json");
    const manifest = await response.json();
    const image = await fetch(`${url}media/${manifest.model.groom.winter.direction.path}`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/ktx2");
    assert.equal(
      sha256(Buffer.from(await image.arrayBuffer())),
      manifest.model.groom.winter.direction.sha256,
    );
  } finally {
    await server.close();
  }
});
