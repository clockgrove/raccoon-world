// The 3D visual ceiling (issue 34): the mockup's main frame rebuilt in real-time 3D at full strength, on Clockgrove's
// stack (Three.js with WebGPU and a WebGL2 fallback) but not limited by its renderer. Full window at device pixel
// ratio, one orthographic three-quarter camera, a key light and real lamp and window lights with shadows, planar
// puddle reflections, fog, rain, bloom and one grade. `globalThis.ceiling` drives it for the capture and the CI journey.
import * as THREE from "three/webgpu";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import {
  clamp,
  dot,
  float,
  mix,
  pass,
  reflector,
  renderOutput,
  screenUV,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { anchor, MOCKUP, placeCamera, STEVIE_PIXEL, STATES, type StateName, VIEWS, type ViewName } from "./look.ts";
import { puddleSky, wetness } from "./materials.ts";
import { loadProps, type PropReport } from "./props.ts";
import { buildSet, lampStrength, rain } from "./set.ts";
import { loadStevie, type Stevie, type StevieClip } from "./stevie.ts";

// biome-ignore lint/suspicious/noExplicitAny: TSL nodes and backend internals.
type Any = any;

const query = new URLSearchParams(location.search);
const forceWebGL = query.get("backend") === "webgl2";
const dpr = Number(query.get("dpr") ?? window.devicePixelRatio ?? 1);
const statusEl = document.getElementById("status") as HTMLElement;

const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById("scene")?.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera();

// ---- Lights: one model for every state ----
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
hemi.position.set(0, 0, 1);
const key = new THREE.DirectionalLight(0xffffff, 1);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.02;
key.shadow.radius = 3;
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
scene.add(hemi, key, key.target, fill, fill.target);

// ---- The set, the props, the rain ----
const reflection: Any = reflector({ resolutionScale: 0.5 });
const set = buildSet(reflection);
scene.add(set.root);
const shower = rain(Number(query.get("rain") ?? 2600));
scene.add(shower.mesh);
let stevie: Stevie | null = null;
let props: PropReport[] = [];

// ---- Post: bloom, tone mapping, the grade ----
const lift = uniform(new THREE.Vector3());
const gain = uniform(new THREE.Vector3(1, 1, 1));
const saturation = uniform(1);
const contrast = uniform(1);
const pipeline = new THREE.RenderPipeline(renderer);
const scenePass = pass(scene, camera);
const hdr = scenePass.getTextureNode("output");
const glowPass = bloom(hdr, 0.55, 0.45, 0.82);
pipeline.outputColorTransform = false;
const display: Any = renderOutput(hdr.add(glowPass));
{
  let c: Any = display.rgb.mul(gain).add(lift.mul(float(1).sub(display.rgb)));
  const luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, saturation);
  c = c.sub(0.5).mul(contrast).add(0.5);
  // A soft vignette, as the mockup's frame darkens towards its corners.
  const d = screenUV.sub(0.5).mul(vec3(1.0, 0.85, 0).xy).length();
  c = c.mul(mix(float(1), float(0.72), smoothstep(0.35, 0.8, d)));
  pipeline.outputNode = vec4(clamp(c, 0, 1), 1);
}

// ---- State ----
interface Settings {
  view: ViewName;
  state: StateName;
  clip: StevieClip;
  heading: string;
  seconds: number;
  rain: boolean;
  hidden: string[];
}
const settings: Settings = {
  view: (query.get("view") as ViewName) ?? "hero",
  state: (query.get("state") as StateName) ?? "hero",
  clip: "idle",
  heading: "three-quarter",
  seconds: 0,
  rain: true,
  hidden: [],
};

function skyTexture(top: number, bottom: number) {
  const width = 64;
  const height = 32;
  const data = new Uint8Array(width * height * 4);
  const a = new THREE.Color(top);
  const b = new THREE.Color(bottom);
  const c = new THREE.Color();
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      c.copy(b).lerp(a, Math.min(1, Math.max(0, (height - j) / height) * 1.3));
      const o = (j * width + i) * 4;
      data.set([c.r * 255, c.g * 255, c.b * 255, 255], o);
    }
  const t = new THREE.DataTexture(data, width, height);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

