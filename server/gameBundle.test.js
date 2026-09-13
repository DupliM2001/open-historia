// Run: node --test server/gameBundle.test.js
//
// Exporting one Game as a portable record and importing it back. What has to
// hold, because each of these is silent damage on a player's machine otherwise:
//   - everything a game holds survives the round trip, and restore points do
//     too even though they travel outside the bundle;
//   - an import is always a NEW game and never the active one, so importing
//     cannot overwrite a campaign or yank a player out of the one they are in;
//   - the sender's name for the game survives, disambiguated only on a real
//     collision;
//   - the bundle says whether the map has to travel with it — and a game whose
//     scenario this install does not have still imports, still opens in the
//     library, and still remembers what to go and ask for;
//   - no API key and no home-folder path ever reaches a bundle. That one is a
//     drift guard: nothing puts them there today, and this test is what says so
//     the day something starts to.
//
// Each case runs in its own child process because OH_DATA_DIR is read once, at
// import time, so one process only ever sees one data directory.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { after, test } from "node:test";
import { OWNER_SCHEMA } from "./ownerMigration.js";

const SERVER_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const STORE_URL = url.pathToFileURL(path.join(SERVER_DIR, "libraryStore.js")).href;

const roots = [];
const writeJson = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value), "utf-8");
};

// A data dir holding one scenario and one game played on it. `scenarioId` is
// written onto the game whether or not that scenario exists, which is how the
// missing-map cases are set up.
const buildDataDir = ({
  gameId = "test-campaign",
  gameName = "Test Campaign",
  scenarioId = "default",
  scenarioExists = true,
  hubOrigin = null,
  extraGames = [],
  snapshots = null,
} = {}) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "oh-gamebundle-"));
  roots.push(root);

  if (scenarioExists) {
    const dir = path.join(root, "scenarios", scenarioId);
    writeJson(path.join(dir, "scenario.json"), {
      id: scenarioId,
      name: scenarioId === "default" ? "Modern Day" : "Hand Drawn World",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      ...(hubOrigin ? { hubOrigin } : {}),
    });
    writeJson(path.join(dir, "world.json"), { ownerSchema: OWNER_SCHEMA });
    writeJson(path.join(dir, "game.json"), {});
    for (const key of ["actions", "advisor", "chat", "events"]) {
      writeJson(path.join(dir, "storage", `${key}.json`), []);
    }
    writeJson(path.join(root, "scenario-manifest.json"), {
      order: [scenarioId],
      selectedScenarioId: scenarioId,
      version: 2,
    });
  }

  const ids = [gameId, ...extraGames.map((entry) => entry.id)];
  for (const entry of [{ id: gameId, name: gameName, scenarioId }, ...extraGames]) {
    const dir = path.join(root, "games", entry.id);
    writeJson(path.join(dir, "game-instance.json"), {
      id: entry.id,
      name: entry.name,
      scenarioId: entry.scenarioId ?? scenarioId,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    writeJson(path.join(dir, "world.json"), {
      ownerSchema: OWNER_SCHEMA,
      countryTags: { Testland: ["socialist"] },
    });
    writeJson(path.join(dir, "game.json"), {
      country: "Testland",
      difficulty: "hard",
      gameDate: "2032-11-15",
      language: "English",
      round: 10,
    });
    writeJson(path.join(dir, "colors.json"), { Testland: [1, 2, 3] });
    writeJson(path.join(dir, "prompts.json"), { gameMaster: "be terse" });
    for (const key of ["actions", "advisor", "chat", "events"]) {
      writeJson(path.join(dir, "storage", `${key}.json`), [{ id: `${key}-1` }]);
    }
    writeJson(path.join(dir, "storage", "intercepts.json"), { Testland: ["a cable"] });
    writeJson(path.join(dir, "storage", "snapshots.json"), snapshots ?? []);
  }

  writeJson(path.join(root, "game-manifest.json"), { activeGameId: gameId, order: ids, version: 2 });
  return root;
};

const runStore = (root, body) => {
  const script = `const store = await import(${JSON.stringify(STORE_URL)});\n${body}`;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf-8",
    env: { ...process.env, OH_DATA_DIR: root },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out.slice(out.lastIndexOf("\n@@") + 3));
};
const report = (expression) => `process.stdout.write("\\n@@" + JSON.stringify(${expression}));`;

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("everything a game holds survives the round trip, and the copy is a new, inactive game", () => {
  const root = buildDataDir();
  const result = runStore(root, `
    const bundle = store.exportGameBundle("test-campaign");
    const imported = store.importGameBundle(bundle);
    const details = store.getGameDetails(imported.game.id);
    const catalog = store.getGameCatalog();
    ${report(`{
      schema: bundle.schema,
      sameId: imported.game.id === "test-campaign",
      name: imported.game.name,
      activeGameId: catalog.activeGameId,
      gameCount: catalog.games.length,
      data: details.data,
      world: details.data.world,
    }`)}
  `);

  assert.equal(result.schema, "open-historia-game-bundle/1");
  assert.equal(result.sameId, false, "an import is a new record, never an overwrite");
  assert.equal(result.gameCount, 2);
  assert.equal(result.activeGameId, "test-campaign", "importing must not switch the active game");
  // Round-tripping into the SAME library is a genuine collision: the original is
  // still sitting there. Two cards reading "Test Campaign" is the case the
  // suffix exists for.
  assert.equal(result.name, "Test Campaign (imported)");
  assert.equal(result.data.game.country, "Testland");
  assert.equal(result.data.game.difficulty, "hard");
  assert.equal(result.data.game.round, 10);
  assert.equal(result.data.prompts.gameMaster, "be terse");
  assert.deepEqual(result.data.events, [{ id: "events-1" }]);
  assert.deepEqual(result.world.countryTags, { Testland: ["socialist"] });
});

