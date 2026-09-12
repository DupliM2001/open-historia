/*! Open Historia — worker-safe polity geometry regression tests © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */
import test from "node:test";
import assert from "node:assert/strict";

import { aggregatePolityGeometry, aggregatePolityGeometryForOwners } from "./polityGeometry.js";

const region = (id, owner, x) => ({
  type: "Feature",
  properties: { id, owner, GID_0: owner.slice(0, 3).toUpperCase() },
  geometry: { type: "Polygon", coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] },
});

test("label geometry aggregation groups canonical ownership without polygon union", () => {
  const source = { type: "FeatureCollection", features: [region("a", "Alpha", 0), region("b", "Beta", 1)] };
  const result = aggregatePolityGeometry(source, { b: "Alpha" });
  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].properties.owner, "Alpha");
  assert.equal(result.features[0].properties.regionCount, 2);
  assert.equal(result.features[0].geometry.coordinates.length, 2);
});

test("affected-owner aggregation ignores unrelated polity geometry", () => {
  const source = { type: "FeatureCollection", features: [region("a", "Alpha", 0), region("b", "Beta", 1), region("c", "Gamma", 2)] };
  const result = aggregatePolityGeometryForOwners(source, { b: "Alpha" }, ["Alpha"]);
  assert.deepEqual(result.features.map((feature) => feature.properties.owner), ["Alpha"]);
  assert.equal(result.features[0].properties.regionCount, 2);
});
