import test from "node:test";
import assert from "node:assert/strict";
import {
  cumulativeArcLengths,
  maxTangentTurnDegrees,
  resamplePolylineByArcLength,
  sampleCubicBezier,
} from "./polityTextSpline.js";

test("PTR-0 support curve is densely sampled and arc-length monotonic", () => {
  const points = sampleCubicBezier({
    p0: [37, 52],
    p1: [55, 62.6],
    p2: [98, 63],
    p3: [120, 54],
    samples: 256,
  });
  assert.equal(points.length, 256);
  const { cumulative, total } = cumulativeArcLengths(points);
  assert.ok(total > 0);
  for (let index = 1; index < cumulative.length; index += 1) {
    assert.ok(cumulative[index] > cumulative[index - 1]);
  }
});

test("PTR-0 cubic support has no glyph-scale tangent hinge", () => {
  const points = sampleCubicBezier({
    p0: [37, 52],
    p1: [55, 62.6],
    p2: [98, 63],
    p3: [120, 54],
    samples: 256,
  });
  assert.ok(maxTangentTurnDegrees(points) < 0.5);
});


test("PTR-0.2 arc-length resampling produces equal map-distance support samples", () => {
  const raw = sampleCubicBezier({
    p0: [0, 0],
    p1: [0.1, 4],
    p2: [9.9, 4],
    p3: [10, 0],
    samples: 32,
  });
  const points = resamplePolylineByArcLength(raw, 96);
  assert.equal(points.length, 96);
  const distances = [];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
    ));
  }
  const average = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  const maxError = Math.max(...distances.map((value) => Math.abs(value - average)));
  assert.ok(maxError / average < 0.02);
});
