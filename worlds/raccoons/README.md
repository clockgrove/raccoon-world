# clockgrove.green-lake-yard@1.4.0

The Wave 1 reference world: a data-only pack. It holds no code and no engine behaviour. Its
versioned presentation metadata, `presentation.json` (`presentationVersion` 1, issue 813), binds the stable actor
IDs and the scene effects to reviewed asset manifests under `assets/manifests/`
([asset pipeline](https://github.com/clockgrove/clockgrove/blob/main/packages/assets/docs/pipeline.md)); it sits outside the pack source, so no pack or
state hash depends on it. Every value below is a resource the shared conformance suite
([conformance](https://github.com/clockgrove/clockgrove/blob/main/packages/simulator/docs/conformance.md)) builds, runs and checks on Node and on Workers.

## Contents

- **Space** `grove.neighborhood`: one 2-D frame in millimetres. Its rectangle regions declare the semantic
  hierarchy through their `parent` references: Green Lake Neighborhood (`green-lake-neighborhood`, the root)
  → Living Yard (`living-yard`) → Porch (`porch`), Den (`den`), Garden (`garden`) and Cedar Area
  (`cedar-area`); `street-buffer` and `snack-house` are children of the neighborhood. The shapes also nest,
  but perception reads the declared hierarchy, not the geometry. `street-buffer` declares a ten-minute dwell
  (`dwell.durationMs` 600000): an object that stays in it that long gets one `movement.region-remained`. No
  routine route reaches the street, so only the `street-dwell` scenario does. The anchor graph holds
  `den-mouth`, `porch-step`, `trash-front`, `tree-base`, `garden-edge`, `fence-gap` and `snack-door`, joined by
  anchor edges; `snack-door` has none. The only way to it is the portal (`clockgrove.portal`) of the fence gate,
  which joins the `fence-gap` anchor to the `snack-house` region and starts open. Because the gate separates
  `snack-door` from the other anchors, every route to `snack-door` or to a point inside the snack house goes
  through the gate, also from a start that is not on an anchor.
- **Space** `grove.zz-household-store`: a separate frame with no regions, anchors or routes, holding only the
  household's two stores. Nothing in it is in any raccoon's space, so the stores are never perceived, routed
  to or eaten from; only the household processes move material out of them.
- **Archetypes**: social raccoon (`grove.raccoon-kind`), kit (`grove.kit-kind`), den, porch, food/trash source,
  water source, a cedar hollow shelter, cedar, herb (plant), the weather/day-night sky and a gate
  (`grove.gate-kind`). Both raccoon archetypes carry the `grove.needs` trait.
- **Actors**: Stevie, Gracie and a kit with `lifecycle` seeds (one household; the kit names Gracie and Stevie as
  parents), plus the placed objects: trash can, snack dish, cat-food bowl, den stash, pantry bin, yard compost heap, finite household stores (in their own space), fruit tree, berry patch, rain puddle, two water bowls (one in the den,
  one in the snack house), den, porch, cedar hollow, cedar, herb, sky and the fence gate (`grove.fence-gate`,
  carrying the portal).
- **Policies**: one clock policy and one `clockgrove.world-behavior-policy` (`grove-yard-4`) covering the clock
  ratio, a three-day weather cycle with day and night, needs, utility, growth and resources, gestation, aging and
  death. Its utility record declares ambiguity (`score-margin` with `maxMargin` 0, so exact score ties are
  ambiguous, and the novelty condition `unperceived-target`): such a decision still takes its routine choice and
  records one planning request beside its trace, never executed
  ([utility decisions](https://github.com/clockgrove/clockgrove/blob/main/packages/kernel/docs/utility-decisions.md)).
  Its household, growth and weather causes are recorded below. Its shelter and hunger weights set the threshold below ([Hunger against rain](#hunger-against-rain)), and its
  water sources and meal size follow [Water](#water).
- **Scripted cognition** (`grove.learning`): Stevie's repeated snack-house food access and resulting belief, the
  kit's belief attributed to Gracie, and two kit beliefs attributed to Stevie, one effective before his death and
  one after.
- **Rules**: five rules with event, schedule, threshold and geofence triggers and fanout, depth and cooldown
  budgets. Their intents are recorded with disposition `recorded-not-executed`; none runs.
- **Capabilities**: one binding of each kind (`inspect`, `embodied-dialogue`, `interpreted-perspective`,
  `influence`, `operator-authoring`), each bound to at least one actor.

## Hunger against rain

`grove-yard-4` weighs shelter at 926 (`shelterWeight`) against hunger at 5000 (`hungerWeight`), so a hungry
raccoon eats in the rain instead of sheltering next to food.

- **Threshold: hunger 6000.** Take a dry raccoon in the heaviest rain (9000), with the den (protection 9000) and
  cat food 18 hours old (freshness 2500) both at distance 0. It shelters at hunger 6000 or below and eats above it.
  Its scores are 1250 × hunger for the food and 7,500,600 for the den, so hunger 6000 scores 7,500,000 and 6001
  scores 7,501,250.
- **Why 6000.** Hunger rises 800 a day and turns urgent at 7000 (`urgentHunger`), where health starts to fall.
  A raccoon that shelters at 6000 or below reaches at most 6800 by its next daily decision, so it eats before
  hunger costs health. This is the hardest case for household food in the pack: Gracie decides at midnight, when the food
  that appeared at 6:00 is 18 hours old.
- **Other cases.** Food weighs hunger × freshness, and shelter weighs (wetness + rain) × protection. Fresher food,
  lighter rain or a weaker shelter lowers the threshold; with fresh food it is 1500. Wetness raises it, and from
  wetness 9000 the reflex shelters whatever the hunger.
- **Proof.** The `hungry-in-the-rain` scenario.

## Closed-world material policy

`resources/policies/behavior.json` declares only platform causes: household transfers from finite stores,
rain collection and evaporation, and plant growth yield. No food or water appears from nothing.

### Household stores

Genesis holds the house's finite supplies: **40,000 food units and 140,000 water units**, in
`grove.zz-household-store`. The stores sit in their own space, as Clockgrove's #187 reference does, so they
are household inventory, not food lying in the yard: a raccoon can only eat what a household process has
moved into the yard. Nothing replenishes either store.

**Horizon: about ten years.** The scheduled deliveries ask for at most 3,526 food units a year (cat food
1,095, snacks 1,095, pantry 488, bins 636, compost 212) and 17,520 water units a year (two 24-unit fills a
morning). Refused deliveries take less: the reviewed one-year run before the compost heap drew 3,314 food
and 11,664 water, because a bowl still holding rain refuses its morning fill. 40,000 food covers more than
eleven years of the food maximum. 140,000 water covers twelve years at the measured rate and eight years if
every fill were accepted. A world run past that horizon empties a store: each later delivery is refused and
journaled, and the yard lives on rain and growth alone. That is the closed-world rule; the horizon is stated
here so it is a known limit, not a surprise.

### Household processes

All household processes act under principal `grove.householder`, an off-screen person declared as a world
process, not an actor. Each process is an ordinary `resource.transfer` from a store, journaled with
`process.command-attempted` and the transfer, so every refill names its cause. A nonempty perishable
destination or a full water bowl refuses a delivery; the refusal is journaled and that occurrence is spent.

| Process | Transfer and cadence | Reason |
| --- | --- | --- |
| `grove.feed-cats` | 3 food to `grove.cat-food-bowl`, daily from day 100, 06:00 | The feral-cat bowl beside the den, which the raccoons raid. Three one-unit meals a day feed the family living by the den. |
| `grove.fill-snack-dish` | 3 food to `grove.snack-dish`, daily from day 100, 06:00 | The same meal count for the snack-house family. |
| `grove.fill-pantry` | 4 food to `grove.pantry-bin`, every 3 days from day 100, 06:00 | The house's pantry bin, out of the raccoons' reach; an intermittent store the food-decay scenario drains. |
| `grove.bins-out` | 12 food to `grove.trash-can`, weekly from day 100, 06:00 | Rubbish goes out once a week, not daily: with a 24-hour shelf life the bin is empty six days in seven. Twelve units is the week's food waste: four days' worth of a dish's three-unit meal. |
| `grove.tip-scraps` | 4 food to `grove.yard-compost`, weekly from day 168, 18:00 | Kitchen scraps tipped on the compost heap by the den after the evening meal. Four units is one fresh meal for each of up to four raccoons (`maxPopulation`). Delivered at 18:00, the scraps are six hours old at the den's midnight decisions, fresher than the 18-hour-old cat food, so the raccoons eat them first; the rest of the week the heap is empty. The heap starts on day 168, after the last reviewed short scenario (`months-fast-forward` ends on day 161), so those scenarios keep their reviewed behaviour. |
| `grove.fill-water-bowl` | 24 water to `grove.water-bowl`, daily from day 100, 06:00 | The outside dish by the den, filled each morning. 24 units is a day's evaporation (below), so a filled bowl lasts until the next morning in dry weather. |
| `grove.fill-snack-house-bowl` | 24 water to `grove.snack-house-bowl`, daily from day 100, 06:00 | The same dish at the snack house. |

Cat food, snacks, trash, compost, pantry food and carried-to-den food have a 24-hour shelf life (one decision
interval): food the household puts out is eaten that day or spoils, so a bin is really empty between
deliveries. The den stash starts empty and has **no refill process**: food reaches it only when a raccoon
carries it there (an ordinary transfer into a carried holder, movement, and a transfer into the stash). Direct
transfers between declared perishable holders keep their arrival times; the carried holder's later deposit
uses the transfer instant under the platform's freshness rules. The recorded daily pantry rule proposes a
finite transfer; rules remain recorded, not executed.

### Growth

The fruit tree and garden berries each yield **16 food at 10 growing days and another 16 at 20 growing
days** (864000000 and 1728000000 growing ms). Growth counts bright light with wetness at least 3000, not
calendar days, so a crop needs both sun and rain. Both plants reach both stages in the year run (64 units
in all, asserted exactly). Sixteen units is a picking that feeds one raccoon for 16 days at one meal a day,
and two pickings a plant keep growth a seasonal supplement, not a second household. Fruit stays on its plant until eaten
or moved; the platform does not make yielding plants perishable or repeat the final stage. The tree and
berries stand in the garden, outside the den and snack-house families' 5 m perception range, so the
year run's raccoons, who stay near home food, do not eat the fruit; it is forage for a raccoon that
goes to the garden. The cedar and herb keep their existing non-food growth stages.

## Water and needs

| Holder | Capacity | Catchment (units/hour at full rain) | Evaporation (units/hour) |
| --- | --- | --- | --- |
| `grove.water-bowl`, `grove.snack-house-bowl` | 32 | 2 | 1 |
| `grove.rain-puddle` | 12 | 4 | 1 |

- **Bowl capacity 32**: one 24-unit morning fill plus 8 units of headroom for rain. A bowl holding more
  than 8 units refuses the morning delivery, so the household tops up a dish rather than overfilling it.
- **Bowl catchment 2**: a small dish. Twelve hours of heavy rain (9000) collect about 21 units, nearly one
  morning's fill, so a storm alone can water a home for a day.
- **Puddle capacity 12, catchment 4**: a shallow hollow drains a wider area than a dish but holds little. It
  fills in about five hours of heavy rain and, at 1 unit an hour, is dry 12 hours after the rain stops:
  for most of the two dry days in each three-day cycle it holds nothing. That is the dry-spell pressure the
  `closed-world-resources` scenario shows: a raccoon at the garden drinks from the wet puddle and, at the
  same puddle dried, stays.
- **Evaporation 1 unit an hour** for every holder: the smallest nonzero rate the policy accepts (it is in
  whole units per hour). A bowl therefore loses 24 units a day, exactly one morning delivery: in dry
  weather a bowl filled at 06:00 is empty by the next morning. Most household water evaporates rather than
  being drunk. In the year run each bowl collects about 2,990 units from rain and receives about 5,830 from
  the household, loses about 8,750 to evaporation, and gives about 60 drinks. That is intended: an outdoor
  dish also waters cats and birds, and a raccoon needs one drink about every ten days (below).

Collection scales by rain intensity and the unprotected fraction; evaporation stops at empty, collection
stops at capacity, and fractional quantities carry between advances. The three-day weather cycle has two
completely dry days, 12 hours of heavy rain, six dry hours and six hours of light rain.

The bowls stay co-located with the home food: den at (8000, 22000), snack house at (30000, 13000), and the
compost heap 2.2 m from the den mouth at (10000, 23000). That keeps food and water within the 5 m
perception range, including for newborns. A meal relieves 1200 hunger against 800 daily hunger growth:
two meals repay a day spent drinking or sheltering. Thirst grows 100 a day and a drink relieves 1000, so one
drink lasts ten days. Utility weighs hunger and thirst at 5000; the 926 shelter weight preserves the
hunger-6000 rain threshold above.

### Pressures in the one-year run

`tools/check-ecology.mjs` asserts these exact counts in both the live and aggregate runs. A bin counts only from
its process's first delivery; before that it has never held food:

- **Empty compost heap: 278 meals taken elsewhere.** From the first scraps (day 168, 18:00) the den family
  meets the heap at every decision. In 16 decisions it holds the fresh scraps and the raccoon eats there; in
  278 it is empty (`unavailable`) and the raccoon eats the older cat food instead. The bin's weekly rhythm changes what they
  eat, not just what they see.
- **Trash can: 1 meal, 1 seen empty.** The trash can sits at `trash-front`, away from both homes, so only
  Stevie's early decisions there meet it.
- **Dry home bowl: 2 decisions.** A home bowl is seen dry twice; the morning fill matches a day's
  evaporation, so a home bowl is rarely dry at a decision. Across the year the three
  outdoor water holders collect 9,523 units from rain and lose 21,039 to evaporation.
- **No household store is ever perceived**: every decision lists both stores as
  `outside-current-space-or-frame`.
- **Needs**: hunger peaks at 6800 and thirst at 5446, below both urgent thresholds (7000). Wet exposure can
  briefly lower health to 9989; hunger and thirst never become discomfort or health-loss causes. The proof
  checks every integrated needs and health event, not just the final population. Both plants yield 64
  units in all.

### Origins

Every accepted material change is checked by native per-holder and global conservation invariants.
`resource.weather-integrated` names rain collection and evaporation; `growth.stage-changed` names the
plant and yielding stage; a household refill records `process.command-attempted` followed by
`resource.transferred`, naming the principal, process and finite source. Consumption identifies the
food or water holder. Recorded Why displays the historical producing event's rain, growth or transfer
cause (including household process identity), which remains inspectable after consumption. This uses
Clockgrove's existing cause history; it does not add transitive inventory lineage to a meal command.

## Scenarios

Each scenario in `scenarios/` has a golden of the same name in `goldens/`.

| Scenario | What it shows |
| --- | --- |
| `closed-world-resources` | Finite household refills; an attributed carried and stashed meal; exact heavy/half-rain bowl collection before the first household visit; evaporation and different choices at a wet versus dry puddle |
| `favorite-snack-house` | Stevie's scripted memories and belief; his hungry decision before they take effect picks the trash can, a later one picks the snack dish, with a non-zero `expectation` feature linked to the scripted refs |
| `hungry-in-the-rain` | Gracie is dry in the heaviest rain with the cat-food bowl at distance 0: on day 122, at hunger 5000, she shelters in the den, and on day 125, at 6200 after a day spent drinking, past the 6000 threshold, she eats from the cat-food bowl and stays dry. No actor's hunger turns urgent. In the `no-food-in-reach` variant the cat-food bowl is retired, her hunger crosses 7000 and the hunger alarm fires |
| `thirsty-raccoons-drink` | On day 112 Gracie, at thirst 1200, drinks from the den bowl at distance 0 (6,000,000 against the cat food's 5,250,000): one drink, thirst 200, and she never moves. The snack-house bowl is in reach of the kit at the snack dish. After the drink her meals pay it back: hunger 5800 on day 114, 5400 on day 115. In the `no-bowl-in-reach` variant the den bowl is retired and nobody drinks |
| `rain-shelter-comfort` | An exposed raccoon gets wetter and less comfortable under rain, a sheltered one does not get wetter, perception differs by location, and a live run equals a fast-forward run |
| `food-decay-and-conservation` | Household food is transferred, decays and is consumed until depleted; a retried command does nothing twice; quantities never go negative and consumed plus remaining is conserved |
| `cedar-growth` | A continuous live run and an aggregated fast-forward run cross the same cedar stages; Stevie's and the kit's `unperceived-target` planning requests, raised in calls 2 and 5 of the live run (12-hour steps) and in the fast-forward run's one call, are identical in both progressions |
| `birth-and-parentage` | A gestation that spans a restart and a fast-forward ends in exactly one `lifecycle.born`; the child's lifecycle entry names its parents and household; an uninterrupted run is equivalent |
| `social-learning` | The kit holds a belief attributed to Gracie, not a copied memory, and its decision changes once the belief takes effect |
| `death-and-successor` | Stevie dies, takes no later decision, keeps his `objectId` and `archetypeId`, and the successor intent names a distinct id that is no entity; a belief attributed to him and effective after his death never reaches a decision, one effective before it still does |
| `months-fast-forward` | Over 61 simulated days weather changes, plant growth stages, resource consumption and decay, lifecycle stage changes, remaining schedules and rule budget outcomes are recorded, and differently stepped runs are equivalent |
| `differential-perception` | One event gives a nearby, a sheltered, a privacy-reduced (access `reduce`) and an absent actor four distinct perception outcomes; the inattentive case waits for the attention factor (Wave 6 RW-0605) |
| `street-dwell` | Four visitors step into the street buffer: the stroller's remain falls ten minutes after its entry, during its own slow 12-minute stroll along the street; the lingerer stays put and gets one `movement.region-remained` ten minutes after entering; the passer steps back out first, so its dwell is cancelled and never fires; the returner leaves and re-enters, and its one remain counts from the second entry. Live (5-minute steps) and fast-forward progression give equal movement events. Gracie's first decision ties staying with seeking the den she is in: she takes the fallback (the den) and each run records exactly one planning request, the same record in both runs (both reach it in their opening fast-forward step) |
| `fence-gap-portal` | Stevie routes to the snack dish through the open fence gate and crosses it as he steps off `fence-gap`; closing, reopening and using it refuse with stable checks when they do not apply; with the gate closed from the start the snack dish is `unreachable`, he reroutes to the trash can, and the kit's moves from off the anchor graph to `snack-door` and into the snack house are refused; interrupted on the gate hop, Stevie keeps his crossing and the gate can close behind him |
| `boundary-walk` | A scenario-created visitor’s moves pass world time across boundaries, and each boundary lands inside the move at its exact time: a slow street stroll across 6:00 as the household delivers food, its dwell falls due and every deferred decision waits for its end; walks across dusk, across midnight as the rain begins and across dawn as food spoils and household deliveries occur (`movement.start`); an interrupt after the rain ends (`movement.interrupt`); a replan as the herb reaches its next stage (`movement.replan`); and a slow trip through the fence gate at dusk as rain begins again (`portal.use`). A replan two days ahead and a walk across the other raccoons' decision time are refused (`movement.passed-time@1`). Live (1-hour steps) and fast-forward runs end in equal final states, revision aside |

`long-runs/` holds the 30-day and one-year qualification scenarios (summarised recording, no goldens, not in
the pack artifact). The external pack check does not run them. Run the focused native proof with `node worlds/raccoons/tools/check-ecology.mjs`; it also exercises the new material scenario.

## Deferred

Session, private-memory, relationship and knowledge-access policy at death is built by Wave 8 RW-0802 (Wave 8
§5.1, "Death") and is not implemented in Wave 1. The pack and the `death-and-successor` scenario only record that an actor died and that
a successor was intended.

## Regenerating goldens

Goldens are generated once, after all pack content is final, because every golden hashes the same artifact.
Follow the golden review workflow in the conformance document; never edit a golden by hand and never commit an
`*.actual.json` file.
