// The other #77 routes as close stills in the same row as the chosen route: each model drawn as shipped, with
// its own rig held at its first pose (provider rigs) or the spike's stand-in rig at idle (fitted).
import type { Arm } from "./arm.js";
import { loadModel, type ModelSpec } from "./model.js";
import { MESHY_CREDIT, MESHY_FIT, modelInstance, modelNotes, textureBytes } from "./arm3d.js";

const DIR = "/repo/references/stevie/77-3d/";

function route(
  name: string,
  label: string,
  spec: ModelSpec,
  licence: Arm["licence"],
  credit: string | undefined,
  how: string,
): Arm {
  return {
    name: `route:${name}`,
    label,
    licence,
    ...(credit ? { credit } : {}),
    inputs: [spec.url.replace("/repo/", "")],
    async create(context) {
      const model = await loadModel(context, spec);
      const base = model.metrics.textures[0];
      return modelInstance(
        context,
        model,
        [how, "material: MeshStandardNodeMaterial with the model's base-colour map, roughness 0.9, lit; no outline", ...modelNotes(model)],
        {
          budget: {
            resolution: base ? `${base.width}x${base.height} base colour, ${base.format}` : "no texture",
            textureBytes: textureBytes(model),
            sourcePxPerUnit: 0,
          },
        },
        spec.rig === "fit",
      );
    },
  };
}

export const routeArms: Arm[] = [
  route("meshy-rig", "Meshy mesh, Meshy's own rig (22K triangles)", { url: `${DIR}ship-meshy.glb`, rig: "provider" }, "CC-BY-4.0", MESHY_CREDIT,
    "Meshy's auto-rig as shipped, held at its first pose"),
  route("tripo", "Tripo mesh, Tripo's quadruped rig", { url: `${DIR}ship-tripo.glb`, rig: "provider", yaw: -Math.PI / 2 }, "MIT", undefined,
    "Tripo's quadruped rig as shipped, in its bind pose"),
  route("fal", "fal TRELLIS.2 mesh, stand-in rig fitted", { url: `${DIR}ship-fal.glb`, rig: "fit" }, "MIT", undefined,
    "the spike's stand-in skeleton fitted to the mesh, shown in its idle pose"),
  route("meshy-fit", "Meshy mesh, stand-in rig fitted (chosen)", MESHY_FIT, "CC-BY-4.0", MESHY_CREDIT,
    "the spike's stand-in skeleton fitted to the mesh, shown in its idle pose"),
];
