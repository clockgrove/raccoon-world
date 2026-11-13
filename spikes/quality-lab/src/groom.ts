import * as THREE from "three/webgpu";
import {
  attribute,
  float,
  fract,
  mix,
  mx_noise_float,
  normalLocal,
  positionLocal,
  positionPrevious,
  smoothstep,
  step,
  texture,
  uv,
  vec2,
} from "three/tsl";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// biome-ignore lint/suspicious/noExplicitAny: TSL node graphs and the glTF manifest cross an untyped loader boundary.
type Any = any;
export type Coat = "summer" | "winter";
export type FurMode = "groomed" | "uniform";

interface MapEntry {
  path: string;
  sha256: string;
  maxLengthM?: number;
}
export interface GroomCoat {
  length: THREE.Texture;
  direction: THREE.Texture;
  density: THREE.Texture;
  maxLengthM: number;
  paths: { length: string; direction: string; density: string };
}
export interface GroomAsset {
  baseColor: THREE.Texture;
  eyes: THREE.Texture;
  winterTint: THREE.Texture;
  coats: Record<Coat, GroomCoat>;
  manifest: Any;
}
export type TrackGroomDownload = (path: string) => {
  onProgress: (event: ProgressEvent) => void;
  finish: () => void;
};

export async function loadGroom(
  modelUrl: string,
  loader: GLTFLoader,
  track?: TrackGroomDownload,
): Promise<GroomAsset> {
  const sourceMedia = modelUrl.includes("/source/");
  const media = new URL(sourceMedia ? "../" : "./", modelUrl);
  const manifestUrl = new URL(
    `assets/models/stevie/${sourceMedia ? "source-manifest" : "manifest"}.json`,
    media,
  );
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Stevie groom manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  const model = manifest.model;
  const cache = new Map<string, Promise<THREE.Texture>>();
  const load = (entry: MapEntry, colour = false): Promise<THREE.Texture> => {
    const key = `${entry.path}:${colour}`;
    let pending = cache.get(key);
    if (!pending) {
      const mediaPath = sourceMedia ? `source/${entry.path.split("/").at(-1)}` : entry.path;
      const url = new URL(mediaPath, media).href;
      const textureLoader = entry.path.endsWith(".ktx2")
        ? loader.ktx2Loader
        : new THREE.TextureLoader();
      if (!textureLoader) throw new Error("Stevie compressed groom requires the lab KTX2 loader");
      const download = track?.(mediaPath);
      pending = textureLoader
        .loadAsync(url, download?.onProgress)
        .then((map: THREE.Texture) => {
          map.flipY = false;
          map.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          map.needsUpdate = true;
          return map;
        })
        .finally(() => download?.finish());
      cache.set(key, pending);
    }
    return pending;
  };
  const coat = async (name: Coat): Promise<GroomCoat> => {
    const maps = model.groom[name];
    const maxLengthM = maps.length.maxLengthM;
    if (!(maxLengthM > 0 && Number.isFinite(maxLengthM)))
      throw new Error(`Stevie ${name} groom has no maxLengthM`);
    const [length, direction, density] = await Promise.all([
      load(maps.length),
      load(maps.direction),
      load(maps.density),
    ]);
    return {
      length,
      direction,
      density,
      maxLengthM,
      paths: {
        length: maps.length.path,
        direction: maps.direction.path,
        density: maps.density.path,
      },
    };
  };
  const [baseColor, eyes, winterTint, summer, winter] = await Promise.all([
    load(model.textures.baseColor, true),
    load(model.eyes),
    load(model.textures.tint.winter, true),
    coat("summer"),
    coat("winter"),
  ]);
  return { baseColor, eyes, winterTint, coats: { summer, winter }, manifest };
}

/** Displace the rest pose before Three skins it; positionNode would apply the model-space comb after skinning. */
class GroomMaterial extends THREE.MeshStandardNodeMaterial {
  constructor(
    private readonly displacement: Any,
    side: THREE.Side,
  ) {
    super({ side });
  }
  setupPosition(builder: Any) {
    positionLocal.addAssign(this.displacement);
    // Velocity passes skin the previous rest pose separately from the current one.
    if (builder.needsPreviousData()) positionPrevious.addAssign(this.displacement);
    return super.setupPosition(builder);
  }
}

export function groomMaterial(
  asset: GroomAsset,
  coat: Coat,
  layer: number,
  layers: number,
  fin = false,
) {
  const maps = asset.coats[coat];
  const h: Any = fin ? attribute("fin", "vec2").y : float(layer / layers);
  const length = texture(maps.length, uv()).r;
  // Assetforge encodes a rest-pose model-space comb direction as rgb = d * 0.5 + 0.5.
  const comb = texture(maps.direction, uv()).rgb.mul(2).sub(1);
  const bent = normalLocal.add(comb.mul(h));
  const direction = mix(
    normalLocal,
    bent.div(bent.length().max(0.0001)),
    step(float(0.0001), bent.length()),
  );
  const displacement = direction.mul(length.mul(maps.maxLengthM).mul(h));
  const material = new GroomMaterial(displacement, fin ? THREE.DoubleSide : THREE.FrontSide);
  const cell = fin ? vec2(attribute("fin", "vec2").x.mul(20), 0.5) : uv().mul(420);
  const strand = mx_noise_float(cell.floor().add(0.5)).mul(0.5).add(0.5);
  const radial = fin
    ? fract(cell.x).sub(0.5).abs()
    : vec2(fract(cell.x).sub(0.5), fract(cell.y).sub(0.5)).length();
  const density = texture(maps.density, uv()).r;
  const occupancy = mx_noise_float(cell.floor().add(17.5)).mul(0.5).add(0.5);
  const eyes = texture(asset.eyes, uv()).r;
  const keep = step(h, strand).mul(step(radial, float(0.5).mul(float(1).sub(h)).add(0.12)));
  material.opacityNode = keep
    .mul(step(occupancy, density))
    .mul(float(1).sub(eyes))
    .mul(smoothstep(0, 0.01, length));
  material.alphaTest = 0.5;
  const base = texture(asset.baseColor, uv()).rgb;
  const tint = texture(asset.winterTint, uv());
  const albedo = coat === "winter" ? base.mul(mix(float(1), tint.rgb, tint.a.mul(h))) : base;
  material.colorNode = albedo.mul(mix(float(0.55), float(1.12), h));
  material.roughness = 0.9;
  material.userData = {
    coat,
    maxLengthM: maps.maxLengthM,
    groom: maps.paths,
    eyes: asset.manifest.model.eyes.path,
  };
  return material;
}
