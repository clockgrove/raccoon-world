// A control arm: a plain lit capsule of Stevie's height. Used to check the page and runner, never in the report.
import type { Arm, ArmInstance, Figure } from "./arm.js";
import { JUNIPER_TINT, KIT_SCALE, STEVIE_HEIGHT } from "./arm.js";

export const stubArm: Arm = {
  name: "stub",
  label: "Control capsule",
  licence: "MIT",
  inputs: [],
  async create(context): Promise<ArmInstance> {
    const { THREE } = context;
    const root = new THREE.Group();
    const geometry = new THREE.CylinderGeometry(0.35, 0.35, STEVIE_HEIGHT, 16);
    geometry.translate(0, STEVIE_HEIGHT / 2, 0);
    const pool: { anchor: InstanceType<typeof THREE.Group>; material: InstanceType<typeof THREE.MeshStandardNodeMaterial> }[] = [];
    for (let i = 0; i < 3; i++) {
      const material = new THREE.MeshStandardNodeMaterial({ color: 0x9a8f80, roughness: 0.9 });
      const anchor = new THREE.Group();
      const depth = new THREE.Group();
      depth.scale.set(1, 1, 1250);
      depth.add(new THREE.Mesh(geometry, material));
      anchor.add(depth);
      root.add(anchor);
      pool.push({ anchor, material });
    }
    return {
      root,
      show(figures: readonly Figure[]) {
        pool.forEach(({ anchor, material }, i) => {
          const figure = figures[i];
          anchor.visible = Boolean(figure);
          if (!figure) return;
          context.place(anchor, figure.at);
          const s = figure.role === "kit" ? KIT_SCALE : 1;
          anchor.scale.multiplyScalar(s);
          anchor.scale.z /= s;
          const tint = figure.role === "juniper" ? JUNIPER_TINT : [1, 1, 1];
          material.color.setRGB((0x9a / 255) * tint[0], (0x8f / 255) * tint[1], (0x80 / 255) * tint[2]);
        });
      },
      headingSource: () => ({ drawn: true, shown: "drawn" }),
      stepMs: {},
      budget: { resolution: "none (untextured)", textureBytes: 0, sourcePxPerUnit: 0 },
      notes: ["control: an untextured lit capsule"],
    };
  },
};
