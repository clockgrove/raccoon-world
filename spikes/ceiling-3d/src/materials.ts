// One material model for the whole frame (issue 34): every surface is a physically based Standard node material
// lit by the same lights, with procedural albedo, roughness and wetness from world-space noise, so detail density is
// the same on the house, the set dressing and the ground at any zoom. Nothing here bakes light.
import * as THREE from "three/webgpu";
import {
  clamp,
  color,
  float,
  fract,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  mx_worley_noise_float,
  normalLocal,
  normalWorld,
  positionLocal,
  positionWorld,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

// biome-ignore lint/suspicious/noExplicitAny: TSL node graphs are untyped at this boundary.
type Node = any;

/** Rain wetness, 0 to 1: lowers roughness and darkens albedo on every surface that is out in the weather. */
export const wetness = uniform(1);
/** The sky colour the puddles pick up at grazing angles (set per state). */
export const puddleSky = uniform(new THREE.Color(0x9fb2b0));

const tone = (hex: number) => color(new THREE.Color(hex));

function standard(options: {
  colour: Node;
  roughness: Node | number;
  metalness?: number;
  exposed?: boolean;
  side?: THREE.Side;
}): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ side: options.side ?? THREE.FrontSide });
  const rough = typeof options.roughness === "number" ? float(options.roughness) : options.roughness;
  // Wet surfaces are darker and glossier; a top-facing surface catches more rain than a wall.
  const exposure = options.exposed === false ? float(0) : clamp(normalWorld.z.mul(0.6).add(0.4), 0, 1).mul(wetness);
  material.colorNode = options.colour.mul(mix(float(1), float(0.72), exposure));
  material.roughnessNode = mix(rough, rough.mul(0.45), exposure);
  material.metalness = options.metalness ?? 0;
  return material;
}

/** Weathered wood: grain stretched along the board's local axis, dark knots and lighter wear. */
export function wood(hex: number, axis: "x" | "y" | "z" = "x", options: { exposed?: boolean; variation?: number } = {}) {
  const p = positionLocal;
  const stretch = axis === "x" ? vec3(p.x.mul(1.5), p.y.mul(40), p.z.mul(40)) : axis === "y" ? vec3(p.x.mul(40), p.y.mul(1.5), p.z.mul(40)) : vec3(p.x.mul(40), p.y.mul(40), p.z.mul(1.5));
  const grain = mx_fractal_noise_float(stretch, 3, 2, 0.5).mul(0.5).add(0.5);
  const blotch = mx_noise_float(positionWorld.mul(2.2)).mul(0.5).add(0.5);
  const variation = options.variation ?? 0.35;
  const base = tone(hex);
  const colour = base.mul(mix(float(1 - variation), float(1 + variation * 0.6), grain)).mul(mix(float(0.8), float(1.12), blotch));
  return standard({ colour, roughness: mix(float(0.62), float(0.85), grain), exposed: options.exposed });
}

/** Painted clapboard siding: horizontal boards, shadowed laps, flaking paint. */
export function siding(hex: number) {
  const lap = fract(positionWorld.z.mul(1 / 0.17));
  const shade = smoothstep(0.0, 0.18, lap).mul(0.35).add(0.65);
  const wear = smoothstep(0.35, 0.75, mx_fractal_noise_float(positionWorld.mul(vec3(3, 3, 9)), 3, 2, 0.5).mul(0.5).add(0.5));
  const colour = mix(tone(hex), tone(0x6b5a44), wear.mul(0.4)).mul(shade);
  return standard({ colour, roughness: 0.75, exposed: false });
}

/** Flagstone: blue-grey slate with cell variation, moss creeping onto its upper face. */
export function stone(hex = 0x6f7272) {
  const cells = mx_worley_noise_float(positionWorld.mul(5));
  const grit = mx_fractal_noise_float(positionWorld.mul(14), 3, 2, 0.5).mul(0.5).add(0.5);
  const mossy = smoothstep(0.55, 0.75, mx_noise_float(positionWorld.mul(3.1)).mul(0.5).add(0.5)).mul(smoothstep(0.6, 0.95, normalWorld.z));
  const rock = tone(hex).mul(mix(float(0.7), float(1.15), grit)).mul(mix(float(1.05), float(0.85), cells));
  const colour = mix(rock, tone(0x4c5a20), mossy.mul(0.85));
  return standard({ colour, roughness: mix(float(0.7), float(0.9), mossy) });
}

/** Bark: deep vertical furrows, moss on the north side and the root flare. */
export function bark() {
  const furrow = mx_fractal_noise_float(positionWorld.mul(vec3(9, 9, 1.4)), 4, 2, 0.55).mul(0.5).add(0.5);
  const mossy = smoothstep(0.45, 0.8, mx_noise_float(positionWorld.mul(1.6)).mul(0.5).add(0.5)).mul(smoothstep(1.4, 0.2, positionWorld.z));
  const colour = mix(tone(0x4a3324).mul(mix(float(0.45), float(1.25), furrow)), tone(0x55621f), mossy.mul(0.8));
  return standard({ colour, roughness: 0.9 });
}

/** Galvanised or painted metal. */
export function metal(hex: number, roughness = 0.4, metalness = 0.7) {
  const grime = mx_fractal_noise_float(positionWorld.mul(6), 3, 2, 0.5).mul(0.5).add(0.5);
  return standard({ colour: tone(hex).mul(mix(float(0.65), float(1.1), grime)), roughness: mix(float(roughness), float(0.8), grime.mul(0.5)), metalness });
}

