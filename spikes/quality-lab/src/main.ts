// The quality lab (issue 45): the #34 ceiling's yard at dusk and night in rain, with Stevie (c3 on the shared raccoon
// rig, #54) walking a loop, every effect on its own switch, and `globalThis.lab` (config.ts LabHandle) for the runner
// UI and the CI journey. Three.js WebGPU with the WebGL2 fallback, three's own TSL add-ons only.
import * as THREE from "three/webgpu";
import { CSMShadowNode } from "three/addons/csm/CSMShadowNode.js";
import { LightProbeGrid } from "three/addons/lighting/LightProbeGrid.js";
import { bayer16 } from "three/addons/tsl/math/Bayer.js";
import { Fn, float, hash, instanceIndex, mx_noise_float, positionLocal, reflector, screenCoordinate, smoothstep, time, vec3 } from "three/tsl";
import { anchor, placeCamera, STATES, VIEWS } from "../../ceiling-3d/src/look.ts";
import { ground, puddleSky, rippleStrength, wetness } from "../../ceiling-3d/src/materials.ts";
import { loadProps } from "../../ceiling-3d/src/props.ts";
import { buildSet, lampStrength, rain } from "../../ceiling-3d/src/set.ts";
import { type LabConfig, type LabHandle, type LabStatus, type Measurement, type Platform, PRESETS, type PresetName, type StateName, type ViewName } from "./config.ts";
import { buildPipeline, grade, type Pipeline } from "./pipeline.ts";
import { type LabStevie, loadStevie } from "./stevie.ts";
import { mountUi } from "./ui.ts";

// biome-ignore lint/suspicious/noExplicitAny: TSL nodes and backend internals.
type Any = any;

const query = new URLSearchParams(location.search);
const forceWebGL = query.get("backend") === "webgl2";
const statusEl = document.getElementById("status") as HTMLElement;
const SOFTWARE = /swiftshader|llvmpipe|lavapipe|softpipe|software|microsoft basic render/i;
const media = (file: string) => new URL(`media/${file}`, document.baseURI).href;

function detectPlatform(): Platform {
  const forced = query.get("platform");
  if (forced === "phone" || forced === "desktop") return forced;
  const uaData: Any = (navigator as Any).userAgentData;
  if (uaData && typeof uaData.mobile === "boolean") return uaData.mobile ? "phone" : "desktop";
  return /Mobi|Android|iPhone|iPad|iPod/u.test(navigator.userAgent) ? "phone" : "desktop";
}
const platform = detectPlatform();

const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL, trackTimestamp: true } as Any);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById("scene")?.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera();

// ---- Lights: the ceiling's model. The key light comes in two forms, one plain shadow map or cascades. ----
const HAZE_LAYER = 10;
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
hemi.position.set(0, 0, 1);
function keyLight() {
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0006;
  light.shadow.normalBias = 0.02;
  light.shadow.radius = 3;
  light.layers.enable(HAZE_LAYER);
  return light;
}
const keyPlain = keyLight();
const keyCascaded = keyLight();
const csm = new CSMShadowNode(keyCascaded as Any, { cascades: 3, maxFar: 60, mode: "practical", lightMargin: 20 });
csm.fade = true;
(keyCascaded.shadow as Any).shadowNode = csm;
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
scene.add(hemi, keyPlain, keyPlain.target, keyCascaded, keyCascaded.target, fill, fill.target);

// ---- The set (the ceiling's), the props, the rain ----
const reflection: Any = reflector({ resolutionScale: 0.5 });
const set = buildSet(reflection);
scene.add(set.root);
const reflectiveGround = set.ground.material as THREE.Material;
let plainGround: THREE.Material | null = null;
const shadowLamps = set.lamps.filter((lamp) => lamp.light.castShadow).map((lamp) => lamp.light);
// The porch lantern (the lamp whose base strength is 7): the god rays' source.
const porchLight = (set.lamps.find((lamp) => lamp.base === 7) ?? set.lamps[0]).light;
for (const lamp of set.lamps) lamp.light.layers.enable(HAZE_LAYER);
let shower = rain(PRESETS.medium.rainCount);
scene.add(shower.mesh);

