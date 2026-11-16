# Raccoon World's Wave 4 golden captures

This directory holds Raccoon World's captures of Clockgrove's Wave 4 golden states (§15.3), their
digests and the approvals of those digests (#13). Clockgrove's
[visual golden workflow](https://github.com/clockgrove/clockgrove/blob/main/tests/visual/README.md)
defines the states and the file layout. The captures run on the Clockgrove commit in
[`CLOCKGROVE_COMMIT`](../../CLOCKGROVE_COMMIT), with this world's pack (`worlds/raccoons`),
shell (`worlds/raccoons/shell.json`) and reviewed art (`assets/reviewed`).

## What is captured

Every state is captured on WebGPU (in this directory) and on forced WebGL2 (in `webgl2/`), at
1536×864, 1280×720 and 390×844, with reduced motion, on Chromium's software GPU (SwiftShader):

- `daylight-dry`: 12:00, no rain;
- `dusk-rain-low`, `-medium`, `-high`: 17:45 in rain, at each quality tier;
- `dusk-rain`: 19:00 in rain;
- `night-rain-low`, `-medium`, `-high`: 22:00 in rain, at each quality tier;
- `selected-actor-rail`: Stevie (`grove.stevie`) selected, with the entity rail open;
- `event-why-inspector`: Stevie's recorded Why;
- `selected-inspectable-object`: the den (`grove.den`), an object the world inspects without reacting;
- `disconnected-recovering`: the scene socket dropped and recovering;
- `text-access`: the shell without its renderer.

That makes 78 PNGs. `captures.json` and `webgl2/captures.json` hold each file's SHA-256.
`approval-status.json` gives each file's state against `approved-captures.json`: `approved`,
`pending-human-approval` or `changed-needs-human-approval`.

## Running it

```sh
bash scripts/qualify.sh capture             # into tests/visual
bash scripts/qualify.sh capture <directory> # anywhere else
```

The command needs the pinned checkout (`bash scripts/clockgrove.sh fetch`), its PostgreSQL 18.6
with pgvector 0.8.7, and the system packages its Chromium needs. Clockgrove's
`scripts/ci/toolchain.sh postgresql pgvector browser-deps` installs them on Ubuntu 26.04. The
command installs the pinned Playwright Chromium itself. Each run takes about five minutes. It
prints every file's approval state, then a count.

It fails when a file that has an approval no longer matches its approved digest. Files with no
approval yet don't fail it.

CI's `visual` job runs the same command on every pull request and push to main, and uploads the
result as the `raccoon-world-captures` artifact. A manual run of the CI workflow on main
(`workflow_dispatch`) repeats it.

## Review and approval

Neither the command nor CI approves anything. A person approves each file, or an agent does on the
owner's explicit delegation, recorded in the reviewed change. For this world that delegation is
Kirk's of 2026-11-16 on #13: an agent may approve the captures at their exact digests after
inspecting each one at its declared viewport and backend.

1. Run the CI capture twice on main and confirm that every digest agrees between the two runs.
2. Inspect each PNG at its viewport and backend.
3. Commit the CI captures with `approved-captures.json`, one entry per file:

   ```json
   {
     "approvals": [
       { "file": "daylight-dry@1536x864.png", "sha256": "sha256:<digest from approval-status.json>" },
       { "file": "webgl2/daylight-dry@1536x864.png", "sha256": "sha256:<digest>" }
     ]
   }
   ```

Captures are byte-identical on repeat. Clockgrove's capture renders text with grayscale
antialiasing (clockgrove/clockgrove#336), so the subpixel text fringe that flipped between runs at
Clockgrove `1e4b8b9` no longer occurs. A `visual` failure on a tree that changed nothing is a real
regression to report, not a re-run.

The journey step runs even when the capture step fails, so a flip never hides the journey's result.

Moving `CLOCKGROVE_COMMIT`, or changing the art, the shell or the pack, can change a digest. Its
approval then stops matching, CI fails, and the file needs reviewing again.

## Composition review

Wave 4 §19, "Reference composition and art-direction tokens". A reviewer compares the approved
captures with [the reference image](../../docs/design/reference/raccoon-world-reference.png),
including the dusk/rain mood (`dusk-rain*`, `night-rain*`). Record the result here, under this
heading: the reviewer, the date, the captures' commit, what matches the reference, and each
departure from it with its follow-up.

### Result, 2026-11-16

Reviewer: the Clockgrove owner agent session, on Kirk's delegation of 2026-11-16 (#13). Date: 2026-11-16. Captures: CI runs 43881218079 (main `3147efc`) and 43885457259 (main `3d1ceec`, which changes only `.github/workflows/factory.yml`), on Clockgrove `1e4b8b9`. All 78 digests agree between the two runs. The review compares the approved 1536×864 captures with [the reference](../../docs/design/reference/raccoon-world-reference.png) against Wave 4 §4.1 (composition) and §4.2 (art-direction tokens).

**Matches the reference**
- A top HUD of about 60 px spans the viewport. It has the wordmark (spaced small caps) and the world selector at the left, day, time and weather centred, and utility actions at the right.
- A persistent right rail takes about a fifth of the width.
- A compact event feed sits at the lower left.
- The selected entity is highlighted in the scene and labelled near its sprite (`selected-actor-rail`).
- The chrome matches the tokens: near-black charcoal with an olive undertone, brass hairline borders, sage accents and a readable sans.
- The scene is data-driven, and the reference image is never loaded.

**Departs from the reference**
1. **Art and camera.** The yard is a flat top-down green plane with small pixel-art sprites. The reference is an isometric, painterly storybook yard. *Follow-up:* the art and camera decisions come first (raccoon-world#98, and the visual decisions before art).
2. **The yard isn't the primary surface.** The canvas sits in the page flow at about 56% of the width, between the MCP and approvals links and the status text. The left column is empty apart from the feed. In the reference the yard fills about four-fifths of the width, and the feed floats over it. *Follow-up:* clockgrove/clockgrove#378.
3. **Dusk mood.** The `dusk-rain-*` states at 17:45 are lit like noon: 17:45 comes before this world's dusk phase, which starts at 18:00 (`worlds/raccoons/scenarios/boundary-walk.json`), and Clockgrove's fixture goldens show the same. `dusk-rain` at 19:00 then looks the same as night. No capture has the reference's warm windows and lanterns against a cool wet dusk. *Follow-up:* clockgrove/clockgrove#378.
4. **Names.** The title, world selector and labels show raw ids (`worldid_b0f7baeb3fc2ce46`, `grove.stevie`) where the reference shows the world's and the character's names. *Follow-up:* clockgrove/clockgrove#378.
5. **Stevie's disclosure.** The rail calls Stevie a "Deterministic/reactive object", while the reference treats him as the cognitive actor you talk to. *Follow-up:* clockgrove/clockgrove#354 part 2, which brings the pack's declared conversation mode.
6. **Raw state on the main view.** Debug text sits below the canvas (canonical revision and time, rain intensity, puddles). The reference shows only the HUD and the panels. *Follow-up:* clockgrove/clockgrove#378.
7. **The selection ring hides what it selects.** It's drawn over Stevie and over the den's mouth, where the reference rings the character at its feet. *Follow-up:* clockgrove/clockgrove#378.
8. **The phone Why panel is cut off.** At 390×844 the panel cuts its second resource cause mid-line. *Follow-up:* clockgrove/clockgrove#378.

**Determinism.** All 78 digests agree between the two CI runs, and each WebGL2 file shows everything its WebGPU twin shows.

### Re-approval, 2026-11-16 (#147)

The pin moved to Clockgrove `aa9c8c4` (#147). CI run 43908122491's `visual` job, attempts 1 and 2, agrees on all 78 digests. Each file was inspected at its viewport and backend, and pixel-diffed against the files approved above. Three changes:
- Text is antialiased in grayscale.
- One paragraph in `event-why-inspector` at 1536×864 wraps one word earlier.
- That state's first wall-clock mask is 1 px wider.

The 3D canvas, the event feed and the rail content are bit-identical, so every departure above still stands. Item 5 now needs the world's side: Clockgrove now projects a pack's declared `clockgrove.conversation-mode` (clockgrove/clockgrove#354), but this pack doesn't yet declare it for Stevie, so the rail still says "Deterministic/reactive object".
