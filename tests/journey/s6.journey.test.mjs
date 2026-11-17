// The S6 story in a real browser: Raccoon World boots in the Clockgrove shell, rain falls and
// puddles form, Stevie moves, the feed reports the rain, Why shows the recorded evidence, and Stevie,
// who declares a cognitive Conversation mode, is offered for Talk while Gracie, who declares none, is not.
// scripts/qualify.sh journey runs this through the pinned Clockgrove checkout (CLOCKGROVE_DIR).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

const clockgrove = process.env.CLOCKGROVE_DIR;
const worldRoot = process.env.RACCOON_WORLD_ROOT;
if (!clockgrove || !worldRoot)
  throw new Error("Run this journey with scripts/qualify.sh journey (CLOCKGROVE_DIR, RACCOON_WORLD_ROOT)");
const fromClockgrove = (file) => import(pathToFileURL(path.join(clockgrove, file)).href);

const { chromium } = await fromClockgrove("node_modules/playwright/index.mjs");
const { advanceCommand, provisionTestWorld, truthOf } = await fromClockgrove(
  "apps/runtime/test/world-fixture.ts",
);
const { isNativeWorldOwnerChild, runNativeWorldOwnerProcess, withNativeWorldOwner } =
  await fromClockgrove("apps/runtime/test/world-owner/native-harness.ts");
const { createServer } = await fromClockgrove("apps/web/node_modules/vite/dist/node/index.js");
const { worldRoutePath } = await fromClockgrove("apps/web/src/world-route.ts");
const { decodeLivingScene, VOICE_DISCLOSURES } = await fromClockgrove(
  "packages/contracts/src/index.ts",
);

const pack = path.join(worldRoot, "worlds/raccoons");
const shellFile = path.join(pack, "shell.json");
const here = import.meta.dirname;
const STEVIE = "grove.stevie";
const GRACIE = "grove.gracie";
// Owner findings on #74 (2026-11-08): Vulkan and ANGLE are required for SwiftShader swap chains.
const GPU_FLAGS = [
  "--enable-unsafe-webgpu",
  "--enable-unsafe-swiftshader",
  "--use-webgpu-adapter=swiftshader",
  "--use-angle=swiftshader",
  "--enable-features=Vulkan",
  "--use-vulkan=swiftshader",
];

