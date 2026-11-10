// The generated props (issue 34): Meshy and Tripo text-to-3D GLBs (references/ceiling-3d/props, CC BY 4.0), each
// fitted into its slot in the set: turned z-up, scaled to the slot's size, set on the ground, made wet like the rest.
// A prop whose GLB is missing (or is an un-fetched Git LFS pointer) keeps its procedural stand-in.
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Slot } from "./set.ts";

// biome-ignore lint/suspicious/noExplicitAny: three objects crossing the GLTF loader boundary.
type Any = any;

export interface PropReport {
  readonly name: string;
  readonly source: "generated" | "stand-in";
  readonly triangles: number;
}

export async function loadProps(slots: Record<string, Slot>, parent: THREE.Object3D): Promise<PropReport[]> {
  const loader = new GLTFLoader();
  const reports = await Promise.all(
    Object.entries(slots).map(async ([name, slot]): Promise<PropReport> => {
      let gltf: Any;
      try {
        gltf = await loader.loadAsync(`/media/props/${name}.glb`);
      } catch {
        return { name, source: "stand-in", triangles: 0 };
      }
      const model: THREE.Object3D = gltf.scene;
      // glTF is y-up; the yard is z-up.
      model.rotation.x = Math.PI / 2;
      const tilted = new THREE.Group();
      tilted.add(model);
      tilted.rotation.y = slot.tilt ?? 0;
      const holder = new THREE.Group();
      holder.name = `prop-${name}`;
      holder.add(tilted);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder);
      const size = box.getSize(new THREE.Vector3());
      const scale = slot.size / Math.max(1e-6, slot.by === "height" ? size.z : Math.max(size.x, size.y));
      const centre = box.getCenter(new THREE.Vector3());
      const fit = new THREE.Group();
      fit.add(holder);
      holder.position.set(-centre.x * scale, -centre.y * scale, -box.min.z * scale);
      holder.scale.setScalar(scale);
      fit.position.copy(slot.at);
      fit.rotation.z = slot.yaw;
      let triangles = 0;
      fit.traverse((node: Any) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        const geometry = node.geometry;
        triangles += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const m of materials) {
          // Rain: generated textures come dry; wet them like every other surface.
          if ("roughness" in m) m.roughness = Math.min(1, (m.roughness ?? 1) * 0.6);
          if (m.roughnessMap) m.roughness = 0.6;
          m.envMapIntensity = 0.6;
        }
      });
      slot.stand.visible = false;
      parent.add(fit);
      return { name, source: "generated", triangles: Math.round(triangles) };
    }),
  );
  return reports;
}