// ---- Rain splashes: rings that grow and fade on the ground, phase per instance ----
const SPLASHES = 600;
const splashes = (() => {
  const geometry = new THREE.RingGeometry(0.7, 1, 16);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const phase = hash(instanceIndex).add(time.mul(1.7)).fract();
  material.positionNode = positionLocal.mul(phase.mul(0.06).add(0.01));
  material.colorNode = vec3(0.78, 0.83, 0.86);
  material.opacityNode = float(1).sub(phase).mul(0.45).mul(smoothstep(0.0, 0.08, phase));
  const mesh = new THREE.InstancedMesh(geometry, material, SPLASHES);
  mesh.name = "splashes";
  mesh.frustumCulled = false;
  const centre = anchor(836, 560);
  const m = new THREE.Matrix4();
  let seed = 45;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < SPLASHES; i++) mesh.setMatrixAt(i, m.makeTranslation(centre.x + (r() - 0.5) * 12, centre.y + (r() - 0.5) * 12, 0.012));
  return mesh;
})();
scene.add(splashes);

// ---- Volumetric haze: a ray-marched volume over the yard, lit by the key and the lamps, on its own layer ----
const hazeMaterial: Any = new (THREE as Any).VolumeNodeMaterial();
hazeMaterial.steps = 16;
hazeMaterial.offsetNode = bayer16(screenCoordinate);
hazeMaterial.scatteringNode = Fn(({ positionRay }: Any) => {
  const drift = mx_noise_float(positionRay.mul(0.45).add(vec3(time.mul(0.08), 0, 0))).mul(0.5).add(0.5);
  return drift.mul(0.35).mul(smoothstep(3.2, 0.0, positionRay.z));
});
const haze = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 3.5), hazeMaterial);
haze.position.copy(anchor(836, 470)).setZ(1.75);
haze.receiveShadow = true;
haze.layers.disableAll();
haze.layers.enable(HAZE_LAYER);
scene.add(haze);

// ---- Light probes: a 4 × 4 × 2 grid baked once over the yard the first time they are switched on ----
let probes: Any = null;
let probeError: string | null = null;
function ensureProbes() {
  if (probes || probeError) return;
  try {
    const grid: Any = new LightProbeGrid(16, 16, 3.5, 4, 4, 2);
    grid.position.copy(anchor(836, 470)).setZ(1.75);
    grid.updateMatrixWorld(true);
    grid.bake(renderer, scene, { cubemapSize: 8 });
    probes = grid;
  } catch (error) {
    probeError = String((error as Error)?.message ?? error);
    console.error(error);
  }
}

// ---- Stevie walks a loop on the open ground of puddles and stepping stones in front of the porch steps ----
const LOOP = { centre: anchor(480, 680), radius: 0.65 };
let stevie: LabStevie | null = null;

// ---- State ----
let config: LabConfig = { ...(PRESETS[(query.get("preset") as PresetName) ?? "medium"] ?? PRESETS.medium) };
let view: ViewName = query.get("view") === "close" ? "close" : "yard";
let state: StateName = query.get("state") === "night" ? "night" : "dusk";
let current: Pipeline | null = null;
let ready = false;
let failure: string | null = null;
let busy = true;
let adapter = "unknown";
const started = performance.now();
let frozenAt: number | null = query.has("t") ? Number(query.get("t")) : null;

/** The close-up's zoom: Stevie (0.45 m standing) at about a third of the frame height. */
const CLOSE_ZOOM = 3.4;

function placeView() {
  const aspect = window.innerWidth / window.innerHeight;
  if (view === "close" && stevie) {
    const focus = stevie.position.clone().setZ(0.2);
    placeCamera(camera, { label: "close-up", zoom: CLOSE_ZOOM, focus: () => focus }, aspect);
  } else placeCamera(camera, VIEWS.hero, aspect);
}

