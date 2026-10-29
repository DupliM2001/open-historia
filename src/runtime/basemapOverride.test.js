/*! Open Historia — the player's basemap pick: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/basemapOverride.test.js
//
// Settings > Map lets a player put a built-in basemap under the map. It may
// replace a scenario's built-in basemap, never a scenario's own map.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { DEFAULT_BASEMAP_ID, basemapOverrideFor, basemapSeaColour, basemapTileLoader, resolveBasemapId } from "./assets.js";

test("a player's pick replaces a scenario's built-in basemap", () => {
  assert.equal(basemapOverrideFor("dark-gray"), "dark-gray");
  assert.equal(resolveBasemapId({ overrideId: basemapOverrideFor("dark-gray"), scenarioId: "ocean" }), "dark-gray");
  // Nothing picked, or a value no build knows: the scenario's basemap.
  assert.equal(basemapOverrideFor(""), "");
  assert.equal(basemapOverrideFor("somewhere-else"), "");
  assert.equal(resolveBasemapId({ overrideId: basemapOverrideFor(""), scenarioId: "ocean-dark" }), "ocean-dark");
  assert.equal(resolveBasemapId({ overrideId: "", scenarioId: "" }), DEFAULT_BASEMAP_ID);
});

test("a scenario with a map of its own keeps it whatever the player picked", () => {
  assert.equal(basemapOverrideFor("dark-gray", { scenarioHasOwnMap: true }), "");
  assert.equal(basemapOverrideFor("ocean", { scenarioHasOwnMap: true }), "");
  assert.equal(basemapOverrideFor("dark-gray", { scenarioHasOwnMap: false }), "dark-gray");
});

test("the game map and Settings both follow the rule", () => {
  const world = fs.readFileSync(new URL("../Game/Map/World.jsx", import.meta.url), "utf8");
  assert.match(world, /basemapOverrideFor\(basemapOverride, \{ scenarioHasOwnMap: bgDeclared \}\)/);
  const settings = fs.readFileSync(new URL("../Game/GameUI/settings.jsx", import.meta.url), "utf8");
  // The pick is switched off, shown as the scenario's own, and says why.
  assert.match(settings, /const ownMap = Boolean\(background\?\.kind\);/);
  assert.match(settings, /value=\{ownMap \? "" : value\} disabled=\{ownMap\}/);
  assert.match(settings, /This scenario uses its own basemap, which cannot be replaced\./);
});

test("a basemap tile that fails on a busy connection is asked for again", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (calls.length === 1) throw new TypeError("Failed to fetch");
    if (calls.length === 2) return new Response("", { status: 503 });
    return new Response(new Uint8Array([1, 2, 3]));
  };
  try {
    // z5 is below the placeholder check, so only the tile itself is fetched.
    const { data } = await basemapTileLoader({ url: "ohbase://streets/5/10/12" }, new AbortController());
    assert.deepEqual([...new Uint8Array(data)], [1, 2, 3]);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((url) => url.includes("World_Street_Map/MapServer/tile/5/10/12")));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a 404 basemap tile is not asked for again", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("", { status: 404 }); };
  try {
    await assert.rejects(basemapTileLoader({ url: "ohbase://streets/5/10/12" }, new AbortController()), /HTTP 404/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("each light basemap names its sea colour", () => {
  assert.equal(basemapSeaColour("streets"), "#99d9f2");
  assert.equal(basemapSeaColour("ocean-dark"), null, "dark variants keep their own dark background");
});
