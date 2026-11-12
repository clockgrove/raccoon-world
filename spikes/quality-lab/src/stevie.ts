// Stevie in the quality lab (issue 45): the c3 rigged GLB walking a loop of the yard at the clip's recorded speed,
// with fur shells (0, 4, 8 or 16) and silhouette fins as two independent knobs.
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { attribute, color, float, fract, mix, mx_noise_float, smoothstep, texture, uv, vec2 } from "three/tsl";
import { furShell } from "../../ceiling-3d/src/materials.ts";
import type { FurShells } from "./config.ts";

// biome-ignore lint/suspicious/noExplicitAny: three objects and node graphs crossing the loader boundary.
type Any = any;

export interface WalkLoop {
  centre: THREE.Vector3;
  radius: number;
}

export interface LabStevie {
  readonly root: THREE.Object3D;
  readonly speedMps: number;
  readonly metrics: Record<string, unknown>;
  readonly position: THREE.Vector3;
  setFur(shells: FurShells, fins: boolean): void;
  update(seconds: number): void;
}

const SOURCE = "references/stevie/3d-wave0-candidates/c3-rigged/c3-rigged.glb";
const RECORDED_SPEED = 0.268;
const FUR_LENGTH = 0.012;
const MAX_FIN_EDGES = 5000;

function recordedSpeed(gltf: Any): number {
  const lists = [gltf.parser?.json?.extras?.output?.clips, gltf.asset?.extras?.output?.clips, gltf.asset?.extras?.clips];
  for (const list of lists) {
    const entries: Any[] = Array.isArray(list) ? list : list && typeof list === "object" ? Object.values(list) : [];
    const walk = entries.find((c) => c?.name === "walk" && Number.isFinite(c.speedMps));
    if (walk) return walk.speedMps;
  }
  return RECORDED_SPEED;
}

