// The approved looked-dev Stevie, walking the same loop in the lab's yard and close view.
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { attribute, color, float, fract, mix, mx_noise_float, smoothstep, texture, uv, vec2 } from "three/tsl";
import { furShell } from "../../ceiling-3d/src/materials.ts";
import type { FurShells, LevelMode } from "./config.ts";
import { groomMaterial, loadGroom, type Coat, type FurMode, type GroomAsset, type TrackGroomDownload } from "./groom.ts";

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
  setFur(shells: FurShells, fins: boolean, coat?: Coat, furMode?: FurMode): void;
  update(seconds: number): void;
}

const SOURCE_DIR = "assets/models/stevie";
const SOURCE = `${SOURCE_DIR}/stevie.glb`;
const RECORDED_SPEED = 0.267756;
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
  const normals = new Float32Array(n * 3);
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
      normals.set([nrm.x, nrm.y, nrm.z], o * 3);
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
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
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

/** The loaded file, shared by every raccoon made from it: geometry, materials and the walk clip. */
export interface StevieAsset {
  gltf: Any;
  groom: GroomAsset;
  clip: THREE.AnimationClip;
  speedMps: number;
  loadMs: number;
  /** Shared across raccoons: the fur shell materials by "count-layer", the fins' geometry and material. */
  shellMaterials: Map<string, THREE.Material>;
  fins: Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material }>;
  /** The URL the model was loaded from, and the body mesh's local units in metres along each axis. */
  url: string;
  bind: BindScale;
  /** The level file's name under media/, its detail level (0 for stevie.glb), its tier and the largest texture it draws with. */
  file: string;
  level: number;
  tier: "desktop" | "phone";
  textureMaxPx: number;
}

export interface BindScale {
  metresPerUnit: THREE.Vector3;
  /** The body's rest-pose bounding box size in metres, independent of how the file stores its positions. */
  sizeM: THREE.Vector3;
}

function isBody(node: Any, eyesMaterial: string) {
  return node.isSkinnedMesh && node.material.name !== eyesMaterial;
}

/**
 * Metres per local unit of the body mesh at its bind pose. Skinned vertices reach the world through
 * bone.matrixWorld x boneInverse x bindMatrix, so a file can store positions in any units and carry the scale in its
 * inverse bind matrices: the quantized web media does (normalised int16 positions, inverse bind matrices scaled by
 * about 0.38), the source GLB does not. Fur lengths are metres, so shells and fins divide by this.
 */
function bindScale(scene: THREE.Object3D, eyesMaterial: string): BindScale {
  let body: THREE.SkinnedMesh | undefined;
  scene.traverse((node: Any) => {
    if (!body && isBody(node, eyesMaterial)) body = node;
  });
  if (!body) throw new Error("Stevie's glTF holds no skinned mesh");
  const mesh: THREE.SkinnedMesh = body;
  scene.updateMatrixWorld(true);
  const { bones, boneInverses } = mesh.skeleton;
  const metresPerUnit = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const toBind = new THREE.Matrix4();
  // The scene root sits at the origin with no scale when loaded, so bone.matrixWorld is in the file's metres.
  for (let i = 0; i < bones.length; i++) {
    toBind.multiplyMatrices(bones[i].matrixWorld, boneInverses[i]).multiply(mesh.bindMatrix);
    metresPerUnit.add(scale.setFromMatrixScale(toBind));
  }
  metresPerUnit.divideScalar(bones.length);
  if (![metresPerUnit.x, metresPerUnit.y, metresPerUnit.z].every((v) => v > 0 && Number.isFinite(v)))
    throw new Error(`Stevie's bind pose has no usable scale: ${metresPerUnit.toArray()}`);
  mesh.geometry.computeBoundingBox();
  const sizeM = mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(metresPerUnit);
  return { metresPerUnit, sizeM };
}

const pixels = (map: Any): number => Math.max(map?.image?.width ?? 0, map?.image?.height ?? 0, map?.mipmaps?.[0]?.width ?? 0);

