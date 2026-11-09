// Stevie for the 3D look proof (issue 26): the #77 Meshy multi-image mesh in ship form (ship-meshy-fit.glb,
// CC BY 4.0, "3D model generated with Meshy (meshy.ai)"), with the #77 spike's quadruped skeleton fitted at
// load (fit.ts) and its procedural idle and walk clips, re-shaded in the slice's one material and outline.
// Meshy's own rig is a humanoid skeleton whose walk rears the raccoon up and tears the mesh (#77), so it is
// not used. Joints and clips are those of spikes/stevie-3d/src/stevie/model.ts.
import type { RendererContentContext } from "@pin/apps/web/src/renderer-content.ts";
import { THREE } from "@pin/apps/web/src/renderer-content.ts";
import { fitRig, type Joint, type V3 } from "./fit.ts";
import { HEADING_YAW, STEVIE_HEIGHT, normalRotation, outline, setYaw, surface } from "./look.ts";

// biome-ignore lint/suspicious/noExplicitAny: three objects crossing the GLTF loader boundary.
type Any = any;
export type StevieClip = "idle" | "walk";

/** Joints in yard axes (x forward, y left, z up), metres, at rest (model.ts JOINTS). */
const JOINTS: readonly Joint[] = [
  { name: "root", parent: null, at: [0, 0, 0], end: [0, 0, 0.1] },
  { name: "hips", parent: "root", at: [-0.14, 0, 0.3], end: [0, 0, 0.32] },
  { name: "spine", parent: "hips", at: [0, 0, 0.32], end: [0.13, 0, 0.31] },
  { name: "chest", parent: "spine", at: [0.13, 0, 0.31], end: [0.2, 0, 0.35] },
  { name: "neck", parent: "chest", at: [0.2, 0, 0.35], end: [0.27, 0, 0.39] },
  { name: "head", parent: "neck", at: [0.27, 0, 0.39], end: [0.42, 0, 0.37] },
  { name: "tail1", parent: "hips", at: [-0.27, 0, 0.29], end: [-0.37, 0, 0.25] },
  { name: "tail2", parent: "tail1", at: [-0.37, 0, 0.25], end: [-0.46, 0, 0.21] },
  { name: "tail3", parent: "tail2", at: [-0.46, 0, 0.21], end: [-0.54, 0, 0.19] },
  { name: "tail4", parent: "tail3", at: [-0.54, 0, 0.19], end: [-0.62, 0, 0.19] },
  ...(["L", "R"] as const).flatMap((side) => {
    const y = side === "L" ? 0.09 : -0.09;
    return [
      { name: `frontUpper${side}`, parent: "chest", at: [0.15, y, 0.24] as V3, end: [0.15, y, 0.12] as V3 },
      { name: `frontLower${side}`, parent: `frontUpper${side}`, at: [0.15, y, 0.12] as V3, end: [0.17, y, 0.0] as V3 },
      { name: `backUpper${side}`, parent: "hips", at: [-0.15, y, 0.25] as V3, end: [-0.13, y, 0.12] as V3 },
      { name: `backLower${side}`, parent: `backUpper${side}`, at: [-0.13, y, 0.12] as V3, end: [-0.12, y, 0.0] as V3 },
    ];
  }),
];

const TAU = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;
export const IDLE_SECONDS = 2.4;
export const WALK_SECONDS = 0.8;
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);