it("S6: the world boots in the Clockgrove shell, rains, and Stevie moves and explains why", async () => {
  if (!isNativeWorldOwnerChild()) {
    await runNativeWorldOwnerProcess(path.join(here, "s6.journey.test.mjs"), pack, {
      vitestConfig: path.join(here, "vitest.config.mjs"),
      timeoutMs: 210_000,
      inheritOutput: true,
      prepare: (fixture) =>
        // The member's privacy ceiling allows conversation, so Talk is offered (#152).
        truthOf(fixture)(
          `UPDATE clockgrove.world_memberships SET grants=ARRAY['runtime:world-observe','runtime:world-inspect','runtime:world-command'],
            privacy_ceiling='{"version":1,"allowedCategories":["public_scene","conversation"]}' WHERE principal_id='principal-runtime';
          UPDATE clockgrove_auth.session SET token='hall-inspect' WHERE token='local-reader-session'`,
        ),
    });
    return;
  }
  await withNativeWorldOwner(async (native) => {
    const { fixture, world } = native;
    const provisioned = await provisionTestWorld(fixture, world, "principal-runtime");
    const scope = {
      ...provisioned.partition.target,
      spaceId: provisioned.partition.route.spaceId,
    };
    const truth = truthOf(fixture);
    const revision = async () =>
      BigInt(
        await truth(
          `SELECT revision FROM clockgrove.partition_states WHERE partition_id = '${provisioned.partition.route.partitionId}'`,
        ),
      );
    const scene = async () =>
      decodeLivingScene(
        (await native.request("/v1/runtime/scene", { version: 1, ...scope }, "hall-inspect")).body,
      );
    const commit = async (command) => {
      const { status, body } = await native.submit(command, {}, "hall-inspect");
      expect(status, JSON.stringify(body)).toBe(200);
    };
    const stevieAt = async () =>
      (await scene()).entities.find(({ objectId }) => objectId === STEVIE).pose.coordinates.join(",");

    process.env.CLOCKGROVE_WORLD_SHELL = shellFile;
    process.env.CLOCKGROVE_WORLD_ASSETS = path.join(worldRoot, "assets/reviewed");
    const shell = JSON.parse(await readFile(shellFile, "utf8"));

    const server = await createServer({
      root: path.join(clockgrove, "apps/web"),
      configFile: path.join(clockgrove, "apps/web/vite.config.ts"),
      server: {
        host: "127.0.0.1",
        port: 0,
        proxy: { "/v1": { target: await native.origin(), ws: true } },
      },
      plugins: [
        {
          // The journey reads what the renderer drew through the adapter it exposes.
          name: "expose-hall-adapter",
          transform(code, id) {
            if (id.split("?")[0] === path.join(clockgrove, "apps/web/src/renderer.ts"))
              return {
                code: `${code}\nconst load = ThreeWorldSceneAdapter.prototype.loadSnapshot;\nThreeWorldSceneAdapter.prototype.loadSnapshot = function (...args) { globalThis.hallAdapter = this; return load.apply(this, args); };`,
                map: null,
              };
          },
        },
      ],
    });
    let browser;
    try {
      await server.listen();
      const { port } = server.httpServer.address();
      browser = await chromium.launch({ headless: true, args: GPU_FLAGS });
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.getByLabel("Local session credential").fill("hall-inspect");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.locator("select#world").selectOption(worldRoutePath(scope));
      await page.getByText(/^Arrival: scene ready at revision /u).waitFor();

      // 1. This world's shell and atlas, drawn by WebGPU.
      expect(await page.title()).toBe(shell.name);
      expect(await page.getByText(shell.wordmark, { exact: true }).first().isVisible()).toBe(true);
      const tokens = await page.evaluate(
        (names) =>
          Object.fromEntries(
            names.map((name) => [
              name,
              getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
            ]),
          ),
        Object.keys(shell.tokens),
      );
      expect(tokens).toEqual(shell.tokens);
      const atlas = await page.evaluate(() => ({
        backend: globalThis.hallAdapter.backend,
        pages: globalThis.hallAdapter.atlasTextures.length,
        keys: [...globalThis.hallAdapter.atlas.keys()],
      }));
      expect(atlas.backend).toBe("webgpu");
      expect(atlas.pages).toBeGreaterThan(0);
      expect(atlas.keys.some((key) => key.includes("stevie"))).toBe(true);

      const living = page.getByRole("region", { name: "Living scene" });

      // 2. Talk follows the declared Conversation mode (#152): Stevie declares a cognitive one, Gracie
      // none. Checked on arrival, while Gracie is out in the yard and listed in the scene.
      const entityLine = (id) =>
        living
          .getByRole("listitem")
          .filter({ has: page.locator(`button[data-focus-key="entity:${id}"]`) });
      const interactions = page.getByRole("region", { name: "Interactions" });
      const talkAction = interactions.getByRole("button", { name: "Talk", exact: true });
      const talk = page.getByRole("region", { name: "Private conversation" });
      const opener = page
        .getByRole("region", { name: "Entity rail" })
        .getByRole("button", { name: "Open entity rail" });
      await expect
        .poll(() => entityLine(STEVIE).innerText())
        .toMatch(/; available actions Inspect, History, Why, Talk\s*$/u);
      // Gracie's card offers no Talk, and the runtime refuses one.
      await expect
        .poll(() => entityLine(GRACIE).innerText())
        .toMatch(/; available actions Inspect, History, Why\s*$/u);
      await living.getByRole("button").evaluateAll((buttons, id) => {
        const button = buttons.find((candidate) => candidate.dataset.focusKey === `entity:${id}`);
        if (!button) throw new Error(`Missing ${id}`);
        button.click();
      }, GRACIE);
      if ((await opener.count()) > 0) await opener.click();
      await page
        .getByRole("heading", { name: `Selected entity: ${GRACIE}`, exact: true })
        .waitFor();
      await interactions.getByRole("button", { name: "Why", exact: true }).waitFor();
      expect(await talkAction.count()).toBe(0);
      expect(await talk.count()).toBe(0);
      const refused = await native.request(
        "/v1/runtime/conversations/create",
        { version: 1, ...scope, actorId: GRACIE },
        "hall-inspect",
      );
      expect([refused.status, refused.body]).toEqual([409, { error: "talk_unavailable" }]);

      // 3. Rain.
      await commit({
        ...advanceCommand(world, "s6-rain", 0n, await revision()),
        type: "world.weather.set",
        payload: { schemaVersion: 2, rainIntensity: 9000 },
      });
      await living.getByText("Rain intensity: 9000", { exact: true }).waitFor();

      // 4. Puddles, in the scene's text and drawn by the renderer.
      await expect
        .poll(async () => Number(/Puddles: (\d+)/u.exec(await living.innerText())?.[1] ?? 0))
        .toBeGreaterThan(0);
      expect(
        await page.evaluate(
          () =>
            globalThis.hallAdapter.effects.filter(
              ({ role, sprite }) => role === "puddle" && sprite.visible,
            ).length,
        ),
      ).toBeGreaterThan(0);

      // 5. Stevie moves. He rests in the den; a day and a half into the rain (to noon on the second
      // day) he has left it for the snack house, as the world's own decisions and movement rules say.
      const stevieDrawn = () =>
        page.evaluate((id) => {
          const { x, y } = globalThis.hallAdapter.drawn.get(id).body.position;
          return [x, y];
        }, STEVIE);
      const denPose = "15000,8000";
      const snackHousePose = "30000,13000";
      const drawnBefore = await stevieDrawn();
      expect(await stevieAt()).toBe(denPose);
      await commit(
        advanceCommand(
          world,
          "s6-stevie-moves",
          BigInt((await scene()).simulationTime) + 129_600_000n,
          await revision(),
          { maxInputs: 1024, maxEvents: 4096 },
        ),
      );
      expect(await stevieAt()).toBe(snackHousePose);
      const stevieLine = living.getByText(/^grove\.stevie Identity: /u);
      await expect.poll(() => stevieLine.innerText()).toContain("position: 30000, 13000");
      await expect.poll(stevieDrawn).not.toEqual(drawnBefore);

      // 6. The feed reports what the rain did.
      const feed = page.getByRole("region", { name: "Event feed" });
      await expect.poll(() => feed.getByText(/ collected \d+ water from rain/u).count()).toBeGreaterThan(0);

      // 7. Why: Stevie's recorded action evidence.
      await living.getByRole("button").evaluateAll((buttons, id) => {
        const button = buttons.find((candidate) => candidate.dataset.focusKey === `entity:${id}`);
        if (!button) throw new Error(`Missing ${id}`);
        button.click();
      }, STEVIE);
      if ((await opener.count()) > 0) await opener.click();
      const selected = page.getByRole("region", { name: "Selected entity", exact: true });
      await selected.getByText(/^Selected entity at canonical revision /u).waitFor();
      await selected.getByRole("button", { name: /^Why action / }).first().click();
      const why = page.getByRole("region", { name: "Recorded Why" });
      await why.getByText("Recorded evidence loaded.", { exact: true }).waitFor();
      await why.getByText("Recorded command", { exact: true }).waitFor();

      // 8. Talk with Stevie (#152). He declares a cognitive Conversation mode, so his card offers
      // Talk, and a new conversation opens in his voice with its disclosure. Opening one calls no
      // model; no message is sent.
      await talkAction.waitFor();
      expect(await talkAction.isEnabled()).toBe(true);
      await talk.getByRole("button", { name: "New conversation", exact: true }).click();
      await talk.getByText("Manage conversation", { exact: true }).click();
      await talk.getByText(VOICE_DISCLOSURES.cognitive, { exact: true }).waitFor();
      const listed = await native.request(
        "/v1/runtime/conversations/list",
        { version: 1, ...scope, actorId: STEVIE },
        "hall-inspect",
      );
      expect(listed.status, JSON.stringify(listed.body)).toBe(200);
      expect(
        listed.body.sessions.map(({ actorId, voiceMode, disclosure, messageCount }) => ({
          actorId,
          voiceMode,
          disclosure,
          messageCount,
        })),
      ).toEqual([
        {
          actorId: STEVIE,
          voiceMode: "cognitive",
          disclosure: "Actor's subjective communication",
          messageCount: 0,
        },
      ]);
    } finally {
      await browser?.close();
      await server.close();
    }
  });
}, 240_000);
