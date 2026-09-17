/*! Open Historia — what the territory director is shown of the map © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/AI/nativeTerritoryDirector.state.test.js
//
// Runs without node_modules: nativeTerritoryDirector.js imports nothing.
//
// A live 30-day jump on the built-in scenario sent this narrow pass 215,000
// characters, five times (every lookup round re-sends the request): about a
// million characters, 40% of what the whole jump spent. Nearly all of it was
// regionOwnershipOverrides, which on a hand-drawn world has a row for EVERY
// region — 4,848 of `"2014": "Ukraine"`, a numeric id and an owner, no name,
// nothing a model can reason from. The pass needs the map's non-normal state and
// can look anything else up. These pin what it still gets, and that a quiet map
// costs almost nothing.

import test from "node:test";
import assert from "node:assert/strict";

import { TERRITORIAL_STATE_ROW_CAP, summarizeTerritorialState } from "./nativeTerritoryDirector.js";

const handDrawnWorld = (regionCount) => {
  const regionOwnershipOverrides = {};
  for (let id = 1; id <= regionCount; id += 1) regionOwnershipOverrides[String(id)] = id % 2 ? "Ukraine" : "Russian Federation";
  return { regionOwnershipOverrides, regionSovereigntyOverrides: {}, regionClaimants: {} };
};

test("a map at peace costs almost nothing, however many regions it has", () => {
  const world = handDrawnWorld(4848);
  const before = JSON.stringify({
    regionOwnershipOverrides: world.regionOwnershipOverrides,
    regionSovereigntyOverrides: world.regionSovereigntyOverrides,
    regionClaimants: world.regionClaimants,
  }, null, 2).length;
  const state = summarizeTerritorialState(world, []);
  const after = JSON.stringify(state).length;
  assert.deepEqual(state.regionOwnershipOverrides, {});
  assert.ok(after < 400, `a quiet map should be a few hundred characters, was ${after}`);
  assert.ok(before > 100000, `the old dump of the same world was ${before}`);
});

test("an occupied region keeps its controller, its sovereign and its claimants", () => {
  const world = handDrawnWorld(100);
  world.regionOwnershipOverrides["7"] = "Russian Federation";
  world.regionSovereigntyOverrides["7"] = "Ukraine";
  world.regionClaimants["7"] = ["Ukraine"];
  world.regionClaimants["9"] = ["Poland"]; // disputed, not occupied
  const state = summarizeTerritorialState(world, []);
  assert.deepEqual(state.regionOwnershipOverrides, { 7: "Russian Federation", 9: "Ukraine" });
  assert.deepEqual(state.regionSovereigntyOverrides, { 7: "Ukraine" });
  assert.deepEqual(state.regionClaimants, { 7: ["Ukraine"], 9: ["Poland"] });
  assert.equal("omittedRegions" in state, false);
  assert.match(state.scope, /find_region or region_info/);
});

test("the stores are copies, so the analyzer cannot reach back into the world", () => {
  const world = handDrawnWorld(4);
  world.regionClaimants["1"] = ["Poland"];
  const state = summarizeTerritorialState(world, []);
  state.regionClaimants["1"].push("Spain");
  assert.deepEqual(world.regionClaimants["1"], ["Poland"]);
});

test("when the cap bites, the front the events are about is what survives it", () => {
  const world = handDrawnWorld(10);
  const total = TERRITORIAL_STATE_ROW_CAP + 50;
  // A long list of someone else's disputes first...
  for (let index = 0; index < total; index += 1) {
    world.regionOwnershipOverrides[`far-${index}`] = "Brazil";
    world.regionClaimants[`far-${index}`] = ["Argentina"];
  }
  // ...and the one this jump's events are actually about, last.
  world.regionOwnershipOverrides.donbas = "Russian Federation";
  world.regionSovereigntyOverrides.donbas = "Ukraine";
  const state = summarizeTerritorialState(world, [{ title: "Ukraine counter-attacks", description: "Ukrainian forces push east." }]);
  assert.equal(Object.keys(state.regionClaimants).length + Object.keys(state.regionSovereigntyOverrides).length, TERRITORIAL_STATE_ROW_CAP);
  assert.equal(state.regionSovereigntyOverrides.donbas, "Ukraine", "the named front must survive the cap");
  assert.equal(state.omittedRegions, 51);
});

test("the same world gives the same prompt, so a lookup round can be a cache hit", () => {
  const world = handDrawnWorld(50);
  world.regionClaimants["3"] = ["Poland"];
  world.regionSovereigntyOverrides["5"] = "Ukraine";
  const candidates = [{ title: "Poland protests", description: "A note is delivered." }];
  assert.equal(JSON.stringify(summarizeTerritorialState(world, candidates)), JSON.stringify(summarizeTerritorialState(world, candidates)));
});

test("a world with no stores at all is an empty state, not a crash", () => {
  for (const world of [null, undefined, {}, { regionOwnershipOverrides: "nope" }]) {
    const state = summarizeTerritorialState(world, null);
    assert.deepEqual(state.regionOwnershipOverrides, {});
    assert.deepEqual(state.regionClaimants, {});
  }
});
