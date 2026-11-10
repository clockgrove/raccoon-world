// The yard corner of the 3D look proof (issue 26), built in code: a house corner and porch with a warm lamp, a
// fence run, two bins (one tipped over), plants and shrubs, wet ground with a stone path and puddles. Every prop
// is merged into one vertex-coloured mesh with an outline hull, in yard metres (x east, y north, z up), at a
// detail density matched to Stevie's ship mesh (simple forms, no fine geometry noise). Decision: props are
// procedural rather than generated, so the run spends nothing on them and every prop shares one material.
import { THREE } from "@pin/apps/web/src/renderer-content.ts";
import { outline, surface, WARM } from "./look.ts";

// biome-ignore lint/suspicious/noExplicitAny: three objects built and merged here.
type Any = any;
type V3 = readonly [number, number, number];

/** The palette, picked by eye from the mockup (docs/design/reference/raccoon-world-reference.png), sRGB. */
export const PALETTE = {
  plank: 0x7a4a2c,
  plankDark: 0x5a3822,
  rail: 0x8c5c36,
  siding: 0x3d4a3c,
  sidingDark: 0x323d31,
  trim: 0x6b5a44,
  roof: 0x3a3833,
  frame: 0x5a4632,
  door: 0x4a3020,
  fence: 0x6e5440,
  fenceDark: 0x56412f,
  mud: 0x4a3a2a,
  moss: 0x4f5f2c,
  grass: 0x5a6b2f,
  stone: 0x77746a,
  stoneDark: 0x5f5d56,
  bin: 0x707672,
  binDark: 0x575d59,
  fern: 0x4d7a2e,
  shrub: 0x3e6127,
  shrubLight: 0x56802f,
  lavender: 0xa98bc8,
  yellow: 0xe0b85a,
  daisy: 0xf0ece0,
  litter: 0xd8cfbf,
  puddle: 0x26303a,
  brass: 0x8a6a3a,
} as const;