function rotationTrack(bone: string, axis: Any, seconds: number, angle: (phase: number) => number, keys = 12) {
  const times: number[] = [];
  const values: number[] = [];
  const q = new THREE.Quaternion();
  for (let k = 0; k <= keys; k++) {
    const phase = k / keys;
    times.push(phase * seconds);
    q.setFromAxisAngle(axis, angle(phase));
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
}

/** Idle: 2.4 s of breathing, a slow look round and a lazy tail. Walk: a 0.8 s diagonal-pair gait (model.ts). */
function clips(hipsAt: V3) {
  const s = Math.sin;
  const idle = new THREE.AnimationClip("idle", IDLE_SECONDS, [
    rotationTrack("chest", axisY, IDLE_SECONDS, (p) => deg(2.5) * s(p * TAU)),
    rotationTrack("neck", axisZ, IDLE_SECONDS, (p) => deg(12) * s(p * TAU)),
    rotationTrack("head", axisY, IDLE_SECONDS, (p) => deg(-4) * s(p * TAU * 2)),
    ...["tail1", "tail2", "tail3", "tail4"].map((bone, i) =>
      rotationTrack(bone, axisZ, IDLE_SECONDS, (p) => deg(7) * s(p * TAU - i * 0.6)),
    ),
  ]);
  const gait = (offset: number, amplitude: number) => (p: number) => deg(amplitude) * s((p + offset) * TAU);
  const knee = (offset: number) => (p: number) => deg(-22) * Math.max(0, s((p + offset) * TAU + 1.2));
  const bob = new THREE.VectorKeyframeTrack(
    "hips.position",
    Array.from({ length: 9 }, (_, k) => (k / 8) * WALK_SECONDS),
    Array.from({ length: 9 }, (_, k) => [hipsAt[0], hipsAt[1], hipsAt[2] + 0.012 * Math.cos((k / 8) * TAU * 2)]).flat(),
  );
  const walk = new THREE.AnimationClip("walk", WALK_SECONDS, [
    bob,
    rotationTrack("frontUpperL", axisY, WALK_SECONDS, gait(0, 28)),
    rotationTrack("backUpperR", axisY, WALK_SECONDS, gait(0, 28)),
    rotationTrack("frontUpperR", axisY, WALK_SECONDS, gait(0.5, 28)),
    rotationTrack("backUpperL", axisY, WALK_SECONDS, gait(0.5, 28)),
    rotationTrack("frontLowerL", axisY, WALK_SECONDS, knee(0)),
    rotationTrack("backLowerR", axisY, WALK_SECONDS, knee(0)),
    rotationTrack("frontLowerR", axisY, WALK_SECONDS, knee(0.5)),
    rotationTrack("backLowerL", axisY, WALK_SECONDS, knee(0.5)),
    rotationTrack("chest", axisX, WALK_SECONDS, (p) => deg(3) * s(p * TAU)),
    rotationTrack("head", axisY, WALK_SECONDS, (p) => deg(3) * s(p * TAU * 2)),
    ...["tail1", "tail2", "tail3", "tail4"].map((bone, i) =>
      rotationTrack(bone, axisZ, WALK_SECONDS, (p) => deg(10) * s(p * TAU - i * 0.8)),
    ),
  ]);
  return { idle, walk };
}

function buildBones(joints: readonly Joint[]) {
  const bones: Any[] = [];
  const index = new Map(joints.map((joint, i) => [joint.name, i]));
  for (const joint of joints) {
    const bone = new THREE.Bone();
    bone.name = joint.name;
    const parent = joint.parent ? joints[index.get(joint.parent) ?? 0] : null;
    bone.position.set(
      joint.at[0] - (parent?.at[0] ?? 0),
      joint.at[1] - (parent?.at[1] ?? 0),
      joint.at[2] - (parent?.at[2] ?? 0),
    );
    if (joint.parent) bones[index.get(joint.parent) ?? 0].add(bone);
    bones.push(bone);
  }
  return bones;
}

/** glTF is y-up and faces +z; the yard is z-up with the character facing +x (model.ts GLTF_TO_YARD). */
const GLTF_TO_YARD = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2, "ZYX"));