/** Quads along a deterministic sample of the mesh's edges, each pushed out along the vertex normals, skinned like the body. */
function finGeometry(source: THREE.BufferGeometry, length: number): THREE.BufferGeometry {
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const uvs = source.getAttribute("uv");
  const skinIndex = source.getAttribute("skinIndex");
  const skinWeight = source.getAttribute("skinWeight");
  const index = source.getIndex();
  const corners = index ? index.count : position.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const seen = new Set<number>();
  const edges: [number, number][] = [];
  for (let t = 0; t + 2 < corners; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = at(t + k);
      const b = at(t + ((k + 1) % 3));
      const key = Math.min(a, b) * position.count + Math.max(a, b);
      if (a === b || seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }
  const stride = Math.max(1, Math.ceil(edges.length / MAX_FIN_EDGES));
  const chosen = edges.filter((_, i) => i % stride === 0);
  const n = chosen.length * 4;
  const pos = new Float32Array(n * 3);
  const uv0 = new Float32Array(n * 2);
  const fin = new Float32Array(n * 2);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const idx = new Uint32Array(chosen.length * 6);
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  chosen.forEach(([a, b], e) => {
    for (let k = 0; k < 4; k++) {
      const v = (k & 1 ? b : a);
      const top = k >> 1;
      const o = e * 4 + k;
      p.fromBufferAttribute(position, v);
      nrm.fromBufferAttribute(normal, v);
      p.addScaledVector(nrm, top * length);
      pos.set([p.x, p.y, p.z], o * 3);
      if (uvs) uv0.set([uvs.getX(v), uvs.getY(v)], o * 2);
      fin.set([(k & 1) * 0.5 + (e % 7) * 0.13, top], o * 2);
      for (let j = 0; j < 4; j++) {
        si[o * 4 + j] = skinIndex.getComponent(v, j);
        sw[o * 4 + j] = skinWeight.getComponent(v, j);
      }
    }
    const o = e * 4;
    idx.set([o, o + 1, o + 2, o + 1, o + 3, o + 2], e * 6);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv0, 2));
  geometry.setAttribute("fin", new THREE.BufferAttribute(fin, 2));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  return geometry;
}

function finMaterial(map: THREE.Texture | null) {
  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const f: Any = attribute("fin", "vec2");
  const strands = f.x.mul(float(20));
  const strand = mx_noise_float(vec2(strands.floor(), 0.5)).mul(0.5).add(0.5);
  const across = fract(strands).sub(0.5).abs();
  const height = f.y;
  // Strands thin towards the tip, and shorter ones end early.
  material.opacityNode = smoothstep(height, height.add(0.15), strand).mul(smoothstep(across, across.add(0.05), float(0.45).mul(float(1).sub(height)).add(0.05)));
  material.alphaTest = 0.5;
  const base: Any = map ? texture(map, uv()).rgb : color(new THREE.Color(0x6a5c50));
  material.colorNode = base.mul(mix(float(0.7), float(1.1), height));
  material.roughness = 0.9;
  return material;
}

export async function loadStevie(url: string, loop: WalkLoop, onProgress?: (event: ProgressEvent) => void): Promise<LabStevie> {
  const started = performance.now();
  const gltf: Any = await new GLTFLoader().loadAsync(url, onProgress);
  let body: THREE.SkinnedMesh | undefined;
  gltf.scene.traverse((node: Any) => {
    if (!body && node.isSkinnedMesh) body = node;
  });
  if (!body) throw new Error("Stevie's glTF holds no skinned mesh");
  const skinned: THREE.SkinnedMesh = body;
  const clip: THREE.AnimationClip = gltf.animations.find((c: THREE.AnimationClip) => c.name === "walk") ?? gltf.animations[0];
  if (!clip) throw new Error("Stevie's glTF holds no walk clip");
  const speedMps = recordedSpeed(gltf);

  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  const material = skinned.material as Any;
  const map: THREE.Texture | null = material.map ?? null;
  const geometry = skinned.geometry;
  const parent = skinned.parent ?? gltf.scene;

  const attach = (mesh: THREE.SkinnedMesh) => {
    mesh.position.copy(skinned.position);
    mesh.quaternion.copy(skinned.quaternion);
    mesh.scale.copy(skinned.scale);
    mesh.bind(skinned.skeleton, skinned.bindMatrix);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.visible = false;
    parent.add(mesh);
    return mesh;
  };

  // Shell sets are built the first time a count is asked for and then kept; switching only toggles visibility.
  const shellSets = new Map<number, THREE.SkinnedMesh[]>();
  const shellsFor = (count: number) => {
    let set = shellSets.get(count);
    if (!set) {
      set = [];
      for (let layer = 1; layer <= count; layer++) {
        const shell = new THREE.SkinnedMesh(geometry, furShell(map ?? new THREE.Texture(), layer, count, FUR_LENGTH));
        shell.name = `stevie-fur-${count}-${layer}`;
        set.push(attach(shell));
      }
      shellSets.set(count, set);
    }
    return set;
  };

  // Fins approximate classic view-dependent silhouette fins: quads on mesh edges standing out along the normals.
  let fins: THREE.SkinnedMesh | undefined;
  const makeFins = () => {
    fins ??= attach(new THREE.SkinnedMesh(finGeometry(geometry, FUR_LENGTH * 1.5), finMaterial(map)));
    fins.name = "stevie-fins";
    return fins;
  };

  // glTF faces +z; the y-up to z-up turn sends that to -y, so a yaw of (heading + pi/2) points it along `heading`
  // measured from east. Walking counter-clockwise, the heading at angle a on the loop is a + pi/2, hence yaw a + pi.
  const turn = new THREE.Group();
  turn.rotation.x = Math.PI / 2;
  turn.add(gltf.scene);
  const root = new THREE.Group();
  root.name = "stevie";
  root.add(turn);
  const position = new THREE.Vector3(loop.centre.x + loop.radius, loop.centre.y, 0);

  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(clip).play();

  let triangles = 0;
  gltf.scene.traverse((node: Any) => {
    if (node.isMesh) triangles += (node.geometry.getIndex()?.count ?? node.geometry.getAttribute("position").count) / 3;
  });
  const metrics: Record<string, unknown> = {
    source: SOURCE,
    triangles,
    joints: skinned.skeleton.bones.length,
    clip: clip.name,
    clipSeconds: clip.duration,
    speedMps,
    furShells: 0,
    fins: false,
    loadMs: Math.round(performance.now() - started),
  };

  let shown: FurShells | -1 = -1;
  let finsOn: boolean | undefined;
  return {
    root,
    speedMps,
    metrics,
    position,
    setFur(shells, on) {
      if (shells !== shown) {
        for (const set of shellSets.values()) for (const s of set) s.visible = false;
        if (shells > 0) for (const s of shellsFor(shells)) s.visible = true;
        shown = shells;
        metrics.furShells = shells;
      }
      if (on !== finsOn) {
        if (on) makeFins().visible = true;
        else if (fins) fins.visible = false;
        finsOn = on;
        metrics.fins = on;
      }
    },
    update(seconds) {
      mixer.setTime(seconds % clip.duration);
      const angle = (speedMps * seconds) / loop.radius;
      position.set(loop.centre.x + loop.radius * Math.cos(angle), loop.centre.y + loop.radius * Math.sin(angle), 0);
      root.position.copy(position);
      root.rotation.z = angle + Math.PI;
      root.updateMatrixWorld(true);
    },
  };
}
