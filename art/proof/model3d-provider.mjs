// The 3D offline proof's scripted model provider (Assetforge `--provider-script`, issue 39). It never
// calls a model, and nothing it makes is committed: the proof writes into a throwaway copy of the
// repository.
//
// - model: answers every image-to-3D call with Stevie's wave 0 pick, c3
//   (references/stevie/3d-wave0-candidates/c3/c3.glb, Kirk's pick of 2026-11-10). It is already
//   normalised to face +z, so the proof's routes set the model route's `forward` to +z. Assetforge's
//   own scripted quadruped (test/fixtures/model3d-quadruped-script.ts) is not raccoon-shaped, and the
//   raccoon template's joint-limit QA refuses it, so the proof hands Assetforge a real raccoon body.
// - decide: an identity score in the middle of the rubric, recorded in shadow mode.
// - rig and animate: never called, because the profile declares the shared rig and generated gaits.
import { readFileSync } from "node:fs";

const C3 = new URL("../../references/stevie/3d-wave0-candidates/c3/c3.glb", import.meta.url);

export default {
  image() {
    throw new Error("the 3D proof makes no images");
  },
  vision() {
    throw new Error("the 3D proof answers no vision calls");
  },
  decide() {
    return { answer: { type: "score", score: 3.6 }, confidence: 0.7, costUsd: 0.00002 };
  },
  model(request, index) {
    return {
      handle: `proof-model-${index}`,
      glb: new Uint8Array(readFileSync(C3)),
      costUsd: 0.3,
      ...(request.seed !== undefined && { seed: request.seed }),
    };
  },
  rig() {
    throw new Error("a shared-rig target makes no rig call");
  },
  animate() {
    throw new Error("a shared-rig target makes no clip call");
  },
};
