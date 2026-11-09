#!/usr/bin/env node
// Builds src/yard.json: the SceneProjection the comparison page loads into Clockgrove's product renderer.
// It is Raccoon World's yard from this repository's pack (worlds/raccoons): every placed actor at its pack
// placement, with the pack's presentation bindings and effects, as the live yard projects them. The
// placeholder raccoons (Stevie, Gracie, the kit) are left out, so the only characters in a shot are the arm's.
// No world session or database: the projection is made from the pack files alone.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const pack = path.join(root, "worlds/raccoons");
const out = fileURLToPath(new URL("../src/yard.json", import.meta.url));
/** The yard's own raccoons: the comparison draws its arm's characters in their place. */
const LEFT_OUT = new Set(["grove.stevie", "grove.gracie", "grove.kit"]);
const FRAME = "frame-yard";

const presentation = JSON.parse(await readFile(path.join(pack, "presentation.json"), "utf8"));
const actors = [];
for (const file of (await readdir(path.join(pack, "resources/actors"))).sort()) {
  const actor = JSON.parse(await readFile(path.join(pack, "resources/actors", file), "utf8"));
  if (!actor.placement || LEFT_OUT.has(actor.id)) continue;
  actors.push(actor);
}
const coordinates = (placement) => placement.coordinates.map((c) => String(c.$bigint ?? c));
const pose = (placement) => ({ frameId: FRAME, frameVersion: 1, coordinates: coordinates(placement) });
const byId = new Map(actors.map((actor) => [actor.id, actor]));
const bindings = presentation.bindings.filter((binding) => byId.has(binding.objectId));
const effects = presentation.effects
  .filter((effect) => ["puddle", "lantern", "window"].includes(effect.role))
  .map((effect) => {
    // Unbound effects (the puddle) sit at the porch step, where the yard's lit path is.
    const at = byId.get(effect.objectId ?? "grove.porch") ?? byId.get("grove.porch");
    return { role: effect.role, assetId: effect.assetId, animationFamily: effect.animationFamily, pose: pose(at.placement) };
  });
const yard = {
  tenantId: "tenant-raccoon-world",
  worldId: "world-raccoon-world",
  timelineId: "timeline-comparison",
  spaceId: "grove.neighborhood",
  privacyClass: "public_scene",
  compatibility: { projectionVersion: 2, assetManifestVersion: 2, clientVersion: 1 },
  revision: "1",
  simulationTime: "64800000",
  weather: { rainIntensity: 9000 },
  hierarchy: [{ spaceId: "grove.neighborhood", label: "The yard" }],
  frames: [
    {
      frameId: FRAME,
      version: 1,
      dimensions: 2,
      unit: { name: "millimetre", fractionalDigits: 0 },
      axes: { axes: [{ name: "x", positiveDirection: "east" }, { name: "y", positiveDirection: "north" }] },
      origin: ["0", "0"],
      gravity: { kind: "constant-vector", vector: ["0", "0"] },
    },
  ],
  entities: actors.map((actor) => ({
    objectId: actor.id,
    archetypeId: actor.archetype.id,
    pose: pose(actor.placement),
    presentation: { kind: "placeholder", label: bindings.find((b) => b.objectId === actor.id)?.accessibilityLabel ?? actor.id },
  })),
  presentationBindings: bindings,
  interactions: [],
  feedCursor: "1",
  audienceHash: "stevie-comparison",
  effects,
};
await writeFile(out, `${JSON.stringify(yard, null, 2)}\n`);
console.log(`yard: ${actors.length} actors, ${bindings.length} bindings, ${effects.length} effects -> ${path.relative(root, out)}`);
