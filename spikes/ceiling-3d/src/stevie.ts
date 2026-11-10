// Stevie in the ceiling frame (issue 34): the #77 Meshy multi-image mesh (ship-meshy-fit.glb, CC BY 4.0, "3D model
// generated with Meshy (meshy.ai)") on the #77 quadruped rig with its idle and walk clips, both reused from the
// 3D look proof (spikes/look-3d/src/stevie.ts). The restyle for this frame: his own albedo graded to the mockup's
// palette with a fur sheen (materials.ts furBody), and shell fur, skinned copies pushed out along the normal that
// draw strands, so his silhouette is soft like the mockup's painted fur rather than a hard polygon edge.
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { fitRig } from "../../look-3d/src/fit.ts";
import { buildBones, clips, JOINTS, yardGeometry } from "../../look-3d/src/stevie.ts";
import { furBody, furShell } from "./materials.ts";

// biome-ignore lint/suspicious/noExplicitAny: three objects crossing the GLTF loader boundary.
type Any = any;
export type StevieClip = "idle" | "walk";

/** Shells and fur length: about 1.2 cm of fur over 8 shells. */
export const FUR = { shells: 8, length: 0.012 };

/** On-screen headings as yaw about z from east (as in the look proof). */
export const HEADING_YAW: Readonly<Record<string, number>> = {
  "three-quarter": -1.75,
  right: Math.PI / 4,
  back: (3 * Math.PI) / 4,
  left: (5 * Math.PI) / 4,
  front: (7 * Math.PI) / 4,
};

export interface Stevie {
  readonly root: THREE.Group;
  readonly metrics: Record<string, unknown>;
  pose(clip: StevieClip, heading: string, seconds: number): void;
}

export async function loadStevie(renderer: Any, url: string): Promise<Stevie> {
  const started = performance.now();
  const ktx2 = new KTX2Loader().setTranscoderPath("/decoders/basis/");
  await ktx2.detectSupportAsync(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const loaded = await loader.loadAsync(url);
  let source: Any;
  loaded.scene.traverse((node: Any) => {
    if (!source && node.isMesh) source = node;
  });
  if (!source) throw new Error("Stevie's glTF holds no mesh");
  const map = source.material.map;
  const geometry = yardGeometry(source);
  const rig = fitRig(geometry, JOINTS);
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(rig.skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(rig.skinWeight, 4));
  const at = (name: string) => rig.joints.find((j) => j.name === name)?.at ?? [0, 0, 0];
  const [hips, rootAt] = [at("hips"), at("root")];
  const animation = clips([hips[0] - rootAt[0], hips[1] - rootAt[1], hips[2] - rootAt[2]]);
  const bones = buildBones(rig.joints);
  const skeleton = new THREE.Skeleton(bones);
  const body = new THREE.SkinnedMesh(geometry, furBody(map));
  body.name = "stevie-body";
  body.castShadow = true;
  body.receiveShadow = true;
  body.add(bones[0]);
  body.updateMatrixWorld(true);
  body.bind(skeleton);
  body.frustumCulled = false;
  for (let layer = 1; layer <= FUR.shells; layer++) {
    const shell = new THREE.SkinnedMesh(geometry, furShell(map, layer, FUR.shells, FUR.length));
    shell.name = `stevie-fur-${layer}`;
    shell.bind(skeleton, body.bindMatrix);
    shell.frustumCulled = false;
    shell.receiveShadow = true;
    body.add(shell);
  }
  const root = new THREE.Group();
  root.name = "stevie";
  root.add(body);
  const mixer = new THREE.AnimationMixer(body);
  const actions = { idle: mixer.clipAction(animation.idle), walk: mixer.clipAction(animation.walk) };
  const triangles = (geometry.getIndex()?.count ?? geometry.getAttribute("position").count) / 3;
  return {
    root,
    metrics: {
      source: "references/stevie/77-3d/ship-meshy-fit.glb",
      triangles,
      furShells: FUR.shells,
      drawnTriangles: triangles * (FUR.shells + 1),
      joints: rig.joints.length,
      texture: map?.image ? `${map.image.width}×${map.image.height} KTX2` : "none",
      clips: [animation.idle, animation.walk].map((c) => ({ name: c.name, seconds: c.duration })),
      loadMs: Math.round(performance.now() - started),
    },
    pose(clip, heading, seconds) {
      for (const [name, action] of Object.entries(actions)) {
        if (name === clip) action.play();
        else action.stop();
      }
      mixer.setTime(seconds % animation[clip].duration);
      root.rotation.z = HEADING_YAW[heading] ?? 0;
    },
  };
}
