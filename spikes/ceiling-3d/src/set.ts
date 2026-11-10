// The mockup's yard, rebuilt (issue 34). Every piece is placed by the mockup pixel it occupies (look.ts anchor),
// so the composition matches the reference at the hero camera. Geometry is procedural; the generated props
// (props.ts) replace their stand-ins when their GLBs are present.
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { anchor, LOOK, WARM } from "./look.ts";
import { bark, foliage, glow, ground, matte, metal, siding, stone, wood } from "./materials.ts";

// biome-ignore lint/suspicious/noExplicitAny: TSL nodes at the boundary.
type Any = any;

/** A small deterministic random source, so every capture draws the same yard. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The lamp strength every glowing pane and lamp light reads (state × on). */
export const lampStrength = uniform(1);

export interface Lamp {
  readonly light: THREE.PointLight;
  readonly base: number;
}

export interface Set {
  readonly root: THREE.Group;
  /** Named groups the journey hides one at a time to prove each draws. */
  readonly groups: Record<string, THREE.Object3D>;
  readonly lamps: Lamp[];
  /** Placeholders the generated props replace: name → where and how big. */
  readonly slots: Record<string, Slot>;
  readonly ground: THREE.Mesh;
}

export interface Slot {
  readonly at: THREE.Vector3;
  /** Target size in metres along the prop's largest horizontal extent, or its height when `by` is "height". */
  readonly size: number;
  readonly by: "height" | "width";
  readonly yaw: number;
  /** Turn about the prop's own x axis before the yaw: lays an upright model on its side. */
  readonly tilt?: number;
  readonly stand: THREE.Object3D;
}

const UPZ = new THREE.Vector3(0, 0, 1);
/** Unit ground direction from a to b. */
const dir = (a: THREE.Vector3, b: THREE.Vector3) => new THREE.Vector3(b.x - a.x, b.y - a.y, 0).normalize();
/** The horizontal normal of a line, turned towards the camera. */
function towardsCamera(u: THREE.Vector3) {
  const n = new THREE.Vector3(-u.y, u.x, 0);
  if (n.x * -LOOK.x + n.y * -LOOK.y < 0) n.negate();
  return n;
}

function shadowed<T extends THREE.Object3D>(o: T, cast = true): T {
  o.traverse((c: Any) => {
    if (c.isMesh) {
      c.castShadow = cast;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** A box spanning `length` along `u`, `depth` along the camera-facing normal, `height` up, its base centre at `at`. */
function slab(material: THREE.Material, at: THREE.Vector3, u: THREE.Vector3, length: number, depth: number, height: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, depth, height), material);
  mesh.position.set(at.x, at.y, at.z + height / 2);
  mesh.rotation.z = Math.atan2(u.y, u.x);
  return shadowed(mesh);
}

/** Instanced boxes from a list of matrices: boards, balusters, pickets. */
function boards(material: THREE.Material, size: [number, number, number], matrices: THREE.Matrix4[]) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  return shadowed(mesh);
}

const compose = (p: THREE.Vector3, yaw: number, s = new THREE.Vector3(1, 1, 1), tilt = 0) =>
  new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, yaw, "ZXY")), s);

/** The ground layout mask: R puddles, G mud, B grass, painted at mockup anchors over a 24 m square. */
const GROUND_SIZE = 24;
function layoutMask(centre: THREE.Vector3) {
  const size = 1024;
  const data = new Uint8Array(size * size * 4);
  const toUv = (p: THREE.Vector3) => [((p.x - centre.x) / GROUND_SIZE + 0.5) * size, ((p.y - centre.y) / GROUND_SIZE + 0.5) * size];
  const blobs: { at: number[]; r: number; ch: number; v: number }[] = [];
  const px = size / GROUND_SIZE;
  // Puddles: the mockup's wet patches along the path, by the bin and in front of the porch.
  for (const [x, y, r] of [
    [560, 540, 0.55], [470, 500, 0.3], [880, 470, 0.5], [960, 455, 0.32], [900, 620, 0.6], [640, 660, 0.42], [760, 610, 0.3],
    [1150, 590, 0.35], [700, 780, 0.38], [430, 640, 0.3], [820, 540, 0.25],
  ] as const)
    blobs.push({ at: toUv(anchor(x, y)), r: r * px, ch: 0, v: 1 });
  // Mud: the trodden middle of the yard, around the path and the bin.
  for (const [x, y, r] of [
    [620, 560, 2.8], [800, 520, 2.2], [740, 700, 2.4], [980, 520, 1.8], [520, 470, 1.6], [700, 860, 2.0], [880, 640, 1.8], [450, 600, 1.4],
  ] as const)
    blobs.push({ at: toUv(anchor(x, y)), r: r * px, ch: 1, v: 1 });
  // Grass: the edges, by the fences and the beds.
  for (const [x, y, r] of [
    [150, 650, 2.4], [1250, 520, 2.2], [1000, 800, 2.0], [280, 880, 1.8], [1450, 380, 2.2], [80, 400, 2.2],
  ] as const)
    blobs.push({ at: toUv(anchor(x, y)), r: r * px, ch: 2, v: 1 });
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const o = (j * size + i) * 4;
      const acc = [0, 0, 0];
      for (const b of blobs) {
        const d = Math.hypot(i - b.at[0], j - b.at[1]) / b.r;
        if (d < 1.6) acc[b.ch] = Math.max(acc[b.ch], b.v * Math.max(0, 1 - d * d * 0.5));
      }
      data[o] = acc[0] * 255;
      data[o + 1] = acc[1] * 255;
      data[o + 2] = acc[2] * 255;
      data[o + 3] = 255;
    }
  const mask = new THREE.DataTexture(data, size, size);
  mask.colorSpace = THREE.NoColorSpace;
  mask.magFilter = THREE.LinearFilter;
  mask.minFilter = THREE.LinearMipmapLinearFilter;
  mask.generateMipmaps = true;
  mask.needsUpdate = true;
  return mask;
}

