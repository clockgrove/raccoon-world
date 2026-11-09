// The "3D rendered to sprites" arm's offline step: the 3D arm's own model and clips drawn, tilted and yawed
// exactly as the 3D arm draws them, into 192 px cells with an orthographic camera: unlit albedo, view-space
// normal and view depth. ONE offscreen WebGPURenderer does all frames and is disposed afterwards.
import { THREE, TSL } from "clockgrove-pin/apps/web/src/renderer-content.js";
import { CAMERA_ELEVATION, HEADING_YAW, HEADINGS, type Heading } from "./arm.js";
import type { Model } from "./model.js";

// biome-ignore lint/suspicious/noExplicitAny: the pinned Three namespace is used untyped here
type Any = any;

export const BAKE_CELL = 192;
export const WALK_FRAMES = 8;
export const IDLE_FRAMES = 4;
export const COLUMNS = WALK_FRAMES + IDLE_FRAMES;
/** Atlas column of a frame: walk phases first, then idle. */
export const frameColumn = (clip: "idle" | "walk", phase: number): number =>
  clip === "walk"
    ? Math.floor((phase % 1) * WALK_FRAMES) % WALK_FRAMES
    : WALK_FRAMES + (Math.floor((phase % 1) * IDLE_FRAMES) % IDLE_FRAMES);
export const headingRow = (heading: Heading): number => HEADINGS.indexOf(heading);

export interface Baked {
  readonly albedo: Any;
  readonly normal: Any;
  readonly depth: Any;
  readonly width: number;
  readonly height: number;
  /** Content units the square cell covers, and the cell centre's height above the feet. */
  readonly cellUnits: number;
  readonly centreY: number;
  /** Half the depth range, in content units: depth 0..1 maps to -depthHalf..+depthHalf about the foot pivot. */
  readonly depthHalf: number;
  readonly stepMs: Readonly<Record<string, number>>;
}

const MARGIN = 1.04;

