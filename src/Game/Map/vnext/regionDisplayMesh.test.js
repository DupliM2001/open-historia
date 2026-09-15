/*! Open Historia — render-safe political region display mesh tests © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRegionDisplayRepairPlan,
  buildRenderSafeMultiPolygon,
  geometryToMultiPolygon,
  isExplicitAuthoredGeometry,
  multiPolygonArea,
  multiPolygonToGeometry,
  polygonNeedsRenderSubdivision,
  repairRegionDisplayMesh,
} from "./regionDisplayMesh.js";

const square = (x0, y0, x1, y1) => ({
  type: "Polygon",
  coordinates: [[
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ]],
});

const feature = (id, geometry, properties = {}) => ({
  type: "Feature",
  id,
  properties: { id, ...properties },
  geometry,
});

const polygonBounds = (polygon) => {
  const points = (polygon ?? []).flat();
  return {
    minX: Math.min(...points.map((point) => point[0])),
    minY: Math.min(...points.map((point) => point[1])),
    maxX: Math.max(...points.map((point) => point[0])),
    maxY: Math.max(...points.map((point) => point[1])),
  };
};

// Minimal axis-aligned clipper used only to exercise render-safety orchestration
// in Node without importing the optional/browser polygon-clipping dependency.
const rectangleClipper = {
  union: (subject) => subject,
  intersection: (subject, clip) => {
    const subjectPolygon = Array.isArray(subject?.[0]?.[0]?.[0]) ? subject[0] : subject;
    const a = polygonBounds(subjectPolygon);
    const b = polygonBounds(clip);
    const minX = Math.max(a.minX, b.minX);
    const minY = Math.max(a.minY, b.minY);
    const maxX = Math.min(a.maxX, b.maxX);
    const maxY = Math.min(a.maxY, b.maxY);
    if (!(minX < maxX && minY < maxY)) return [];
    return geometryToMultiPolygon(square(minX, minY, maxX, maxY));
  },
  difference: (subject) => subject,
};

test("numeric/dotless stock-like ids are not protected merely because gid0 is absent", () => {
  const numeric = feature("2634", square(0, 0, 2, 2), { owner: "Republic of Kazakhstan" });
  assert.equal(isExplicitAuthoredGeometry(numeric), false);
  const plan = buildRegionDisplayRepairPlan({ type: "FeatureCollection", features: [numeric] });
  assert.equal(plan.records[0].protected, false);
});

test("editor-authored reg_* and edited geometries are explicitly protected from neighbour subtraction", () => {
  assert.equal(isExplicitAuthoredGeometry(feature("reg_custom", square(0, 0, 2, 2))), true);
  assert.equal(isExplicitAuthoredGeometry(feature("KAZ.1_1", square(0, 0, 2, 2), { edited: true })), true);
});

test("dateline-spanning stock geometry is excluded from naive bbox overlap repair", () => {
  const collection = {
    type: "FeatureCollection",
    features: [
      feature("WRAP.1", square(-179, 0, 179, 4), { gid0: "WRP" }),
      feature("LOCAL.1", square(10, 1, 12, 3), { gid0: "LOC" }),
    ],
  };
  const plan = buildRegionDisplayRepairPlan(collection);
  assert.equal(plan.candidatePairCount, 0);
  assert.deepEqual(plan.records[0].clips, []);
  assert.deepEqual(plan.records[1].clips, []);
});

test("smaller stock-like region wins an overlap and clips the larger stock-like region", () => {
  const collection = {
    type: "FeatureCollection",
    features: [
      feature("BIG.1", square(0, 0, 10, 10), { gid0: "BIG" }),
      feature("SMALL.1", square(9, 9, 11, 11), { gid0: "SML" }),
    ],
  };
  const plan = buildRegionDisplayRepairPlan(collection);
  assert.deepEqual(plan.records[0].clips, [1]);
  assert.deepEqual(plan.records[1].clips, []);
  assert.equal(plan.plannedFeatureCount, 1);
});

test("authored or edited geometry is protected and stock-like display geometry yields to it", () => {
  const collection = {
    type: "FeatureCollection",
    features: [
      feature("STOCK.1", square(0, 0, 5, 5), { gid0: "AAA" }),
      feature("reg_drawn-region", square(4, 1, 6, 3), { owner: "Authoria" }),
      feature("EDIT.1", square(2, 4, 4, 6), { gid0: "AAA", edited: true }),
    ],
  };
  const plan = buildRegionDisplayRepairPlan(collection);
  assert.equal(plan.records[1].protected, true);
  assert.equal(plan.records[2].protected, true);
  assert.ok(plan.records[0].clips.includes(1));
  assert.ok(plan.records[0].clips.includes(2));
  assert.deepEqual(plan.records[1].clips, []);
  assert.deepEqual(plan.records[2].clips, []);
});

test("two explicitly authored features are never rewritten by automatic neighbour subtraction", () => {
  const collection = {
    type: "FeatureCollection",
    features: [
      feature("reg_drawn-a", square(0, 0, 2, 2), { owner: "A" }),
      feature("reg_drawn-b", square(1, 1, 3, 3), { owner: "B" }),
    ],
  };
  const plan = buildRegionDisplayRepairPlan(collection);
  assert.equal(plan.plannedFeatureCount, 0);
  assert.deepEqual(plan.records[0].clips, []);
  assert.deepEqual(plan.records[1].clips, []);
});

test("polygon helpers preserve simple geometry area through multi-polygon conversion", () => {
  const geometry = square(0, 0, 4, 3);
  const multi = geometryToMultiPolygon(geometry);
  assert.equal(multiPolygonArea(multi), 12);
  assert.deepEqual(multiPolygonToGeometry(multi), geometry);
});

test("large/complex polygons are identified for render-safe subdivision", () => {
  const longRectangle = geometryToMultiPolygon(square(0, 0, 10, 2))[0];
  const compactRectangle = geometryToMultiPolygon(square(0, 0, 1, 1))[0];
  assert.equal(polygonNeedsRenderSubdivision(longRectangle), true);
  assert.equal(polygonNeedsRenderSubdivision(compactRectangle), false);
});



test("production render-safe threshold subdivides medium-span polygons without changing canonical input", () => {
  const subject = geometryToMultiPolygon(square(0, 0, 2, 1));
  const original = JSON.stringify(subject);
  const result = buildRenderSafeMultiPolygon(rectangleClipper, subject);
  assert.equal(JSON.stringify(subject), original);
  assert.equal(result.changed, true);
  assert.equal(result.subdivided, true);
  assert.ok(result.geometry.length > 1);
  assert.ok(Math.abs(multiPolygonArea(result.geometry) - multiPolygonArea(subject)) < 1e-9);
});

test("render-safe subdivision preserves area while partitioning a large polygon", () => {
  const subject = geometryToMultiPolygon(square(0, 0, 10, 2));
  const original = JSON.stringify(subject);
  const result = buildRenderSafeMultiPolygon(rectangleClipper, subject, {
    maxPoints: 100,
    maxSpanDegrees: 3,
    maxDepth: 6,
    maxParts: 32,
  });

  assert.equal(JSON.stringify(subject), original);
  assert.equal(result.changed, true);
  assert.equal(result.subdivided, true);
  assert.ok(result.geometry.length > 1);
  assert.ok(Math.abs(multiPolygonArea(result.geometry) - multiPolygonArea(subject)) < 1e-9);
});

test("explicitly authored geometry is still render-safety subdivided without losing protection semantics", async () => {
  const authored = feature("reg_long", square(0, 0, 10, 2), { owner: "Authoria" });
  const result = await repairRegionDisplayMesh(
    { type: "FeatureCollection", features: [authored] },
    {
      clipper: rectangleClipper,
      renderSafeMaxPoints: 100,
      renderSafeMaxSpanDegrees: 3,
      yieldTask: async () => {},
    },
  );

  assert.equal(buildRegionDisplayRepairPlan({ type: "FeatureCollection", features: [authored] }).records[0].protected, true);
  assert.equal(result.stats.renderSafeFeatureCount, 1);
  assert.equal(result.stats.renderSafeSubdivisionCount, 1);
  assert.equal(result.data.features[0].geometry.type, "MultiPolygon");
});

test("repair output is display-only and never mutates canonical input features", async () => {
  const big = feature("BIG.1", square(0, 0, 10, 10), { gid0: "BIG" });
  const small = feature("SMALL.1", square(9, 9, 11, 11), { gid0: "SML" });
  const collection = { type: "FeatureCollection", features: [big, small] };
  const original = JSON.stringify(collection);
  const clippedBig = geometryToMultiPolygon(square(0, 0, 9, 10));
  const clipper = {
    difference: () => clippedBig,
  };

  const result = await repairRegionDisplayMesh(collection, {
    clipper,
    yieldEvery: 1,
    yieldTask: async () => {},
  });

  assert.equal(result.cancelled, false);
  assert.equal(JSON.stringify(collection), original);
  assert.notEqual(result.data.features[0], big);
  assert.equal(result.data.features[1], small);
  assert.equal(result.stats.repairedFeatureCount, 1);
});

test("repair fails open to canonical geometry when clipping would remove too much area", async () => {
  const big = feature("BIG.1", square(0, 0, 10, 10), { gid0: "BIG" });
  const small = feature("SMALL.1", square(9, 9, 11, 11), { gid0: "SML" });
  const collection = { type: "FeatureCollection", features: [big, small] };
  const tinyRemainder = geometryToMultiPolygon(square(0, 0, 1, 1));
  const result = await repairRegionDisplayMesh(collection, {
    clipper: { difference: () => tinyRemainder },
    yieldTask: async () => {},
  });
  assert.equal(result.data.features[0], big);
  assert.equal(result.stats.lossFallbackCount, 1);
});

test("repair can be cancelled without publishing a partial mesh", async () => {
  const collection = {
    type: "FeatureCollection",
    features: [
      feature("BIG.1", square(0, 0, 10, 10), { gid0: "BIG" }),
      feature("SMALL.1", square(9, 9, 11, 11), { gid0: "SML" }),
    ],
  };
  let checks = 0;
  const result = await repairRegionDisplayMesh(collection, {
    clipper: { difference: (subject) => subject },
    shouldCancel: () => ++checks > 1,
    yieldTask: async () => {},
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.data, null);
});
