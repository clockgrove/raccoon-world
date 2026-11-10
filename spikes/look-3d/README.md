# 3D look proof (issue 26)

This folder holds the page, content and scripts behind [the report](../../docs/design/3d-look-proof.md). The page draws Stevie and a yard corner as world content (renderer content v1) through Clockgrove's product renderer, at the commit this repository pins.

- `index.html`, `src/main.ts`: the composition root. It loads the pinned `ThreeWorldSceneAdapter` with one committed snapshot that has no projected entities. It also exposes `globalThis.look3d`, which changes only a copy of the visual inputs: view, clock, rain, tier, reduced motion and Stevie's pose.
- `src/content.ts`: the content instance, with one anchor for the whole slice.
- `src/look.ts`: the shared rules, used by Stevie and every prop:
  - the one camera mapping and the views;
  - the material;
  - the outline;
  - the storybook grade.
- `src/stevie.ts`, `src/fit.ts`: Stevie, the #77 Meshy mesh. The #77 quadruped rig is fitted to him at load, and he plays procedural idle and walk clips.
- `src/yard.ts`: the procedural yard corner.
- `scripts/serve.mjs`: the Vite configuration, composed over the pinned checkout's own config and dependencies.
  - `build` is a compile check.
  - `serve [--webgl2]` serves the page on 127.0.0.1.
- `scripts/look.mjs`:
  - `journey`: the SwiftShader check on both backends, for CI once a maintainer wires it in (report, Maintainer steps).
  - `capture`: the maintainer's report capture on a real GPU.

The page and scripts use the pinned checkout's Three, Vite and Playwright, so nothing is installed here. `CLOCKGROVE_DIR` names the checkout, as in `scripts/clockgrove.sh`. The type check uses `tsconfig.json`, which assumes the default `.clockgrove`:

```sh
.clockgrove/node_modules/.bin/tsc -p spikes/look-3d/tsconfig.json
```
