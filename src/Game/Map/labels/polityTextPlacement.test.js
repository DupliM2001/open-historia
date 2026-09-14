import test from "node:test";
import assert from "node:assert/strict";
import {
  coverageGridContains,
  optimizeTerritorialArcPlacement,
} from "./polityTextPlacement.js";

const grid = ({ resolution = 24, predicate }) => ({
  resolution,
  bounds: [0, 0, 1, 1],
  rows: Array.from({ length: resolution }, (_, row) => (
    Array.from({ length: resolution }, (_, column) => {
      const x = (column + 0.5) / resolution;
      const y = (row + 0.5) / resolution;
      return predicate(x, y) ? "1" : "0";
    }).join("")
  )),
});

test("coverage grid classifies owned territory deterministically", () => {
  const coverage = grid({ predicate: (x, y) => x >= 0.2 && x <= 0.8 && y >= 0.3 && y <= 0.7 });
  assert.equal(coverageGridContains(coverage, [0.5, 0.5]), true);
  assert.equal(coverageGridContains(coverage, [0.05, 0.5]), false);
});

test("placement optimizer slides toward owned room instead of spilling across the edge", () => {
  // Territory occupies the right-hand side. A legacy anchor left of center should
  // not force the final label to stay there.
  const coverage = grid({ predicate: (x, y) => x >= 0.35 && x <= 0.96 && y >= 0.28 && y <= 0.72 });
  const result = optimizeTerritorialArcPlacement({
    anchor: [0.43, 0.5],
    preferredAngleDeg: 0,
    axisSpanWorld: 0.61,
    crossSpanWorld: 0.44,
    desiredSupportLength: 0.54,
    maxSupportLength: 0.59,
    bendRatio: 0.04,
    bendSign: 1,
    aspectRatio: 8,
    coverageGrid: coverage,
    samples: 64,
  });
  assert.ok(result);
  assert.ok(result.center[0] > 0.5, `expected east/right shift, got ${result.center[0]}`);
  assert.ok(result.ownCoverage > 0.88, `coverage=${result.ownCoverage}`);
  assert.ok(result.evaluated <= 130, `candidate budget regressed: ${result.evaluated}`);
});

test("placement optimizer recenters a high edge-biased label inside territorial mass", () => {
  const coverage = grid({ predicate: (x, y) => x >= 0.08 && x <= 0.92 && y >= 0.22 && y <= 0.78 });
  const result = optimizeTerritorialArcPlacement({
    anchor: [0.5, 0.27],
    preferredAngleDeg: 0,
    axisSpanWorld: 0.84,
    crossSpanWorld: 0.56,
    desiredSupportLength: 0.74,
    maxSupportLength: 0.81,
    bendRatio: 0.035,
    bendSign: 1,
    aspectRatio: 10,
    coverageGrid: coverage,
    samples: 64,
  });
  assert.ok(result);
  assert.ok(result.center[1] > 0.35, `expected inward/down shift, got ${result.center[1]}`);
  assert.ok(result.crossCentering > 0.7);
});

test("thin territory favors a land-supported candidate", () => {
  // Diagonal slender strip. Optimizer should find a diagonal orientation instead
  // of keeping a horizontal ocean-heavy arc.
  const coverage = grid({
    resolution: 32,
    predicate: (x, y) => Math.abs(y - (0.82 - x * 0.58)) < 0.085 && x > 0.1 && x < 0.9,
  });
  const result = optimizeTerritorialArcPlacement({
    anchor: [0.5, 0.53],
    preferredAngleDeg: -28,
    axisSpanWorld: 0.78,
    crossSpanWorld: 0.17,
    desiredSupportLength: 0.68,
    maxSupportLength: 0.75,
    bendRatio: 0.025,
    bendSign: 1,
    aspectRatio: 7,
    coverageGrid: coverage,
    samples: 64,
  });
  assert.ok(result);
  assert.ok(result.centerlineCoverage > 0.75, `centerline=${result.centerlineCoverage}`);
  assert.ok(result.ownCoverage > 0.6, `coverage=${result.ownCoverage}`);
  assert.ok(result.evaluated <= 130, `candidate budget regressed: ${result.evaluated}`);
});

test("multipart recovery shrinks away from a large internal water gap", () => {
  // Two nearby owned landmasses separated by a clear strait. A long word can
  // score well in aggregate by touching both islands, but that produces the
  // ugly 'bridge the sea' result. The optimizer should spend its compact
  // recovery budget and keep the chosen support on one continuous landmass.
  const coverage = grid({
    resolution: 40,
    predicate: (x, y) => (
      (x >= 0.05 && x <= 0.28 && y >= 0.2 && y <= 0.8)
      || (x >= 0.39 && x <= 0.96 && y >= 0.16 && y <= 0.84)
    ),
  });
  const result = optimizeTerritorialArcPlacement({
    anchor: [0.68, 0.5],
    preferredAngleDeg: 0,
    axisSpanWorld: 0.91,
    crossSpanWorld: 0.68,
    desiredSupportLength: 0.82,
    maxSupportLength: 0.88,
    bendRatio: 0.025,
    bendSign: 1,
    aspectRatio: 8.5,
    coverageGrid: coverage,
    samples: 64,
  });
  assert.ok(result);
  assert.ok(result.internalGapFraction <= 0.055, `internalGap=${result.internalGapFraction}`);
  assert.ok(result.ownCoverage > 0.84, `coverage=${result.ownCoverage}`);
  assert.ok(result.chordLength < 0.74, `expected compact recovery, chord=${result.chordLength}`);
  assert.ok(result.evaluated <= 165, `candidate budget regressed: ${result.evaluated}`);
});

test("wide-ribbon coastal overhang shrinks even when the centerline stays continuously owned", () => {
  // A rotated territorial corridor can keep its baseline entirely on land while
  // the rendered glyph ribbon still hangs far over water. The old multipart
  // recovery only looked for a centerline gap, so a Britain-like diagonal could
  // survive unchanged. Compact recovery must also react to poor ribbon coverage
  // and refine around the angle that actually won the broad search.
  const angle = 55 * Math.PI / 180;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const coverage = grid({
    resolution: 48,
    predicate: (x, y) => {
      const dx = x - 0.5;
      const dy = y - 0.5;
      const along = dx * ux + dy * uy;
      const across = dx * nx + dy * ny;
      return Math.abs(along) <= 0.30 && Math.abs(across) <= 0.09;
    },
  });
  const result = optimizeTerritorialArcPlacement({
    anchor: [0.5, 0.5],
    preferredAngleDeg: 40,
    axisSpanWorld: 0.80,
    crossSpanWorld: 0.45,
    desiredSupportLength: 0.74,
    maxSupportLength: 0.78,
    bendRatio: 0.03,
    bendSign: 1,
    aspectRatio: 7,
    coverageGrid: coverage,
    samples: 64,
  });
  assert.ok(result);
  assert.ok(result.internalGapFraction <= 0.055, `centerline should be continuous, gap=${result.internalGapFraction}`);
  assert.ok(result.ownCoverage > 0.95, `ribbon coverage=${result.ownCoverage}`);
  assert.ok(result.chordLength < 0.64, `expected compact ribbon, chord=${result.chordLength}`);
  assert.ok(result.evaluated <= 155, `candidate budget regressed: ${result.evaluated}`);
});
