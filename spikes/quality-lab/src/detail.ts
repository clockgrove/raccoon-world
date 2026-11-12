// Geometry detail (the triangle stress tier): the yard's static meshes, props included, drawn with 4, 16 or 64 times
// their triangles. Each step splits every triangle into four at its edge midpoints, so the shapes, normals and UVs stay
// what they were and only the triangle count grows. It answers "how many triangles can this device draw and hold the
// frame budget" before any high-detail art exists. Stevie is left alone (his fur shells share his geometry and have
// their own knob), and so are the rain and the splashes: the tiers measure the set and its props.
import * as THREE from "three/webgpu";

/** Splits every triangle into four at its edge midpoints. Shared edges share their midpoint, so no cracks open. */
export function subdivide(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  const vertexCount = position.count;
  const index = geometry.index;
  const corners = index ? index.count : vertexCount;
  const corner = (i: number) => (index ? index.getX(i) : i);

  // Every attribute as plain floats (meshopt quantisation stores normalised integers; getComponent denormalises).
  const names = Object.keys(geometry.attributes);
  const sources = names.map((name) => geometry.getAttribute(name));
  const midpoints = new Map<number, number>();
  const edges: [number, number][] = [];
  const triangles = new Uint32Array(corners * 4);
  const midpoint = (a: number, b: number) => {
    const key = a < b ? a * vertexCount + b : b * vertexCount + a;
    let at = midpoints.get(key);
    if (at === undefined) {
      at = vertexCount + edges.length;
      midpoints.set(key, at);
      edges.push([a, b]);
    }
    return at;
  };
  for (let t = 0; t < corners; t += 3) {
    const a = corner(t);
    const b = corner(t + 1);
    const c = corner(t + 2);
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    // Four triangles per source triangle, in order, so material groups keep their ranges (start and count times four).
    triangles.set([a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca], t * 4);
  }

  const out = new THREE.BufferGeometry();
  const total = vertexCount + edges.length;
  names.forEach((name, n) => {
    const src = sources[n]!;
    const size = src.itemSize;
    const data = new Float32Array(total * size);
    for (let v = 0; v < vertexCount; v++) for (let c = 0; c < size; c++) data[v * size + c] = src.getComponent(v, c);
    const unit = name === "normal" || name === "tangent";
    edges.forEach(([a, b], e) => {
      const at = (vertexCount + e) * size;
      for (let c = 0; c < size; c++) data[at + c] = (src.getComponent(a, c) + src.getComponent(b, c)) / 2;
      if (unit) {
        const length = Math.hypot(data[at]!, data[at + 1]!, data[at + 2]!) || 1;
        for (let c = 0; c < 3; c++) data[at + c] = data[at + c]! / length;
        if (name === "tangent" && size === 4) data[at + 3] = src.getComponent(a, 3);
      }
    });
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  });
  out.setIndex(new THREE.BufferAttribute(triangles, 1));
  for (const group of geometry.groups) out.addGroup(group.start * 4, group.count * 4, group.materialIndex);
  out.boundingBox = geometry.boundingBox?.clone() ?? null;
  out.boundingSphere = geometry.boundingSphere?.clone() ?? null;
  if (!out.boundingSphere) out.computeBoundingSphere();
  out.name = `${geometry.name}×4`;
  return out;
}

/** Holds each mesh's own geometry and swaps in a subdivided copy for the asked level; frees levels it no longer shows. */
export class GeometryDetail {
  private readonly originals = new Map<THREE.Mesh, THREE.BufferGeometry>();
  private readonly levels = new Map<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();
  private shown = 1;

  /** Static meshes under the roots: no skinned or morphing meshes, and none of the excluded objects. */
  constructor(roots: readonly THREE.Object3D[], exclude: readonly THREE.Object3D[] = []) {
    const skip = new Set(exclude);
    for (const root of roots)
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || skip.has(mesh)) return;
        if (Object.keys(mesh.geometry.morphAttributes).length || !mesh.geometry.getAttribute("position")) return;
        this.originals.set(mesh, mesh.geometry);
      });
  }

  get level(): number {
    return this.shown;
  }

  /** times: 1, 4, 16 or 64 (each a further four-way split). */
  set(times: number): void {
    const steps = Math.max(0, Math.round(Math.log(times) / Math.log(4)));
    for (const [mesh, base] of this.originals) mesh.geometry = steps === 0 ? base : this.at(base, steps);
    // Free every level not shown now: a phone cannot hold several copies of a 64× yard.
    for (const levels of this.levels.values())
      for (const [step, geometry] of levels)
        if (step !== steps) {
          geometry.dispose();
          levels.delete(step);
        }
    this.shown = 4 ** steps;
  }

  private at(base: THREE.BufferGeometry, steps: number): THREE.BufferGeometry {
    let levels = this.levels.get(base);
    if (!levels) this.levels.set(base, (levels = new Map()));
    const cached = levels.get(steps);
    if (cached) return cached;
    // Build up from the base each time (lower levels are freed once a higher one is shown).
    let geometry = base;
    for (let s = 1; s <= steps; s++) {
      const next = subdivide(geometry);
      if (geometry !== base) geometry.dispose();
      geometry = next;
    }
    levels.set(steps, geometry);
    return geometry;
  }
}

/** Triangles in the visible scene: each visible mesh's triangles times its instances (fur shells and rain included). */
export function sceneTriangles(scene: THREE.Object3D): number {
  let total = 0;
  scene.traverseVisible((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const corners = geometry.index ? geometry.index.count : (geometry.getAttribute("position")?.count ?? 0);
    const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    total += (corners / 3) * instances;
  });
  return Math.round(total);
}