test("restore points travel beside the bundle, not inside it", () => {
  const root = buildDataDir({ snapshots: [{ round: 9, world: { note: "before the war" } }] });
  const result = runStore(root, `
    const bundle = store.exportGameBundle("test-campaign");
    const snapshots = store.readGameSnapshots("test-campaign");
    const imported = store.importGameBundle(bundle);
    const beforeRestore = store.readGameSnapshots(imported.game.id);
    store.writeGameSnapshots(imported.game.id, snapshots);
    ${report(`{
      inBundle: Object.hasOwn(bundle.data, "snapshots"),
      sent: snapshots,
      beforeRestore,
      afterRestore: store.readGameSnapshots(imported.game.id),
    }`)}
  `);

  assert.equal(result.inBundle, false, "snapshots stay out of the bundle — they are ~40x the rest");
  assert.deepEqual(result.sent, [{ round: 9, world: { note: "before the war" } }]);
  assert.deepEqual(result.beforeRestore, [], "a fresh import starts with none");
  assert.deepEqual(result.afterRestore, result.sent, "and gets them back verbatim");
});

test("a name already in the library gains (imported); a free one does not", () => {
  const root = buildDataDir();
  const result = runStore(root, `
    const bundle = store.exportGameBundle("test-campaign");
    const first = store.importGameBundle(bundle);
    const second = store.importGameBundle(bundle);
    const renamed = store.importGameBundle({ ...bundle, game: { ...bundle.game, name: "Something Else" } });
    ${report(`{ first: first.game.name, second: second.game.name, renamed: renamed.game.name }`)}
  `);

  // The source game is still in the library, so even the first import collides.
  assert.equal(result.first, "Test Campaign (imported)");
  assert.equal(result.second, "Test Campaign (imported 2)", "and the suffix keeps counting");
  assert.equal(result.renamed, "Something Else", "a name nobody else holds is left alone");
});

test("a bundle whose schema is not ours is refused, and says so", () => {
  const root = buildDataDir();
  const result = runStore(root, `
    const reject = (bundle) => { try { store.importGameBundle(bundle); return null; } catch (error) { return error.message; } };
    ${report(`{
      wrongSchema: reject({ schema: "pax-historia-scenario-bundle/2", data: {}, game: {} }),
      noSchema: reject({ data: {}, game: {} }),
      notAnObject: reject("nope"),
      count: store.getGameCatalog().games.length,
    }`)}
  `);

  assert.match(result.wrongSchema, /Unsupported game bundle schema/);
  assert.match(result.noSchema, /Unsupported game bundle schema/);
  assert.match(result.notAnObject, /must be a JSON object/);
  assert.equal(result.count, 1, "a refused import writes nothing");
});

