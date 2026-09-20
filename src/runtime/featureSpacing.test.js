/*! Open Historia — keeping counters and structures off each other: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/featureSpacing.test.js
//
// Runs in a bare checkout: featureSpacing.js imports nothing.
//
// Two ways this goes wrong, and both are visible on the map. Too timid, and four
// things ordered to one city are drawn as one counter. Too bold, and an army
// spaced off its neighbour is pushed over a border or into the sea. Both are
// pinned, along with the rule that settles a tie between them: a little overlap
// beats a wrong country.

import test from "node:test";
import assert from "node:assert/strict";

import { FOOTPRINT_KM, SPACING_PADDING, crowding, obstaclesOf, spaceOut } from "./featureSpacing.js";

const KHARKIV = { lng: 36.23, lat: 49.99 };
const unitAt = (lng, lat, id = "") => ({ id, lng, lat, radiusKm: FOOTPRINT_KM.unit });
const KM_PER_DEG_LAT = 110.574;
const gapKm = (a, b) => Math.hypot((a.lng - b.lng) * 111.32 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180), (a.lat - b.lat) * KM_PER_DEG_LAT);

test("a spot with nothing near it is left exactly where it was", () => {
    assert.deepEqual(spaceOut({ ...KHARKIV, obstacles: [] }), { ...KHARKIV, moved: false, clear: true });
    const far = spaceOut({ ...KHARKIV, obstacles: [unitAt(30, 45)] });
    assert.deepEqual(far, { ...KHARKIV, moved: false, clear: true });
});

test("a thing placed on top of another is moved just clear of it, and no further than it needs", () => {
    const placed = spaceOut({ ...KHARKIV, obstacles: [unitAt(KHARKIV.lng, KHARKIV.lat)] });
    assert.equal(placed.moved, true);
    assert.equal(placed.clear, true);
    const gap = gapKm(placed, KHARKIV);
    const room = FOOTPRINT_KM.unit * 2 * SPACING_PADDING;
    assert.ok(gap >= room - 0.5, `${gap} km is still touching (needs ${room})`);
    assert.ok(gap < room * 2, `${gap} km is further than it needed to go`);
});

test("four things sent to one city end up as four counters", () => {
    const standing = [];
    for (let index = 0; index < 4; index += 1) {
        const placed = spaceOut({ ...KHARKIV, obstacles: standing });
        assert.equal(placed.clear, true, `counter ${index + 1}`);
        standing.push(unitAt(placed.lng, placed.lat, `u${index}`));
    }
    for (let a = 0; a < standing.length; a += 1) {
        for (let b = a + 1; b < standing.length; b += 1) {
            assert.ok(gapKm(standing[a], standing[b]) >= FOOTPRINT_KM.unit * 2 * SPACING_PADDING - 0.5, `${a} and ${b} overlap`);
        }
    }
    // And they stay a cluster: the last is still plainly "at Kharkiv".
    assert.ok(gapKm(standing[3], KHARKIV) < 120);
});

test("a structure needs less room than a counter", () => {
    const beside = spaceOut({ ...KHARKIV, radiusKm: FOOTPRINT_KM.marker, obstacles: [{ ...KHARKIV, radiusKm: FOOTPRINT_KM.marker }] });
    const counters = spaceOut({ ...KHARKIV, obstacles: [unitAt(KHARKIV.lng, KHARKIV.lat)] });
    assert.ok(gapKm(beside, KHARKIV) < gapKm(counters, KHARKIV));
});

test("a thing that started inside its region is never spaced out of it", () => {
    // A strip 0.2 degrees wide (about 14 km): far too narrow to clear a counter sideways.
    const inside = (point) => point.lng >= 36.13 && point.lng <= 36.33 && point.lat >= 45 && point.lat <= 55;
    const placed = spaceOut({ ...KHARKIV, obstacles: [unitAt(KHARKIV.lng, KHARKIV.lat)], inside });
    assert.equal(inside(placed), true, JSON.stringify(placed));
    assert.equal(placed.moved, true);
    // It found room along the strip instead.
    assert.ok(Math.abs(placed.lat - KHARKIV.lat) > 0.2);
});

test("with nowhere clear, the least crowded spot is used rather than a wrong country", () => {
    // A box one footprint across, already holding a counter: there is no clear spot in it.
    const inside = (point) => Math.abs(point.lng - KHARKIV.lng) <= 0.1 && Math.abs(point.lat - KHARKIV.lat) <= 0.07;
    const others = [unitAt(KHARKIV.lng, KHARKIV.lat)];
    const placed = spaceOut({ ...KHARKIV, obstacles: others, inside });
    assert.equal(placed.clear, false);
    assert.equal(inside(placed), true);
    assert.ok(crowding(placed, FOOTPRINT_KM.unit, others) < crowding(KHARKIV, FOOTPRINT_KM.unit, others), "still better than where it started");
});

test("a thing placed at sea is not dragged ashore by the region rule", () => {
    const land = (point) => point.lat > 46;                       // the origin (44 N) is NOT inside
    const fleet = { lng: 33, lat: 44 };
    const placed = spaceOut({ ...fleet, obstacles: [unitAt(fleet.lng, fleet.lat)], inside: land });
    assert.equal(placed.clear, true);
    assert.ok(placed.lat < 46);
});

test("the same inputs give the same point", () => {
    const others = [unitAt(KHARKIV.lng, KHARKIV.lat), unitAt(36.6, 50.1)];
    assert.deepEqual(spaceOut({ ...KHARKIV, obstacles: others }), spaceOut({ ...KHARKIV, obstacles: others }));
});

test("bad input is returned as it came, never thrown on", () => {
    assert.deepEqual(spaceOut({ lng: "east", lat: 50 }), { lng: "east", lat: 50, moved: false, clear: false });
    assert.equal(spaceOut({ ...KHARKIV, obstacles: [{ lng: null, lat: 3 }, null, "junk"] }).moved, false);
    assert.equal(spaceOut().clear, false);
});

test("the obstacles of a world are its units and its structures, minus the thing being placed", () => {
    const world = {
        units: [{ id: "u1", lng: 1, lat: 2 }, { id: "u2", lng: 3, lat: 4 }, { id: "ghost", lng: null, lat: 4 }],
        markers: [{ id: "m1", lng: 5, lat: 6 }],
    };
    assert.deepEqual(obstaclesOf(world).map((o) => [o.id, o.radiusKm]), [["u1", 16], ["u2", 16], ["m1", 10]]);
    assert.deepEqual(obstaclesOf(world, { except: "u2" }).map((o) => o.id), ["u1", "m1"]);
    assert.deepEqual(obstaclesOf(null), []);
});