/** Plain painted or matte surface with a little noise so nothing reads as flat CG colour. */
export function matte(hex: number, roughness = 0.8, options: { side?: THREE.Side; exposed?: boolean } = {}) {
  const n = mx_noise_float(positionWorld.mul(7)).mul(0.08).add(1);
  return standard({ colour: tone(hex).mul(n), roughness, side: options.side, exposed: options.exposed });
}

/** Foliage: per-instance colour (InstancedMesh.setColorAt) times a darker base, two-sided. */
export function foliage(roughness = 0.65) {
  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, vertexColors: true });
  material.roughnessNode = mix(float(roughness), float(roughness * 0.5), wetness);
  return material;
}

/** Glowing window glass or lamp glass: emissive, warm, scaled by the lamp uniform. */
export function glow(hex: number, strength: Node) {
  const material = new THREE.MeshStandardNodeMaterial();
  material.colorNode = tone(0x1a120a);
  const flicker = mx_noise_float(positionWorld.mul(9)).mul(0.15).add(0.92);
  material.emissiveNode = tone(hex).mul(strength).mul(flicker);
  material.roughness = 0.2;
  return material;
}

/**
 * The yard ground: mud, moss and grass from a painted layout mask (R puddle, G mud, B grass) plus world noise,
 * and mirror-like puddles that sample the planar reflection.
 */
export function ground(mask: THREE.Texture, reflection: Node) {
  const m = texture(mask, uv());
  const n1 = mx_fractal_noise_float(positionWorld.mul(1.3), 4, 2, 0.5).mul(0.5).add(0.5);
  const n2 = mx_fractal_noise_float(positionWorld.mul(9), 3, 2, 0.5).mul(0.5).add(0.5);
  const mud = mix(tone(0x2f2218), tone(0x4b3825), n2);
  const moss = mix(tone(0x1f2a0e), tone(0x46561c), n2.mul(n1).mul(1.6));
  const grass = mix(tone(0x2e3c14), tone(0x55662a), n2);
  const mudAmount = clamp(m.g.add(n1.sub(0.5).mul(0.6)), 0, 1);
  let albedo: Node = mix(moss, mud, smoothstep(0.35, 0.65, mudAmount));
  albedo = mix(albedo, grass, smoothstep(0.4, 0.7, m.b.add(n2.sub(0.5).mul(0.4))));
  const n3 = mx_fractal_noise_float(positionWorld.mul(3.2), 3, 2, 0.5).mul(0.5).add(0.5);
  const puddle = smoothstep(0.5, 0.56, m.r.add(n3.sub(0.5).mul(0.7)).add(n2.sub(0.5).mul(0.06)));
  const damp = smoothstep(0.15, 0.5, m.r.add(n3.sub(0.5).mul(0.6)).add(m.g.mul(0.3)));
  const material = new THREE.MeshStandardNodeMaterial();
  // Ripples: the reflection is pushed a little by fine noise so the puddles read as rain-struck water.
  const ripple = vec2(mx_noise_float(positionWorld.mul(vec3(18, 18, 1))), mx_noise_float(positionWorld.mul(vec3(17, 19, 1)).add(4))).mul(0.006);
  reflection.uvNode = reflection.uvNode.add(ripple);
  const water = reflection.rgb.mul(1.1).add(puddleSky.mul(0.05));
  const wetAlbedo = albedo.mul(mix(float(1), float(0.55), damp.mul(wetness)));
  material.colorNode = mix(wetAlbedo, tone(0x050403), puddle.mul(0.9));
  material.emissiveNode = water.mul(puddle).mul(wetness);
  material.roughnessNode = mix(mix(float(0.92), float(0.4), damp.mul(wetness)), float(0.05), puddle);
  material.metalness = 0;
  return material;
}

/** Stevie's restyle: the Meshy albedo graded into the mockup's warm grey-brown, a soft fur sheen, no flat bands. */
export function furBody(map: THREE.Texture) {
  const material = new THREE.MeshStandardNodeMaterial();
  const albedo: Node = texture(map, uv()).rgb;
  const lum = albedo.dot(vec3(0.299, 0.587, 0.114));
  // Pull the photographic texture towards the mockup's palette: warmer mids, deep cool darks, creamy whites.
  const graded = mix(mix(tone(0x15110f), tone(0x6a5c50), smoothstep(0.02, 0.35, lum)), tone(0xe6dccb), smoothstep(0.35, 0.8, lum));
  material.colorNode = mix(albedo, graded, 0.55).mul(1.05);
  material.roughness = 0.85;
  material.sheenNode = tone(0x9a8a78).mul(0.6);
  material.sheenRoughness = 0.55;
  return material;
}

/** One fur shell: strands from a hashed cell grid in UV space, thinning towards the tips, darkening at the roots. */
export function furShell(map: THREE.Texture, layer: number, layers: number, length: number) {
  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.FrontSide });
  const h = layer / layers;
  const albedo: Node = texture(map, uv()).rgb;
  const cell = uv().mul(420);
  const strand = mx_noise_float(cell.floor().add(0.5)).mul(0.5).add(0.5);
  const radial = vec2(fract(cell.x).sub(0.5), fract(cell.y).sub(0.5)).length();
  // Each strand is a cone: present while its random length exceeds this shell's height, thinner near the tip.
  const keep = step(float(h), strand).mul(step(radial, float(0.5 * (1 - h) + 0.12)));
  material.opacityNode = keep;
  material.alphaTest = 0.5;
  material.colorNode = albedo.mul(mix(float(0.55), float(1.12), float(h)));
  material.roughness = 0.9;
  material.positionNode = positionLocal.add(normalLocal.mul(length * h));
  return material;
}