/** Merges primitives (each with a colour) into one geometry with `color` and the outline's `hull` direction. */
class Builder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly hull: number[] = [];
  private readonly indices: number[] = [];

  add(primitive: Any, colour: number, transform: Any, jitter = 0.06): this {
    const geometry = primitive.index ? primitive : primitive;
    geometry.applyMatrix4(transform);
    geometry.computeBoundingBox();
    const centre = new THREE.Vector3();
    geometry.boundingBox.getCenter(centre);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const base = this.positions.length / 3;
    const c = new THREE.Color(colour);
    // Decision: a small per-primitive value shift keeps repeated pieces (pickets, boards) from reading as one slab.
    const shift = 1 + (Math.sin(base * 12.9898 + colour) * 0.5) * jitter;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      this.positions.push(v.x, v.y, v.z);
      this.normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      this.colors.push(c.r * shift, c.g * shift, c.b * shift);
      v.sub(centre);
      if (v.lengthSq() < 1e-12) v.set(0, 0, 1);
      v.normalize();
      this.hull.push(v.x, v.y, v.z);
    }
    const index = geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.indices.push(base + index.getX(i));
    else for (let i = 0; i < position.count; i++) this.indices.push(base + i);
    geometry.dispose();
    return this;
  }

  box(size: V3, at: V3, colour: number, turn = 0): this {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    return this.add(g, colour, matrix(at, turn));
  }
  /** A z-up cylinder standing on `at` (its base), or lying when `lying` turns it about y. */
  cylinder(radius: number, height: number, at: V3, colour: number, segments = 12, top = radius, lying = false): this {
    const g = new THREE.CylinderGeometry(top, radius, height, segments);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, height / 2);
    if (lying) g.rotateY(Math.PI / 2);
    return this.add(g, colour, matrix(at, 0));
  }
  sphere(radius: V3, at: V3, colour: number, segments = 10): this {
    const g = new THREE.SphereGeometry(1, segments, Math.max(6, Math.round(segments * 0.7)));
    g.scale(radius[0], radius[1], radius[2]);
    return this.add(g, colour, matrix(at, 0));
  }

  build(name: string, material: Any, withOutline = true): Any {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute("hull", new THREE.Float32BufferAttribute(this.hull, 3));
    geometry.setIndex(this.indices);
    const group = new THREE.Group();
    group.name = name;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}-surface`;
    group.add(mesh);
    if (withOutline) {
      const edge = new THREE.Mesh(geometry, outline("hull"));
      edge.name = `${name}-outline`;
      group.add(edge);
    }
    return group;
  }
}

function matrix(at: V3, turn: number): Any {
  return new THREE.Matrix4().makeRotationZ(turn).setPosition(at[0], at[1], at[2]);
}

/** Deterministic value noise for ground colour and plant placement (no Math.random: stills repeat). */
function noise(x: number, y: number, seed = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = noise(xi, yi, seed);
  const b = noise(xi + 1, yi, seed);
  const c = noise(xi, yi + 1, seed);
  const d = noise(xi + 1, yi + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** The ground: a vertex-coloured mud, moss and grass patchwork over the slice, x 0..7.6, y 0..6.6. */
function ground(): Any {
  const [w, d, sx, sy] = [7.6, 6.6, 38, 33];
  const g = new THREE.PlaneGeometry(w, d, sx, sy);
  g.translate(w / 2, d / 2, 0);
  const position = g.getAttribute("position");
  const colors: number[] = [];
  const mud = new THREE.Color(PALETTE.mud);
  const moss = new THREE.Color(PALETTE.moss);
  const grass = new THREE.Color(PALETTE.grass);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const n = smoothNoise(x * 0.9, y * 0.9) * 0.7 + smoothNoise(x * 2.3, y * 2.3, 1) * 0.3;
    // Worn mud along the path and near the porch, greener towards the fence and the edges.
    const worn = Math.max(0, 1 - Math.abs(y - (2.8 + 0.25 * (x - 2))) / 1.6) * (x > 1.5 && x < 6 ? 1 : 0.4);
    c.copy(grass).lerp(moss, Math.min(1, n * 1.4)).lerp(mud, Math.min(1, worn * 0.8 + (n > 0.62 ? 0.3 : 0)));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, surface({ vertex: true, roughness: 0.95 }));
  mesh.name = "ground-surface";
  const group = new THREE.Group();
  group.name = "ground";
  group.add(mesh);
  return group;
}

/** Stepping stones from the porch steps across the yard to the bins, and towards the viewer. */
function path(): Any {
  const b = new Builder();
  const stones: V3[] = [
    [2.65, 3.3, 0], [3.2, 3.55, 0], [3.8, 3.85, 0], [4.4, 4.2, 0], [5.0, 4.55, 0],
    [2.8, 2.6, 0], [3.0, 1.95, 0], [3.35, 1.3, 0], [3.6, 0.6, 0],
  ];
  stones.forEach((at, i) => {
    const r = 0.2 + noise(i, 3) * 0.08;
    b.cylinder(r, 0.035, at, i % 3 === 0 ? PALETTE.stoneDark : PALETTE.stone, 9);
  });
  return b.build("path", surface({ vertex: true, roughness: 0.8 }));
}

/** Puddles: flat dark discs that show only while it rains (the content reads the projection's weather). */
function puddles(): Any {
  const b = new Builder();
  const spots: [number, number, number, number][] = [
    [3.95, 2.35, 0.42, 0.26], [4.3, 2.05, 0.25, 0.18], [2.35, 2.9, 0.3, 0.2],
    [5.15, 3.75, 0.36, 0.22], [4.55, 1.15, 0.3, 0.24], [6.0, 2.6, 0.28, 0.17],
  ];
  for (const [x, y, rx, ry] of spots) {
    const g = new THREE.CylinderGeometry(1, 1, 0.004, 20);
    g.rotateX(Math.PI / 2);
    g.scale(rx, ry, 1);
    b.add(g, PALETTE.puddle, matrix([x, y, 0.02], 0.4), 0);
  }
  return b.build("puddles", surface({ vertex: true, roughness: 0.12 }), false);
}

/** The house corner: siding, trim, a door, a pitched-looking stepped roof. The yard sees its east and south walls. */
function house(): Any {
  const b = new Builder();
  const [x0, x1, y0, y1, h] = [-2.8, 0, 1.0, 6.8, 3.0];
  b.box([x1 - x0, y1 - y0, h], [(x0 + x1) / 2, (y0 + y1) / 2, h / 2], PALETTE.siding);
  // Siding boards on both visible walls.
  for (let z = 0.25; z < h; z += 0.28) {
    b.box([0.03, y1 - y0, 0.05], [x1 + 0.015, (y0 + y1) / 2, z], PALETTE.sidingDark, 0);
    b.box([x1 - x0, 0.03, 0.05], [(x0 + x1) / 2, y0 - 0.015, z], PALETTE.sidingDark, 0);
  }
  // Corner trim, sill and foundation.
  b.box([0.12, 0.12, h], [x1 + 0.02, y0 - 0.02, h / 2], PALETTE.trim);
  b.box([0.08, y1 - y0, 0.3], [x1 + 0.04, (y0 + y1) / 2, 0.15], PALETTE.stoneDark);
  b.box([x1 - x0, 0.08, 0.3], [(x0 + x1) / 2, y0 - 0.04, 0.15], PALETTE.stoneDark);
  // Door behind the porch.
  b.box([0.06, 0.9, 2.0], [x1 + 0.03, 3.6, 1.45], PALETTE.door);
  b.box([0.08, 1.05, 0.08], [x1 + 0.04, 3.6, 2.48], PALETTE.trim);
  // Roof: eaves and two stepped slabs.
  b.box([x1 - x0 + 0.5, y1 - y0 + 0.5, 0.18], [(x0 + x1) / 2 + 0.1, (y0 + y1) / 2 - 0.1, h + 0.09], PALETTE.roof);
  b.box([x1 - x0 - 0.2, y1 - y0 - 0.2, 0.5], [(x0 + x1) / 2 - 0.2, (y0 + y1) / 2 + 0.05, h + 0.43], PALETTE.roof);
  b.box([x1 - x0 - 1.2, y1 - y0 - 1.0, 0.45], [(x0 + x1) / 2 - 0.5, (y0 + y1) / 2 + 0.2, h + 0.9], PALETTE.roof);
  return b.build("house", surface({ vertex: true, roughness: 0.9 }));
}

/** The window on the east wall: frame, mullions and a glass pane that glows warm when the lamps are lit. */
function windowPane(): { group: Any; glass: Any } {
  const b = new Builder();
  const [y, z, w, h] = [5.3, 1.75, 1.0, 1.05];
  b.box([0.1, w + 0.16, 0.1], [0.05, y, z + h / 2 + 0.05], PALETTE.frame);
  b.box([0.12, w + 0.24, 0.1], [0.06, y, z - h / 2 - 0.05], PALETTE.frame);
  b.box([0.1, 0.08, h], [0.05, y - w / 2 - 0.04, z], PALETTE.frame);
  b.box([0.1, 0.08, h], [0.05, y + w / 2 + 0.04, z], PALETTE.frame);
  b.box([0.1, 0.05, h], [0.05, y, z], PALETTE.frame);
  b.box([0.1, w, 0.05], [0.05, y, z], PALETTE.frame);
  const group = b.build("window", surface({ vertex: true, roughness: 0.85 }));
  const pane = new THREE.BoxGeometry(0.02, w, h);
  pane.translate(0.01, y, z);
  const glass = new THREE.Mesh(pane, surface({ color: 0x3a3428, roughness: 0.2, emissive: WARM, emissiveIntensity: 0 }));
  glass.name = "window-glass";
  group.add(glass);
  return { group, glass };
}

/** The porch: deck, boards, two steps, posts, rails with balusters and a roof. */
function porch(): Any {
  const b = new Builder();
  const [x1, y0, y1, deck] = [1.7, 2.2, 4.6, 0.45];
  b.box([x1, y1 - y0, deck], [x1 / 2, (y0 + y1) / 2, deck / 2], PALETTE.plankDark);
  for (let y = y0 + 0.1; y < y1; y += 0.2) b.box([x1, 0.17, 0.02], [x1 / 2, y, deck + 0.01], PALETTE.plank);
  // Steps down to the path (y 3.3–3.9).
  b.box([0.35, 0.7, 0.3], [x1 + 0.175, 3.6, 0.15], PALETTE.plank);
  b.box([0.35, 0.7, 0.15], [x1 + 0.525, 3.6, 0.075], PALETTE.plank);
  // Posts.
  for (const y of [y0 + 0.06, y1 - 0.06]) b.box([0.12, 0.12, 2.3], [x1 - 0.06, y, deck + 1.15], PALETTE.rail);
  b.box([0.12, 0.12, 2.3], [x1 - 0.06, 3.22, deck + 1.15], PALETTE.rail);
  b.box([0.12, 0.12, 2.3], [x1 - 0.06, 3.98, deck + 1.15], PALETTE.rail);
  // Rails and balusters along the front (gap at the steps) and both ends.
  const rail = (from: V3, to: V3) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    const turn = Math.atan2(dy, dx);
    for (const z of [deck + 0.15, deck + 0.85]) {
      b.box([length, 0.07, 0.07], [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, z], PALETTE.rail, turn);
    }
    const count = Math.max(1, Math.floor(length / 0.16));
    for (let i = 1; i < count; i++) {
      const t = i / count;
      b.box([0.045, 0.045, 0.7], [from[0] + dx * t, from[1] + dy * t, deck + 0.5], PALETTE.plank, turn);
    }
  };
  rail([x1 - 0.06, y0 + 0.06, 0], [x1 - 0.06, 3.22, 0]);
  rail([x1 - 0.06, 3.98, 0], [x1 - 0.06, y1 - 0.06, 0]);
  rail([0, y0 + 0.06, 0], [x1 - 0.06, y0 + 0.06, 0]);
  rail([0, y1 - 0.06, 0], [x1 - 0.06, y1 - 0.06, 0]);
  // Porch roof and beam.
  b.box([x1 + 0.25, y1 - y0 + 0.3, 0.12], [(x1 + 0.25) / 2, (y0 + y1) / 2, deck + 2.36], PALETTE.roof);
  b.box([0.14, y1 - y0, 0.16], [x1 - 0.06, (y0 + y1) / 2, deck + 2.24], PALETTE.rail);
  return b.build("porch", surface({ vertex: true, roughness: 0.85 }));
}

/** The porch lamp: a bracket and lantern on the wall beside the door, its glass glowing when lit. */
function porchLamp(): { group: Any; glass: Any; pool: Any } {
  const b = new Builder();
  const [y, z] = [1.7, 1.95];
  b.box([0.28, 0.04, 0.04], [0.14, y, z + 0.28], PALETTE.brass);
  b.box([0.2, 0.2, 0.05], [0.24, y, z + 0.2], PALETTE.brass);
  b.box([0.18, 0.18, 0.04], [0.24, y, z - 0.12], PALETTE.brass);
  for (const [dx, dy] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]] as const) {
    b.box([0.025, 0.025, 0.3], [0.24 + dx, y + dy, z + 0.03], PALETTE.brass);
  }
  const group = b.build("porch-lamp", surface({ vertex: true, roughness: 0.5 }));
  const glassGeometry = new THREE.BoxGeometry(0.14, 0.14, 0.26);
  glassGeometry.translate(0.24, y, z + 0.03);
  const glass = new THREE.Mesh(glassGeometry, surface({ color: 0xffe2b0, roughness: 0.3, emissive: WARM, emissiveIntensity: 0 }));
  glass.name = "porch-lamp-glass";
  group.add(glass);
  // A warm pool on the ground under the lamp: a stand-in for the light content cannot cast (see the report).
  // Decision: lamp and pool sit south of the porch roof, which would otherwise hide them from the camera.
  const poolGeometry = new THREE.CircleGeometry(1, 28);
  poolGeometry.scale(0.8, 0.55, 1);
  poolGeometry.translate(0.8, y - 0.1, 0.03);
  const pool = new THREE.Mesh(
    poolGeometry,
    surface({ color: 0x000000, roughness: 1, emissive: WARM, emissiveIntensity: 0, transparent: true, opacity: 0 }),
  );
  pool.name = "porch-lamp-pool";
  group.add(pool);
  return { group, glass, pool };
}

/** The fence run along the north edge and down the east edge: two rails and pointed pickets. */
function fence(): Any {
  const b = new Builder();
  const run = (from: V3, to: V3) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    const turn = Math.atan2(dy, dx);
    for (const z of [0.35, 0.95]) b.box([length, 0.05, 0.08], [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, z], PALETTE.fenceDark, turn);
    const count = Math.floor(length / 0.17);
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const height = 1.15 + noise(i, from[0]) * 0.1;
      const x = from[0] + dx * t;
      const y = from[1] + dy * t;
      b.box([0.1, 0.03, height], [x, y, height / 2], i % 4 === 0 ? PALETTE.fenceDark : PALETTE.fence, turn);
      const tip = new THREE.ConeGeometry(0.07, 0.1, 4);
      tip.rotateX(Math.PI / 2);
      tip.rotateZ(Math.PI / 4);
      b.add(tip, PALETTE.fence, matrix([x, y, height + 0.05], turn));
    }
    for (let i = 0; i <= Math.floor(length / 1.8); i++) {
      const t = Math.min(1, (i * 1.8) / length);
      b.box([0.12, 0.12, 1.35], [from[0] + dx * t, from[1] + dy * t - 0.05, 0.675], PALETTE.fenceDark, turn);
    }
  };
  run([0.15, 6.55, 0], [7.4, 6.55, 0]);
  run([7.4, 6.4, 0], [7.4, 1.4, 0]);
  return b.build("fence", surface({ vertex: true, roughness: 0.9 }));
}

/** A galvanised bin: ribbed body, lid and handles; `tipped` lies it on its side with litter spilling out. */
function bin(name: string, at: V3, tipped: boolean): Any {
  const b = new Builder();
  if (!tipped) {
    b.cylinder(0.26, 0.82, at, PALETTE.bin, 16, 0.3);
    for (const z of [0.2, 0.45, 0.7]) b.cylinder(0.3 - 0.04 * (1 - z), 0.035, [at[0], at[1], z], PALETTE.binDark, 16);
    b.cylinder(0.33, 0.06, [at[0], at[1], 0.82], PALETTE.binDark, 16);
    b.box([0.14, 0.04, 0.05], [at[0], at[1], 0.9], PALETTE.binDark);
  } else {
    const body = new THREE.CylinderGeometry(0.3, 0.26, 0.82, 16, 1, true);
    body.rotateZ(Math.PI / 2);
    b.add(body, PALETTE.bin, matrix([at[0], at[1], 0.29], -0.5));
    const bottom = new THREE.CylinderGeometry(0.26, 0.26, 0.02, 16);
    bottom.rotateZ(Math.PI / 2);
    b.add(bottom, PALETTE.binDark, matrix([at[0] + 0.36, at[1] - 0.2, 0.27], -0.5));
    for (const offset of [-0.2, 0.05, 0.3]) {
      const rib = new THREE.TorusGeometry(0.29, 0.02, 4, 16);
      rib.rotateY(Math.PI / 2);
      b.add(rib, PALETTE.binDark, matrix([at[0] + offset * Math.cos(-0.5), at[1] + offset * Math.sin(-0.5), 0.29], -0.5));
    }
    // The lid on the ground and litter spilling from the open end.
    b.cylinder(0.33, 0.05, [at[0] - 0.75, at[1] + 0.55, 0], PALETTE.binDark, 16);
    for (let i = 0; i < 9; i++) {
      const r = 0.4 + noise(i, 9) * 0.6;
      const a = 2.3 + (noise(i, 4) - 0.5) * 1.6;
      const colour = [PALETTE.litter, PALETTE.yellow, 0xb04a3a, PALETTE.litter][i % 4] ?? PALETTE.litter;
      b.box([0.12, 0.09, 0.02], [at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r, 0.012], colour, a * 3);
    }
  }
  const group = b.build(name, surface({ vertex: true, roughness: 0.55 }));
  return group;
}

/** Ferns (fans of long leaves) and flowers along the house, porch and fence. */
function plants(): Any {
  const b = new Builder();
  const fern = (at: V3, size: number, seed: number) => {
    const leaves = 7;
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2 + noise(i, seed);
      const leaf = new THREE.SphereGeometry(1, 6, 4);
      leaf.scale(0.32 * size, 0.07 * size, 0.035 * size);
      leaf.rotateY(-0.55);
      leaf.translate(0.26 * size, 0, 0.12 * size);
      b.add(leaf, i % 2 ? PALETTE.fern : PALETTE.shrubLight, matrix(at, a));
    }
  };
  fern([0.55, 1.4, 0], 1.0, 1);
  fern([0.4, 5.1, 0], 1.2, 2);
  fern([6.9, 5.9, 0], 1.3, 3);
  fern([2.2, 6.1, 0], 1.0, 4);
  fern([6.9, 1.8, 0], 0.9, 5);
  const flowers: [V3, number][] = [
    [[0.3, 1.9, 0], PALETTE.lavender], [[0.25, 2.05, 0], PALETTE.daisy], [[2.05, 2.35, 0], PALETTE.yellow],
    [[2.15, 4.55, 0], PALETTE.lavender], [[2.3, 4.75, 0], PALETTE.daisy], [[1.0, 0.7, 0], PALETTE.yellow],
    [[5.9, 6.15, 0], PALETTE.lavender], [[6.25, 6.1, 0], PALETTE.daisy],
  ];
  flowers.forEach(([at, colour], i) => {
    for (let k = 0; k < 4; k++) {
      const dx = (noise(i, k) - 0.5) * 0.3;
      const dy = (noise(k, i) - 0.5) * 0.3;
      const h = 0.25 + noise(i + k, 7) * 0.2;
      b.box([0.02, 0.02, h], [at[0] + dx, at[1] + dy, h / 2], PALETTE.fern);
      b.sphere([0.05, 0.05, 0.035], [at[0] + dx, at[1] + dy, h], colour, 6);
    }
  });
  return b.build("plants", surface({ vertex: true, roughness: 0.8 }));
}

/** Shrubs: clumps of soft spheres in two greens. */
function shrubs(): Any {
  const b = new Builder();
  const clump = (at: V3, size: number, seed: number) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + noise(i, seed) * 0.6;
      const r = i === 0 ? 0 : 0.25 * size;
      const s = (0.28 + noise(seed, i) * 0.1) * size;
      b.sphere([s, s, s * 0.85], [at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r, s * 0.7 + (i === 0 ? 0.15 * size : 0)],
        i % 2 ? PALETTE.shrub : PALETTE.shrubLight, 10);
    }
  };
  clump([0.6, 0.45, 0], 1.1, 1);
  clump([3.4, 6.05, 0], 1.0, 2);
  clump([7.0, 3.3, 0], 1.2, 3);
  clump([1.25, 6.1, 0], 0.8, 4);
  return b.build("shrubs", surface({ vertex: true, roughness: 0.85 }));
}

export interface Yard {
  /** Every prop group, by name. */
  readonly props: Record<string, Any>;
  /** Puddles show while it rains; lamps glow from dusk; surfaces get wetter in rain. */
  setConditions(rain: number, lit: boolean, night: boolean): void;
  /** A point on each prop (yard metres) for screen lookups and crops. */
  readonly probes: Record<string, V3>;
}

export function buildYard(): Yard {
  const lamp = porchLamp();
  const pane = windowPane();
  const props: Record<string, Any> = {
    ground: ground(),
    path: path(),
    puddles: puddles(),
    house: house(),
    porch: porch(),
    "porch-lamp": lamp.group,
    window: pane.group,
    fence: fence(),
    "bin-1": bin("bin-1", [5.75, 5.6, 0], false),
    "bin-2": bin("bin-2", [6.35, 4.85, 0], true),
    plants: plants(),
    shrubs: shrubs(),
  };
  const dry = new Map<Any, number>();
  for (const group of Object.values(props))
    group.traverse((node: Any) => {
      if (node.isMesh && !node.name.endsWith("-outline")) dry.set(node, node.material.roughness ?? 1);
    });
  return {
    props,
    probes: {
      ground: [6.2, 0.8, 0],
      path: [3.2, 3.55, 0.03],
      puddles: [3.95, 2.35, 0],
      house: [0, 1.6, 1.4],
      porch: [1.0, 2.7, 0.46],
      "porch-lamp": [0.24, 1.7, 1.95],
      window: [0, 5.3, 1.75],
      fence: [4.0, 6.55, 0.7],
      "bin-1": [5.75, 5.6, 0.5],
      "bin-2": [6.35, 4.85, 0.29],
      plants: [0.55, 1.4, 0.1],
      shrubs: [7.0, 3.3, 0.35],
    },
    setConditions(rain, lit, night) {
      const wet = rain > 0;
      props.puddles.visible = wet;
      // Materials may have been replaced by the renderer's tier conversion, so read them from the meshes.
      for (const [mesh, roughness] of dry) {
        const material = mesh.material;
        if ("roughness" in material && !mesh.name.startsWith("puddles"))
          material.roughness = wet ? Math.max(0.35, roughness * 0.6) : roughness;
      }
      // Decision: the product's warm source bound (0.45) for the glass; the pool stays faint.
      lamp.glass.material.emissiveIntensity = lit ? 0.45 : 0;
      pane.glass.material.emissiveIntensity = lit ? (night ? 0.45 : 0.3) : 0;
      lamp.pool.material.emissiveIntensity = lit ? 0.25 : 0;
      lamp.pool.material.opacity = lit ? 0.35 : 0;
      lamp.pool.visible = lit;
    },
  };
}
