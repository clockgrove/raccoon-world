// The real-time 3D arm: Meshy's mesh (reduced, KTX2/meshopt) with the spike's stand-in skeleton fitted to it,
// drawn as lit skinned meshes in the product renderer's scene.
import { THREE } from "clockgrove-pin/apps/web/src/renderer-content.js";
import type { Arm, ArmInstance, Figure } from "./arm.js";
import { STEVIE_HEIGHT } from "./arm.js";
import { figureFrame, loadModel, type Model, type ModelSpec, placeFigure, tintOf } from "./model.js";

export const MESHY_FIT_URL = "/repo/references/stevie/77-3d/ship-meshy-fit.glb";
export const MESHY_FIT: ModelSpec = { url: MESHY_FIT_URL, rig: "fit" };
export const MESHY_CREDIT = "3D model generated with Meshy (meshy.ai)";

const BYTES = (n: number) => `${(n / 1_048_576).toFixed(1)} MiB`;

export function textureBytes(model: Model): number {
  return model.metrics.textures.reduce((sum, t) => sum + t.bytes, 0);
}
export function modelNotes(model: Model): string[] {
  const m = model.metrics;
  return [
    `${m.triangles} triangles, ${m.vertices} vertices, ${m.joints} joints; textures ${m.textures.map((t) => `${t.name} ${t.width}x${t.height} ${t.format}`).join(", ") || "none"}`,
    `rig: ${m.rigNotes}`,
    `clips: ${m.clips.map((c) => `${c.name} ${c.seconds}s/${c.tracks} tracks`).join(", ")}`,
  ];
}

/** The three-figure pool every skinned-model arm draws with: one instance, frame and material set per slot. */
export async function modelInstance(
  context: Parameters<Arm["create"]>[0],
  model: Model,
  notes: readonly string[],
  extra: Partial<ArmInstance> & Pick<ArmInstance, "budget">,
  animate: boolean,
): Promise<ArmInstance> {
  const root = new THREE.Group();
  const pool = [0, 1, 2].map(() => {
    const frame = figureFrame();
    const instance = model.instantiate();
    frame.yaw.add(instance.object);
    root.add(frame.anchor);
    return { frame, instance };
  });
  return {
    root,
    show(figures: readonly Figure[]) {
      pool.forEach(({ frame, instance }, i) => {
        const figure = figures[i];
        frame.anchor.visible = Boolean(figure);
        if (!figure) return;
        placeFigure(context, frame, figure);
        if (animate) instance.pose(figure.clip, figure.phase);
        instance.tint(tintOf(figure));
      });
    },
    headingSource: () => ({ drawn: true, shown: "drawn" }),
    stepMs: model.stepMs,
    notes,
    ...extra,
  };
}

export const arm3d: Arm = {
  name: "3d",
  label: "Real-time 3D (meshy-fit)",
  licence: "CC-BY-4.0",
  credit: MESHY_CREDIT,
  inputs: [MESHY_FIT_URL.replace("/repo/", "")],
  async create(context) {
    const model = await loadModel(context, MESHY_FIT);
    const bytes = textureBytes(model);
    const base = model.metrics.textures[0];
    const texels = model.texelsPerUnit || (base ? base.height / STEVIE_HEIGHT : 0);
    return modelInstance(
      context,
      model,
      [
        "material: MeshStandardNodeMaterial with the model's base-colour map, roughness 0.9, metalness 0, lit by the scene's lights and fog; no outline",
        ...modelNotes(model),
        "the idle and walk clips are the spike's stand-in clips on the fitted skeleton, not Meshy's",
        `texture memory ${BYTES(bytes)} as transcoded by this browser; texels per unit estimated from the mesh's UV area against its surface area`,
      ],
      {
        budget: {
          resolution: base
            ? `${base.width}x${base.height} base colour, ${base.format}, one 10K-triangle mesh`
            : "no texture",
          textureBytes: bytes,
          sourcePxPerUnit: texels,
        },
      },
      true,
    );
  },
};
