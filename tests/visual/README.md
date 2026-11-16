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

There is a known nondeterminism at Clockgrove `1e4b8b9` (#13). Repeated local runs agreed on 75 of
the 78 files and on every WebGPU file. In each run, one WebGL2 1536×864 capture differed by two
pixels: the anti-aliased left fringe of the "A" in "Arrival: scene ready…", at x=351, y=189–190,
just outside its paragraph. That is Chromium's text repaint inside Clockgrove's capture suite, not
a world input. Until Clockgrove fixes it and the pin moves, a file the two runs disagree on can't
be approved at a stable digest.

Moving `CLOCKGROVE_COMMIT`, or changing the art, the shell or the pack, can change a digest. Its
approval then stops matching, CI fails, and the file needs reviewing again.

## Composition review

Wave 4 §19, "Reference composition and art-direction tokens". A reviewer compares the approved
captures with [the reference image](../../docs/design/reference/raccoon-world-reference.png),
including the dusk/rain mood (`dusk-rain*`, `night-rain*`). Record the result here, under this
heading: the reviewer, the date, the captures' commit, what matches the reference, and each
departure from it with its follow-up.