export async function bake(model: Model): Promise<Baked> {
  const stepMs: Record<string, number> = {};
  const started = performance.now();
  const renderer: Any = new THREE.WebGPURenderer({
    antialias: false,
    alpha: true,
    forceWebGL: !(navigator as Any).gpu,
  });
  try {
    await renderer.init();
    renderer.setPixelRatio(1);
    renderer.setSize(BAKE_CELL, BAKE_CELL, false);

    const scene = new THREE.Scene();
    const tilt = new THREE.Group();
    tilt.rotation.x = CAMERA_ELEVATION;
    const yaw = new THREE.Group();
    const instance = model.instantiate();
    yaw.add(instance.object);
    tilt.add(yaw);
    scene.add(tilt);

    const frames: { row: number; column: number; clip: "idle" | "walk"; phase: number; heading: Heading }[] = [];
    HEADINGS.forEach((heading, row) => {
      for (let k = 0; k < WALK_FRAMES; k++) frames.push({ row, column: k, clip: "walk", phase: k / WALK_FRAMES, heading });
      for (let k = 0; k < IDLE_FRAMES; k++)
        frames.push({ row, column: WALK_FRAMES + k, clip: "idle", phase: k / IDLE_FRAMES, heading });
    });
    const meshes: Any[] = [];
    instance.object.traverse((node: Any) => node.isMesh && meshes.push(node));
    const pose = (f: (typeof frames)[number]) => {
      yaw.rotation.y = -HEADING_YAW[f.heading];
      instance.pose(f.clip, f.phase);
      scene.updateMatrixWorld(true);
    };

    // First pass: the exact extent of every posed vertex, so one cell size frames all headings and poses.
    let [minX, maxX, minY, maxY, maxZ] = [Infinity, -Infinity, Infinity, -Infinity, 0];
    const v = new THREE.Vector3();
    for (const f of frames) {
      pose(f);
      for (const mesh of meshes) {
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v);
          else v.fromBufferAttribute(position, i);
          v.applyMatrix4(mesh.matrixWorld);
          minX = Math.min(minX, v.x);
          maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y);
          maxY = Math.max(maxY, v.y);
          maxZ = Math.max(maxZ, Math.abs(v.z));
        }
      }
    }
    const cellUnits = Math.max(2 * Math.max(-minX, maxX), maxY - minY) * MARGIN;
    const centreY = (minY + maxY) / 2;
    const depthHalf = maxZ * MARGIN;

    const camera = new THREE.OrthographicCamera(
      -cellUnits / 2, cellUnits / 2, centreY + cellUnits / 2, centreY - cellUnits / 2, 0.1, 100,
    );
    camera.position.set(0, 0, 50);
    camera.updateMatrixWorld(true);

    const clearA = new THREE.Color(0, 0, 0);
    const passes = {
      albedo: (m: Any) => new THREE.MeshBasicNodeMaterial({ map: m.map ?? null, side: m.side }),
      normal: (m: Any) => {
        const material = new THREE.MeshBasicNodeMaterial({ side: m.side });
        material.colorNode = TSL.normalView.mul(0.5).add(0.5);
        return material;
      },
      depth: (m: Any) => {
        const material = new THREE.MeshBasicNodeMaterial({ side: m.side });
        material.colorNode = TSL.vec3(TSL.positionWorld.z.div(2 * depthHalf).add(0.5));
        return material;
      },
    };
    type Pass = keyof typeof passes;
    const originals = meshes.map((m) => m.material);
    const swapped = Object.fromEntries(
      (Object.keys(passes) as Pass[]).map((p) => [p, meshes.map((m, i) => passes[p](originals[i]))]),
    ) as Record<Pass, Any[]>;
    const srgb = new THREE.RenderTarget(BAKE_CELL, BAKE_CELL, { depthBuffer: true });
    srgb.texture.colorSpace = THREE.SRGBColorSpace;
    const linear = new THREE.RenderTarget(BAKE_CELL, BAKE_CELL, { depthBuffer: true });
    linear.texture.colorSpace = THREE.NoColorSpace;
    const targets = { albedo: srgb, normal: linear, depth: linear };
    const clears = { albedo: [clearA, 0], normal: [new THREE.Color(0.5, 0.5, 1), 1], depth: [new THREE.Color(0.5, 0.5, 0.5), 1] } as const;

    const draw = async (pass: Pass): Promise<Uint8Array> => {
      renderer.setRenderTarget(targets[pass]);
      renderer.setClearColor(clears[pass][0], clears[pass][1]);
      renderer.clear();
      renderer.render(scene, camera);
      return (await renderer.readRenderTargetPixelsAsync(targets[pass], 0, 0, BAKE_CELL, BAKE_CELL)) as Uint8Array;
    };

    // Readback row order differs by backend: render a marker in the top half and see where it lands.
    const marker = new THREE.Scene();
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(cellUnits / 4, cellUnits / 4),
      new THREE.MeshBasicNodeMaterial({ color: 0xffffff }),
    );
    quad.position.set(0, centreY + cellUnits / 4, 0);
    marker.add(quad);
    renderer.setRenderTarget(linear);
    renderer.setClearColor(clearA, 0);
    renderer.clear();
    renderer.render(marker, camera);
    const probe = (await renderer.readRenderTargetPixelsAsync(linear, 0, 0, BAKE_CELL, BAKE_CELL)) as Uint8Array;
    let sum = 0;
    let n = 0;
    for (let y = 0; y < BAKE_CELL; y++)
      for (let x = 0; x < BAKE_CELL; x++)
        if (probe[(y * BAKE_CELL + x) * 4 + 3]! > 128) {
          sum += y;
          n++;
        }
    const topFirst = n > 0 && sum / n < BAKE_CELL / 2;
    quad.geometry.dispose();
    quad.material.dispose();

    const width = COLUMNS * BAKE_CELL;
    const height = HEADINGS.length * BAKE_CELL;
    const atlas = {
      albedo: new Uint8Array(width * height * 4),
      normal: new Uint8Array(width * height * 4),
      depth: new Uint8Array(width * height * 4),
    };
    for (const f of frames) {
      pose(f);
      const cells: Record<Pass, Uint8Array> = { albedo: new Uint8Array(0), normal: new Uint8Array(0), depth: new Uint8Array(0) };
      for (const pass of ["albedo", "normal", "depth"] as Pass[]) {
        meshes.forEach((m, i) => {
          m.material = swapped[pass][i];
        });
        cells[pass] = await draw(pass);
      }
      dilate(cells, 2);
      for (const pass of ["albedo", "normal", "depth"] as Pass[])
        for (let y = 0; y < BAKE_CELL; y++) {
          const source = topFirst ? BAKE_CELL - 1 - y : y;
          atlas[pass].set(
            cells[pass].subarray(source * BAKE_CELL * 4, (source + 1) * BAKE_CELL * 4),
            ((f.row * BAKE_CELL + y) * width + f.column * BAKE_CELL) * 4,
          );
        }
    }
    meshes.forEach((m, i) => {
      m.material = originals[i];
    });
    for (const list of Object.values(swapped)) for (const m of list) m.dispose();
    srgb.dispose();
    linear.dispose();

    const texture = (data: Uint8Array, colorSpace: string) => {
      const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.colorSpace = colorSpace;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    stepMs.bake = Math.round(performance.now() - started);
    return {
      albedo: texture(atlas.albedo, THREE.SRGBColorSpace),
      normal: texture(atlas.normal, THREE.NoColorSpace),
      depth: texture(atlas.depth, THREE.NoColorSpace),
      width,
      height,
      cellUnits,
      centreY,
      depthHalf,
      stepMs,
    };
  } finally {
    renderer.setRenderTarget(null);
    renderer.dispose();
  }
}

/** Copies the colour of the nearest opaque albedo pixel into the transparent ones around it (all three maps). */
function dilate(cells: Record<"albedo" | "normal" | "depth", Uint8Array>, rounds: number): void {
  const n = BAKE_CELL;
  let mask = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) mask[i] = cells.albedo[i * 4 + 3]! > 127 ? 1 : 0;
  for (let r = 0; r < rounds; r++) {
    const next = mask.slice();
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (mask[y * n + x]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const [nx, ny] = [x + dx, y + dy];
          if (nx < 0 || ny < 0 || nx >= n || ny >= n || !mask[ny * n + nx]) continue;
          for (const pass of ["albedo", "normal", "depth"] as const)
            for (let c = 0; c < 3; c++) cells[pass][(y * n + x) * 4 + c] = cells[pass][(ny * n + nx) * 4 + c]!;
          next[y * n + x] = 1;
          break;
        }
      }
    mask = next;
  }
}
