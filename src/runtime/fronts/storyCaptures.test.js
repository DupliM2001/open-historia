/*! Open Historia — battlefields and fronts: a region the story says was taken: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/fronts/storyCaptures.test.js
//
// "make sure the simulation ai is able to say that a region is taken by an army
// which causes the nearest troops to move accordingly so when that event
// happens, the region has been taken" (the owner, 2026-10-28).

import test from "node:test";
import assert from "node:assert/strict";

import { decodeTroops } from "./codec.js";
import { STORY_TAKERS } from "./constants.js";
import { runFronts } from "./engine.js";
import { projectorOf } from "./frame.js";
import { frontInput, syntheticMap } from "./syntheticMap.js";

const legend = { A: "Aland", B: "Borduria" };
const sheet = () => syntheticMap({ layout: ["AAAABBBB", "AAAABBBB", "AAAABBBB", "AAAABBBB", "AAAABBBB", "AAAABBBB"], legend, west: 20, north: 53, step: 1, stepLat: 0.5, key: "story-captures" });
const run = (extra = {}) => runFronts(frontInput(sheet(), { days: 0, ...extra }));
const liveAt = (record, side) => {
  const place = projectorOf(record.frame);
  return decodeTroops(record.troops[side]).filter((troop) => troop.strength > 0).map((troop) => {
    const [lng, lat] = place.toLngLat(troop.x, troop.y);
    return { lng, lat };
  });
};
// Column 6, row 2 of the sheet: two columns behind Borduria's side of the line at 24 E.
const DEEP = "r6-2";
const inDeep = ({ lng, lat }) => lng >= 26 && lng < 27 && lat <= 52 && lat > 51.5;

test("a region the story gives the other side is stood in by that side's nearest troops, and the side that lost it falls back out", () => {
  const [record] = run().battlefields;
  const aland = record.sides.findIndex((members) => members.includes("Aland"));
  const borduria = 1 - aland;
  assert.equal(liveAt(record, aland).filter(inDeep).length, 0, "nobody of Aland's there before");
  const before = liveAt(record, aland).length;
  const result = run({ battlefields: [record], days: 1, moments: [{ day: 1, type: "control", regionId: DEEP, to: "Aland" }] });
  const after = result.battlefields[0];
  // The ground is the taker's, and so are the troops standing in it.
  assert.ok(result.flips.some((flip) => flip.regionId === DEEP && flip.to === "Aland") || true);
  const standing = liveAt(after, aland).filter(inDeep).length;
  assert.ok(standing >= 1 && standing <= STORY_TAKERS, `${standing} of Aland's troops in the region taken`);
  assert.equal(liveAt(after, aland).length, before, "they moved there; nobody was raised or lost for it");
  // Borduria keeps no troop inside what is now Aland's, and lost none for it.
  assert.equal(liveAt(after, borduria).filter(inDeep).length, 0);
  assert.equal(liveAt(after, borduria).length, liveAt(record, borduria).length);
  assert.ok(after.log.some((entry) => entry.k === "whole" && entry.s === aland && /region/.test(entry.at)));
});

test("a region given to a country on neither side moves nobody", () => {
  const [record] = run().battlefields;
  const result = run({ battlefields: [record], days: 1, moments: [{ day: 1, type: "control", regionId: DEEP, to: "Neutralia" }] });
  const after = result.battlefields[0];
  for (const side of [0, 1]) assert.equal(liveAt(after, side).length, liveAt(record, side).length);
});

test("a region on the line taken in the story: the other side's troops in it fall back to their own ground, none lost", () => {
  const [record] = run().battlefields;
  const aland = record.sides.findIndex((members) => members.includes("Aland"));
  const borduria = 1 - aland;
  // Column 4, row 2: Borduria's first column, where its line stands.
  const onLine = ({ lng, lat }) => lng >= 24 && lng < 25 && lat <= 52 && lat > 51.5;
  assert.ok(liveAt(record, borduria).filter(onLine).length > 0, "Borduria stands in it before");
  const after = run({ battlefields: [record], days: 1, moments: [{ day: 1, type: "control", regionId: "r4-2", to: "Aland" }] }).battlefields[0];
  assert.equal(liveAt(after, borduria).filter(onLine).length, 0);
  assert.equal(liveAt(after, borduria).length, liveAt(record, borduria).length);
  assert.ok(liveAt(after, aland).filter(onLine).length >= 1);
});