let appliedState: StateName | null = null;
function apply() {
  const view = VIEWS[settings.view] ?? VIEWS.hero;
  const aspect = window.innerWidth / window.innerHeight;
  placeCamera(camera, view, aspect);
  const s = STATES[settings.state] ?? STATES.hero;
  if (appliedState !== settings.state) {
    scene.environment?.dispose();
    scene.environment = skyTexture(s.sky, s.ground);
    scene.environmentIntensity = s.hemi * 0.5;
    appliedState = settings.state;
  }
  hemi.color.setHex(s.sky);
  puddleSky.value.setHex(s.sky);
  hemi.groundColor.setHex(s.ground);
  hemi.intensity = s.hemi;
  key.color.setHex(s.key);
  key.intensity = s.keyIntensity;
  const focus = VIEWS.hero.focus();
  key.target.position.copy(focus);
  key.position.copy(focus).add(new THREE.Vector3(...s.keyFrom).normalize().multiplyScalar(20));
  const sc = key.shadow.camera;
  sc.left = -11;
  sc.right = 11;
  sc.top = 11;
  sc.bottom = -11;
  sc.near = 1;
  sc.far = 50;
  sc.updateProjectionMatrix();
  fill.color.setHex(s.fill);
  fill.intensity = s.fillIntensity;
  fill.target.position.copy(focus);
  fill.position.copy(focus).add(new THREE.Vector3(0.6, -0.8, 0.5).multiplyScalar(20));
  scene.fog = new THREE.Fog(s.fog, s.fogNear, s.fogFar);
  scene.background = new THREE.Color(s.fog);
  renderer.toneMappingExposure = s.exposure;
  lift.value.set(...s.lift);
  gain.value.set(...s.gain);
  saturation.value = s.saturation;
  contrast.value = s.contrast;
  lampStrength.value = s.lamps;
  for (const lamp of set.lamps) lamp.light.intensity = lamp.base * s.lamps;
  wetness.value = settings.rain ? s.rain : 0;
  shower.mesh.visible = settings.rain;
  shower.update(settings.seconds);
  stevie?.pose(settings.clip, settings.heading, settings.seconds);
  const hidden = new Set(settings.hidden);
  for (const [name, object] of Object.entries(set.groups)) object.visible = !hidden.has(name);
  if (stevie) stevie.root.visible = !hidden.has("stevie");
  shower.mesh.visible = settings.rain && !hidden.has("rain");
}

function render() {
  apply();
  pipeline.render();
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

let ready = false;
let failure: string | null = null;
const intervals: number[] = [];
let last = 0;
let playing = query.get("play") === "1";

async function init() {
  await renderer.init();
  const stevieAt = anchor(STEVIE_PIXEL[0], STEVIE_PIXEL[1]);
  stevie = await loadStevie(renderer, "/media/stevie.glb");
  stevie.root.position.copy(stevieAt);
  scene.add(stevie.root);
  props = await loadProps(set.slots, set.groups.props);
  apply();
  await renderer.compileAsync(scene, camera);
  render();
  await nextFrame();
  render();
  ready = true;
  statusEl.textContent = "The yard is ready";
  renderer.setAnimationLoop((now: number) => {
    if (last) intervals.push(now - last);
    if (intervals.length > 240) intervals.shift();
    last = now;
    if (playing) {
      settings.seconds += 1 / 60;
      render();
    }
  });
}

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (ready) render();
});

async function rendererString(): Promise<string> {
  const backend: Any = (renderer as Any).backend;
  if (backend.isWebGPUBackend) {
    const adapter: Any = await (navigator as Any).gpu?.requestAdapter();
    const info = adapter?.info ?? {};
    return [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" / ") || "unknown WebGPU adapter";
  }
  const gl: WebGLRenderingContext = backend.gl;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] * 100) / 100;
};

Object.assign(globalThis, {
  ceiling: {
    mockup: MOCKUP,
    status: () => ({
      ready,
      failure,
      backend: (renderer as Any).backend?.isWebGPUBackend ? "webgpu" : "webgl2",
      pixelRatio: renderer.getPixelRatio(),
      canvas: [renderer.domElement.width, renderer.domElement.height],
      objects: [...Object.keys(set.groups), ...(stevie ? ["stevie"] : []), "rain"],
      props,
      stevie: stevie?.metrics ?? null,
      settings: { ...settings },
    }),
    /** Changes the frame's inputs and draws one frame; resolves after it reaches the screen. */
    async set(changes: Partial<Settings>) {
      Object.assign(settings, changes);
      render();
      await nextFrame();
      render();
      await nextFrame();
      return { ...settings };
    },
    rendererString,
    /** Draws `frames` frames back to back on the animation clock and reports their intervals and memory. */
    async measure(frames = 120) {
      intervals.length = 0;
      last = 0;
      const wasPlaying = playing;
      playing = true;
      while (intervals.length < frames) await nextFrame();
      playing = wasPlaying;
      const info: Any = renderer.info;
      const heap: Any = (performance as Any).memory;
      return {
        frames: intervals.length,
        frameMsP50: percentile(intervals, 50),
        frameMsP95: percentile(intervals, 95),
        geometries: info.memory?.geometries ?? null,
        textures: info.memory?.textures ?? null,
        textureMiB: info.memory?.texturesSize ? Math.round((info.memory.texturesSize / 1048576) * 10) / 10 : null,
        drawCalls: info.render?.drawCalls ?? info.render?.calls ?? null,
        triangles: info.render?.triangles ?? null,
        jsHeapMiB: heap ? Math.round((heap.usedJSHeapSize / 1048576) * 10) / 10 : null,
      };
    },
  },
});

init().catch((error) => {
  failure = String(error?.stack ?? error);
  statusEl.textContent = `Failed: ${failure}`;
  console.error(error);
});
