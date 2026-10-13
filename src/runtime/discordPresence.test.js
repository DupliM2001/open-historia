/*! Open Historia — what Discord shows the player playing: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/discordPresence.test.js

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { PRESENCE_GONE, presenceAllowed, presenceFor } from "./discordPresence.js";
import { MAP_SETTING_KEYS } from "./mapSettings.js";
import { normalizePresence } from "../../server/discordPresence.js";

const game = { id: "g1", country: "FRA", currentDate: "2016-01-01" };

test("in a game: who, which scenario and the in-game date", () => {
  assert.deepEqual(presenceFor({ activeGame: game, playerName: "France", scenarioName: "Modern Day" }), {
    scene: "game",
    player: "France",
    scenario: "Modern Day",
    date: "1 January 2016",
  });
});

test("a year before AD 1 reads as BC", () => {
  const rome = presenceFor({ activeGame: { ...game, currentDate: "-0218-03-01" }, playerName: "Rome", scenarioName: "Punic Wars" });
  assert.equal(rome.date, "1 March 218 BC");
});

test("no game, no games, or the main menu over a game: the main menu", () => {
  assert.deepEqual(presenceFor({}), { scene: "menu" });
  assert.deepEqual(presenceFor({ activeGame: game, inMenu: true }), { scene: "menu" });
});

test("what the page sends is what the server accepts", () => {
  const sent = presenceFor({ activeGame: game, playerName: "France", scenarioName: "Modern Day" });
  assert.deepEqual(normalizePresence(JSON.parse(JSON.stringify(sent))), sent);
  assert.deepEqual(normalizePresence(presenceFor({})), { scene: "menu" });
});

test("the HUD reports it, and the server only takes it from this computer", () => {
  const hud = fs.readFileSync(new URL("../Game/GameUI/main.jsx", import.meta.url), "utf8");
  assert.match(hud, /useDiscordPresence\(presenceFor\(\{/);
  const server = fs.readFileSync(new URL("../../server/server.js", import.meta.url), "utf8");
  assert.match(server, /app\.post\("\/api\/presence", jsonParser, \(req, res\) => \{\s*if \(isLoopbackAddress\(req\.socket\?\.remoteAddress\)\) discordPresence\.update\(normalizePresence\(req\.body\)\);/);
});

// What the page has stored, for one read of the switch.
const withStored = (stored, run) => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (key) => (Object.hasOwn(stored, key) ? stored[key] : null) },
    configurable: true,
    writable: true,
  });
  try {
    return run();
  } finally {
    if (prior) Object.defineProperty(globalThis, "localStorage", prior);
    else delete globalThis.localStorage;
  }
};

test("the player's switch is on unless it was turned off", () => {
  withStored({}, () => assert.equal(presenceAllowed(), true, "a fresh install"));
  withStored({ [MAP_SETTING_KEYS.discordPresence]: "1" }, () => assert.equal(presenceAllowed(), true));
  withStored({ [MAP_SETTING_KEYS.discordPresence]: "0" }, () => assert.equal(presenceAllowed(), false));
  // Its own key: no other switch turns it off.
  withStored({ [MAP_SETTING_KEYS.liveSkipEvents]: "0" }, () => assert.equal(presenceAllowed(), true));
});

test("switched off, the page reports nothing more and says goodbye once", () => {
  const page = fs.readFileSync(new URL("./discordPresence.js", import.meta.url), "utf8");
  // No report is armed while the switch is off, and flipping it runs the
  // effect again.
  assert.match(page, /if \(!onLocalServer\(\) \|\| !allowed\) return undefined;\s*const timer = setTimeout\(\(\) => postPresence\(body\), PRESENCE_DEBOUNCE_MS\);/);
  assert.match(page, /\}, \[allowed, body\]\);/);
  // The goodbye goes on the way from on to off, and at no other time: this
  // effect follows the switch alone, not what is on screen.
  assert.match(page, /if \(wasAllowed\.current && !allowed && onLocalServer\(\)\) postPresence\(JSON\.stringify\(PRESENCE_GONE\)\);\s*wasAllowed\.current = allowed;\s*\}, \[allowed\]\);/);
  // And the goodbye is what the server reads as nothing to show.
  assert.equal(normalizePresence(JSON.parse(JSON.stringify(PRESENCE_GONE))), null);
  // Those are the only places the page talks to the route.
  assert.equal(page.split("postPresence(").length - 1, 2, "the report and the goodbye");
  assert.equal(page.split("/api/presence").length - 1, 1, "the one request");
  // The switch is followed from this window and from another one of the same game.
  assert.match(page, /window\.addEventListener\("mapSettings:updated", read\);\s*window\.addEventListener\("storage", read\);/);
});

test("Settings has the switch, only where there is a Discord app to tell", () => {
  const settings = fs.readFileSync(new URL("../Game/GameUI/settings.jsx", import.meta.url), "utf8");
  assert.match(settings, /const discord = presenceAvailable\(\);/);
  assert.match(settings, /\{discord && \(\s*<>\s*<Toggle label="Show what I am playing on Discord" enabled=\{discordPresenceOn\} onToggle=\{onToggleDiscordPresence\} \/>/);
  assert.match(settings, /"Discord shows the country you play, the scenario and the in-game date to people who can see your activity\. Desktop app only\."/);
  // Stored with the other switches, on by default, and announced when flipped.
  assert.match(settings, /discordPresence: getMapSettingDefaultOn\(MAP_SETTING_KEYS\.discordPresence\),/);
  assert.match(settings, /updateMapSetting\("discordPresence", MAP_SETTING_KEYS\.discordPresence, !mapSettings\.discordPresence\)/);
  const page = fs.readFileSync(new URL("./discordPresence.js", import.meta.url), "utf8");
  assert.match(page, /export const presenceAvailable = onLocalServer;/, "the row and the reports are decided by the same test");
});
