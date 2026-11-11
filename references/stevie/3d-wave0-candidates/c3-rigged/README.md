# c3, re-rigged with the raccoon rig and the tuned walk

Kirk's pick (c3) with Assetforge's shared raccoon rig and generated gait (clockgrove/assetforge#84, tuning in clockgrove/assetforge#88), replacing Tripo's auto-rig and library walk. This is the Stevie for the quality lab (#45) until `assetforge pick` writes c3 through the 3D profile (#39).

- `c3-rigged.glb`: the same mesh and texture as `../c3/c3.glb`, re-rigged with the draft raccoon template (30 joints, ears included). It has one generated `walk` clip: 743 ms, looping, in place, with `speedMps` 0.268. A runtime moves the character at that speed so the feet stay planted. Standing height is 0.45 m, it faces +z, and it stands on y = 0.
- Gait: plantigrade, lateral-sequence walk, with a back arch of 22°, rump at 1.10, head pitched 28° down and the tail low (`raccoon-walk.json` in assetforge's `docs/examples/raccoon-rig/`).
- QA (every check passes): soles within 0.3 mm of the ground, slide at most 0.3 mm, heels flat; stance wrists and ankles within their limits; bent joints keep at least 92% of their thickness; the loop closes.
- `walk-vs-reference.png`: the walk beside Kirk's gait reference frames. `walk-side.png`: the walk from the side.
- `provenance.json`: the source model's provenance, plus the rig template's and gait's hashes. No provider call was made ($0).

The template and walk values are drafts. raccoon-world#39 sets Raccoon World's real ones.
