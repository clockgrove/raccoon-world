# Raccoon World's 3D target profile (issue 39)

[`art/target-profile-3d.json`](../../art/target-profile-3d.json) is the target Assetforge builds Raccoon World's real-time 3D characters against. It follows the owner's decisions in [visual-decisions.md](../design/visual-decisions.md):

- characters are rigged models drawn by Clockgrove's live renderer;
- the yard is a 3D scene;
- the zoom runs from the whole yard down to a close-up where Stevie fills about a third of the screen height;
- raccoons use one shared rig and a generated gait;
- characters are built on Tripo's paid plan.

The field names are the shared contract with Assetforge (clockgrove/assetforge#72, #82 and #84; [Assetforge's characters-3d.md](https://github.com/clockgrove/assetforge/blob/main/docs/characters-3d.md)).

The 2D sprite profile, `art/target-profile.json`, is unchanged. It still describes the placeholder strips Clockgrove's pinned asset check accepts.

## What is where

| Field | What it holds |
| --- | --- |
| `model3d.budgets` | The **hand-off budget**: the largest model Assetforge may hand over. It is the desktop character tier. Assetforge's own QA (`budget-<key>`) filters candidates against it before the pick. |
| `model3d.tiers.<tier>.<kind>` | Per tier (`desktop`, `phone`) and per kind (`character`, `prop`): triangles, texture size, materials, bones and LODs. `status` says whether the tier was measured or is pending. |
| `model3d.lods` | Three levels of detail and their switch points. |
| `model3d.handoff` / `model3d.shipped` | The format-neutral hand-off, next to the format the game ships. |
| `model3d.rig`, `model3d.gaits.walk` | The shared raccoon skeleton template ([`art/rig/raccoon.json`](../../art/rig/raccoon.json)) and the generated walk. |
| `model3d.clipSets.raccoon` | The clip set every raccoon needs, and which clips are generated. |
| `model3d.groom` | The seasonal coats, their traits and which coat each season wears. |
| `layout`, `manifest` | Where a pick is written (`assets/models/<assetId>/`) and the manifest written beside it, carrying provenance. |
| `validator` | `node art/tools/model3d.mjs validate {{manifest}}`: Clockgrove's asset validation, then the profile's own checks (below). |

## Budgets per tier

Hand-off budget (`model3d.budgets`): **60,000 triangles, 2048 px textures, 4 materials, 80 bones and 3 LODs.**

| Tier | Kind | Triangles | Texture (max edge) | Materials | Bones | LODs | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Desktop (full look) | character | 60,000 | 2048 px | 4 | 80 | 3 | measured |
| Desktop (full look) | prop / set piece | 30,000 | 1024 px | 4 | 8 | 3 | measured |
| Phone (recent phones, lower tier) | character | 20,000 | 1024 px | 4 | 80 | 3 | **pending** |
| Phone (recent phones, lower tier) | prop / set piece | 10,000 | 512 px | 4 | 8 | 3 | **pending** |

- **Bones and materials are the same on both tiers.** Every raccoon shares one skeleton, so its clips work on every tier, and a material split would double draw calls on the tier that can least afford it.
- **A phone draws its characters from the LOD chain.** It does not use a separate model. The phone budgets are what LOD1 must fit. Stevie's chain (#113) is built, and the validator checks each level against the tier that draws it.
- **Phone numbers are provisional.** They wait on Kirk's device run (below).

### How the desktop numbers were measured

The numbers come from the quality lab ([quality-lab.md](../design/quality-lab.md); `spikes/quality-lab`; <https://clockgrove.github.io/raccoon-world/quality-lab/>). It runs on Clockgrove's pinned three.js renderer, the renderer of clockgrove/clockgrove#184, at the close-up zoom, with Stevie (c3, 59,847 triangles, 2048 px) walking at about a third of the frame height. Kirk's run of 2026-11-12 (raccoon-world#89) was on an RTX 2060 SUPER at 1080p, with Edge 157, native WebGPU and GPU timestamps. Medium takes 5.2 ms of GPU time:

- **Triangle budget:** from the base config, 64× geometry detail (6.4M scene triangles, 12M drawn per frame) holds 60 fps at 11.7 ms of GPU time; the estimate where it breaks is about 7.9M.
- **Geometry detail at Medium:** 16× geometry detail costs +1.7 ms of GPU time.
- **Resolution dominates:** a render scale of 2 (DPR 2) costs +11.3 ms. Each effect is small by comparison:
  - point-light shadows +1.0 ms (their cube maps draw the scene again: 0.56M → 1.7M triangles per frame);
  - light shafts +0.9 ms;
  - reflections +0.6 ms;
  - fur shells, splashes, haze, probes, cascades and bloom under 0.2 ms each;
  - Ultra at DPR 1, with every effect on, takes 13.2 ms of GPU time.
- **Shader compiles stall:** after a change, WebGPU on Windows draws nothing for seconds while it builds the new pipelines. The lab reports that wait as `stallMs`.

An earlier set of numbers from WebGL2 through WSL's D3D12 translation (point shadows +50 ms, shafts +24 ms) was an artefact of that layer and is not used.

**Desktop triangle budgets are therefore not GPU-bound at these counts.** A full cast is about ten raccoons at 60k triangles, plus about a hundred set pieces at 30k. That is about 3.6M triangles, inside the 6.4M that held 60 fps, and shadow passes draw it again. The desktop limits are set by the hand-off rather than by the GPU:

- **Triangles:** the 60k character budget is Tripo's `face_limit` (Assetforge sends the triangle budget with the call) and c3's measured size.
- **Texture sizes:** these are the decided ones (below).

The frame budget goes to resolution first, then effects; the lab measures both.

### Phone: pending

Kirk's phone run is **pending**: Sweep and Triangle budget on his iPhone, WebGPU with timestamps. Medium held 60 fps there on 2026-11-11, which is the only phone number so far.

- **Until that run,** the phone tier keeps a third of the desktop triangles and one mip level down on textures. LOD1 is 0.33 of LOD0.
- **The run replaces these numbers.** Save its JSON under `spikes/quality-lab/results/`, run `node spikes/quality-lab/scripts/report.mjs`, then set `model3d.tiers.phone`. Set `status` to `measured` only once the numbers come from the device.

## Levels of detail

The switch points are the character's on-screen height as a fraction of the screen height. That ties them to the decided zoom range rather than to a camera distance, which changes with the viewport.

| Level | Triangles (of LOD0) | Drawn while the character is at least |
| --- | --- | --- |
| LOD0 | 1.0 (60k) | 0.15 of the screen height (the close-up is about 0.33) |
| LOD1 | 0.33 (20k, the phone tier) | 0.05 |
| LOD2 | 0.10 (6k) | anything smaller (the whole-yard view) |

The hand-off may carry 1 to 3 levels (`budgets.lods`, counted as 1 plus `MSFT_lod` levels). Assetforge's wave 0 hands over LOD0 only. Like the KTX2 encode, Stevie's LOD1 and LOD2 were built by `assetforge lod` from the approved model (#113) and sit beside the main file as `.glb` files (`handoff.lods: "files"`). Assetforge's wave 0 pick still hands over LOD0 only; the scripted proof pick has no chain.

## Texture size and format: hand-off vs shipped

| | Hand-off (what Assetforge writes and the validator checks) | Shipped (what the game loads) |
| --- | --- | --- |
| Container | `.glb`, uncompressed | `.glb` with `EXT_meshopt_compression` |
| Textures | PNG or JPEG, embedded, within the pixel limit | KTX2, mipmapped: UASTC for normal maps, ETC1S for the rest |
| Size | 2048 px for the cast, 1024 px for set pieces | the same |

The shipped format is decided: source and compressed renders differ by a mean of 0.1–0.3 out of 255 (#79). It is a **target-side build step**: `spikes/stevie-3d/scripts/web-media.mjs` encodes whatever is handed over.

The hand-off stays format-neutral (kirk-45, 2026-11-12). The validator never requires KTX2 or meshopt, so wave 0's exit, "the target validator accepts it on the first try", holds for a plain Assetforge `.glb`.

## Rig, gait and clips

- **Template:** [`art/rig/raccoon.json`](../../art/rig/raccoon.json) has 30 joints:
  - pelvis, three spine joints, neck and head;
  - `ear_l` and `ear_r` on the head, which keep the ears from folding when the head pitches;
  - a five-joint tail;
  - four legs, each running upper, lower, ankle or wrist, then toe.

  It has four plantigrade feet: hind feet flat heel to toe, and front paws flat like hands in stance, with wrists limited to ±15° of yaw and roll. It is Assetforge's draft (`docs/examples/raccoon-rig/`), adopted as tuned on c3 in clockgrove/assetforge#88.
- **Walk** (`model3d.gaits.walk`, from the reference traits in `references/stevie/gait-reference/`):

  | Field | Value |
  | --- | --- |
  | footfall | lateral sequence |
  | `dutyFactor` | 0.68 |
  | `strideBodyLengths` | 0.26 |
  | `stepHeightBodyLengths` | 0.025 |
  | `backArchDeg` | 22 (hunched) |
  | `hipHeightRatio` | 1.10 (rump high) |
  | `headPitchDeg` | 28 (head low) |
  | `tailPitchDeg` | 18 (tail low) |
  | `tailSwayDeg` | 8 |
  | `speedBodyLengthsPerSecond` | 0.35 |
  | `swingCurlDeg` | fore 45, hind 10 |

  These are #88's starting values, unchanged:
  - The reference traits agree with them: plantigrade hind feet, hand-like flat front paws, a hunched rump high with the head low, and a low swaying tail.
  - QA agrees with them: applied to c3 through this profile, the walk passes foot contact, joint limits, skinning and loop QA, and its feet stay on one ground line.
  - A deeper hunch fails stance wrist-yaw QA at ±15°.
- **Clip set** (`model3d.clipSets.raccoon`): `idle`, `walk`, `sniff`, `eat`, `play` and `shelter`, the raccoon families.
  - **`walk`** is locomotion and is generated from the gait.
  - **`idle`** is generated from `model3d.motions.idle`: Assetforge's draft idle (assetforge#135, `docs/examples/raccoon-motions/profile-fragment.json` at the pinned commit), a 4 s breathing loop on the shared rig, unchanged. #82's hand-off needs an idle, and a shared-rig run makes no library call, so the profile declares it. Like every number here it is a draft for Kirk to tune.
  - **The other four** come from the provider's library only where nothing generated fits.

  At the pinned Assetforge, a shared-rig run makes no library call. Those four come back as `missingClips` and are never faked, and the validator flags each as `clip-missing:<family>`. Library clips on the shared rig are Assetforge work.

## Coats by season

`model3d.groom.seasons` is `["summer", "winter"]`: two grooms on the same model, UVs and rig, with no extra 3D generation (clockgrove/assetforge#82).

- **Summer:** from the summer photos (`references/gracie/`, `references/stevie/stevie-window-front.png`, `references/stevie/gait-reference/adult-fence-walk.png`). The coat lies flatter and the build looks leaner. The base colour is the approved turnaround's, so there is no tint texture.
- **Winter:** from `references/coats/winter-coat-frames.png` (#58):
  - long, silver-tipped guard hairs over a dense, pale under-layer;
  - cheek ruffs that flare out past the mask;
  - a thick tail with bold black and buff rings;
  - a rounder silhouette.

  Its lighter, frosted tip colour is the `output.textures.tint.winter` texture, its alpha weighting the tint toward the fur tips.

**Which coat when** (`model3d.groom.calendar`):

| Season | Months | Coat |
| --- | --- | --- |
| Spring | March to May | `summer` |
| Summer | June to August | `summer` |
| Autumn | September to November | `winter` |
| Winter | December to February | `winter` |

The pinned Clockgrove's pack format has no coat field yet (clockgrove/clockgrove#242 adds the renderer side). So the calendar lives in this profile, and the pack copies it to the field #242 names. `worlds/raccoons` is unchanged.

## Licences and provenance

- **The profile's licence is MIT, and `acceptedLicenses` is empty.** Only a commercial grant that allows relabelling ships: Tripo's paid plan, as decided. A free-plan grant such as Meshy's CC BY 4.0 is refused by Assetforge with exit 7 (`license_refused`) before anything is written.
- **Every manifest records the asset's provenance:**
  - provider (`tripo`), model and route;
  - provider terms;
  - the combined `outputGrant`;
  - the IPTC digital source type;
  - the reference hashes and the prompt.

  The full record goes beside the model as `<model>.provenance.json`.
- **Review is always written as `pending`.** Approval is human.
- **Nothing goes into `assets/` until a real, owner-approved run.** This change writes models only into throwaway copies.

## The profile's own checks

`node art/tools/model3d.mjs validate <manifest>` routes a manifest that declares side files (`model.groom`, `model.textures` or `model.eyes`) to this world's own checks (below). Otherwise it maps the manifest to Clockgrove's model manifest (`node art/tools/model3d.mjs map <manifest>` prints it) and runs the pinned `clockgrove-assets validate` on a throwaway world. The model target's limits are the desktop budget for the model's kind (`tiers.desktop.character`, which equals the flat hand-off `budgets`, or `tiers.desktop.prop`), and its `tiers` are every tier's budget for that kind. A manifest with level files (`model.levels`) is sent with them beside the `.glb`, as Clockgrove's `output.levels` (level 0 is the main file), and with `output.renditions` from `model.chain.tiers`, so Clockgrove checks each level against the tier that draws it (clockgrove/clockgrove#304). A tier with its own `model.tiers.<tier>.levels` files is left out of both, because Clockgrove's contract has no per-tier files, and this world checks it instead. The kind is `--kind character|prop`, else the manifest's `kind` (`character-3d` or `prop-3d`), else character. It needs the checkout from `bash scripts/clockgrove.sh fetch` and exits 2 without it. It exits 0 when it accepts the model and 1 when it refuses it.

- **Refused by Clockgrove:** printed as `refused <code>: <line>` with Clockgrove's own codes, for example `MODEL_BUDGET_EXCEEDED`, `MODEL_HASH_MISMATCH` (a level file) or `ASSET_MANIFEST_INVALID`. It then stops. A `MODEL_BUDGET_EXCEEDED` on a tier whose `status` is not `measured` (the phone, pending) is not a refusal: it comes back as that tier's `tier:<tier>:<key>` flag, naming the level. The platform does the container, measures, budgets, content hash, bounds shape, provenance and grant checks, so the world codes that did those (`over-budget:*`, `format:container`, `format:units`, `manifest:content-hash`, `manifest:mismatch:*`, `manifest:source`, `manifest:provenance:<model|provider|route|outputGrant>`, `grant:relabel`, `grant:non-commercial`, `clip:mismatch`) are gone.
- **Refused by this world** (after Clockgrove accepts):
  - `format:texture-media-type`: a texture that is not PNG or JPEG;
  - `manifest:bounds`: not standing on y=0, or not 0.05 to 5 m tall;
  - `manifest:provenance:digitalSourceType`;
  - `grant:license`: not the profile's licence or an accepted one;
  - `rig:template` or `rig:joints`: not the declared template, or not its joints in order;
  - `clip:not-generated:<family>`: locomotion that is not the generated gait;
  - `manifest:levels`: a level file or side map of a tier's chain that is missing, unreadable, has a different sha256, is not a one-level GLB, or has a different triangle count than the manifest declares, or a level `model.chain.tiers` says a tier draws that the tier's own `model.tiers.<tier>.levels` files leave out.
- **Flagged** (accepted and reported):
  - `tier:<tier>:<key>`: a level the tier draws is over that tier's budget. The detail names the level and its file. A manifest with no chain is checked as its main file against each tier;
  - `clip-missing:<family>`: a required clip that is not there yet.

Stevie's chain (#113) is checked level by level. A tier draws its own `model.tiers.<tier>.levels` files when it has them (and they must cover every level `model.chain.tiers` lists for it), else the levels `model.chain.tiers` lists for it (0 is the main file). Each level's triangles, materials, bones and texture size (its embedded textures or the side maps the tier draws, whichever is larger) and the number of levels drawn are compared with that tier's budget. Stevie's phone levels and maps fit the phone budget, so it carries no `tier:phone` flag. `model3d.handoff.lods` is `"embedded"` or `"files"`.

The hand-off declares `clipFields` and `sideImages: "embedded"` as Assetforge's characters-3d.md describes. Clockgrove refuses side images until clockgrove/clockgrove#305.

**Side files.** Clockgrove refuses maps beside the `.glb` until clockgrove/clockgrove#305. A manifest that declares them, today only Stevie's committed look-dev model (#107), keeps this world's own checks in `art/tools/model3d-sidefiles.mjs`, with their codes: the container, measures, budgets, content hash, source, bounds, provenance, grant, rig and clips, as before #82. The output says `platform: not run` for it. When #305 lands, that module goes and the model moves to Clockgrove's validator.

`node art/tools/model3d.mjs profile` checks the profile's own shape:
- the tiers;
- the hand-off budget equal to the desktop character tier;
- the LOD chain and `handoff.lods`;
- the clip set covering the gaits;
- seasons and a calendar that covers every month.

Clockgrove-side validation of 3D models is clockgrove/clockgrove#281 (now run by the validator above), and #82 proves it end to end (below). Stevie's committed look-dev model (#107) keeps its side-file maps, which #81's fur reads, and this world's own checks (above), and moves to Clockgrove's validator when clockgrove/clockgrove#305 accepts side images.

## The offline proof

`bash scripts/assetforge.sh check` (check 8, `model3d`) runs the pinned Assetforge and Clockgrove on a throwaway copy of this repository. It makes no paid call and needs no key:

1. `stage` runs Stevie's spec (`art/stevie/character-3d/spec.json`) against the bible and this profile as committed. The run uses the scripted provider `art/proof/model3d-provider.mjs`, which hands Assetforge c3's mesh in place of a Tripo call, and `art/proof/model3d-routes.json`.
   - Assetforge fits the raccoon template and generates the idle and the walk.
   - The candidate passes every QA check.
   - Assetforge's own scripted quadruped is not raccoon-shaped, and the raccoon template's joint-limit QA refuses it, so the proof uses a real raccoon body.
2. `pick` writes the rigged `.glb`, its manifest and its provenance through the profile, with Clockgrove's clip fields and no side images. The profile's validator accepts it on the first try, Clockgrove's `clockgrove-assets validate` at the pinned commit included. It flags the phone tier (the scripted pick has no chain) and the four clips still missing.
3. Clockgrove refuses the same model with `MODEL_BUDGET_EXCEEDED` under a lower hand-off triangle budget, and again when it is checked against the desktop prop budget.
4. The handed-off model renders through the pinned renderer's world-content seam (clockgrove/clockgrove#112): `art/tools/model3d-render.mjs` loads it through `context.loaders` on Clockgrove's fixture renderer page, plays its idle under a software GPU, and checks that it is skinned with the manifest's bones and that the picture changes when the model is hidden and when the idle moves.
5. A free-plan CC BY grant is refused with exit 7, and nothing is written.
6. Stevie's committed manifest is accepted with no `tier:` flag. A phone triangle budget of 15,000 flags `tier:phone:triangles` naming level 1, a wrong sha256 on a phone level is refused with `manifest:levels`, and so is a phone level `model.chain.tiers` lists with no phone file.
7. The scripted pick given a level file and `model.chain.tiers` goes to Clockgrove with them: Clockgrove accepts it and its phone level 1 comes back as `tier:phone:triangles`, and a wrong sha256 on the level file is refused by Clockgrove with `MODEL_HASH_MISMATCH`.

Nothing the proof writes is committed.
