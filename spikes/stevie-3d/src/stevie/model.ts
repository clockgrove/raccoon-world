// Issue 77's 3D Stevie, ported to the product renderer (clockgrove#112): a generated GLB loaded through the
// extension point's loaders, either with the provider's own rig ("provider") or with the spike's stand-in
// skeleton and idle/walk clips fitted to the mesh ("fit", fit.ts). Every instance is a SkinnedMesh clone with
// its own AnimationMixer and its own MeshStandardNodeMaterial (the model's map, no outline).
import { THREE, type RendererContentContext } from "clockgrove-pin/apps/web/src/renderer-content.js";
import { clone as cloneSkinned } from "clockgrove-pin/apps/web/node_modules/three/examples/jsm/utils/SkeletonUtils.js";
import {
  CAMERA_ELEVATION,
  type Figure,
  HEADING_YAW,
  JUNIPER_TINT,
  KIT_SCALE,
  STEVIE_HEIGHT,
} from "./arm.js";
import { fitRig, type Joint, type V3 } from "./fit.js";

// biome-ignore lint/suspicious/noExplicitAny: the pinned Three namespace is used untyped here
type Any = any;
type Context = RendererContentContext;

/** Joints in yard axes (x forward, y left, z up), metres, at rest; each with its parent and segment end. */
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
      {
        name: `frontUpper${side}`,
        parent: "chest",
        at: [0.15, y, 0.24] as V3,
        end: [0.15, y, 0.12] as V3,
      },
      {
        name: `frontLower${side}`,
        parent: `frontUpper${side}`,
        at: [0.15, y, 0.12] as V3,
        end: [0.17, y, 0.0] as V3,
      },
      {
        name: `backUpper${side}`,
        parent: "hips",
        at: [-0.15, y, 0.25] as V3,
        end: [-0.13, y, 0.12] as V3,
      },
      {
        name: `backLower${side}`,
        parent: `backUpper${side}`,
        at: [-0.13, y, 0.12] as V3,
        end: [-0.12, y, 0.0] as V3,
      },
    ];
  }),
];
const JOINT_INDEX = new Map(JOINTS.map((joint, index) => [joint.name, index]));

