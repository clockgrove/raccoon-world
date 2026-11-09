# Raccoon World

Raccoon World is the first world built on [Clockgrove](https://github.com/clockgrove/clockgrove), the platform for persistent, living worlds. It's a quiet Pacific Northwest garden at dusk, where a household of raccoons (Stevie, Juniper and the kits) live their routines, react to rain and night, and learn. You can observe them, talk to Stevie, and trace why anything happened.

This repository holds everything specific to Raccoon World:
- the world pack: actors, archetypes, rules, scenarios and goldens;
- its art and the style bible it's made under;
- its interface theme;
- its deployment.

The engine, runtime and tools live in Clockgrove. Assets are generated with [Assetforge](https://github.com/clockgrove/assetforge) and reviewed by people.

## Status

Pre-1.0. The world's content was copied here from [clockgrove/clockgrove at 86d706858f5710c7c5221212a94e26cc595cfc7f](https://github.com/clockgrove/clockgrove/tree/86d706858f5710c7c5221212a94e26cc595cfc7f) (raccoon-world#1), keeping the same paths, so that commit is the history for every file that came from there. It was a plain copy, not a history rewrite: Clockgrove stores its PNGs in Git, this repository stores them in Git LFS, and a rewrite would have mixed the two. Clockgrove deletes its copies once its own tests run on its neutral fixture world.

What's here:
- `worlds/raccoons`: the world pack (actors, archetypes, rules, scenarios, goldens, long runs, the placeholder-art generator);
- `assets/`: the world's art, manifests, review sheet, golden scene and licence report;
- `docs/design/`: the UI description and the reference images (the mockup and Jimothy's sheet);
- `docs/adr/`: the draft decision record on how the world draws its characters (3D, 2D or 3D rendered to sprites);
- `art/`: the style bible, the Assetforge target profile and the inputs for Stevie's six animation families, with the offline art proof ([art/README.md](art/README.md));
- `reference/asset-style.json`: the world's painterly style profile as Clockgrove reads it;
- `docs/art/author-guide.md`: how art is made, from these inputs to the live yard;
- `references/stevie/`: Stevie's approved turnaround and the 3D spike's models;
- `spikes/stevie-3d/`: the 3D Stevie spike code from Clockgrove's renderer bake-off.

## Checking the pack against Clockgrove

Raccoon World uses Clockgrove from a source checkout at one pinned commit, with no npm packages. The commit is in [`CLOCKGROVE_COMMIT`](CLOCKGROVE_COMMIT), and nowhere else. CI's required `ci` check, Factory's validation and a local run all use [`scripts/clockgrove.sh`](scripts/clockgrove.sh), which runs Clockgrove's [external world-pack check](https://github.com/clockgrove/clockgrove/blob/main/packages/simulator/docs/conformance.md#external-worlds-from-a-pinned-checkout) on `worlds/raccoons` with the manifests in `assets/manifests`.

Run it locally with the Node.js version the pinned commit names in its `package.json` `engines` and Corepack:

```sh
bash scripts/clockgrove.sh check
```

The first run clones the pinned commit into `.clockgrove/` in this repository, which Git ignores (set `CLOCKGROVE_DIR` to use another directory), and installs its locked dependencies with lifecycle scripts off. Later runs reuse that checkout. It sits in the repository, not your home directory, so it also works in sandboxes that may write only the clone, like Factory's local mode. pnpm is the version Clockgrove pins in `packageManager`, through Corepack; where Corepack can't fetch it, the script uses the pnpm on your `PATH` and says so. A golden mismatch writes `<scenario>.actual.json` beside the golden for review; Git ignores it.

To move the pin:

1. Put the new full Clockgrove commit in `CLOCKGROVE_COMMIT`.
2. If that commit pins a different Node.js, update `node-version` in `.github/workflows/ci.yml` and `FACTORY_NODE_VERSION` in `.github/workflows/factory.yml` to match. The script stops with a message when they differ.
3. Run `bash scripts/clockgrove.sh check`. If a golden differs, review its `.actual.json` and replace the golden only when the new behaviour is intended.
4. Open a PR; its `ci` check proves the pack against the new commit. Only a maintainer's PR moves the pin: `CLOCKGROVE_COMMIT` is a Factory protected path, so a Factory worker can't change it.

## Making art with Assetforge

Art is generated with Assetforge from a source checkout at the commit in [`ASSETFORGE_COMMIT`](ASSETFORGE_COMMIT), never from npm. [`scripts/assetforge.sh`](scripts/assetforge.sh) fetches it into `.assetforge-src/` (ignored) and runs it. Check the art direction, the target profile against Clockgrove's validator, each family's run forecast and the offline end-to-end proof, with no key and no spend:

```sh
bash scripts/clockgrove.sh fetch
bash scripts/assetforge.sh check
```

The whole path, from the inputs to the live yard, is in [docs/art/author-guide.md](docs/art/author-guide.md).

## License

Raccoon World is licensed under the [MIT License](LICENSE), including its generated art, as Clockgrove work. The exception is the 3D models made on Meshy's Free plan, which are CC BY 4.0 ([REUSE.toml](REUSE.toml), [references/stevie](references/stevie/README.md)). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