export function buildSet(reflection: Any): Set {
  const root = new THREE.Group();
  root.name = "set";
  const groups: Record<string, THREE.Object3D> = {};
  const lamps: Lamp[] = [];
  const slots: Record<string, Slot> = {};
  const group = (name: string) => {
    const g = new THREE.Group();
    g.name = name;
    groups[name] = g;
    root.add(g);
    return g;
  };
  const random = rng(34);

  // ---- Ground ----
  const centre = anchor(836, 470);
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), ground(layoutMask(centre), reflection));
  groundMesh.position.set(centre.x, centre.y, 0);
  groundMesh.receiveShadow = true;
  groundMesh.add(reflection.target);
  group("ground").add(groundMesh);

  // ---- House and porch ----
  const house = group("house");
  const porch = group("porch");
  const P1 = anchor(360, 450);
  const P2 = anchor(735, 335);
  const u = dir(P1, P2);
  const n = towardsCamera(u);
  const L = P1.distanceTo(P2);
  const DECK = 0.6;
  const DEPTH = 1.8;
  const along = (s: number, out = 0, z = 0) => P1.clone().addScaledVector(u, s).addScaledVector(n, out).setZ(z);
  const wallMat = siding(0x3a4a3c);
  const trim = wood(0xb59b78, "z", { exposed: false, variation: 0.2 });
  const deckWood = wood(0x7a5232, "x");
  const postWood = wood(0x8a5e38, "z");
  // The house body behind the porch, running out of frame to the left and up.
  const wallBase = along(-5.5, -DEPTH - 3, 0);
  house.add(slab(wallMat, along(L / 2 - 2.6, -DEPTH - 3, 0), u, L + 5.8, 6, 5));
  // The gable end on the left, seen side-on.
  house.add(slab(wallMat, along(-5.5, -DEPTH - 0.2, 0), u, 0.3, 0.4, 5));
  void wallBase;
  // Corner boards.
  house.add(slab(trim, along(L + 0.3, -DEPTH + 0.02, 0), u, 0.16, 0.12, 5));
  // Windows: one on the porch, one upper left (the mockup's lit window at 200,130), and a door.
  const windowAt = (s: number, z: number, w: number, h: number, lit: number) => {
    const g = new THREE.Group();
    const c = along(s, -DEPTH + 0.02, z);
    const frame = slab(trim, c, u, w + 0.18, 0.1, h + 0.18);
    frame.position.z -= 0.09;
    g.add(frame);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow(0xffa04a, lampStrength.mul(lit)));
    pane.position.copy(c).addScaledVector(n, 0.06);
    pane.position.z = z + h / 2;
    pane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    pane.rotateZ(Math.atan2(u.y, u.x) - Math.atan2(n.y, n.x) + Math.PI / 2);
    g.add(pane);
    // Muntins.
    g.add(slab(trim, c.clone().addScaledVector(n, 0.07), u, 0.05, 0.03, h));
    const bar = slab(trim, c.clone().addScaledVector(n, 0.07).setZ(z + h / 2 - 0.025), u, w, 0.03, 0.05);
    g.add(bar);
    const light = new THREE.PointLight(WARM, 0, 7, 1.6);
    light.position.copy(c).addScaledVector(n, 0.45);
    light.position.z = z + h * 0.6;
    lamps.push({ light, base: 5.5 * lit });
    g.add(light);
    house.add(g);
  };
  windowAt(-3.2, 1.75, 0.7, 0.95, 1);
  windowAt(-1.0, DECK + 0.55, 0.7, 0.9, 1);
  windowAt(L * 0.62, DECK + 0.5, 0.6, 0.85, 0.6);
  const door = slab(wood(0x4a3020, "z"), along(L * 0.3, -DEPTH + 0.05, DECK), u, 0.7, 0.08, 1.45);
  house.add(door);
  // Upper balcony slab and its railing (the mockup's upper rail).
  porch.add(slab(deckWood, along(L / 2 - 0.2, -DEPTH / 2 + 0.1, 2.25), u, L + 0.6, DEPTH + 0.2, 0.14));
  // Deck.
  const deckBoards: THREE.Matrix4[] = [];
  for (let k = 0; k < DEPTH / 0.15; k++) {
    const c = along(L / 2 - 0.15, -0.08 - k * 0.15, DECK - 0.04);
    deckBoards.push(compose(c, Math.atan2(u.y, u.x), new THREE.Vector3(1, 1, 1 + random() * 0.2)));
  }
  porch.add(boards(deckWood, [L + 0.3, 0.135, 0.05], deckBoards));
  porch.add(slab(postWood, along(L / 2 - 0.15, -DEPTH / 2, 0), u, L + 0.3, DEPTH, DECK - 0.06));
  // Skirt boards between ground and deck, with the den opening (the mockup's "Raccoon Den").
  const skirt: THREE.Matrix4[] = [];
  const DEN = [L * 0.38, L * 0.58];
  for (let s = 0; s < L; s += 0.13) {
    if (s > DEN[0] && s < DEN[1]) continue;
    skirt.push(compose(along(s, 0.02, (DECK - 0.1) / 2), Math.atan2(u.y, u.x), new THREE.Vector3(1, 1, 0.9 + random() * 0.1)));
  }
  porch.add(boards(wood(0x5e4128, "z"), [0.11, 0.03, DECK - 0.1], skirt));
  const den = slab(matte(0x070504, 1), along((DEN[0] + DEN[1]) / 2, -0.15, 0), u, DEN[1] - DEN[0], 0.2, DECK - 0.12);
  porch.add(den);
  // The den's sign: a plank lettered "Raccoon Den".
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 512;
  signCanvas.height = 128;
  const ctx = signCanvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#7a5634";
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(40,24,12,${0.15 + random() * 0.2})`;
    ctx.beginPath();
    const y = random() * 128;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + random() * 8 - 4, 340, y + random() * 8 - 4, 512, y + random() * 6 - 3);
    ctx.stroke();
  }
  ctx.fillStyle = "#f0dfbf";
  ctx.font = "italic 600 64px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Raccoon Den", 256, 66);
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.19), new THREE.MeshStandardNodeMaterial({ map: signTexture, roughness: 0.8 }));
  sign.position.copy(along(DEN[0] - 0.25, 0.09, DECK - 0.32));
  sign.quaternion.setFromUnitVectors(UPZ, n);
  sign.rotateZ(Math.atan2(u.y, u.x) - Math.atan2(n.y, n.x) + Math.PI / 2);
  sign.rotateZ(0.12);
  sign.castShadow = true;
  porch.add(sign);
  // Posts and rail.
  for (const s of [0, L * 0.5, L]) porch.add(slab(postWood, along(s, 0, 0), u, 0.13, 0.13, 2.25));
  const rails = [DECK + 0.06, DECK + 0.62];
  for (const z of rails) porch.add(slab(postWood, along(L / 2, 0, z), u, L, 0.08, 0.08));
  porch.add(slab(postWood, along(L / 2, -DEPTH / 2, 2.39 + 0.56), u, L, 0.07, 0.07));
  const balusters: THREE.Matrix4[] = [];
  const upper: THREE.Matrix4[] = [];
  for (let s = 0.1; s < L - 0.05; s += 0.12) {
    balusters.push(compose(along(s, 0, DECK + 0.34), Math.atan2(u.y, u.x)));
    upper.push(compose(along(s, -DEPTH / 2, 2.39 + 0.28), Math.atan2(u.y, u.x)));
  }
  porch.add(boards(postWood, [0.04, 0.04, 0.56], balusters));
  porch.add(boards(postWood, [0.04, 0.04, 0.56], upper));
  // Steps down from the porch's left end towards the yard.
  for (let k = 0; k < 3; k++) {
    const h = DECK - (k + 1) * (DECK / 3);
    porch.add(slab(deckWood, along(0.5, 0.12 + k * 0.24, 0), u, 0.9, 0.24, h + DECK / 3));
  }
  // The porch lantern by the den, and its light.
  const lantern = new THREE.Group();
  const lanternAt = along(DEN[0] + 0.15, 0.12, DECK - 0.45);
  lantern.add(slab(metal(0x1b1712, 0.5, 0.6), lanternAt.clone().setZ(lanternAt.z + 0.26), u, 0.16, 0.16, 0.04));
  const lanternGlass = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), glow(0xffc070, lampStrength.mul(6)));
  lanternGlass.position.copy(lanternAt).setZ(lanternAt.z + 0.15);
  lantern.add(lanternGlass);
  const porchLight = new THREE.PointLight(WARM, 0, 6, 1.5);
  porchLight.position.copy(lanternAt).addScaledVector(n, 0.15).setZ(lanternAt.z + 0.12);
  porchLight.castShadow = true;
  porchLight.shadow.mapSize.set(512, 512);
  porchLight.shadow.bias = -0.002;
  lamps.push({ light: porchLight, base: 7 });
  lantern.add(porchLight);
  group("porch-lamp").add(lantern);
  // Potted plant on the upper balcony.
  const pot = new THREE.Group();
  pot.add(slab(matte(0x8a4a2a, 0.8), along(0.6, -0.4, 2.39), u, 0.28, 0.28, 0.24));
  pot.add(bush(along(0.6, -0.4, 2.63), 0.28, 0x4f6e2a, rng(7)));
  porch.add(pot);

  // ---- The neighbour's wall beyond the fence, with its lit window (top right of the mockup) ----
  const neighbour = group("neighbour");
  const nA = anchor(1180, 200, 0);
  const nu = dir(anchor(1100, 250), anchor(1600, 520));
  neighbour.add(slab(siding(0x2d3c4e), nA.clone().addScaledVector(towardsCamera(nu), -1.5), nu, 9, 2.5, 6));
  {
    const nn = towardsCamera(nu);
    const w = anchor(1270, 150, 2.4);
    const c = new THREE.Vector3(w.x, w.y, 0);
    // Snap the window onto the neighbour wall's face.
    const face = nA.clone().addScaledVector(nn, -0.25);
    const off = c.clone().sub(face).dot(nn);
    c.addScaledVector(nn, -off);
    neighbour.add(slab(trim, c.clone().setZ(2.2), nu, 1.0, 0.1, 1.3));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), glow(0xffa04a, lampStrength.mul(0.9)));
    pane.position.copy(c).addScaledVector(nn, 0.06).setZ(2.85);
    pane.quaternion.setFromUnitVectors(UPZ, nn);
    pane.rotateZ(Math.atan2(nu.y, nu.x) - Math.atan2(nn.y, nn.x) + Math.PI / 2);
    neighbour.add(pane);
    const light = new THREE.PointLight(WARM, 0, 6, 1.6);
    light.position.copy(c).addScaledVector(nn, 0.5).setZ(2.9);
    lamps.push({ light, base: 4 });
    neighbour.add(light);
  }

  // ---- Fences ----
  const fences = group("fence");
  const fenceWood = wood(0x6e5338, "z", { variation: 0.4 });
  const fence = (a: THREE.Vector3, b: THREE.Vector3, height: number, seed: number) => {
    const r = rng(seed);
    const fu = dir(a, b);
    const len = a.distanceTo(b);
    const yaw = Math.atan2(fu.y, fu.x);
    const pickets: THREE.Matrix4[] = [];
    for (let s = 0; s < len; s += 0.16) {
      const h = height * (0.92 + r() * 0.12);
      const p = a.clone().addScaledVector(fu, s);
      p.z = h / 2;
      pickets.push(compose(p, yaw + (r() - 0.5) * 0.06, new THREE.Vector3(1, 1, h / height), (r() - 0.5) * 0.05));
    }
    fences.add(boards(fenceWood, [0.14, 0.025, height], pickets));
    const fnormal = towardsCamera(fu);
    for (const z of [0.3, height - 0.25]) fences.add(slab(fenceWood, a.clone().addScaledVector(fu, len / 2).addScaledVector(fnormal, 0.05).setZ(z), fu, len, 0.05, 0.09));
    for (let s = 0; s <= len; s += 2.2) fences.add(slab(fenceWood, a.clone().addScaledVector(fu, s).addScaledVector(fnormal, 0.08), fu, 0.11, 0.11, height + 0.1));
  };
  fence(anchor(640, 215), anchor(1000, 300), 1.25, 1);
  fence(anchor(1000, 300), anchor(1720, 720), 1.15, 2);
  fence(anchor(-40, 790), anchor(470, 1010), 0.7, 3);
  fence(anchor(1060, 1010), anchor(1720, 690), 0.7, 4);

  // ---- The tree ----
  const tree = group("tree");
  const treeAt = anchor(842, 405);
  const trunkGeo = new THREE.CylinderGeometry(0.42, 0.62, 10, 48, 40, true);
  trunkGeo.rotateX(Math.PI / 2);
  {
    const pos = trunkGeo.getAttribute("position");
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = Math.atan2(v.y, v.x);
      const ridge = 0.05 * Math.sin(a * 11 + v.z * 0.6) + 0.035 * Math.sin(a * 23 - v.z * 1.3);
      const flare = Math.max(0, 1.2 - (v.z + 5)) * 0.35;
      const k = 1 + ridge + flare * (0.6 + 0.4 * Math.sin(a * 5));
      pos.setXYZ(i, v.x * k, v.y * k, v.z + 5);
    }
    trunkGeo.computeVertexNormals();
  }
  const trunk = shadowed(new THREE.Mesh(trunkGeo, bark()));
  trunk.position.set(treeAt.x, treeAt.y, -0.05);
  tree.add(trunk);
  const roots = new THREE.Group();
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + random() * 0.4;
    const len = 0.6 + random() * 0.5;
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.18, len, 10, 1, true), bark());
    root.rotation.set(0, 0, 0);
    root.position.set(treeAt.x + Math.cos(a) * (0.45 + len * 0.35), treeAt.y + Math.sin(a) * (0.45 + len * 0.35), 0.08);
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.cos(a), -Math.sin(a), 0.32).normalize());
    root.scale.set(1, 1, 0.55);
    roots.add(root);
  }
  tree.add(shadowed(roots));
  slots["tree-base"] = { at: treeAt.clone(), size: 2.7, by: "width", yaw: 0.4, stand: roots };

  // ---- Path stones ----
  const stones = group("path");
  const stoneMat = stone();
  const stonePoints: [number, number, number][] = [
    [480, 480, 0.42], [560, 500, 0.38], [650, 520, 0.4], [745, 545, 0.45], [800, 600, 0.4], [735, 640, 0.42],
    [700, 715, 0.45], [760, 770, 0.4], [690, 830, 0.46], [740, 905, 0.48], [860, 470, 0.36], [930, 520, 0.34],
    [620, 610, 0.3], [400, 520, 0.36], [990, 600, 0.32], [560, 420, 0.32], [680, 465, 0.3],
  ];
  for (const [x, y, r] of stonePoints) {
    const g = new THREE.CylinderGeometry(r * 0.62, r * 0.66, 0.06, 9, 1);
    g.rotateX(Math.PI / 2);
    const pos = g.getAttribute("position");
    const sr = rng(x * 7 + y);
    const jitter = Array.from({ length: 10 }, () => 0.8 + sr() * 0.35);
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getY(i), pos.getX(i));
      const k = jitter[Math.round(((a + Math.PI) / (Math.PI * 2)) * 9) % 9];
      pos.setXYZ(i, pos.getX(i) * k * 1.25, pos.getY(i) * k, pos.getZ(i));
    }
    // Keep the cylinder's own normals: flat caps, smooth sides, no fan creases from the jitter.
    const m = shadowed(new THREE.Mesh(g, stoneMat));
    const p = anchor(x, y);
    m.position.set(p.x, p.y, 0.02);
    m.rotation.z = sr() * Math.PI;
    stones.add(m);
  }

  // ---- Plants: ferns, shrubs, grass, flowers, moss ----
  const plants = group("plants");
  const fernSpots: [number, number, number][] = [
    [740, 380, 1.1], [960, 345, 1.0], [880, 290, 0.9], [1010, 390, 0.8], [690, 300, 0.8], [110, 470, 1.0], [170, 610, 0.9],
    [60, 720, 1.0], [1260, 470, 1.0], [1350, 410, 0.9], [840, 700, 0.8], [270, 690, 0.8], [600, 290, 0.7], [1480, 520, 0.9],
    [320, 780, 0.7], [1180, 420, 0.7], [520, 850, 0.7], [960, 900, 0.8], [1120, 660, 0.7],
  ];
  plants.add(ferns(fernSpots.map(([x, y, s]) => [anchor(x, y), s]), rng(3)));
  const bushes: [number, number, number, number][] = [
    [40, 330, 0.9, 0x3d5a22], [130, 380, 0.8, 0x4a6326], [230, 470, 0.6, 0x3f5c24], [40, 560, 0.8, 0x45602a], [1300, 340, 0.8, 0x3b5524],
    [1420, 440, 0.9, 0x405a26], [1580, 480, 0.8, 0x3d5824], [600, 250, 0.6, 0x415e25], [420, 830, 0.6, 0x3f5c25],
  ];
  for (const [x, y, r, c] of bushes) plants.add(bush(anchor(x, y, 0), r, c, rng(x + y)));
  plants.add(grass(rng(9)));
  const flowerSpots: [number, number, number][] = [
    [100, 470, 0xf2efe6], [140, 500, 0xf2efe6], [170, 560, 0x9a7ad8], [210, 600, 0x8a6cc8], [60, 520, 0xe8e2d0],
    [1180, 620, 0xf09a3a], [1220, 600, 0xe8d050], [1080, 700, 0xf2efe6], [340, 460, 0xe0a040], [1300, 560, 0x9a7ad8],
  ];
  plants.add(flowers(flowerSpots.map(([x, y, c]) => [anchor(x, y), c]), rng(11)));
  plants.add(leafLitter(rng(13)));

  // ---- Stand-ins the generated props replace ----
  const props = group("props");
  const standIn = (name: string, px: number, py: number, size: number, by: "height" | "width", yaw: number, build: () => THREE.Object3D, tilt = 0) => {
    const at = anchor(px, py);
    const stand = build();
    stand.position.copy(at);
    stand.rotation.z = yaw;
    props.add(shadowed(stand));
    slots[name] = { at, size, by, yaw, tilt, stand };
  };
  standIn("trash-can", 1120, 470, 0.85, "width", 2.6, () => {
    const g = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.29, 0.95, 24, 1, true), metal(0x8a8f8c, 0.45, 0.8));
    can.rotation.z = Math.PI / 2;
    can.position.z = 0.33;
    g.add(can);
    return g;
  }, Math.PI / 2);
  standIn("mailbox", 330, 600, 0.95, "height", -0.6, () => {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0), wood(0x6a4a30, "z"));
    post.position.z = 0.5;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.26), metal(0x3c4248, 0.5, 0.6));
    box.position.z = 1.1;
    g.add(post, box);
    return g;
  });
  standIn("lamp-post", 500, 905, 1.05, "height", 0, () => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.1, 10), metal(0x15130f, 0.5, 0.7));
    pole.rotation.x = Math.PI / 2;
    pole.position.z = 0.55;
    g.add(pole);
    return g;
  });
  standIn("mushrooms", 905, 395, 0.28, "height", 0.3, () => mushroomCluster(rng(5)));
  standIn("bird-feeder", 1005, 215, 0.42, "height", 0, () => new THREE.Group());
  standIn("watering-can", 1300, 640, 0.45, "height", -0.9, () => {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.32, 18), metal(0x9aa09c, 0.4, 0.8));
    can.rotation.x = Math.PI / 2;
    can.position.z = 0.16;
    return can;
  });
  standIn("garden-bed", 980, 770, 1.6, "width", 0.95, () => {
    const g = new THREE.Group();
    g.add(slab(wood(0x6b4a2e, "x"), new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 1.8, 1.0, 0.35));
    return g;
  });
  // A second, procedural garden bed further right (the mockup has two).
  {
    const g = new THREE.Group();
    const at = anchor(1230, 700);
    const bu = dir(anchor(1100, 760), anchor(1400, 600));
    g.add(slab(wood(0x6b4a2e, "x"), at, bu, 1.7, 0.95, 0.32));
    g.add(slab(matte(0x1c140d, 0.95), at.clone().setZ(0.02), bu, 1.55, 0.8, 0.31));
    for (let k = 0; k < 6; k++) g.add(bush(at.clone().addScaledVector(bu, -0.6 + k * 0.24).setZ(0.33), 0.16 + random() * 0.06, 0x4f7a2a, rng(40 + k)));
    props.add(shadowed(g));
  }
  // The lamp post's lantern light and the feeder's post, which stay whether the generated props load or not.
  {
    const lampAt = anchor(500, 905);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), glow(0xffc070, lampStrength.mul(7)));
    glass.position.set(lampAt.x, lampAt.y, 0.93);
    groups["lamp-glow"] = glass;
    props.add(glass);
    const light = new THREE.PointLight(WARM, 0, 7, 1.5);
    light.position.set(lampAt.x, lampAt.y, 0.95);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.002;
    lamps.push({ light, base: 8 });
    props.add(light);
    const postAt = anchor(1065, 330);
    const feederPost = slab(wood(0x5a3e26, "z"), postAt, new THREE.Vector3(1, 0, 0), 0.1, 0.1, 1.65);
    const arm = slab(wood(0x5a3e26, "x"), postAt.clone().setZ(1.5), dir(postAt, anchor(1005, 330)), 0.9, 0.08, 0.08);
    arm.position.add(dir(postAt, anchor(1005, 330)).multiplyScalar(0.4));
    props.add(feederPost, arm);
    slots["bird-feeder"] = { ...slots["bird-feeder"], at: postAt.clone().add(dir(postAt, anchor(1005, 330)).multiplyScalar(0.75)).setZ(1.05) };
  }
  // Clutter: litter spilling from the bin, a crushed can, a lid.
  {
    const r = rng(21);
    const litter = new THREE.Group();
    const binMouth = anchor(1040, 520);
    const paper = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.09, 2, 2), matte(0xe8e0d0, 0.9, { side: THREE.DoubleSide }), 26);
    const tint = new THREE.Color();
    for (let i = 0; i < 26; i++) {
      const p = binMouth.clone().add(new THREE.Vector3((r() - 0.6) * 1.0, (r() - 0.5) * 0.8, 0.02 + r() * 0.03));
      paper.setMatrixAt(i, compose(p, r() * 6, new THREE.Vector3(0.6 + r(), 0.6 + r(), 1), (r() - 0.5) * 0.8));
      paper.setColorAt(i, tint.setHSL(r() < 0.3 ? 0.08 : 0.1, r() < 0.3 ? 0.6 : 0.1, 0.55 + r() * 0.3));
    }
    litter.add(paper);
    const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12), metal(0xb03a2a, 0.35, 0.6));
    tin.position.copy(binMouth).add(new THREE.Vector3(-0.3, 0.2, 0.035));
    tin.rotation.set(0, Math.PI / 2, 0.7);
    litter.add(tin);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 24), metal(0x7d827f, 0.45, 0.8));
    lid.position.copy(anchor(1210, 560)).setZ(0.08);
    lid.rotation.set(Math.PI / 2 + 0.25, 0, 0.4);
    litter.add(lid);
    group("clutter").add(shadowed(litter));
  }

  return { root, groups, lamps, slots, ground: groundMesh };
}

/** A fern clump: fronds of paired leaflets, curving out and down, merged into one geometry with vertex colours. */
function fernGeometry(r: () => number) {
  const positions: number[] = [];
  const colours: number[] = [];
  const base = new THREE.Color(0x2e4a16);
  const tip = new THREE.Color(0x7a9a34);
  const c = new THREE.Color();
  const fronds = 11;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + r() * 0.4;
    const len = 0.45 + r() * 0.35;
    const lift = 0.7 + r() * 0.5;
    const steps = 14;
    const spine = (t: number) =>
      new THREE.Vector3(Math.cos(a) * len * t, Math.sin(a) * len * t, len * (lift * t - (lift + 0.35) * t * t * 0.9));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const p = spine(t);
      const q = spine(t + 1 / steps);
      const fwd = q.clone().sub(p).normalize();
      const side = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
      const w = 0.11 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.4);
      for (const sgn of [-1, 1]) {
        const tipPt = p.clone().addScaledVector(side, sgn * w).addScaledVector(fwd, 0.02).add(new THREE.Vector3(0, 0, -0.015));
        const p2 = p.clone().addScaledVector(fwd, 0.035);
        positions.push(p.x, p.y, p.z, p2.x, p2.y, p2.z, tipPt.x, tipPt.y, tipPt.z);
        c.copy(base).lerp(tip, t * 0.8 + r() * 0.2);
        for (let v = 0; v < 3; v++) colours.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  g.computeVertexNormals();
  // Soft, upward foliage normals so leaves shade like a canopy, not like facets.
  const nrm = g.getAttribute("normal");
  for (let i = 0; i < nrm.count; i++) {
    const v = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2] + 0.4).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

function ferns(spots: [THREE.Vector3, number][], r: () => number) {
  const geo = fernGeometry(r);
  const mesh = new THREE.InstancedMesh(geo, foliage(0.6), spots.length * 2);
  const tint = new THREE.Color();
  let i = 0;
  for (const [p, s] of spots)
    for (let k = 0; k < 2; k++) {
      const q = p.clone().add(new THREE.Vector3((r() - 0.5) * 0.5 * s, (r() - 0.5) * 0.5 * s, 0));
      mesh.setMatrixAt(i, compose(q, r() * 6.3, new THREE.Vector3(s, s, s * (0.9 + r() * 0.3))));
      mesh.setColorAt(i, tint.setHSL(0.22 + r() * 0.05, 0.45, 0.5 + r() * 0.2));
      i++;
    }
  return shadowed(mesh);
}

/** A leafy shrub: small leaf cards scattered over a squashed sphere, normals pointing out. */
function bush(at: THREE.Vector3, radius: number, hex: number, r: () => number) {
  const count = Math.round(900 * radius * radius + 120);
  const leaf = new THREE.PlaneGeometry(0.055, 0.035);
  leaf.rotateX(Math.PI / 2);
  const mesh = new THREE.InstancedMesh(leaf, foliage(0.6), count);
  const tint = new THREE.Color();
  const baseColour = new THREE.Color(hex);
  for (let i = 0; i < count; i++) {
    const u = r() * Math.PI * 2;
    const v = Math.acos(1 - r() * 1.1);
    const d = radius * (0.75 + r() * 0.3);
    const p = new THREE.Vector3(Math.cos(u) * Math.sin(v) * d, Math.sin(u) * Math.sin(v) * d, Math.cos(v) * d * 0.8 + radius * 0.3);
    p.add(at);
    mesh.setMatrixAt(i, compose(p, r() * 6.3, new THREE.Vector3(1 + r(), 1 + r(), 1), (r() - 0.3) * 1.5));
    mesh.setColorAt(i, tint.copy(baseColour).multiplyScalar(0.55 + r() * 0.45 * (p.z - at.z) / radius).offsetHSL((r() - 0.5) * 0.03, -0.05, 0));
  }
  return shadowed(mesh);
}

/** Grass tufts over the yard's grassy and mossy edges. */
function grass(r: () => number) {
  const blade = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (let b = 0; b < 7; b++) {
    const a = (b / 7) * Math.PI * 2 + r();
    const h = 0.05 + r() * 0.07;
    const lean = 0.04 + r() * 0.05;
    const w = 0.012;
    const ox = Math.cos(a) * 0.03;
    const oy = Math.sin(a) * 0.03;
    pos.push(ox - w * Math.sin(a), oy + w * Math.cos(a), 0, ox + w * Math.sin(a), oy - w * Math.cos(a), 0, ox + Math.cos(a) * lean, oy + Math.sin(a) * lean, h);
  }
  blade.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  blade.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  const colours: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const t = i % 3 === 2 ? 1 : 0.35;
    colours.push(0.25 * t, 0.36 * t, 0.12 * t);
  }
  blade.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  const areas: [number, number, number][] = [
    [120, 650, 1.6], [1300, 520, 1.4], [1050, 860, 1.2], [250, 900, 1.2], [1450, 380, 1.6], [80, 400, 1.6],
  ];
  const count = 900;
  const mesh = new THREE.InstancedMesh(blade, foliage(0.7), count);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const [x, y, rad] = areas[i % areas.length];
    const c = anchor(x, y);
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * rad;
    const s = 0.8 + r() * 0.9;
    mesh.setMatrixAt(i, compose(new THREE.Vector3(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 0), r() * 6.3, new THREE.Vector3(s, s, s)));
    mesh.setColorAt(i, tint.setHSL(0.18 + r() * 0.08, 0.5, 0.45 + r() * 0.35));
  }
  mesh.receiveShadow = true;
  return mesh;
}

function flowers(spots: [THREE.Vector3, number][], r: () => number) {
  const petal = new THREE.CircleGeometry(0.035, 6);
  const per = 9;
  const mesh = new THREE.InstancedMesh(petal, foliage(0.5), spots.length * per);
  const tint = new THREE.Color();
  let i = 0;
  for (const [p, hex] of spots)
    for (let k = 0; k < per; k++) {
      const q = p.clone().add(new THREE.Vector3((r() - 0.5) * 0.45, (r() - 0.5) * 0.45, 0.18 + r() * 0.25));
      mesh.setMatrixAt(i, compose(q, r() * 6, new THREE.Vector3(1, 1, 1), (r() - 0.5) * 0.8));
      mesh.setColorAt(i, tint.setHex(hex).multiplyScalar(0.85 + r() * 0.3));
      i++;
    }
  return shadowed(mesh, false);
}

/** Fallen leaves over the whole yard: the mockup's ochre and rust specks. */
function leafLitter(r: () => number) {
  const leaf = new THREE.PlaneGeometry(0.05, 0.032);
  const count = 500;
  const mesh = new THREE.InstancedMesh(leaf, foliage(0.6), count);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const p = anchor(r() * 1672, 160 + r() * 800);
    mesh.setMatrixAt(i, compose(new THREE.Vector3(p.x, p.y, 0.012 + r() * 0.01), r() * 6.3, new THREE.Vector3(1, 1, 1), (r() - 0.5) * 0.4));
    mesh.setColorAt(i, tint.setHSL(0.05 + r() * 0.06, 0.5 + r() * 0.25, 0.14 + r() * 0.14));
  }
  mesh.receiveShadow = true;
  return mesh;
}

export function mushroomCluster(r: () => number) {
  const g = new THREE.Group();
  const cap = matte(0x8a5530, 0.6);
  const stem = matte(0xd8cdb4, 0.7);
  for (let k = 0; k < 7; k++) {
    const h = 0.08 + r() * 0.16;
    const rad = 0.04 + r() * 0.05;
    const x = (r() - 0.5) * 0.3;
    const y = (r() - 0.5) * 0.3;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.3, rad * 0.4, h, 8), stem);
    s.rotation.x = Math.PI / 2;
    s.position.set(x, y, h / 2);
    const c = new THREE.Mesh(new THREE.SphereGeometry(rad, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap);
    c.rotation.x = Math.PI / 2;
    c.scale.set(1, 0.6, 1);
    c.position.set(x, y, h);
    g.add(s, c);
  }
  return g;
}

/** Rain: streaks in a box over the frame, falling with a slight wind; positions are a pure function of time. */
export function rain(count: number) {
  const streak = new THREE.CylinderGeometry(0.003, 0.003, 0.2, 3, 1);
  streak.rotateX(Math.PI / 2);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.color = new THREE.Color(0xc8d4dc);
  material.opacity = 0.16;
  const mesh = new THREE.InstancedMesh(streak, material, count);
  mesh.frustumCulled = false;
  mesh.name = "rain";
  const r = rng(77);
  const seeds = Array.from({ length: count }, () => [r(), r(), r(), 0.8 + r() * 0.4]);
  const centre = anchor(836, 470);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.12, 0.08, 1).normalize());
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const update = (seconds: number) => {
    for (let i = 0; i < count; i++) {
      const [a, b, c, speed] = seeds[i];
      const z = 7 - ((c * 7 + seconds * 7 * speed) % 7);
      p.set(centre.x + (a - 0.5) * 16 + (7 - z) * 0.12, centre.y + (b - 0.5) * 16 + (7 - z) * 0.08, z);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}
