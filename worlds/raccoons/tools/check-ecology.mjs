import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const platform = resolve(process.env.CLOCKGROVE_DIR ?? ".clockgrove");
const platformImport = (path) => import(pathToFileURL(resolve(platform, path)));
await platformImport("packages/simulator/cli/typescript-hooks.mjs");
const { loadPack } = await platformImport("packages/simulator/test/conformance/pack-source.ts");
const { ports, packPorts } = await platformImport("packages/simulator/cli/ports.ts");
const { buildWorldPack, decodeResource } = await platformImport(
  "packages/world-pack-sdk/src/index.ts",
);
const { runScenario } = await platformImport("packages/simulator/src/index.ts");
const { executeWorldKernel } = await platformImport("packages/kernel/src/index.ts");
const pack = await loadPack(packDirectory);
const build = await buildWorldPack(pack.source, packPorts);
assert.equal(build.ok, true, JSON.stringify(build.error));
const names = process.argv.slice(2);
// Reviewed counts from the one-year run (see README, "Pressures in the one-year run").
const YEAR = {
  compostMeals: 16,
  emptyCompostMeals: 332,
  trashMeals: 1,
  emptyTrashMeals: 1,
  dryBowlDecisions: 2,
};
if (!names.length) names.push("closed-world-resources", "long-run-one-year");
for (const name of names) {
  const document = decodeResource(
    new Uint8Array(
      readFileSync(
        resolve(
          packDirectory,
          name.startsWith("long-run-") ? "long-runs" : "scenarios",
          `${name}.json`,
        ),
      ),
    ),
  );
  const stats = new Map();
  console.log(`Checking ${name} through the native executor`);
  const result = await runScenario(
    { artifact: build.value.artifact, source: pack.source, scenario: document },
    {
      ...ports,
      driver: (run) => {
        const stat = {
          maxHunger: 0,
          maxThirst: 0,
          minHealth: 10000,
          needDiscomforts: 0,
          plantYield: 0,
          collected: 0,
          evaporated: 0,
          transfers: 0,
          compostMeals: 0,
          emptyCompostMeals: 0,
          trashMeals: 0,
          emptyTrashMeals: 0,
          dryBowlDecisions: 0,
          householdStorePerceived: 0,
          calls: 0,
        };
        stats.set(run, stat);
        return {
          async call(input) {
            const outcome = executeWorldKernel(input);
            stat.calls += 1;
            if (name.startsWith("long-run-") && stat.calls % 32 === 0)
              console.log(
                `${name}/${run}: call ${stat.calls}, simulation time ${outcome.ok ? outcome.result.state.simulationTime : "refused"}`,
              );
            if (outcome.ok) {
              for (const draft of outcome.result.decisionDrafts) {
                const d = draft.decision;
                const exclusion = (target) =>
                  d.candidates?.find((c) => c.action.targetObjectId === target)?.excludedReason;
                const selected = d.selectedAction?.targetObjectId;
                const meal = d.selectedAction?.kind === "seek-food";
                // A bin the household fills only on its own day: full, the raccoon eats from it; seen
                // empty, it eats from another holder instead.
                for (const [target, full, empty] of [
                  ["grove.yard-compost", "compostMeals", "emptyCompostMeals"],
                  ["grove.trash-can", "trashMeals", "emptyTrashMeals"],
                ]) {
                  if (meal && selected === target) stat[full] += 1;
                  if (meal && selected !== target && exclusion(target) === "unavailable")
                    stat[empty] += 1;
                }
                if (
                  ["grove.water-bowl", "grove.snack-house-bowl"].some(
                    (bowl) => exclusion(bowl) === "unavailable",
                  )
                )
                  stat.dryBowlDecisions += 1;
                for (const store of ["grove.household-food", "grove.household-water"])
                  if (exclusion(store) !== undefined && exclusion(store) !== "outside-current-space-or-frame")
                    stat.householdStorePerceived += 1;
              }
              for (const event of outcome.result.events) {
                const p = event.payload;
                if (event.type === "needs.changed")
                  stat.maxHunger = Math.max(stat.maxHunger, p.hunger);
                if (event.type === "wellbeing.integrated") {
                  stat.maxThirst = Math.max(stat.maxThirst, p.thirst);
                  stat.minHealth = Math.min(stat.minHealth, p.health);
                }
                if (
                  event.type === "comfort.changed" &&
                  p.causes.some((cause) => cause === "hungry" || cause === "thirsty")
                )
                  stat.needDiscomforts += 1;
                if (event.type === "growth.stage-changed" && p.yield)
                  stat.plantYield += p.yield.quantity;
                if (event.type === "resource.weather-integrated") {
                  stat.collected += p.collected;
                  stat.evaporated += p.evaporated;
                }
                if (event.type === "resource.transferred") stat.transfers += 1;
              }
            }
            return outcome;
          },
        };
      },
    },
  );
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(
    result.value.bundle.assertions.filter((a) => !a.passed),
    [],
    `${name} assertions`,
  );
  assert.equal(result.value.bundle.replayVerified, true);
  for (const [run, stat] of stats) {
    console.log(`${name}/${run}: ${JSON.stringify(stat)}`);
    if (name === "long-run-one-year") {
      assert.ok(stat.maxHunger < 7000, `${run}: urgent hunger ${stat.maxHunger}`);
      assert.ok(stat.maxThirst < 7000, `${run}: urgent thirst ${stat.maxThirst}`);
      // The platform charges need-related health loss only during hungry/thirsty discomfort; wetness is separate.
      assert.equal(stat.needDiscomforts, 0, `${run}: hunger/thirst health-loss causes`);
      assert.equal(stat.plantYield, 64, `${run}: finite fruit yield`);
      assert.ok(stat.collected > 0 && stat.evaporated > 0, `${run}: weather pressures`);
      assert.ok(stat.transfers > 0, `${run}: household provisioning`);
      // Exact, reviewed values from the native year run (identical in both execution shapes).
      assert.equal(stat.compostMeals, YEAR.compostMeals, `${run}: meals from the fresh compost heap`);
      assert.equal(
        stat.emptyCompostMeals,
        YEAR.emptyCompostMeals,
        `${run}: compost heap seen empty, meal taken from another holder`,
      );
      assert.equal(stat.trashMeals, YEAR.trashMeals, `${run}: meals from the bin`);
      assert.equal(stat.emptyTrashMeals, YEAR.emptyTrashMeals, `${run}: bin seen empty`);
      assert.equal(stat.dryBowlDecisions, YEAR.dryBowlDecisions, `${run}: home bowl seen dry`);
      assert.equal(stat.householdStorePerceived, 0, `${run}: household stores stay off-screen`);
    }
  }
}
