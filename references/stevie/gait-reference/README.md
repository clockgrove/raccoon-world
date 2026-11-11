# Raccoon gait reference

Frames from Kirk's own porch footage of raccoon kits, 2026-11-10. This is the motion reference for Raccoon World's raccoon walk (clockgrove/assetforge's shared rig and generated gait). Only cropped frames are kept here, never the clip; the footage is shot through a screen door, so it is soft.

- `side-crossing.png`: a kit crossing in side view, t = 0.00–0.20 s at about 25 fps.
- `walk-away.png`: a kit walking away, t = 6.20–7.95 s at about 9 fps.
- `adult-fence-walk.png`: an adult mid-stride along a fence top, in side view. This is the sharpest view of the feet and ankles (Kirk's still, 2026-11-10).

## What the kits do

- **Hind feet are plantigrade.** The whole hind foot goes down, heel included, like a bear's. The ankle does not stay raised the way a dog's does.
- **Front paws are hand-like.** A paw bearing weight is flat, with the fingers spread and the wrist straight. A paw in the swing flexes at the wrist, with the fingers curling down as it reaches forward (`adult-fence-walk.png`). Bending is right in the swing and wrong in stance, where the wrist must never fold or collapse.
- **The body is hunched.** The back arches high, with the rump and middle above the shoulders, and the head is carried low and forward, looking down. The legs are short under a heavy body, the elbows are tucked, and the feet reach out from under the body rather than swinging like long dog legs.
- **The tail hangs low**, curving down behind, **and sways** with the hips. The steps are short and quick, and the rump rocks side to side at a walk.
- **Feet plant and stay planted** on the ground through each stance, with no sliding or sinking.

The first 3D Stevie (`references/stevie/3d-wave0-candidates/c3`) uses a generic library walk instead: raised hind ankles, front wrists folding, a level back and the head up, and feet off a common ground line. That is what the generated gait replaces.