/** A float, de-quantised, yard-axis copy of the loaded mesh (KHR_mesh_quantization stores normalised ints). */
function yardGeometry(mesh: Any) {
  mesh.updateWorldMatrix(true, false);
  const transform = new THREE.Matrix4().multiplyMatrices(GLTF_TO_YARD, mesh.matrixWorld);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
  const source = mesh.geometry;
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const uv = source.getAttribute("uv");
  const positions = new Float32Array(position.count * 3);
  const normals = new Float32Array(position.count * 3);
  const uvs = new Float32Array(position.count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(transform);
    positions.set([v.x, v.y, v.z], i * 3);
    if (normal) {
      v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      normals.set([v.x, v.y, v.z], i * 3);
    }
    if (uv) uvs.set([uv.getX(i), uv.getY(i)], i * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normal) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  if (uv) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const index = source.getIndex();
  if (index) geometry.setIndex(Array.from({ length: index.count }, (_, i) => index.getX(i)));
  if (!normal) geometry.computeVertexNormals();
  // Centre on the feet and scale to Stevie's height.
  geometry.computeBoundingBox();
  const box = geometry.boundingBox as Any;
  const scale = STEVIE_HEIGHT / Math.max(1e-6, box.max.z - box.min.z);
  geometry.translate(-(box.max.x + box.min.x) / 2, -(box.max.y + box.min.y) / 2, -box.min.z);
  geometry.scale(scale, scale, scale);
  return geometry;
}

export interface Stevie {
  /** The heading group: place it at Stevie's spot in yard metres; it turns about z. */
  readonly root: Any;
  readonly metrics: Record<string, unknown>;
  pose(clip: StevieClip, heading: string, seconds: number): void;
  dispose(): void;
}

export async function loadStevie(context: RendererContentContext, url: string): Promise<Stevie> {
  const started = performance.now();
  const { gltf } = await context.loaders({ basis: "/decoders/basis/", draco: "/decoders/draco/" });
  const loaded = await gltf.loadAsync(url);
  context.signal.throwIfAborted();
  const loadMs = performance.now() - started;
  let source: Any;
  loaded.scene.traverse((node: Any) => {
    if (!source && node.isMesh) source = node;
  });
  if (!source) throw new Error("Stevie's glTF holds no mesh");
  const map = source.material.map;
  const geometry = yardGeometry(source);
  source.geometry.dispose();
  const fitStarted = performance.now();
  const rig = fitRig(geometry, JOINTS);
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(rig.skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(rig.skinWeight, 4));
  const at = (name: string) => rig.joints.find((j) => j.name === name)?.at ?? ([0, 0, 0] as V3);
  const [hips, rootAt] = [at("hips"), at("root")];
  const animation = clips([hips[0] - rootAt[0], hips[1] - rootAt[1], hips[2] - rootAt[2]]);
  const fitMs = performance.now() - fitStarted;

  const normal = normalRotation(HEADING_YAW["three-quarter"]);
  const bones = buildBones(rig.joints);
  const skeleton = new THREE.Skeleton(bones);
  const body = new THREE.SkinnedMesh(geometry, surface({ map, roughness: 0.9, normal }));
  body.name = "stevie-body";
  body.add(bones[0]);
  body.updateMatrixWorld(true);
  body.bind(skeleton);
  const hull = new THREE.SkinnedMesh(geometry, outline("normal"));
  hull.name = "stevie-outline";
  hull.bind(skeleton, body.bindMatrix);
  body.add(hull);
  body.frustumCulled = false;
  hull.frustumCulled = false;
  const root = new THREE.Group();
  root.name = "stevie";
  root.add(body);

  const mixer = new THREE.AnimationMixer(body);
  const actions = { idle: mixer.clipAction(animation.idle), walk: mixer.clipAction(animation.walk) };
  const index = geometry.getIndex();
  return {
    root,
    metrics: {
      source: "references/stevie/77-3d/ship-meshy-fit.glb",
      triangles: (index?.count ?? geometry.getAttribute("position").count) / 3,
      vertices: geometry.getAttribute("position").count,
      joints: rig.joints.length,
      texture: map?.image ? `${map.image.width}×${map.image.height} KTX2` : "none",
      clips: [animation.idle, animation.walk].map((c) => ({ name: c.name, seconds: c.duration, tracks: c.tracks.length })),
      rig: rig.notes,
      loadMs: Math.round(loadMs),
      fitMs: Math.round(fitMs),
    },
    pose(clip, heading, seconds) {
      for (const [name, action] of Object.entries(actions)) {
        if (name === clip) action.play();
        else action.stop();
      }
      mixer.setTime(seconds % animation[clip].duration);
      const yaw = HEADING_YAW[heading] ?? 0;
      root.rotation.z = yaw;
      setYaw(normal, yaw);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(body);
      loaded.scene.traverse((node: Any) => node.material?.dispose?.());
    },
  };
}
