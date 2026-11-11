# Gracie: references

Kirk's photos of Gracie, one of the raccoons who visit his porch. This is the source for her identity lock and her 3D model. Photos and frames only, never video clips, per Kirk's rule for his footage.

- `gracie-sleeping.png` (Kirk, 2026-11-10): Gracie asleep on the porch rug, on her side, in a three-quarter view from above, behind the screen door.
- `gracie-lounging.png` (Kirk, 2026-11-10): Gracie sprawled on a patio cushion, looking back over her shoulder, behind the screen. It shows her long, pale grey lower-body and leg fur clearly.
- `gracie-and-stevie.png` (Kirk, 2026-11-10; IDs as Kirk thinks they are): Gracie at the back, in three-quarter view looking at the camera, and Stevie at the front by the food bowl. Side by side, Gracie's lower body is visibly paler and greyer (pale belly, light legs), while Stevie is an even brown-grey with a darker, streaked back.
- `gracie-ice-cube.png` (Kirk, 2026-11-10): Gracie curled on the rug, holding an ice cube in one front paw. It shows her hand-like paws, the pale grey fur over her legs and feet with dark palms and soles, and her ringed tail.

## How to tell Gracie

In Kirk's words: "You can tell Gracie with the grey longer fur on lower body."

- **Signature:** the fur on her lower body (belly, flanks and hindquarters) is lighter, greyer and noticeably longer and shaggier than on her back. This is the feature her identity lock must keep, and the one that sets her apart from Stevie.
- A full dark mask with pale brows and a pale muzzle; rounded ears with pale rims; a ringed tail.

## Pose and anatomy (for rest, shelter and eat motion)

- **Rest pose:** lying on her side, slightly curled, head tucked down onto her front paws, eyes closed, tail lying along her body.
- **Front paws:** long-fingered and hand-like, with dark palms and pale fur over the tops. She holds and turns small things in one paw, like the ice cube; that's the reference for an `eat` clip.
- **Hind feet:** plantigrade. The whole sole shows, dark underneath, with pale toes and pale fur over the top of the foot. This matches the gait reference (`references/stevie/gait-reference/adult-fence-walk.png`).

## Style-bible entry and turnaround

Gracie is in the style bible (`art/style-bible.md`, "Gracie") as the subject `gracie`. Her description leads with her signature, and these three photos are her likeness references. She uses the shared raccoon rig and the generated gait. Her 3D inputs are in `art/gracie/character-3d/`: `kind: "character-3d"`, `subject: "gracie"`, `gait: "quadruped"`.

**Turnaround: waiting on candidates and Kirk's pick.** Her four-view turnaround (front, three-quarter, side and back) is generated from these photos by an image edit through Vercel AI Gateway (`openai/gpt-image-2`), as Stevie's was:

```sh
node art/tools/turnaround.mjs gracie --dry-run   # forecast: no key, no spend
node art/tools/turnaround.mjs gracie             # needs AI_GATEWAY_API_KEY in the environment
```

- **Inputs:** the prompt, the photos, the candidate count (3) and the $5 cap are in `art/gracie/turnaround.json`.
- **Budget:** each call reserves $0.50 against the cap before it runs. A call that would pass the cap is refused.
- **Outputs:** the candidates go to `turnaround-candidates/cN/`: the 2×2 sheet `turnaround.png` and its four cropped views.
- **Provenance:** `turnaround-candidates/provenance.json` records each call's provider, model, route, endpoint, prompt, input hashes, reservation, measured cost, provider terms and output grant (`outputGrant`: OpenAI API terms, commercial and relabellable, so the images are MIT here under `REUSE.toml`'s `**` annotation). It also records each file's hash, and every image is tagged IPTC `trainedAlgorithmicMedia`.

The candidates are review material, not approved art. **The pick is Kirk's.** Once he has picked:

1. Copy the picked candidate's views to `references/gracie/turnaround-{front,three-quarter,side,back}.png`, with its provenance.
2. Add Gracie's identity lock (`identities.gracie`, approved, with the three-quarter view as the turnaround and these photos as references). Assetforge accepts a lock only on an approved turnaround, which is why she has none yet.
3. Add the approved front and side views as her subject references.
4. Add Gracie to the lock set that `art/tools/check.mjs` expects.

His further photos of her refine the turnaround.
