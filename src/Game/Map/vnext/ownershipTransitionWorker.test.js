import test from "node:test";
import assert from "node:assert/strict";
import { sliceOwnershipTransitionFeature } from "./ownershipTransitionWorker.js";

const square = {
  type: "Feature",
  id: "r1",
  properties: { id: "r1", fromOwner: "A", toOwner: "B", sweepDx: 1, sweepDy: 0 },
  geometry: {
    type: "Polygon",
    coordinates: [[[0, 0], [10, 0], [10, 4], [0, 4], [0, 0]]],
  },
};

test("ownership transition slices preserve one region as ordered directional bands", async () => {
  globalThis.__OH_POLYGON_CLIPPER_TEST__ = {
    intersection(_subject, clipPolygon) { return [clipPolygon]; },
  };
  const slices = await sliceOwnershipTransitionFeature(square);
  delete globalThis.__OH_POLYGON_CLIPPER_TEST__;
  assert.ok(slices.length >= 8);
  assert.equal(slices[0].properties.id, "r1");
  const ts = slices.map((feature) => feature.properties.transitionT);
  assert.ok(ts.every((value) => value > 0 && value <= 1));
  assert.deepEqual([...ts].sort((a, b) => a - b), ts);
  assert.equal(ts.at(-1), 1);
  assert.ok(slices.every((feature) => feature.geometry.type === "MultiPolygon"));
});


test("high-latitude diagonal sweeps compensate raw lon/lat clipping for Mercator rendering", async () => {
  const highLatitude = {
    type: "Feature",
    id: "r-high",
    properties: { id: "r-high", fromOwner: "A", toOwner: "B", sweepDx: 1, sweepDy: 1 },
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 60], [10, 60], [10, 64], [0, 64], [0, 60]]],
    },
  };

  const clips = [];
  globalThis.__OH_POLYGON_CLIPPER_TEST__ = {
    intersection(_subject, clipPolygon) {
      clips.push(clipPolygon);
      return [clipPolygon];
    },
  };
  await sliceOwnershipTransitionFeature(highLatitude);
  delete globalThis.__OH_POLYGON_CLIPPER_TEST__;

  assert.ok(clips.length > 0);
  const ring = clips[0][0];
  const dx = ring[1][0] - ring[0][0];
  const dy = ring[1][1] - ring[0][1];
  assert.ok(dx > 0 && dy > 0);
  assert.ok(
    dy / dx > 0.35 && dy / dx < 0.65,
    "a 45-degree rendered sweep near 62N must use a shallower raw-latitude clip vector so Mercator magnification restores 45 degrees on screen",
  );
});
