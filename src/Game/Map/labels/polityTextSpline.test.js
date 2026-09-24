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

test("PTR-1 Chaikin smoothing preserves endpoints and increases path resolution", async () => {
  const { smoothPolylineChaikin } = await import("./polityTextSpline.js");
  const input = [[0, 0], [1, 1], [2, 0]];
  const output = smoothPolylineChaikin(input, 3);
  assert.deepEqual(output[0], input[0]);
  assert.deepEqual(output[output.length - 1], input[input.length - 1]);
  assert.ok(output.length > input.length);
  assert.ok(maxTangentTurnDegrees(output) < maxTangentTurnDegrees(input));
});

test("PTR-1 support window extracts the requested centered arc length", async () => {
  const { cumulativeArcLengths, extractCenteredSubpathByArcLength } = await import("./polityTextSpline.js");
  const line = [[0, 0], [10, 0]];
  const support = extractCenteredSubpathByArcLength(line, 4, { samples: 17 });
  const { total } = cumulativeArcLengths(support);
  assert.ok(Math.abs(total - 4) < 1e-9);
  assert.ok(Math.abs(support[0][0] - 3) < 1e-9);
  assert.ok(Math.abs(support[support.length - 1][0] - 7) < 1e-9);
});

test("PTR-1.3 canonical arc removes S-curves and keeps one curvature sign", async () => {
  const { canonicalSingleArcFromPolyline } = await import("./polityTextSpline.js");
  const input = [
    [0, 0],
    [2, 0.8],
    [4, -0.7],
    [6, -1.0],
    [8, 0.5],
    [10, 0],
  ];
  const arc = canonicalSingleArcFromPolyline(input, { samples: 128 });
  assert.equal(arc.length, 128);

  let previousCross = 0;
  let signChanges = 0;
  for (let index = 1; index < arc.length - 1; index += 1) {
    const ax = arc[index][0] - arc[index - 1][0];
    const ay = arc[index][1] - arc[index - 1][1];
    const bx = arc[index + 1][0] - arc[index][0];
    const by = arc[index + 1][1] - arc[index][1];
    const cross = ax * by - ay * bx;
    if (Math.abs(cross) < 1e-12) continue;
    if (previousCross !== 0 && Math.sign(cross) !== Math.sign(previousCross)) signChanges += 1;
    previousCross = cross;
  }
  assert.equal(signChanges, 0);
  assert.ok(maxTangentTurnDegrees(arc) < 0.25);
});

test("PTR-1.3 canonical arc follows the dominant side of a noisy worker corridor", async () => {
  const { canonicalSingleArcFromPolyline } = await import("./polityTextSpline.js");
  // Early samples dip below the chord, but the stronger/larger body is above it.
  const input = [
    [0, 0],
    [2, -0.35],
    [4, -0.15],
    [6, 0.75],
    [8, 1.0],
    [10, 0],
  ];
  const arc = canonicalSingleArcFromPolyline(input, { samples: 129 });
  const middle = arc[Math.floor(arc.length / 2)];
  assert.ok(middle[1] > 0, `expected a single positive bow, got y=${middle[1]}`);
});

test("PTR-1.3 canonical arc keeps genuinely straight baselines straight", async () => {
  const { canonicalSingleArcFromPolyline } = await import("./polityTextSpline.js");
  const input = [[0, 0], [2, 0.002], [5, -0.001], [8, 0.001], [10, 0]];
  const arc = canonicalSingleArcFromPolyline(input, { samples: 128 });
  const maxDeviation = Math.max(...arc.map(([, y]) => Math.abs(y)));
  assert.ok(maxDeviation < 0.01);
});


test("PTR-1.4 single-arc calibration allows a stronger but still monotonic C-bow", async () => {
  const { canonicalSingleArcFromPolyline } = await import("./polityTextSpline.js");
  const input = [[0, 0], [2, 0.5], [4, 0.8], [6, 0.7], [8, 0.4], [10, 0]];
  const oldArc = canonicalSingleArcFromPolyline(input, {
    samples: 129,
    bendScale: 0.85,
    maxBendRatio: 0.06,
  });
  const newArc = canonicalSingleArcFromPolyline(input, {
    samples: 129,
    bendScale: 1.02,
    maxBendRatio: 0.072,
  });
  const middle = Math.floor(newArc.length / 2);
  assert.ok(Math.abs(newArc[middle][1]) > Math.abs(oldArc[middle][1]) * 1.15);

  let previousCross = 0;
  let signChanges = 0;
  for (let index = 1; index < newArc.length - 1; index += 1) {
    const ax = newArc[index][0] - newArc[index - 1][0];
    const ay = newArc[index][1] - newArc[index - 1][1];
    const bx = newArc[index + 1][0] - newArc[index][0];
    const by = newArc[index + 1][1] - newArc[index][1];
    const cross = ax * by - ay * bx;
    if (Math.abs(cross) < 1e-12) continue;
    if (previousCross !== 0 && Math.sign(cross) !== Math.sign(previousCross)) signChanges += 1;
    previousCross = cross;
  }
  assert.equal(signChanges, 0);
});

test("PTR-1.5 axis arc remains a single signed curve at arbitrary orientation", async () => {
  const { singleArcFromAxis, signedBendMetrics } = await import("./polityTextSpline.js");
  const points = singleArcFromAxis({
    center: [0.5, 0.5],
    angleDeg: 37,
    chordLength: 0.2,
    bendRatio: 0.05,
    bendSign: -1,
    samples: 128,
  });
  const bend = signedBendMetrics(points);
  assert.equal(bend.sign, -1);
  assert.ok(bend.bendRatio > 0.04 && bend.bendRatio < 0.06);
  assert.ok(maxTangentTurnDegrees(points) < 1);
});
