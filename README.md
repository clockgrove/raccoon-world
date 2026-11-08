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
- `references/stevie/`: Stevie's approved turnaround and the 3D spike's models;
- `spikes/stevie-3d/`: the 3D Stevie spike code from Clockgrove's renderer bake-off.

## License

Raccoon World is licensed under the [MIT License](LICENSE), including its generated art, as Clockgrove work. The exception is the 3D models made on Meshy's Free plan, which are CC BY 4.0 ([REUSE.toml](REUSE.toml), [references/stevie](references/stevie/README.md)). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