test("the bundle says whether the map has to travel with it", () => {
  const builtIn = runStore(buildDataDir({ scenarioId: "default" }), `
    ${report(`store.exportGameBundle("test-campaign").scenarioRef`)}
  `);
  assert.equal(builtIn.builtIn, true, "every install has the built-in map");
  assert.equal(builtIn.hubOrigin, null);

  const fromHub = runStore(
    buildDataDir({
      scenarioId: "shared-world",
      hubOrigin: { postId: 42, bundleUrl: "https://example.invalid/world.zip", syncedAt: "2026-08-01T00:00:00.000Z" },
    }),
    `${report(`store.exportGameBundle("test-campaign").scenarioRef`)}`,
  );
  assert.equal(fromHub.builtIn, false);
  assert.equal(fromHub.hubOrigin.bundleUrl, "https://example.invalid/world.zip", "still downloadable, so it need not ride along");
  assert.equal(fromHub.scenarioName, "Hand Drawn World");

  const homemade = runStore(buildDataDir({ scenarioId: "my-own-map" }), `
    ${report(`store.exportGameBundle("test-campaign").scenarioRef`)}
  `);
  assert.equal(homemade.builtIn, false);
  assert.equal(homemade.hubOrigin, null, "nowhere to fetch it from, so the caller must embed the map");
});

test("a game whose scenario this install lacks still imports, and remembers what to ask for", () => {
  const root = buildDataDir({ scenarioId: "someone-elses-map", scenarioExists: false });
  const result = runStore(root, `
    const imported = store.importGameBundle({
      schema: "open-historia-game-bundle/1",
      game: { name: "Borrowed Campaign" },
      data: { game: { country: "Testland" }, world: {} },
      scenarioRef: {
        builtIn: false,
        hubOrigin: { postId: 7, bundleUrl: "https://example.invalid/map.zip", syncedAt: "2026-08-01T00:00:00.000Z" },
        scenarioId: "someone-elses-map",
        scenarioName: "Someone Else's Map",
      },
    });
    const card = store.getGameCatalog().games.find((entry) => entry.id === imported.game.id);
    ${report(`{
      scenarioMissing: card.scenarioMissing,
      scenarioId: card.scenarioId,
      importedScenarioName: card.importedScenarioName,
      importedScenarioOrigin: card.importedScenarioOrigin,
    }`)}
  `);

  assert.equal(result.scenarioMissing, true, "the card has to be able to say the map is not here");
  assert.equal(result.scenarioId, "someone-elses-map");
  assert.equal(
    result.importedScenarioName,
    "Someone Else's Map",
    "the scenario id is not a name a player can go and ask anyone for",
  );
  assert.equal(result.importedScenarioOrigin.bundleUrl, "https://example.invalid/map.zip");
});

test("the sender's scenario hints survive an ordinary meta write", () => {
  const root = buildDataDir({ scenarioId: "someone-elses-map", scenarioExists: false });
  const result = runStore(root, `
    const imported = store.importGameBundle({
      schema: "open-historia-game-bundle/1",
      game: { name: "Borrowed Campaign" },
      data: {},
      scenarioRef: { scenarioId: "someone-elses-map", scenarioName: "Someone Else's Map" },
    });
    // Archiving is the smallest ordinary meta write there is; readGameMeta
    // round-trips through it, so a field it does not name is a field this loses.
    store.updateGame(imported.game.id, { archived: true });
    const card = store.getGameCatalog().games.find((entry) => entry.id === imported.game.id);
    ${report(`{ importedScenarioName: card.importedScenarioName }`)}
  `);

  assert.equal(result.importedScenarioName, "Someone Else's Map");
});

test("no API key and no home-folder path ever reaches a bundle", () => {
  // The drift guard. Nothing writes a key or a path into a game today — settings
  // live in localStorage, not in the game — so this passes on an ordinary save.
  // It is here to fail loudly on the day something starts writing one.
  const root = buildDataDir();
  const serialised = runStore(root, `
    ${report(`JSON.stringify(store.exportGameBundle("test-campaign"))`)}
  `);

  const forbidden = [
    [/sk-[A-Za-z0-9]{16,}/, "an OpenAI-style key"],
    [/AIza[A-Za-z0-9_-]{20,}/, "a Google-style key"],
    [/sk-ant-[A-Za-z0-9-]{16,}/, "an Anthropic-style key"],
    [/"apiKey"/, "a field literally called apiKey"],
    [/[A-Za-z]:\\\\Users\\\\[^\\\\"]+/, "a Windows home folder"],
    [/\/(?:home|Users)\/[^/"]+\//, "a POSIX home folder"],
  ];
  for (const [pattern, what] of forbidden) {
    assert.equal(pattern.test(serialised), false, `a game bundle must never carry ${what}`);
  }
});
