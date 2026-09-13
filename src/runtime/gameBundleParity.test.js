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
} from "./web/models.js";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SERVER_STORE = readFileSync(path.join(HERE, "..", "..", "server", "libraryStore.js"), "utf-8");

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

test("Attach game is hidden where no file can be saved", () => {
  const settings = readSource("Game", "GameUI", "settings.jsx");
  const open = settings.indexOf("{!isNativeApp() && (");
  assert.notEqual(open, -1, "settings.jsx still gates something on !isNativeApp()");

  // The branch runs to its closing `)}` at the same indentation it opened on.
  const close = settings.indexOf("\n        )}", open);
  assert.notEqual(close, -1, "the gated branch closes as expected");
  const branch = settings.slice(open, close);

  assert.ok(branch.includes("Attach game"), "the Attach game button sits inside the !isNativeApp() branch");
  assert.ok(branch.includes("handleAttachGame"), "and it is that branch's button that runs it");
});

test("the zip is never handed to libraryBar's same-task revoke", () => {
  // Firefox cancels a download whose object URL is revoked in the same task as
  // the click, which libraryBar's older saveBlobToDisk does. gameZip.js has the
  // deferred revoke; a game export must go through that one.
  const gameZip = readSource("runtime", "gameZip.js");
  assert.match(gameZip, /setTimeout\(\(\) => URL\.revokeObjectURL/, "gameZip.js defers the revoke");
});
