/*! Open Historia — polities founded by receiving territory © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/polityFounding.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  FOUNDING_NOTE,
  collectFoundedPolities,
  foundPolityIfUnknown,
  foundingColor,
  foundingPolityChange,
  hexToRgb,
  isUnknownPolity,
} from "./polityFounding.js";

test("a founded polity's colour is a stable, vivid hex", () => {
  const color = foundingColor("Free State of Kharkiv");
  assert.match(color, /^#[0-9a-f]{6}$/);
  assert.equal(foundingColor("  free state of KHARKIV "), color, "case and padding do not change it");
  assert.notEqual(foundingColor("Donetsk People's Republic"), color);
  const [r, g, b] = hexToRgb(color);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  assert.ok(max - min >= 60, `not grey: ${color}`);
  assert.equal(hexToRgb("nope"), null);
});

test("the synthesised create carries the exact name, a colour and the founding note", () => {
  assert.deepEqual(foundingPolityChange(" Free State of Kharkiv "), {
    operation: "create",
    code: "Free State of Kharkiv",
    name: "Free State of Kharkiv",
    color: foundingColor("Free State of Kharkiv"),
    aliases: [],
    note: FOUNDING_NOTE,
  });
});

test("only receivers the map does not know are founded, once each", () => {
  const known = new Set(["russian federation", "ukraine"]);
  const founded = collectFoundedPolities(
    [
      { token: "Russian Federation", role: "transfer", path: "$.events[0].impacts" },
      { token: "Free State of Kharkiv", role: "transfer", path: "$.events[0].impacts" },
      { token: "free state of kharkiv", role: "control", path: "$.events[1].impacts" },
      { token: "Donbas Militia", role: "contest", path: "$.events[1].impacts" },
      { token: "Kurdistan", role: "claim", path: "$.events[2].impacts" },
      { token: "Ghost Loser", role: "loser", path: "$.events[2].impacts" },
      { token: "Ghost Clearer", role: "clear_contest", path: "$.events[2].impacts" },
      { token: "Unresolved polity", role: "transfer", path: "$.events[3].impacts" },
      { token: "   ", role: "transfer", path: "$.events[3].impacts" },
    ],
    { ownerIsKnown: (name) => known.has(name.toLowerCase()), sentinel: "Unresolved polity" },
  );
  assert.deepEqual([...founded.entries()], [
    ["free state of kharkiv", { name: "Free State of Kharkiv", path: "$.events[0].impacts" }],
    ["donbas militia", { name: "Donbas Militia", path: "$.events[1].impacts" }],
    ["kurdistan", { name: "Kurdistan", path: "$.events[2].impacts" }],
  ]);
  assert.equal(collectFoundedPolities(null).size, 0);
});

test("unknown means no record, not a stock country, and nowhere on the map", () => {
  const world = {
    polityOverrides: { "Kingdom of Belgium": { code: "Kingdom of Belgium", name: "Kingdom of Belgium" } },
    regionOwnershipOverrides: { "1": "Tile Owner" },
    regionSovereigntyOverrides: { "2": "Old Sovereign" },
    regionClaimants: { "3": ["Standing Claimant"] },
  };
  assert.equal(isUnknownPolity(world, "Free State of Kharkiv"), true);
  assert.equal(isUnknownPolity(world, "Kingdom of Belgium"), false, "has a record");
  assert.equal(isUnknownPolity(world, "France"), false, "a stock country may own through the tiles");
  assert.equal(isUnknownPolity(world, "tile owner"), false, "already an owner");
  assert.equal(isUnknownPolity(world, "Old Sovereign"), false, "already a sovereign");
  assert.equal(isUnknownPolity(world, "Standing Claimant"), false, "already a claimant");
  assert.equal(isUnknownPolity(world, ""), false);
  assert.equal(isUnknownPolity({}, "Anyone"), true);
});

test("founding writes an active record with a colour, and never twice", () => {
  const world = { polityOverrides: {}, regionOwnershipOverrides: {} };
  const colors = {};
  const record = foundPolityIfUnknown(world, colors, " Free State of Kharkiv ");
  assert.deepEqual(record, {
    aliases: [],
    code: "Free State of Kharkiv",
    color: foundingColor("Free State of Kharkiv"),
    name: "Free State of Kharkiv",
    note: FOUNDING_NOTE,
    status: "active",
  });
  assert.deepEqual(colors["Free State of Kharkiv"], hexToRgb(record.color));
  assert.equal(foundPolityIfUnknown(world, colors, "Free State of Kharkiv"), null, "already known now");
  assert.equal(foundPolityIfUnknown(world, colors, "France"), null, "stock countries are never founded here");
  assert.equal(Object.keys(world.polityOverrides).length, 1);
});

test("an author's colour is kept when the founded name already has one", () => {
  const world = {};
  const colors = { "Free State of Kharkiv": [1, 2, 3] };
  foundPolityIfUnknown(world, colors, "Free State of Kharkiv");
  assert.deepEqual(colors["Free State of Kharkiv"], [1, 2, 3]);
  assert.equal(world.polityOverrides["Free State of Kharkiv"].status, "active");
});
