/*! Open Historia — targeted malformed-region render repair tests © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  analyzeRegionRenderSafety,
  buildRegionRenderRepair,
  geometryToMultiPolygon,
  multiPolygonArea,
  ringHasPrecisionHazard,
  ringHasSelfIntersection,
  simplifyPrecisionHazards,
  stripDegenerateDetachedPolygons,
} from "./regionRenderRepair.js";

const square = (x0 = 0, y0 = 0, size = 1) => [[
  [x0, y0],
  [x0 + size, y0],
  [x0 + size, y0 + size],
  [x0, y0 + size],
  [x0, y0],
]];

test("clean compact polygons remain outside the repair path", () => {
  const geometry = { type: "Polygon", coordinates: square() };
  assert.deepEqual(analyzeRegionRenderSafety(geometry), {
    supported: true,
    unsafe: false,
    invalidRing: false,
    detachedSliverCount: 0,
    precisionHazard: false,
  });
});

test("non-adjacent self crossings are detected while redundant consecutive vertices are tolerated", () => {
  const bowTie = [[0, 0], [4, 0], [1, 4], [4, 4], [0, 0]];
  assert.equal(ringHasSelfIntersection(bowTie), true);

  const redundantSquare = [[0, 0], [1, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  assert.equal(ringHasSelfIntersection(redundantSquare), false);
});

test("line-like detached garbage shells are removed but compact tiny islands survive", () => {
  const main = square(0, 0, 10);
  const garbage = [[
    [20, 0],
    [30, 0.001],
    [20, 0.0000001],
    [20, 0],
  ]];
  const tinyIsland = square(40, 0, 0.01);
  const result = stripDegenerateDetachedPolygons([main, garbage, tinyIsland]);
  assert.equal(result.changed, true);
  assert.equal(result.removedCount, 1);
  assert.equal(result.geometry.length, 2);
  assert.deepEqual(result.geometry[0], main);
  assert.deepEqual(result.geometry[1], tinyIsland);
});


test("precision-hazard cleanup removes only redundant long-chord vertices", () => {
  const ring = [[
    [0, 0],
    [1, 0.000001],
    [2, 0],
    [2, 1],
    [2, 1],
    [0, 1],
    [0, 0],
  ]];
  assert.equal(ringHasPrecisionHazard(ring[0]), true);
  const result = simplifyPrecisionHazards([ring]);
  assert.equal(result.changed, true);
  assert.ok(result.removedCount >= 2);
  assert.equal(result.geometry[0][0][0][0], 0);
});

test("precision-hazard cleanup removes duplicate-backed near-collinear hairpins", () => {
  const ring = [[
    [0, 0],
    [0.00001, 1],
    [0.00002, 0.4],
    [0.00002, 0.4],
    [2, 0.4],
    [2, -1],
    [0, -1],
    [0, 0],
  ]];
  assert.equal(ringHasPrecisionHazard(ring[0]), true);
  const before = multiPolygonArea([ring]);
  const result = simplifyPrecisionHazards([ring]);
  const after = multiPolygonArea(result.geometry);
  assert.equal(result.changed, true);
  assert.ok(result.removedCount >= 2);
  assert.ok(Math.abs(after - before) / before < 0.0025);
});

test("sliver-only repair preserves canonical identity/properties and changes geometry only", async () => {
  const main = square(0, 0, 10);
  const garbage = [[
    [20, 0],
    [30, 0.001],
    [20, 0.0000001],
    [20, 0],
  ]];
  const source = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { id: "r1", owner: "Test Republic", gid0: "TST", name: "Test" },
      geometry: { type: "MultiPolygon", coordinates: [main, garbage] },
    }],
  };
  const before = multiPolygonArea(geometryToMultiPolygon(source.features[0].geometry));
  const result = await buildRegionRenderRepair(source, { yieldTask: async () => {} });
  assert.equal(result.cancelled, false);
  assert.deepEqual(result.repairedIds, ["r1"]);
  assert.equal(result.data.features.length, 1);
  assert.deepEqual(result.data.features[0].properties, source.features[0].properties);
  assert.equal(result.data.features[0].geometry.type, "Polygon");
  const after = multiPolygonArea(geometryToMultiPolygon(result.data.features[0].geometry));
  assert.ok(Math.abs(after - before) / before < 0.0025);
});

test("self-intersection normalization is accepted only when output is structurally safe and area-preserving", async () => {
  const crossing = [[
    [0, 0],
    [4, 0],
    [1, 4],
    [4, 4],
    [0, 0],
  ]];
  const source = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { id: "cross", owner: "Test" },
      geometry: { type: "Polygon", coordinates: crossing },
    }],
  };
  // The raw crossing has shoelace area 2. Return a valid area-2 rectangle as a
  // deterministic stand-in for polygon-clipping's normalization in this unit.
  const clipper = {
    union: () => [[[
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
      [0, 0],
    ]]],
  };
  const result = await buildRegionRenderRepair(source, { clipper, yieldTask: async () => {} });
  assert.deepEqual(result.repairedIds, ["cross"]);
  assert.equal(result.stats.normalizedFeatureCount, 1);
  assert.equal(analyzeRegionRenderSafety(result.data.features[0].geometry).unsafe, false);
});

test("the current Fault Lines seed exposes the three reported pathology classes to the generic detector", () => {
  const seed = JSON.parse(fs.readFileSync(
    new URL("../../../../server/seed/default/regions.geojson", import.meta.url),
    "utf8",
  ));
  const byName = new Map(seed.features.map((feature) => [feature?.properties?.name, feature]));

  const graz = analyzeRegionRenderSafety(byName.get("Graz")?.geometry);
  const karagandy = analyzeRegionRenderSafety(byName.get("Karagandy")?.geometry);
  const alMinya = analyzeRegionRenderSafety(byName.get("Al Minya")?.geometry);
  const alBinya = analyzeRegionRenderSafety(byName.get("Al Binya")?.geometry);
  const westernDesert = analyzeRegionRenderSafety(byName.get("Egyptian Western Desert")?.geometry);
  const siwa = analyzeRegionRenderSafety(byName.get("Siwa Oasis")?.geometry);

  assert.equal(graz.unsafe, true);
  assert.equal(graz.invalidRing, false);
  assert.ok(graz.detachedSliverCount >= 1);

  assert.equal(karagandy.unsafe, true);
  assert.equal(karagandy.invalidRing, true);

  assert.equal(alMinya.unsafe, true);
  assert.equal(alMinya.invalidRing, false);
  assert.ok(alMinya.detachedSliverCount >= 1);

  // The persistent Egypt screenshot actually contains two distinct artifacts.
  // Al Binya carries the long-chord form, while Egyptian Western Desert and
  // Siwa carry duplicate-backed near-collinear hairpins. Their raw polygons are
  // GEOS-valid, but all three are hostile tessellation inputs on some GPUs.
  assert.equal(alBinya.unsafe, true);
  assert.equal(alBinya.invalidRing, false);
  assert.equal(alBinya.precisionHazard, true);
  assert.equal(westernDesert.unsafe, true);
  assert.equal(westernDesert.invalidRing, false);
  assert.equal(westernDesert.precisionHazard, true);
  assert.equal(siwa.unsafe, true);
  assert.equal(siwa.invalidRing, false);
  assert.equal(siwa.precisionHazard, true);

  // Keep this targeted: the repair path should remain a small minority of the
  // world rather than silently becoming another whole-map display mesh.
  const unsafeCount = seed.features.reduce(
    (count, feature) => count + (analyzeRegionRenderSafety(feature?.geometry).unsafe ? 1 : 0),
    0,
  );
  assert.ok(unsafeCount > 0);
  assert.ok(unsafeCount < seed.features.length * 0.05);
});
