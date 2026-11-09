// The 2D arm: Stevie's owner-picked comparison strips as lit, normal-mapped quads in the product renderer.
// Depth: a depthNode in the fixture's pattern lets the derived dome push fragments towards the camera.
import type { Arm, ArmInstance, Figure, Heading } from "./arm.js";
import { JUNIPER_TINT, KIT_SCALE, STEVIE_HEIGHT } from "./arm.js";
import { CELL, IDLE_FRAMES, STRIPS, WALK_FRAMES, cutStrips } from "./sheet.js";

const DEPTH_SHIFT = 0.04;

export const arm2d: Arm = {
  name: "2d",
  label: "2D sprites (Stevie's comparison strips)",
  licence: "MIT",
  inputs: [STRIPS.idle.replace("/repo/", ""), STRIPS.walk.replace("/repo/", "")],
  async create(context): Promise<ArmInstance> {
    const { THREE, TSL } = context;
    const cut = await cutStrips();
    const { bounds } = cut;
    const opaqueHeight = bounds.feetRow + 1 - bounds.top;
    const unit = STEVIE_HEIGHT / opaqueHeight;

    // DataTexture row 0 is the bottom, the cut data is top row first.
    const flipped = (data: Uint8ClampedArray, mirrorX: boolean) => {
      const out = new Uint8Array(data.length);
      const rowBytes = cut.width * 4;
      for (let y = 0; y < cut.height; y++) {
        const from = (cut.height - 1 - y) * rowBytes;
        out.set(data.subarray(from, from + rowBytes), y * rowBytes);
        if (mirrorX) for (let x = 0; x < cut.width; x++) out[y * rowBytes + x * 4] = 255 - (out[y * rowBytes + x * 4] ?? 0);
      }
      return out;
    };
    const texture = (data: Uint8Array, srgb: boolean) => {
      const t = new THREE.DataTexture(data, cut.width, cut.height);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    const map = texture(flipped(cut.albedo, false), true);
    const normalMap = texture(flipped(cut.normal, false), false);
    // A mirrored quad samples the normals mirrored too, so their x is negated for the left heading.
    const normalMapMirrored = texture(flipped(cut.normal, true), false);
    const depthMap = texture(flipped(cut.depth, false), false);

    const root = new THREE.Group();
    const quadWidth = CELL * unit;
    const pool = [0, 1, 2].map(() => {
      const material = new THREE.MeshStandardNodeMaterial({ map, normalMap, alphaTest: 0.5, roughness: 0.9, metalness: 0 });
      material.depthNode = TSL.positionView.z
        .add(TSL.texture(depthMap).r.mul(DEPTH_SHIFT))
        .add(TSL.cameraNear)
        .div(TSL.cameraNear.sub(TSL.cameraFar));
      const geometry = new THREE.PlaneGeometry(quadWidth, quadWidth);
      const mesh = new THREE.Mesh(geometry, material);
      const anchor = new THREE.Group();
      anchor.add(mesh);
      root.add(anchor);
      return { anchor, mesh, material, geometry };
    });

    const stepMs = { ...cut.stepMs };
    return {
      root,
      show(figures: readonly Figure[]) {
        pool.forEach(({ anchor, mesh, material, geometry }, i) => {
          const figure = figures[i];
          anchor.visible = Boolean(figure);
          if (!figure) return;
          context.place(anchor, figure.at);
          const s = figure.role === "kit" ? KIT_SCALE : 1;
          anchor.scale.multiplyScalar(s);
          anchor.scale.z /= s;
          // Feet at the anchor, the union bounding box centred on it.
          mesh.position.set(
            (CELL / 2 - (bounds.left + bounds.right + 1) / 2) * unit,
            (bounds.feetRow + 1 - CELL / 2) * unit,
            0,
          );
          const count = figure.clip === "idle" ? IDLE_FRAMES : WALK_FRAMES;
          const frame = Math.min(count - 1, Math.floor(figure.phase * count));
          const row = figure.clip === "idle" ? 0 : 1;
          // The idle strip faces left, the walk strip right; the contract's three-quarter faces right.
          const drawnFacesLeft = figure.clip === "idle";
          const mirror = (figure.heading === "left") !== drawnFacesLeft;
          const u0 = (frame * CELL) / cut.width;
          const u1 = ((frame + 1) * CELL) / cut.width;
          // Atlas row 0 (top in the cut data) is the top of the texture, so v counts down from 1.
          const v1 = 1 - (row * CELL) / cut.height;
          const v0 = 1 - ((row + 1) * CELL) / cut.height;
          const uv = geometry.getAttribute("uv");
          // PlaneGeometry order: top-left, top-right, bottom-left, bottom-right.
          const [ul, ur] = mirror ? [u1, u0] : [u0, u1];
          uv.setXY(0, ul, v1);
          uv.setXY(1, ur, v1);
          uv.setXY(2, ul, v0);
          uv.setXY(3, ur, v0);
          uv.needsUpdate = true;
          const nextNormal = mirror ? normalMapMirrored : normalMap;
          if (material.normalMap !== nextNormal) {
            material.normalMap = nextNormal;
            material.needsUpdate = true;
          }
          const tint = figure.role === "juniper" ? JUNIPER_TINT : [1, 1, 1];
          material.color.setRGB(tint[0], tint[1], tint[2]);
        });
      },
      headingSource(heading: Heading) {
        // Stills use the idle clip, whose strip faces left.
        if (heading === "left") return { drawn: true, shown: "drawn (idle strip)" };
        if (heading === "three-quarter") return { drawn: false, shown: "mirror of the drawn front-left view (idle strip faces left)" };
        return { drawn: false, shown: "nearest drawn view: mirror of the idle strip's front-left view" };
      },
      stepMs,
      budget: {
        resolution: "192 px cells, 6 idle + 8 walk frames, 1 drawn direction per clip (idle front-left, walk front-right; the other mirrored)",
        textureBytes: cut.width * cut.height * 4 * 3,
        sourcePxPerUnit: opaqueHeight / STEVIE_HEIGHT,
      },
      notes: [
        "the idle strip faces front-left and the walk strip front-right, so one of the two clips is always mirrored at any heading (UVs flipped, normal map x negated); right, front and back show the three-quarter view",
        "interior holes in the strips' alpha (eyes, mask) are filled opaque with the surrounding colour so the face is solid under alphaTest 0.5",
        "normal map and depth are derived from the alpha silhouette and luminance (dome), not drawn; depthNode follows the fixture sprite (dome shifts fragments by 0.04)",
        "the strips are comparison-only candidates, not approved game art (references/stevie/comparison-candidates/README.md)",
        "QA failure, idle: identity-flicker between frames 3 and 4, the facial markings (patches around the eyes, spots on the snout) change shape",
        "QA failure, walk: footprint-drift at frames 5 and 7, footprints sit 30.5 px and 52 px from the same phase one stride earlier (the checker assumes two legs)",
        "Juniper is the sprite times the warm tint; the kit is the sprite at 0.6 scale",
      ],
      textures: [map, normalMap, normalMapMirrored, depthMap],
    };
  },
};