let appliedState: StateName | null = null;
function applyState() {
  const s = STATES[state];
  if (appliedState !== state) {
    const sky = new THREE.Color(s.sky);
    const bottom = new THREE.Color(s.ground);
    const data = new Uint8Array(64 * 32 * 4);
    const c = new THREE.Color();
    for (let j = 0; j < 32; j++)
      for (let i = 0; i < 64; i++) {
        c.copy(bottom).lerp(sky, Math.min(1, Math.max(0, (32 - j) / 32) * 1.3));
        data.set([c.r * 255, c.g * 255, c.b * 255, 255], (j * 64 + i) * 4);
      }
    const env = new THREE.DataTexture(data, 64, 32);
    env.mapping = THREE.EquirectangularReflectionMapping;
    env.colorSpace = THREE.SRGBColorSpace;
    env.needsUpdate = true;
    scene.environment?.dispose();
    scene.environment = env;
    scene.environmentIntensity = s.hemi * 0.5;
    appliedState = state;
  }
  hemi.color.setHex(s.sky);
  puddleSky.value.setHex(s.sky);
  hemi.groundColor.setHex(s.ground);
  hemi.intensity = s.hemi;
  const focus = VIEWS.hero.focus();
  for (const key of [keyPlain, keyCascaded]) {
    key.color.setHex(s.key);
    key.intensity = s.keyIntensity;
    key.target.position.copy(focus);
    key.position.copy(focus).add(new THREE.Vector3(...s.keyFrom).normalize().multiplyScalar(20));
    const sc = key.shadow.camera;
    Object.assign(sc, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
    sc.updateProjectionMatrix();
  }
  fill.color.setHex(s.fill);
  fill.intensity = s.fillIntensity;
  fill.target.position.copy(focus);
  fill.position.copy(focus).add(new THREE.Vector3(0.6, -0.8, 0.5).multiplyScalar(20));
  scene.fog = new THREE.Fog(s.fog, s.fogNear, s.fogFar);
  scene.background = new THREE.Color(s.fog);
  renderer.toneMappingExposure = s.exposure;
  grade.lift.value.set(...s.lift);
  grade.gain.value.set(...s.gain);
  grade.saturation.value = s.saturation;
  grade.contrast.value = s.contrast;
  lampStrength.value = s.lamps;
  for (const lamp of set.lamps) lamp.light.intensity = lamp.base * s.lamps;
  wetness.value = s.rain;
}

function seconds() {
  return frozenAt ?? (performance.now() - started) / 1000;
}

function render() {
  const t = seconds();
  stevie?.update(t);
  shower.update(t);
  placeView();
  current?.pipeline.render();
}

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

/** Applies every switch of the config to the scene, rebuilds the post graph and compiles it. */
async function applyConfig(next: LabConfig) {
  busy = true;
  try {
    config = { ...next };
    renderer.setPixelRatio(config.dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    stevie?.setFur(config.furShells, config.furFins);
    if (shower.mesh.count !== config.rainCount) {
      scene.remove(shower.mesh);
      shower.mesh.geometry.dispose();
      (shower.mesh.material as THREE.Material).dispose();
      shower = rain(config.rainCount);
      scene.add(shower.mesh);
    }
    splashes.visible = config.splashes;
    rippleStrength.value = config.ripples ? 1 : 0;
    if (config.reflections) set.ground.material = reflectiveGround;
    else {
      plainGround ??= ground(set.ground.userData.mask, null);
      set.ground.material = plainGround;
    }
    keyPlain.visible = !config.cascades;
    keyCascaded.visible = config.cascades;
    for (const light of shadowLamps) light.castShadow = config.pointShadows;
    // God rays march the porch lamp's shadow map, so the lamp casts shadows while they are on.
    if (config.shafts) porchLight.castShadow = true;
    haze.visible = config.haze;
    if (config.probes) {
      ensureProbes();
      if (probes && !probes.parent) scene.add(probes);
    } else if (probes?.parent) scene.remove(probes);
    // Lights shown or hidden and castShadow flips are part of three's lighting cache key, so materials rebuild on their own.
    current?.dispose();
    current = buildPipeline(config, { renderer, scene, camera, shaftLight: porchLight, hazeLayer: HAZE_LAYER, hazeMaterial });
    applyState();
    placeView();
    await renderer.compileAsync(scene, camera);
    render();
    await nextFrame();
    render();
    await nextFrame();
  } finally {
    busy = false;
  }
}

// ---- Measurement: requestAnimationFrame intervals, and GPU time from timestamp queries where they exist ----
let intervals: number[] | null = null;
let gpuTimes: number[] | null = null;
let last = 0;
const timestamps = () => Boolean((renderer as Any).hasFeature?.("timestamp-query")) && Boolean((renderer as Any).backend?.trackTimestamp);

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] * 100) / 100;
};

