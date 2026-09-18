/*! Open Historia — game bundle parity and platform guards © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/gameBundleParity.test.js
//
// A Game exported in the browser has to import on a desktop install and back —
// that is the whole reason the zip is assembled client-side. Two stores build
// that bundle: server/libraryStore.js for desktop and Android, and
// src/runtime/web/libraryStore.js for the web build's IndexedDB.
//
// They cannot share code (one is Node with a filesystem, the other is a browser
// with an object store), so they share a contract instead, and this is what
// holds them to it. A key added to one list and not the other is silent: the
// export still succeeds, the import still succeeds, and one file quietly stops
// carrying a piece of the campaign.
//
// What this does NOT cover: an actual round trip through the web store, which
// needs an IndexedDB harness this repo does not have (no fake-indexeddb, no
// existing test touches web/libraryStore.js). Nor whether web's `default`
// scenario is the same world as desktop's — see .scratch/save-export-zip/spec.md §9.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import url from "node:url";
import { test } from "node:test";
import {
  ACCEPTED_GAME_BUNDLE_SCHEMAS,
  BUILT_IN_SCENARIO_IDS,
  GAME_BUNDLE_DATA_KEYS,
  GAME_BUNDLE_SCHEMA,
  OPTIONAL_GAME_BUNDLE_KEYS,
  TEMPLATE_WORLD_OVERRIDE_KEYS,
} from "./web/storeConstants.js";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SERVER_STORE = readFileSync(path.join(HERE, "..", "..", "server", "libraryStore.js"), "utf-8");

test("the web constants load without a web build", () => {
  // This file imported web/models.js once, which imports the web build's
  // generated country table. It passed on every machine that had run a web build
  // and failed on CI's clean checkout, where the tests run before any build, so
  // the beta installers stopped building. storeConstants.js is what a Node test
  // can import, and only while it imports nothing itself.
  const constants = readFileSync(path.join(HERE, "web", "storeConstants.js"), "utf-8");
  assert.equal(/^\s*(import[\s{*"']|export\s*[*{])/m.test(constants), false, "storeConstants.js imports nothing");
});

// The server's copies are module-private, as they should be — read them out of
// the source rather than widening its exports just for a test.
const serverConst = (name) => {
  const match = SERVER_STORE.match(new RegExp(`const ${name} = ([^;]+);`));
  assert.ok(match, `server/libraryStore.js still declares ${name}`);
  return match[1];
};
const serverStringList = (name) => [...serverConst(name).matchAll(/"([^"]+)"/g)].map((m) => m[1]);

test("both stores write and accept the same schema string", () => {
  assert.equal(serverStringList("GAME_BUNDLE_SCHEMA")[0], GAME_BUNDLE_SCHEMA);
  assert.ok(ACCEPTED_GAME_BUNDLE_SCHEMAS.has(GAME_BUNDLE_SCHEMA));
});

test("the schema carries this project's name, not the one it is an alternative to", () => {
  // The scenario bundle's "pax-historia-scenario-bundle/2" is a frozen wire
  // format kept for the bundles players already hold. A format minted now has no
  // such debt, and nothing else of ours should be named after another product.
  assert.match(GAME_BUNDLE_SCHEMA, /^open-historia-game-bundle\//);
});

test("both stores carry the same set of game data keys", () => {
  assert.deepEqual(
    serverStringList("GAME_BUNDLE_DATA_KEYS"),
    GAME_BUNDLE_DATA_KEYS,
    "a key on one side only means an exported game silently loses it in one direction",
  );
});

test("both stores agree on which entries may simply be absent", () => {
  assert.deepEqual(serverStringList("OPTIONAL_GAME_BUNDLE_KEYS"), [...OPTIONAL_GAME_BUNDLE_KEYS]);
});

test("both stores seed a fresh game from the same scenario world keys", () => {
  // The sixth mirrored constant, and the one that had drifted: the web copy
  // carried a duplicated five-key run and a `customGeometry` the server had
  // never heard of, so a game made on the web inherited one thing from its
  // scenario that the same game made on desktop did not.
  assert.deepEqual(
    serverStringList("TEMPLATE_WORLD_OVERRIDE_KEYS"),
    TEMPLATE_WORLD_OVERRIDE_KEYS,
    "a key on one side only means a fresh game silently stops inheriting it on that platform",
  );
  assert.equal(
    new Set(TEMPLATE_WORLD_OVERRIDE_KEYS).size,
    TEMPLATE_WORLD_OVERRIDE_KEYS.length,
    "no key is listed twice",
  );
});

test("both stores agree on which scenarios never need to travel", () => {
  const server = serverStringList("BUILT_IN_SCENARIO_IDS");
  // The server names them by constant (DEFAULT_SCENARIO_ID, CLASSIC_SCENARIO_ID),
  // so resolve those to their values before comparing.
  const resolved = serverConst("BUILT_IN_SCENARIO_IDS").includes("DEFAULT_SCENARIO_ID")
    ? [serverStringList("DEFAULT_SCENARIO_ID")[0], serverStringList("CLASSIC_SCENARIO_ID")[0]]
    : server;
  assert.deepEqual(resolved, [...BUILT_IN_SCENARIO_IDS]);
});

test("restore points are excluded from the bundle on both sides", () => {
  // They are ~40x the rest of a game and travel as their own zip entry, moved as
  // text so neither side ever parses 21 MB of them. A store that started putting
  // them in `data` would undo that without failing anything else.
  assert.equal(GAME_BUNDLE_DATA_KEYS.includes("snapshots"), false);
  assert.equal(serverStringList("GAME_BUNDLE_DATA_KEYS").includes("snapshots"), false);
});

// --- Platform guard --------------------------------------------------------
// Android's WebView cannot save a file at all: its download listener hands every
// URL to the system browser, and a blob: URL means nothing there (see
// saveDebugLog.js). The Diagnostics log copes by falling back to the clipboard;
// a 4 MB zip has no such fallback, so the two buttons that write one are hidden
// there instead of failing in silence. Read as text, like the log guards,
// because the thing being protected is an absence.
const readSource = (...parts) => readFileSync(path.join(HERE, "..", ...parts), "utf-8");

test("saving the log with the game is hidden where no file can be saved", () => {
  const settings = readSource("Game", "GameUI", "settings.jsx");
  const open = settings.indexOf("{!isNativeApp() && (");
  assert.notEqual(open, -1, "settings.jsx still gates something on !isNativeApp()");

  // The branch runs to its closing `)}` at the same indentation it opened on.
  const close = settings.indexOf("\n        )}", open);
  assert.notEqual(close, -1, "the gated branch closes as expected");
  const branch = settings.slice(open, close);

  assert.ok(branch.includes("Save log file + game"), "the log-plus-game button sits inside the !isNativeApp() branch");
  assert.ok(branch.includes("handleAttachGame"), "and it is that branch's button that runs it");
});

test("every game zip is saved through the deferred-revoke helper", () => {
  // Firefox cancels a download whose object URL is revoked in the same task as the
  // click, which libraryBar's older saveBlobToDisk does. An earlier version of this
  // test asserted only that gameZip.js CONTAINS a deferred revoke — which it did,
  // while the Games tab went on calling the old helper, so the guard passed and the
  // download stayed broken. Assert the call sites instead: what matters is which
  // function the blob is handed to, not that a good one exists somewhere.
  const gameZip = readSource("runtime", "gameZip.js");
  assert.match(gameZip, /setTimeout\(\(\) => URL\.revokeObjectURL/, "gameZip.js defers the revoke");

  for (const [where, ...parts] of [
    ["libraryBar.jsx", "Game", "GameUI", "libraryBar.jsx"],
    ["settings.jsx", "Game", "GameUI", "settings.jsx"],
  ]) {
    const text = readSource(...parts);
    for (const match of text.matchAll(/(\w+)\(blob, `\$\{[^}]+\}-game\.zip`\)/g)) {
      assert.equal(
        match[1],
        "saveGameZipToDisk",
        `${where} saves a game zip with ${match[1]}(), which must be saveGameZipToDisk`,
      );
    }
  }
});

test("Export is hidden where no file can be saved", () => {
  // The Diagnostics half was gated from the start; the card's menu row was not, so
  // Android offered an Export that cannot write a file. Both halves are checked
  // now — a gate on one of two buttons is the shape of the bug, not the fix.
  const bar = readSource("Game", "GameUI", "libraryBar.jsx");
  assert.match(bar, /isNativeApp/, "libraryBar consults the native-app gate");
  assert.match(
    bar,
    /isNativeApp\(\)\s*\?\s*\[\]\s*:\s*\[\[/,
    "the Export row is dropped from the card menu on a native build",
  );
});

test("settings.txt can never carry a key or a whole endpoint", () => {
  // The block that rides inside an exported game is the Logging file's own, and it
  // is redacted at the source: the key only ever as set/not set, the endpoint only
  // by host. This pins those two, because settings.txt travels to strangers.
  // One block per Fallback list entry (docs/world-state.md, "AI access").
  const settingsLog = readSource("runtime", "settingsLog.js");
  assert.match(settingsLog, /\["API key", text\(entry\.apiKey\) \? "set" : "not set"\]/, "the key is a yes/no, never a value");
  assert.match(settingsLog, /\["Endpoint", endpointHostForLog\(entry\.endpoint\)\]/, "an endpoint is reduced to its host");
  assert.equal(
    /\["']Endpoint["'], *(?:text\()?entry\.endpoint\)?\]/.test(settingsLog),
    false,
    "no raw endpoint is ever put in the block",
  );
  assert.equal(/entry\.apiKey\s*\]/.test(settingsLog), false, "no raw key is ever put in the block");

  const debugLog = readSource("runtime", "debugLog.js");
  assert.match(debugLog, /export const buildSettingsReport/, "the report the zip carries is built here");
  assert.match(debugLog, /settingsLines\(await readSettingsSnapshot\(\)\)/, "and it goes through the redacting builder");
});

test("a map too big to zip is refused before it is downloaded", () => {
  // The crash this prevents: a hub map bundles to 297 MB, and fetching it to find
  // that out is itself what kills the tab. The size check must therefore sit on
  // scenarioBytes, which the bundle already carries, and must run BEFORE the
  // exportScenarioBundle call.
  const gameZip = readSource("runtime", "gameZip.js");
  assert.match(gameZip, /MAX_EMBEDDED_SCENARIO_BYTES/, "there is a ceiling at all");

  const check = gameZip.indexOf("scenarioFitsInZip(scenarioRef)");
  const fetchAt = gameZip.indexOf("await exportScenarioBundle(");
  assert.ok(check > 0 && fetchAt > 0, "both the check and the download are present");
  assert.ok(check < fetchAt, "the size is checked before the scenario is downloaded, not after");
});

test("both stores weigh a scenario the same way", () => {
  // scenarioBundleBytes exists in both stores and both scale by the same base64
  // factor. If one side changed it, the client would allow an embed the other
  // would refuse, and the 32 MB ceiling would mean two different things.
  const server = SERVER_STORE.match(/Math\.round\(total \* ([\d.]+)\)/);
  assert.ok(server, "the server still scales a scenario folder by a base64 factor");
  const web = readSource("runtime", "web", "libraryStore.js").match(/byteLength \* ([\d.]+)\)/);
  assert.ok(web, "the web store still scales its assets by one too");
  assert.equal(web[1], server[1], "the two factors must agree or the ceiling means two things");
});