export async function loadStevieAsset(url: string, onProgress?: (event: ProgressEvent) => void, loader = new GLTFLoader(), trackGroom?: TrackGroomDownload, options: { tier?: "phone"; level?: number } = {}): Promise<StevieAsset> {
  const started = performance.now();
  const [gltf, groom]: [Any, GroomAsset] = await Promise.all([loader.loadAsync(url, onProgress), loadGroom(url, loader, trackGroom, options.tier)]);
  if (options.tier) {
    // The phone tier's base colour is the level file's own embedded 1024 px map.
    let embedded: Any = null;
    gltf.scene.traverse((node: Any) => {
      if (node.isMesh && !embedded && node.material.name !== groom.manifest.model.eyes.material) embedded = node.material.map;
    });
    if (!embedded) throw new Error(`${url}: the phone level carries no base colour texture`);
    groom.baseColor = embedded;
  }
  gltf.scene.traverse((node: Any) => {
    if (!node.isMesh) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      material.map = groom.baseColor;
      material.needsUpdate = true;
    }
  });
  const clip: THREE.AnimationClip = gltf.animations.find((c: THREE.AnimationClip) => c.name === "walk") ?? gltf.animations[0];
  if (!clip) throw new Error("Stevie's glTF holds no walk clip");
  const bind = bindScale(gltf.scene, groom.manifest.model.eyes.material);
  const textureMaxPx = Math.max(pixels(groom.baseColor), pixels(groom.eyes), pixels(groom.winterTint), ...Object.values(groom.coats).flatMap((c) => [pixels(c.length), pixels(c.direction), pixels(c.density)]));
  return { gltf, groom, clip, speedMps: groom.manifest.model.clips.find((c: Any) => c.name === "walk")?.speedMps ?? recordedSpeed(gltf), loadMs: Math.round(performance.now() - started), shellMaterials: new Map(), fins: new Map(), url, bind, file: new URL(url, document.baseURI).pathname.split("/media/").at(-1)!.replace(/^source\//u, ""), level: options.level ?? 0, tier: options.tier ?? "desktop", textureMaxPx };
}

/**
 * One raccoon walking a loop: Stevie himself (the file's own scene), or a clone of his rig with its own skeleton and
 * animation, `phase` seconds along the loop. Clones share the geometry and materials.
 */
export function createStevie(asset: StevieAsset, loop: WalkLoop, options: { clone?: boolean; phase?: number } = {}): LabStevie {
  // Keep the loaded scene pristine: later cast clones must not inherit Stevie's already-attached shells.
  const scene: THREE.Object3D = SkeletonUtils.clone(asset.gltf.scene);
  const phase = options.phase ?? 0;
  const { clip, speedMps } = asset;
  let body: THREE.SkinnedMesh | undefined;
  scene.traverse((node: Any) => {
    if (node.isSkinnedMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      if (!body && isBody(node, asset.groom.manifest.model.eyes.material)) body = node;
    }
  });
  if (!body) throw new Error("Stevie's glTF holds no skinned mesh");
  const skinned: THREE.SkinnedMesh = body;

  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  const material = skinned.material as Any;
  const map: THREE.Texture | null = material.map ?? null;
  const geometry = skinned.geometry;
  const parent = skinned.parent ?? scene;
  const { metresPerUnit } = asset.bind;
  // furShell and finGeometry push along the local normal by a scalar; the web media's quantization scale is uniform.
  const unitsPerMetre = 3 / (metresPerUnit.x + metresPerUnit.y + metresPerUnit.z);

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
  const shellSets = new Map<string, THREE.SkinnedMesh[]>();
  const shellsFor = (count: number, coat: Coat, mode: FurMode) => {
    const setKey = `${mode}-${coat}-${count}`;
    let set = shellSets.get(setKey);
    if (!set) {
      set = [];
      for (let layer = 1; layer <= count; layer++) {
        const key = `${mode}-${coat}-${count}-${layer}`;
        let shellMaterial = asset.shellMaterials.get(key);
        if (!shellMaterial) {
          shellMaterial = mode === "groomed" ? groomMaterial(asset.groom, coat, layer, count, false, metresPerUnit) : furShell(map ?? new THREE.Texture(), layer, count, FUR_LENGTH * unitsPerMetre);
          if (mode === "uniform") shellMaterial.userData = { unitsPerMetre: [unitsPerMetre, unitsPerMetre, unitsPerMetre] };
          asset.shellMaterials.set(key, shellMaterial);
        }
        const shell = new THREE.SkinnedMesh(geometry, shellMaterial);
        shell.name = `stevie-fur-${count}-${layer}`;
        set.push(attach(shell));
      }
      shellSets.set(setKey, set);
    }
    return set;
  };

  const finSets = new Map<string, THREE.SkinnedMesh>();
  const makeFins = (coat: Coat, mode: FurMode) => {
    const key = `${mode}-${coat}`;
    let fins = finSets.get(key);
    if (!fins) {
      let shared = asset.fins.get(key);
      if (!shared) {
        shared = mode === "groomed"
          ? { geometry: finGeometry(geometry, 0), material: groomMaterial(asset.groom, coat, 1, 1, true, metresPerUnit) }
          : { geometry: finGeometry(geometry, FUR_LENGTH * 1.5 * unitsPerMetre), material: finMaterial(map) };
        asset.fins.set(key, shared);
      }
      fins = attach(new THREE.SkinnedMesh(shared.geometry, shared.material));
      fins.name = "stevie-fins";
      finSets.set(key, fins);
    }
    return fins;
  };

  // glTF faces +z; the y-up to z-up turn sends that to -y, so a yaw of (heading + pi/2) points it along `heading`
  // measured from east. Walking counter-clockwise, the heading at angle a on the loop is a + pi/2, hence yaw a + pi.
  const turn = new THREE.Group();
  turn.rotation.x = Math.PI / 2;
  turn.add(scene);
  const root = new THREE.Group();
  root.name = options.clone ? "raccoon" : "stevie";
  root.add(turn);
  const position = new THREE.Vector3(loop.centre.x + loop.radius, loop.centre.y, 0);

  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();

  let triangles = 0;
  scene.traverse((node: Any) => {
    if (node.isMesh) triangles += (node.geometry.getIndex()?.count ?? node.geometry.getAttribute("position").count) / 3;
  });
  const metrics: Record<string, unknown> = {
    source: asset.tier === "phone" || asset.level > 0 ? `${SOURCE_DIR}/${asset.file}` : SOURCE,
    url: asset.url,
    file: asset.file,
    level: asset.level,
    tier: asset.tier,
    textureMaxPx: asset.textureMaxPx,
    contentHash: asset.groom.manifest.contentHash,
    metresPerUnit: metresPerUnit.toArray(),
    bindSizeM: asset.bind.sizeM.toArray(),
    triangles,
    joints: skinned.skeleton.bones.length,
    clip: clip.name,
    clipSeconds: clip.duration,
    speedMps,
    furShells: 0,
    fins: false,
    loadMs: asset.loadMs,
  };

  let shown: FurShells | -1 = -1;
  let finsOn: boolean | undefined;
  let shownCoat: Coat | undefined;
  let shownMode: FurMode | undefined;
  return {
    root,
    speedMps,
    metrics,
    position,
    setFur(shells, on, coat = "summer", furMode = "groomed") {
      const coatChanged = coat !== shownCoat || furMode !== shownMode;
      if (shells !== shown || coatChanged) {
        for (const set of shellSets.values()) for (const s of set) s.visible = false;
        if (shells > 0) for (const s of shellsFor(shells, coat, furMode)) s.visible = true;
        shown = shells;
        metrics.furShells = shells;
      }
      if (on !== finsOn || coatChanged) {
        for (const fins of finSets.values()) fins.visible = false;
        if (on) makeFins(coat, furMode).visible = true;
        finsOn = on;
        metrics.fins = on;
      }
      shownCoat = coat;
      shownMode = furMode;
      metrics.coat = coat;
      metrics.furMode = furMode;
      metrics.maxLengthM = furMode === "groomed" ? asset.groom.coats[coat].maxLengthM : FUR_LENGTH;
      // The longest strand as drawn, per axis: the local displacement the shown shells' material was built with,
      // carried back through the bind pose's scale to metres. It differs from maxLengthM if the conversion is wrong.
      const top = shells > 0 ? shellsFor(shells, coat, furMode).at(-1) : undefined;
      const perUnit = (top?.material as Any)?.userData?.unitsPerMetre as number[] | undefined;
      metrics.drawnMaxLengthM = perUnit ? perUnit.map((u, i) => (metrics.maxLengthM as number) * u * metresPerUnit.getComponent(i)) : null;
      metrics.groom = asset.groom.coats[coat].paths;
      metrics.baseColor = asset.groom.manifest.model.textures.baseColor?.path ?? `${asset.file} (embedded)`;
      metrics.eyesMask = asset.groom.manifest.model.eyes.path;
      metrics.winterTint = coat === "winter" && furMode === "groomed" ? asset.groom.manifest.model.textures.tint.winter.path : null;
    },
    update(seconds) {
      const t = seconds + phase;
      mixer.setTime(t % clip.duration);
      const angle = (speedMps * t) / loop.radius;
      position.set(loop.centre.x + loop.radius * Math.cos(angle), loop.centre.y + loop.radius * Math.sin(angle), 0);
      root.position.copy(position);
      root.rotation.z = angle + Math.PI;
      root.updateMatrixWorld(true);
    },
  };
}


/**
 * Stevie's files, loaded one level set at a time: today's single level 0, or the phone tier's levels (finest first) with
 * their switch heights. A page loads only its own mode's set; the other loads when the panel or Compare levels asks.
 */
export interface StevieKit {
  single: StevieAsset | null;
  phone: { asset: StevieAsset; minScreenHeight: number }[] | null;
  /** Loads a mode's files once (later calls share the first load); resolves when they are ready. */
  ensure(mode: LevelMode): Promise<void>;
  /** A loaded asset of either set, for the body's height and walk speed (the levels share both). */
  readonly any: StevieAsset;
}

export interface LevelledStevie extends LabStevie {
  /** Switches to a mode whose files the kit has loaded (await kit.ensure(mode) first). */
  setMode(mode: LevelMode): void;
  /** Picks the level for this fraction of the viewport height (the finest whose minScreenHeight it reaches). */
  selectLevel(screenHeight: number): void;
  /** Shows every level of the mode (true) so the scene compiles them all, or only the drawn one (false). */
  prepare(all: boolean): void;
}

type Level = { stevie: LabStevie; minScreenHeight: number };

/**
 * One raccoon made from the kit's level files. Only the mode's drawn level is visible; each level keeps its own
 * skeleton, shells and fins, built when its mode is first used, so a switch while walking is a visibility change.
 */
export function createLevelled(kit: StevieKit, loop: WalkLoop, options: { clone?: boolean; phase?: number } = {}, mode: LevelMode = "single"): LevelledStevie {
  const root = new THREE.Group();
  root.name = options.clone ? "raccoon" : "stevie";
  const built: { single: Level[] | null; phone: Level[] | null } = { single: null, phone: null };
  let fur: Parameters<LabStevie["setFur"]> | null = null;
  const build = (m: LevelMode): Level[] => {
    const existing = built[m];
    if (existing) return existing;
    const assets = m === "phone" ? kit.phone : kit.single ? [{ asset: kit.single, minScreenHeight: 0 }] : null;
    if (!assets) throw new Error(`Stevie's ${m} levels are not loaded`);
    const levels = assets.map(({ asset, minScreenHeight }) => ({ stevie: createStevie(asset, loop, options), minScreenHeight }));
    for (const entry of levels) {
      entry.stevie.root.visible = false;
      root.add(entry.stevie.root);
      if (fur) entry.stevie.setFur(...fur);
    }
    built[m] = levels;
    return levels;
  };
  const levels = () => build(mode);
  const all = () => [...(built.single ?? []), ...(built.phone ?? [])];
  const position = new THREE.Vector3();
  let active = levels()[0]!;
  let time = 0;
  const show = (everything: boolean) => {
    const shown = levels();
    for (const entry of all()) entry.stevie.root.visible = shown.includes(entry) && (everything || entry === active);
  };
  show(false);
  return {
    root,
    position,
    get speedMps() {
      return active.stevie.speedMps;
    },
    get metrics() {
      return { ...active.stevie.metrics, mode, drawnFile: active.stevie.metrics.file };
    },
    setMode(next) {
      mode = next;
      const shown = levels();
      shown[0]!.stevie.update(time);
      active = shown[0]!;
      show(false);
    },
    selectLevel(screenHeight) {
      const shown = levels();
      const next = shown.find((entry) => screenHeight >= entry.minScreenHeight) ?? shown.at(-1)!;
      if (next === active) return;
      // The level just chosen continues the walk where the last one was.
      next.stevie.update(time);
      active = next;
      show(false);
    },
    prepare: show,
    setFur(...args) {
      fur = args;
      for (const entry of all()) entry.stevie.setFur(...args);
    },
    update(seconds) {
      time = seconds;
      active.stevie.update(seconds);
      position.copy(active.stevie.position);
    },
  };
}

/** Reports one file's download, with the level set it belongs to. */
export type TrackLevelDownload = (key: string, mode: LevelMode) => ReturnType<TrackGroomDownload>;

/**
 * Loads the manifest's chain, then only `mode`'s files: level 0 (stevie.glb and its maps), or the phone tier's levels
 * as the chain lists them (phone: levels 1 and 2, each drawn down to its minScreenHeight, with the phone's 1024 px
 * maps). `model` maps a file name to its URL; `trackModel` and `trackGroom` report each model and map download.
 */
export async function loadStevieKit(model: (file: string) => string, trackModel: TrackLevelDownload, loader = new GLTFLoader(), trackGroom: TrackLevelDownload | undefined, mode: LevelMode): Promise<StevieKit> {
  const load = (file: string, set: LevelMode, options?: { tier?: "phone"; level?: number }) => {
    const download = trackModel(file, set);
    return loadStevieAsset(model(file), download.onProgress, loader, trackGroom && ((key) => trackGroom(key, set)), options).finally(download.finish);
  };
  const sourceMedia = model("stevie.glb").includes("/source/");
  const manifest = await fetch(new URL(`assets/models/stevie/${sourceMedia ? "source-manifest" : "manifest"}.json`, new URL(sourceMedia ? "../" : "./", model("stevie.glb")))).then((r) => {
    if (!r.ok) throw new Error(`Stevie manifest: HTTP ${r.status}`);
    return r.json();
  });
  const chain = manifest.model.chain;
  const names = chain.tiers.find((t: Any) => t.name === "phone").levels as number[];
  const heights = Object.fromEntries(chain.levels.map((l: Any) => [l.level, l.minScreenHeight]));
  const phoneLevels = Object.values(manifest.model.tiers.phone.levels) as Any[];
  const loading: Partial<Record<LevelMode, Promise<void>>> = {};
  const kit: StevieKit = {
    single: null,
    phone: null,
    ensure(set) {
      loading[set] ??= set === "single"
        ? load("stevie.glb", "single").then((asset) => {
            kit.single = asset;
          })
        : Promise.all(names.map((level) => {
            const entry = phoneLevels.find((l) => l.level === level);
            const file = String(entry.path).split("/").at(-1)!;
            return load(file, "phone", { tier: "phone", level }).then((asset) => ({ asset, minScreenHeight: heights[level] as number }));
          })).then((phone) => {
            kit.phone = phone;
          });
      // A failed load can be asked for again.
      loading[set]!.catch(() => delete loading[set]);
      return loading[set]!;
    },
    get any() {
      const asset = kit.single ?? kit.phone?.[0]?.asset;
      if (!asset) throw new Error("no Stevie level is loaded");
      return asset;
    },
  };
  await kit.ensure(mode);
  return kit;
}
