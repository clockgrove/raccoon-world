// "3D rendered to sprites": the 3D arm's model and clips baked to 192 px cells (albedo, view-space normal, depth)
// and drawn as camera-facing quads that are lit by the scene with the baked normals and depth.
import { THREE, TSL } from "clockgrove-pin/apps/web/src/renderer-content.js";
import type { Arm, ArmInstance, Figure } from "./arm.js";
import { bake, BAKE_CELL, COLUMNS, frameColumn, headingRow, IDLE_FRAMES, WALK_FRAMES } from "./bake.js";
import { HEADINGS, KIT_SCALE } from "./arm.js";
import { MESHY_CREDIT, MESHY_FIT, MESHY_FIT_URL, modelNotes } from "./arm3d.js";
import { loadModel, tintOf } from "./model.js";

export const armSprites: Arm = {
  name: "3d-sprites",
  label: "3D rendered to sprites (meshy-fit)",
  licence: "CC-BY-4.0",
  credit: MESHY_CREDIT,
  inputs: [MESHY_FIT_URL.replace("/repo/", "")],
  async create(context): Promise<ArmInstance> {
    const model = await loadModel(context, MESHY_FIT);
    const baked = await bake(model);
    const root = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(baked.cellUnits, baked.cellUnits);
    geometry.translate(0, baked.centreY, 0);
    const cellScale = TSL.vec2(1 / COLUMNS, 1 / HEADINGS.length);
    const pool = [0, 1, 2].map(() => {
      const offset = TSL.uniform(new THREE.Vector2());
      const tint = TSL.uniform(new THREE.Color(1, 1, 1));
      const uv = TSL.uv().mul(cellScale).add(offset);
      const albedo = TSL.texture(baked.albedo, uv);
      const normal = TSL.texture(baked.normal, uv);
      const depth = TSL.texture(baked.depth, uv);
      const material = new THREE.MeshStandardNodeMaterial({ alphaTest: 0.5, roughness: 0.9, metalness: 0 });
      material.colorNode = TSL.vec4(albedo.rgb.mul(tint), albedo.a);
      material.normalNode = TSL.normalize(normal.rgb.mul(2).sub(1));
      // View depth in the 3D arm's own scale: the placement's z (0.01) is undone by the 1250 group, so one content unit is 12.5 deep.
      material.depthNode = TSL.positionView.z
        .add(depth.r.sub(0.5).mul(2 * baked.depthHalf * 12.5))
        .add(TSL.cameraNear)
        .div(TSL.cameraNear.sub(TSL.cameraFar));
      const anchor = new THREE.Group();
      const deep = new THREE.Group();
      deep.scale.set(1, 1, 1250);
      deep.add(new THREE.Mesh(geometry, material));
      anchor.add(deep);
      root.add(anchor);
      return { anchor, offset, tint };
    });
    const bytes = 3 * baked.width * baked.height * 4;
    return {
      root,
      show(figures: readonly Figure[]) {
        pool.forEach(({ anchor, offset, tint }, i) => {
          const figure = figures[i];
          anchor.visible = Boolean(figure);
          if (!figure) return;
          context.place(anchor, figure.at);
          const s = figure.role === "kit" ? KIT_SCALE : 1;
          anchor.scale.multiplyScalar(s);
          anchor.scale.z /= s;
          offset.value.set(frameColumn(figure.clip, figure.phase) / COLUMNS, headingRow(figure.heading) / HEADINGS.length);
          const [r, g, b] = tintOf(figure);
          tint.value.setRGB(r, g, b);
        });
      },
      headingSource: () => ({ drawn: true, shown: "drawn (baked)" }),
      stepMs: { ...model.stepMs, ...baked.stepMs },
      budget: {
        resolution: `${BAKE_CELL} px cells, ${HEADINGS.length} headings x (${WALK_FRAMES} walk + ${IDLE_FRAMES} idle) frames, 3 maps (albedo, normal, depth)`,
        textureBytes: bytes,
        sourcePxPerUnit: BAKE_CELL / baked.cellUnits,
      },
      notes: [
        `baked once with one offscreen WebGPURenderer (released afterwards): orthographic, tilted and yawed as the 3D arm; cell covers ${baked.cellUnits.toFixed(2)} units, so ${(BAKE_CELL / baked.cellUnits).toFixed(0)} px per unit`,
        "material: MeshStandardNodeMaterial, albedo map sRGB, baked view-space normals as the normal, baked depth as the depth, alpha test 0.5, roughness 0.9; albedo edges dilated 2 px",
        "the clips are the spike's stand-in idle and walk on the fitted rig, sampled at 8 walk and 4 idle phases",
        ...modelNotes(model),
      ],
      textures: [baked.albedo, baked.normal, baked.depth],
    };
  },
};