const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);
const axisX = new THREE.Vector3(1, 0, 0);
/** A looping quaternion track sampled at `keys` points of `seconds`, from an angle function of phase. */
function rotationTrack(
  bone: string,
  axis: Any,
  seconds: number,
  angle: (phase: number) => number,
  keys = 12,
): Any {
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
const TAU = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;
/** Idle: 2.4 s of breathing, a slow look round and a lazy tail. Walk: a 0.8 s diagonal-pair gait. */
export const IDLE_SECONDS = 2.4;
export const WALK_SECONDS = 0.8;
function standInClips(hipsAt: V3 = [-0.14, 0, 0.3]): { idle: Any; walk: Any } {
  const s = Math.sin;
  const idle = new THREE.AnimationClip("idle", IDLE_SECONDS, [
    rotationTrack("chest", axisY, IDLE_SECONDS, (p) => deg(2.5) * s(p * TAU)),
    rotationTrack("neck", axisZ, IDLE_SECONDS, (p) => deg(12) * s(p * TAU)),
    rotationTrack("head", axisY, IDLE_SECONDS, (p) => deg(-4) * s(p * TAU * 2)),
    ...["tail1", "tail2", "tail3", "tail4"].map((bone, i) =>
      rotationTrack(bone, axisZ, IDLE_SECONDS, (p) => deg(7) * s(p * TAU - i * 0.6)),
    ),
  ]);
  const gait = (offset: number, amplitude: number) => (p: number) =>
    deg(amplitude) * s((p + offset) * TAU);
  const knee = (offset: number) => (p: number) =>
    deg(-22) * Math.max(0, s((p + offset) * TAU + 1.2));
  const bob = new THREE.VectorKeyframeTrack(
    "hips.position",
    Array.from({ length: 9 }, (_, k) => (k / 8) * WALK_SECONDS),
    Array.from({ length: 9 }, (_, k) => [
      hipsAt[0],
      hipsAt[1],
      hipsAt[2] + 0.012 * Math.cos((k / 8) * TAU * 2),
    ]).flat(),
  );
  const walk = new THREE.AnimationClip("walk", WALK_SECONDS, [
    bob,
    // Diagonal pairs move together: front-left with back-right, front-right with back-left.
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

function buildBones(joints: readonly Joint[] = JOINTS): Any[] {
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


export function timed<T>(steps: Record<string, number>, name: string, work: () => T): T {
  const start = performance.now();
  const result = work();
  steps[name] = Math.round((performance.now() - start) * 1_000) / 1_000;
  return result;
}

// ---- Loading ----------------------------------------------------------------------------------------

/** How a model is rigged: by its provider (kept as shipped), or by fitting the stand-in's skeleton and clips. */
export interface ModelSpec {
  readonly url: string;
  readonly rig: "provider" | "fit";
  /** Extra turn (radians about up) for a provider whose model does not face glTF's +z (Tripo faces -x). */
  readonly yaw?: number;
}
export interface ModelMetrics {
  readonly triangles: number;
  readonly vertices: number;
  readonly joints: number;
  readonly textures: readonly { name: string; width: number; height: number; bytes: number; format: string }[];
  readonly clips: readonly { name: string; seconds: number; tracks: number }[];
  readonly rigNotes: string;
}
/** One placed model in the content frame: y up, facing +x, centred, feet on y = 0, STEVIE_HEIGHT tall. */
export interface ModelInstance {
  readonly object: Any;
  pose(clip: "idle" | "walk", phase: number): void;
  tint(rgb: readonly [number, number, number]): void;
  /** The instance's own materials (for disposal). */
  readonly materials: readonly Any[];
}
export interface Model {
  readonly spec: ModelSpec;
  readonly metrics: ModelMetrics;
  readonly stepMs: Readonly<Record<string, number>>;
  /** Estimated texels per content unit of surface (fit models only; 0 when not computed). */
  readonly texelsPerUnit: number;
  instantiate(): ModelInstance;
}

const cache = new Map<string, Promise<Model>>();
/** Loads once per url: the 3D arm and the sprite arm share one fitted model. */
export function loadModel(context: Context, spec: ModelSpec): Promise<Model> {
  let model = cache.get(spec.url);
  if (!model) {
    model = build(context, spec);
    cache.set(spec.url, model);
  }
  return model;
}

/** glTF is y-up and faces +z; the yard is z-up with the character facing +x (y→z first, then −y→+x). */
const GLTF_TO_YARD = new THREE.Matrix4().makeRotationFromEuler(
  new THREE.Euler(Math.PI / 2, 0, Math.PI / 2, "ZYX"),
);

function litMaterial(source: Any): Any {
  return new THREE.MeshStandardNodeMaterial({
    map: source?.map ?? null,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    side: source?.side ?? THREE.FrontSide,
  });
}

function textureInfo(source: Any, slot: string) {
  const image = source.image ?? {};
  const mips: Any[] = source.mipmaps ?? [];
  const compressed = Boolean(source.isCompressedTexture);
  const bytes = compressed
    ? mips.reduce((sum, m) => sum + (m.data?.byteLength ?? 0), 0)
    : Math.round(image.width * image.height * 4 * (4 / 3));
  return {
    name: slot,
    width: image.width ?? 0,
    height: image.height ?? 0,
    bytes,
    format: compressed ? `compressed (three format ${source.format}, ${mips.length} mips)` : "uncompressed RGBA",
  };
}

function sceneMetrics(scene: Any) {
  let triangles = 0;
  let vertices = 0;
  let joints = 0;
  const textures: ModelMetrics["textures"][number][] = [];
  const seen = new Set<Any>();
  scene.traverse((node: Any) => {
    if (!node.isMesh) return;
    vertices += node.geometry.attributes.position.count;
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    if (node.isSkinnedMesh) joints = Math.max(joints, node.skeleton.bones.length);
    for (const slot of ["map", "normalMap", "roughnessMap", "metalnessMap"]) {
      const map = node.material?.[slot];
      if (map?.image && !seen.has(map)) {
        seen.add(map);
        textures.push(textureInfo(map, slot));
      }
    }
  });
  return { triangles, vertices, joints, textures };
}

/** sqrt(texels / surface area): how many texels of the map cover one content unit of the model's surface. */
function texelsPerUnit(geometry: Any, map: Any): number {
  const uv = geometry.attributes.uv;
  const position = geometry.attributes.position;
  if (!uv || !map?.image) return 0;
  const index = geometry.index;
  const count = (index?.count ?? position.count) / 3;
  const at = (k: number) => (index ? index.getX(k) : k);
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let area = 0;
  let uvArea = 0;
  for (let t = 0; t < count; t++) {
    const [i, j, k] = [at(t * 3), at(t * 3 + 1), at(t * 3 + 2)];
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, j).sub(a);
    c.fromBufferAttribute(position, k).sub(a);
    area += b.cross(c).length() / 2;
    const [u0, v0] = [uv.getX(i), uv.getY(i)];
    uvArea += Math.abs((uv.getX(j) - u0) * (uv.getY(k) - v0) - (uv.getX(k) - u0) * (uv.getY(j) - v0)) / 2;
  }
  return Math.sqrt((uvArea * map.image.width * map.image.height) / Math.max(1e-9, area));
}

/** Plays one clip at one time on a fresh mixer state: deterministic, no wall clock. */
function poser(root: Any, clips: { idle: Any; walk: Any }) {
  const mixer = new THREE.AnimationMixer(root);
  const actions = { idle: mixer.clipAction(clips.idle), walk: mixer.clipAction(clips.walk) };
  return (clip: "idle" | "walk", phase: number) => {
    for (const [name, action] of Object.entries(actions)) {
      if (name === clip) action.play();
      else action.stop();
    }
    mixer.setTime((phase % 1) * clips[clip].duration);
  };
}

/**
 * A copy of `source` with every vertex attribute as plain float32. The shipped GLBs carry quantized, normalized
 * int16 positions and normals (KHR_mesh_quantization, from meshopt); transforming those in place would clamp
 * every vertex to the attribute's [-1, 1] range and crush the mesh into a box.
 */
function floatGeometry(source: Any): Any {
  const geometry = source.clone();
  for (const [name, attribute] of Object.entries(geometry.attributes) as [string, Any][]) {
    if (attribute.array instanceof Float32Array && !attribute.isInterleavedBufferAttribute) continue;
    const values = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++)
      for (let c = 0; c < attribute.itemSize; c++)
        values[i * attribute.itemSize + c] = attribute.getComponent(i, c);
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
  }
  return geometry;
}

async function build(context: Context, spec: ModelSpec): Promise<Model> {
  const stepMs: Record<string, number> = {};
  let start = performance.now();
  const loaders = await context.loaders({ basis: "./decoders/", draco: "./decoders/" });
  const gltf: Any = await loaders.gltf.loadAsync(spec.url);
  (loaders as Any).dispose?.();
  stepMs.load = Math.round((performance.now() - start) * 1_000) / 1_000;
  const counted = sceneMetrics(gltf.scene);
  start = performance.now();
  gltf.scene.updateMatrixWorld(true);

  if (spec.rig === "fit") {
    let mesh: Any = null;
    gltf.scene.traverse((node: Any) => {
      if (node.isMesh && !mesh) mesh = node;
    });
    if (!mesh) throw new Error(`${spec.url} has no mesh`);
    const geometry = floatGeometry(mesh.geometry);
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.applyMatrix4(GLTF_TO_YARD);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const scale = STEVIE_HEIGHT / Math.max(1e-6, box.max.z - box.min.z);
    geometry.translate(-(box.max.x + box.min.x) / 2, -(box.max.y + box.min.y) / 2, -box.min.z);
    geometry.scale(scale, scale, scale);
    stepMs.normalise = Math.round((performance.now() - start) * 1_000) / 1_000;
    const rig = timed(stepMs, "fitSkeletonAndWeights", () => fitRig(geometry, JOINTS));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(rig.skinIndex, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(rig.skinWeight, 4));
    const at = (name: string) => rig.joints.find((j) => j.name === name)?.at ?? [0, 0, 0];
    const [hips, rootAt] = [at("hips"), at("root")];
    const clips = timed(stepMs, "buildClips", () =>
      standInClips([hips[0] - rootAt[0], hips[1] - rootAt[1], hips[2] - rootAt[2]]),
    );
    const map = mesh.material?.map ?? null;
    return {
      spec,
      stepMs,
      texelsPerUnit: texelsPerUnit(geometry, map),
      metrics: {
        ...counted,
        joints: rig.joints.length,
        clips: [clips.idle, clips.walk].map((c) => ({ name: c.name, seconds: c.duration, tracks: c.tracks.length })),
        rigNotes: `the spike's own skeleton and clips fitted to the generated mesh (fit.ts): ${rig.notes}`,
      },
      instantiate() {
        const bones = buildBones(rig.joints);
        const material = litMaterial(mesh.material);
        const skinned = new THREE.SkinnedMesh(geometry, material);
        skinned.add(bones[0]);
        skinned.updateMatrixWorld(true);
        skinned.bind(new THREE.Skeleton(bones));
        skinned.frustumCulled = false;
        const object = new THREE.Group();
        object.rotation.x = -Math.PI / 2; // yard (z up, x forward) to content (y up, x forward)
        object.add(skinned);
        const outer = new THREE.Group();
        outer.add(object);
        const pose = poser(outer, clips);
        pose("idle", 0);
        return {
          object: outer,
          pose,
          tint: (rgb) => material.color.setRGB(rgb[0], rgb[1], rgb[2]),
          materials: [material],
        };
      },
    };
  }

  // Provider rig: kept as shipped, held at its first clip's first key (or the bind pose), scaled to height.
  const held: Any = gltf.animations[0] ?? null;
  const inner = new THREE.Group();
  inner.add(gltf.scene);
  inner.rotation.y = Math.PI / 2 + (spec.yaw ?? 0); // glTF characters face +z; content faces +x
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner, true);
  const scale = STEVIE_HEIGHT / Math.max(1e-6, box.max.y - box.min.y);
  const centre = box.getCenter(new THREE.Vector3());
  stepMs.normalise = Math.round((performance.now() - start) * 1_000) / 1_000;
  const names: string[] = [];
  gltf.scene.traverse((n: Any) => n.isBone && names.push(n.name));
  return {
    spec,
    stepMs,
    texelsPerUnit: 0,
    metrics: {
      ...counted,
      clips: gltf.animations.map((c: Any) => ({ name: c.name, seconds: c.duration, tracks: c.tracks.length })),
      rigNotes: `the provider's auto-rig, ${counted.joints} joints, held at ${held ? `"${held.name}" at t=0` : "its bind pose"}`,
    },
    instantiate() {
      const model3d = cloneSkinned(gltf.scene);
      const materials: Any[] = [];
      model3d.traverse((node: Any) => {
        if (!node.isMesh) return;
        node.frustumCulled = false;
        node.material = litMaterial(node.material);
        materials.push(node.material);
      });
      const rotated = new THREE.Group();
      rotated.rotation.y = Math.PI / 2 + (spec.yaw ?? 0);
      rotated.scale.setScalar(scale);
      rotated.add(model3d);
      // After the scale, the bounding box centre is (centre * scale) in the rotated frame.
      rotated.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
      const outer = new THREE.Group();
      outer.add(rotated);
      if (held) {
        const mixer = new THREE.AnimationMixer(model3d);
        mixer.clipAction(held).play();
        mixer.setTime(0);
      }
      return {
        object: outer,
        pose() {},
        tint: (rgb) => {
          for (const m of materials) m.color.setRGB(rgb[0], rgb[1], rgb[2]);
        },
        materials,
      };
    },
  };
}

// ---- Placing a figure ---------------------------------------------------------------------------------

/**
 * anchor (context.place) → depth (undoes the placement's depth compression so normals light correctly) → tilt
 * (the camera's elevation) → yaw (the heading) → whatever the figure draws.
 */
export interface FigureFrame {
  readonly anchor: Any;
  readonly yaw: Any;
}
export function figureFrame(): FigureFrame {
  const anchor = new THREE.Group();
  const depth = new THREE.Group();
  depth.scale.set(1, 1, 1250);
  const tilt = new THREE.Group();
  tilt.rotation.x = CAMERA_ELEVATION;
  const yaw = new THREE.Group();
  tilt.add(yaw);
  depth.add(tilt);
  anchor.add(depth);
  return { anchor, yaw };
}
/** Positions the frame for a figure; yaw 0 faces screen-right and a positive heading turns towards the viewer. */
export function placeFigure(context: Context, frame: FigureFrame, figure: Figure): void {
  context.place(frame.anchor, figure.at);
  const s = figure.role === "kit" ? KIT_SCALE : 1;
  frame.anchor.scale.multiplyScalar(s);
  frame.anchor.scale.z /= s;
  frame.yaw.rotation.y = -HEADING_YAW[figure.heading];
}
export const tintOf = (figure: Figure): readonly [number, number, number] =>
  figure.role === "juniper" ? JUNIPER_TINT : [1, 1, 1];
export { GLTF_TO_YARD };