function loop(now: number) {
  if (busy || !ready) {
    last = 0;
    return;
  }
  if (intervals && last) intervals.push(now - last);
  last = now;
  render();
  if (timestamps()) {
    const gpu = gpuTimes;
    renderer
      .resolveTimestampsAsync(THREE.TimestampQuery.RENDER)
      .then((ms: Any) => {
        if (gpu && typeof ms === "number" && ms > 0) gpu.push(ms);
      })
      .catch(() => {});
  }
}

async function adapterString(): Promise<string> {
  const backend: Any = (renderer as Any).backend;
  if (backend.isWebGPUBackend) {
    const info: Any = backend.adapter?.info ?? (await (navigator as Any).gpu?.requestAdapter())?.info ?? {};
    const text = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" / ") || "unknown WebGPU adapter";
    return info.isFallbackAdapter ? `${text} (fallback adapter)` : text;
  }
  const gl: WebGL2RenderingContext = backend.gl;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

const lab: LabHandle & Record<string, unknown> = {
  status(): LabStatus {
    return {
      ready,
      failure,
      backend: (renderer as Any).backend?.isWebGPUBackend ? "webgpu" : "webgl2",
      adapter,
      software: SOFTWARE.test(adapter) || /fallback adapter/u.test(adapter),
      timestamps: ready && timestamps(),
      platform,
      dpr: renderer.getPixelRatio(),
      canvas: [renderer.domElement.width, renderer.domElement.height],
      config: { ...config },
      view,
      state,
      userAgent: navigator.userAgent,
    };
  },
  apply: applyConfig,
  async setView(next) {
    view = next;
    render();
    await nextFrame();
  },
  async setState(next) {
    state = next;
    applyState();
    render();
    await nextFrame();
  },
  async measure(options = {}): Promise<Measurement> {
    const warmupMs = options.warmupMs ?? 1500;
    const holdMs = options.holdMs ?? 4000;
    const until = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    await until(warmupMs);
    intervals = [];
    gpuTimes = [];
    last = 0;
    await until(holdMs);
    const frames = intervals;
    const gpu = gpuTimes;
    intervals = null;
    gpuTimes = null;
    return {
      frames: frames.length,
      frameMsP50: percentile(frames, 50),
      frameMsP95: percentile(frames, 95),
      gpuMsP50: percentile(gpu, 50),
      gpuMsP95: percentile(gpu, 95),
    };
  },
  async screenshot(maxWidth = 320) {
    busy = true;
    try {
      render();
      const source = renderer.domElement;
      const scale = Math.min(1, maxWidth / source.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.75);
    } finally {
      busy = false;
    }
  },
  /** Freezes the clock at `t` seconds (null resumes it): the CI journey uses it to compare frames. */
  freeze(t: number | null) {
    frozenAt = t;
  },
  /** Draws one frame now and returns the canvas as a PNG data URL (CI journey). */
  frame(): string {
    render();
    return renderer.domElement.toDataURL("image/png");
  },
  stevie: () => stevie?.metrics ?? null,
  probeError: () => probeError,
};
Object.assign(globalThis, { lab });

async function init() {
  await renderer.init();
  adapter = await adapterString();
  stevie = await loadStevie(media("stevie.glb"), LOOP);
  scene.add(stevie.root);
  await loadProps(set.slots, set.groups.props as THREE.Object3D, media("props/"));
  await applyConfig(config);
  ready = true;
  statusEl.textContent = "The yard is ready";
  renderer.setAnimationLoop(loop);
  const ui = document.getElementById("ui");
  if (ui && query.get("ui") !== "0") mountUi(lab, ui);
}

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init().catch((error) => {
  failure = String(error?.stack ?? error);
  busy = false;
  statusEl.textContent = `Failed: ${failure}`;
  console.error(error);
});
