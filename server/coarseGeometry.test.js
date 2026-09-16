// Run: node --test server/coarseGeometry.test.js
//
// The coarse regions copy the country picker draws instead of the full file.
// It must keep every region (as a speck at worst), its id and its properties,
// and lose almost all of the vertices.

import test from "node:test";
import assert from "node:assert/strict";

import {
  coarsenFeatureCollection,
  coarsenGeometry,
  countFeatureCollectionVertices,
} from "./coarseGeometry.js";

// A wobbly ring: a square with 200 near-collinear points per side.
const wobblySquare = (x, y, size, wobble = 0.001) => {
  const ring = [];
  const steps = 200;
  const edge = (from, to) => {
    for (let i = 0; i < steps; i += 1) {
      const t = i / steps;
      const px = from[0] + (to[0] - from[0]) * t;
      const py = from[1] + (to[1] - from[1]) * t;
      ring.push([px + (i % 2 ? wobble : -wobble), py + (i % 3 ? wobble : 0)]);
    }
  };
  edge([x, y], [x + size, y]);
  edge([x + size, y], [x + size, y + size]);
  edge([x + size, y + size], [x, y + size]);
  edge([x, y + size], [x, y]);
  ring.push([x, y]);
  return ring;
};

test("a region keeps its id and properties on a geometry hundreds of times lighter", () => {
  const data = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", id: "r1", properties: { id: "r1", name: "Gallia", owner: "Rome", claimants: ["Carthage"] }, geometry: { type: "Polygon", coordinates: [wobblySquare(0, 0, 5)] } },
      { type: "Feature", properties: { id: "r2", owner: "Carthage" }, geometry: { type: "MultiPolygon", coordinates: [[wobblySquare(10, 0, 3)], [wobblySquare(20, 0, 2)]] } },
    ],
  };
  const before = countFeatureCollectionVertices(data);
  const coarse = coarsenFeatureCollection(data);
  const after = countFeatureCollectionVertices(coarse);
  assert.equal(coarse.features.length, 2);
  assert.equal(coarse.features[0].id, "r1");
  assert.deepEqual(coarse.features[0].properties, { id: "r1", name: "Gallia", owner: "Rome", claimants: ["Carthage"] });
  assert.equal(coarse.features[1].id, undefined, "no id minted where there was none");
  assert.equal(coarse.features[1].geometry.type, "MultiPolygon");
  assert.equal(coarse.features[1].geometry.coordinates.length, 2, "both parts survive");
  assert.ok(before > 2000, `fixture has ${before} vertices`);
  assert.ok(after < before / 50, `coarsened to ${after} of ${before} vertices`);
  assert.ok(after >= 10, "a square needs its corners");
});

test("a region too small to see stays as a speck rather than vanishing", () => {
  const atoll = (x, y) => [[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y + 0.001], [x, y]];
  const geometry = { type: "MultiPolygon", coordinates: [[atoll(0, 0)], [atoll(2, 2)]] };
  const coarse = coarsenGeometry(geometry);
  assert.equal(coarse.type, "Polygon", "one speck, the largest ring");
  assert.ok(coarse.coordinates[0].length >= 4);
});

test("points and lines are not regions and are dropped; a hole too small to see goes on its own", () => {
  const data = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { id: "city" }, geometry: { type: "Point", coordinates: [1, 1] } },
      { type: "Feature", properties: { id: "r" }, geometry: { type: "Polygon", coordinates: [wobblySquare(0, 0, 5), [[1, 1], [1.001, 1], [1.001, 1.001], [1, 1.001], [1, 1]]] } },
    ],
  };
  const coarse = coarsenFeatureCollection(data);
  assert.equal(coarse.features.length, 1);
  assert.equal(coarse.features[0].geometry.coordinates.length, 1, "the invisible hole is dropped, the shell kept");
});
