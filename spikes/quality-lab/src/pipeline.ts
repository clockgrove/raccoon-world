// The quality lab's post-processing (issue 45), rebuilt for each config from three's own TSL add-ons only: the scene
// pass (MSAA through its sample count), GTAO, the volumetric haze pass, god rays from the porch lamp, TRAA, TAAU or
// FSR 1 upscaling, bloom, ACES tone mapping and the ceiling's grade. Nothing WebGL-only.
import * as THREE from "three/webgpu";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { fsr1 } from "three/addons/tsl/display/FSR1Node.js";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import { godrays } from "three/addons/tsl/display/GodraysNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { taau } from "three/addons/tsl/display/TAAUNode.js";
import { traa } from "three/addons/tsl/display/TRAANode.js";
import {
  clamp,
  colorToDirection,
  directionToColor,
  dot,
  float,
  mix,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  sample,
  screenUV,
  smoothstep,
  uniform,
  vec3,
  vec4,
  velocity,
} from "three/tsl";
import { type LabConfig, RENDER_SCALE } from "./config.ts";

// biome-ignore lint/suspicious/noExplicitAny: TSL nodes are untyped at this boundary.
type Any = any;

/** The grade's per-state values (the ceiling's lift, gain, saturation and contrast). */
export const grade = {
  lift: uniform(new THREE.Vector3()),
  gain: uniform(new THREE.Vector3(1, 1, 1)),
  saturation: uniform(1),
  contrast: uniform(1),
};

export interface PipelineInputs {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** The porch lamp: the light the god rays are cast from (it must cast shadows while they are on). */
  shaftLight: THREE.PointLight;
  /** The layer the haze volume is drawn on, alone, in its own low-resolution pass. */
  hazeLayer: number;
  /** The haze volume's material: its depthNode is set to the scene depth here. */
  hazeMaterial: Any;
}

export interface Pipeline {
  readonly pipeline: THREE.RenderPipeline;
  dispose(): void;
}

export function buildPipeline(config: LabConfig, inputs: PipelineInputs): Pipeline {
  const { renderer, scene, camera } = inputs;
  const disposables: Any[] = [];
  const keep = <T>(node: T): T => {
    disposables.push(node);
    return node;
  };
  const upscaling = config.upscale !== "none";
  const temporal = config.upscale === "taau" || (!upscaling && config.antialias === "traa");
  const msaa = !upscaling && config.antialias === "msaa";

  const scenePass: Any = keep(pass(scene, camera, { samples: msaa ? 4 : 0 }));
  const outputs: Record<string, Any> = { output };
  if (config.ao) outputs.normal = directionToColor(normalView);
  if (temporal) outputs.velocity = velocity;
  if (Object.keys(outputs).length > 1) scenePass.setMRT(mrt(outputs));
  if (upscaling) scenePass.setResolutionScale(RENDER_SCALE);
  const sceneColor: Any = scenePass.getTextureNode("output");
  const sceneDepth: Any = scenePass.getTextureNode("depth");

  // Antialiasing and upscaling act on the scene colour; every later effect samples full-resolution textures.
  let color: Any = sceneColor;
  if (config.upscale === "taau") color = keep(taau(sceneColor, sceneDepth, scenePass.getTextureNode("velocity"), camera));
  else if (config.upscale === "fsr") color = keep(fsr1(sceneColor));
  else if (config.antialias === "traa") color = keep(traa(sceneColor, sceneDepth, scenePass.getTextureNode("velocity"), camera));

  if (config.ao) {
    const normals: Any = scenePass.getTextureNode("normal");
    const sceneNormal = sample((uv: Any) => colorToDirection(normals.sample(uv)));
    const aoPass: Any = keep(ao(sceneDepth, sceneNormal, camera));
    aoPass.resolutionScale = 0.5;
    color = vec4(color.rgb.mul(aoPass.getTextureNode().sample(screenUV).r), 1);
  }

  if (config.haze) {
    inputs.hazeMaterial.depthNode = sceneDepth.sample(screenUV);
    const hazePass: Any = keep(pass(scene, camera, { depthBuffer: false, samples: 0 }));
    const layers = new THREE.Layers();
    layers.disableAll();
    layers.enable(inputs.hazeLayer);
    hazePass.setLayers(layers);
    hazePass.setResolutionScale(0.25);
    const blurred: Any = keep(gaussianBlur(hazePass, 0.6));
    color = vec4(color.rgb.add(blurred.rgb), 1);
  }

  if (config.shafts) {
    const rays: Any = keep(godrays(sceneDepth, camera, inputs.shaftLight));
    rays.density.value = 0.6;
    rays.maxDensity.value = 0.45;
    const warm = vec3(1.0, 0.72, 0.42);
    color = vec4(color.rgb.add(warm.mul(rays.getTextureNode().sample(screenUV).r).mul(0.35)), 1);
  }

  let hdr: Any = color;
  if (config.bloom) {
    const glow: Any = keep(bloom(color, 0.55, 0.45, 0.82));
    hdr = color.add(glow);
  }

  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  const display: Any = renderOutput(hdr);
  if (config.grade) {
    let c: Any = display.rgb.mul(grade.gain).add(grade.lift.mul(float(1).sub(display.rgb)));
    const luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(luma), c, grade.saturation);
    c = c.sub(0.5).mul(grade.contrast).add(0.5);
    const d = screenUV.sub(0.5).mul(vec3(1.0, 0.85, 0).xy).length();
    c = c.mul(mix(float(1), float(0.72), smoothstep(0.35, 0.8, d)));
    pipeline.outputNode = vec4(clamp(c, 0, 1), 1);
  } else {
    pipeline.outputNode = vec4(clamp(display.rgb, 0, 1), 1);
  }

  return {
    pipeline,
    dispose() {
      pipeline.dispose();
      for (const node of disposables) node?.dispose?.();
    },
  };
}
