/*! Open Historia — PTR territorial candidate placement optimizer © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

import { cumulativeArcLengths, singleArcFromAxis } from "./polityTextSpline.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const radians = (degrees) => (Number(degrees) || 0) * Math.PI / 180;

const validCoverageGrid = (grid) => (
  grid
  && Number.isInteger(Number(grid.resolution))
  && Number(grid.resolution) >= 8
  && Array.isArray(grid.bounds)
  && grid.bounds.length === 4
  && grid.bounds.every((value) => Number.isFinite(Number(value)))
  && Array.isArray(grid.rows)
  && grid.rows.length === Number(grid.resolution)
);

export const coverageGridContains = (grid, point) => {
  if (!validCoverageGrid(grid) || !Array.isArray(point) || point.length < 2) return false;
  const resolution = Number(grid.resolution);
  const [minX, minY, maxX, maxY] = grid.bounds.map(Number);
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0)) return false;
  const x = Number(point[0]);
  const y = Number(point[1]);
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  const column = clamp(Math.floor(((x - minX) / width) * resolution), 0, resolution - 1);
  const row = clamp(Math.floor(((y - minY) / height) * resolution), 0, resolution - 1);
  return String(grid.rows[row] ?? "")[column] === "1";
};

export const coverageGridCentroid = (grid) => {
  if (!validCoverageGrid(grid)) return null;
  const resolution = Number(grid.resolution);
  const [minX, minY, maxX, maxY] = grid.bounds.map(Number);
  const width = maxX - minX;
  const height = maxY - minY;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let row = 0; row < resolution; row += 1) {
    const values = String(grid.rows[row] ?? "");
    for (let column = 0; column < resolution; column += 1) {
      if (values[column] !== "1") continue;
      sumX += minX + ((column + 0.5) / resolution) * width;
      sumY += minY + ((row + 0.5) / resolution) * height;
      count += 1;
    }
  }
  return count > 0 ? [sumX / count, sumY / count] : null;
};

const sampleRibbonCoverage = ({ points, aspectRatio, coverageGrid, alongSamples = 28 }) => {
  if (!Array.isArray(points) || points.length < 2 || !(Number(aspectRatio) > 0)) {
    return {
      ownCoverage: 0,
      centerlineCoverage: 0,
      internalGapFraction: 1,
      edgeOutsideFraction: 1,
    };
  }
  const { total } = cumulativeArcLengths(points);
  if (!(total > 0)) {
    return {
      ownCoverage: 0,
      centerlineCoverage: 0,
      internalGapFraction: 1,
      edgeOutsideFraction: 1,
    };
  }

  const height = total / Number(aspectRatio);
  const halfHeight = height / 2;
  const across = [-0.82, -0.42, 0, 0.42, 0.82];
  const samples = Math.max(8, Math.min(points.length, Math.floor(alongSamples)));
  let inside = 0;
  let totalSamples = 0;
  let centerInside = 0;
  const centerlineInside = [];

  for (let sample = 0; sample < samples; sample += 1) {
    const index = Math.round((points.length - 1) * (sample / (samples - 1)));
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const point = points[index];
    let tx = next[0] - previous[0];
    let ty = next[1] - previous[1];
    const tangentLength = Math.hypot(tx, ty) || 1;
    tx /= tangentLength;
    ty /= tangentLength;
    const nx = ty;
    const ny = -tx;

    const centerOwned = coverageGridContains(coverageGrid, point);
    centerlineInside.push(centerOwned);
    if (centerOwned) centerInside += 1;
    for (const fraction of across) {
      const probe = [
        point[0] + nx * halfHeight * fraction,
        point[1] + ny * halfHeight * fraction,
      ];
      if (coverageGridContains(coverageGrid, probe)) inside += 1;
      totalSamples += 1;
    }
  }

  // Total coverage alone cannot distinguish a tiny coastline overhang from a
  // label that bridges two disconnected islands. Measure the longest OUTSIDE
  // run that is bounded by owned centerline samples on both sides; that is the
  // visual signature of an Irish-Sea / strait / large-lake bridge.
  let longestInternalGap = 0;
  let runStart = -1;
  for (let index = 0; index <= centerlineInside.length; index += 1) {
    const owned = index < centerlineInside.length ? centerlineInside[index] : true;
    if (!owned && runStart < 0) {
      runStart = index;
      continue;
    }
    if (owned && runStart >= 0) {
      const runEnd = index - 1;
      const boundedLeft = runStart > 0 && centerlineInside[runStart - 1] === true;
      const boundedRight = index < centerlineInside.length && centerlineInside[index] === true;
      if (boundedLeft && boundedRight) {
        longestInternalGap = Math.max(longestInternalGap, runEnd - runStart + 1);
      }
      runStart = -1;
    }
  }

  let leadingOutside = 0;
  while (leadingOutside < centerlineInside.length && !centerlineInside[leadingOutside]) leadingOutside += 1;
  let trailingOutside = 0;
  while (
    trailingOutside < centerlineInside.length
    && !centerlineInside[centerlineInside.length - 1 - trailingOutside]
  ) trailingOutside += 1;

  return {
    ownCoverage: totalSamples > 0 ? inside / totalSamples : 0,
    centerlineCoverage: centerInside / samples,
    internalGapFraction: longestInternalGap / samples,
    edgeOutsideFraction: (leadingOutside + trailingOutside) / samples,
  };
};

const centerMetrics = ({ center, centroid, angleDeg, axisSpan, crossSpan }) => {
  if (!Array.isArray(center) || !Array.isArray(centroid)) {
    return { axisCentering: 0.5, crossCentering: 0.5 };
  }
  const angle = radians(angleDeg);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const dx = center[0] - centroid[0];
  const dy = center[1] - centroid[1];
  const along = Math.abs(dx * ux + dy * uy) / Math.max(Number(axisSpan) || 0, 1e-12);
  const across = Math.abs(dx * nx + dy * ny) / Math.max(Number(crossSpan) || 0, 1e-12);
  return {
    // Along-axis asymmetry is often desirable (China is the representative
    // fixture), so keep this term deliberately weak.
    axisCentering: 1 - clamp(along / 0.42, 0, 1),
    // Cross-axis centering keeps Russia-class labels out of a hull edge.
    crossCentering: 1 - clamp(across / 0.32, 0, 1),
  };
};

export const scoreTerritorialArcCandidate = ({
  points,
  center,
  angleDeg,
  preferredAngleDeg,
  axisSpanWorld,
  crossSpanWorld,
  aspectRatio,
  coverageGrid,
}) => {
  const { total: supportLength } = cumulativeArcLengths(points ?? []);
  const coverage = sampleRibbonCoverage({ points, aspectRatio, coverageGrid });
  const centroid = coverageGridCentroid(coverageGrid);
  const centering = centerMetrics({
    center,
    centroid,
    angleDeg,
    axisSpan: axisSpanWorld,
    crossSpan: crossSpanWorld,
  });
  const spanUsage = clamp(supportLength / Math.max(Number(axisSpanWorld) || 0, 1e-12), 0, 1.15);
  let angleDistance = Math.abs((Number(angleDeg) || 0) - (Number(preferredAngleDeg) || 0));
  while (angleDistance > 90) angleDistance = Math.abs(angleDistance - 180);
  const outside = 1 - coverage.ownCoverage;
  const internalGapPenalty = Math.max(0, coverage.internalGapFraction - 0.055) * 30.0;
  const edgeOutsidePenalty = Math.max(0, coverage.edgeOutsideFraction - 0.11) * 4.0;

  // Ownership dominates. A little coastline overhang is acceptable, but a
  // label that consumes a neighbour/ocean should rapidly lose to a translated
  // candidate that uses the polity's own empty room. Most importantly, a long
  // unsupported INTERNAL run is much worse than the same amount of harmless
  // endpoint overhang: it means the word is bridging disconnected landmasses.
  const score = (
    coverage.ownCoverage * 10.0
    + coverage.centerlineCoverage * 3.2
    + spanUsage * 4.2
    + centering.crossCentering * 1.8
    + centering.axisCentering * 0.45
    - Math.max(0, outside - 0.055) * 12.0
    - internalGapPenalty
    - edgeOutsidePenalty
    - (angleDistance / 20) * 0.22
  );

  return {
    score,
    supportLength,
    spanUsage,
    ownCoverage: coverage.ownCoverage,
    centerlineCoverage: coverage.centerlineCoverage,
    internalGapFraction: coverage.internalGapFraction,
    edgeOutsideFraction: coverage.edgeOutsideFraction,
    crossCentering: centering.crossCentering,
    axisCentering: centering.axisCentering,
    angleDistance,
  };
};

const shiftedCenter = ({ baseCenter, angleDeg, alongOffset, crossOffset }) => {
  const angle = radians(angleDeg);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  return [
    baseCenter[0] + ux * alongOffset + nx * crossOffset,
    baseCenter[1] + uy * alongOffset + ny * crossOffset,
  ];
};

const uniqueCenters = (centers) => {
  const result = [];
  for (const center of centers) {
    if (!Array.isArray(center) || center.length < 2) continue;
    if (result.some((candidate) => Math.hypot(candidate[0] - center[0], candidate[1] - center[1]) < 1e-8)) continue;
    result.push(center);
  }
  return result;
};

/**
 * Select one C-arc with a bounded coarse-to-fine search.
 *
 * PTR-1.6 originally exhausted the full cartesian product of centers, angles,
 * offsets, spans and bend strengths. That produced excellent placement, but a
 * thin polity could score ~1,800 128-point ribbons before ONE label was ready.
 * Keep the same score function and search envelope, but spend the budget in two
 * stages: a broad ~80-candidate pass, then refine only the strongest few seeds.
 */
export const optimizeTerritorialArcPlacement = ({
  anchor,
  preferredAngleDeg,
  axisSpanWorld,
  crossSpanWorld,
  desiredSupportLength,
  maxSupportLength = null,
  bendRatio,
  bendSign,
  aspectRatio,
  coverageGrid,
  samples = 128,
}) => {
  const axisSpan = Math.max(1e-12, Number(axisSpanWorld) || 0);
  const crossSpan = Math.max(1e-12, Number(crossSpanWorld) || 0);
  const preferred = Number(preferredAngleDeg) || 0;
  const centroid = coverageGridCentroid(coverageGrid);
  const anchorPoint = Array.isArray(anchor) ? anchor.map(Number) : null;
  const baseCenters = uniqueCenters([
    anchorPoint,
    centroid,
    anchorPoint && centroid ? [
      anchorPoint[0] * 0.35 + centroid[0] * 0.65,
      anchorPoint[1] * 0.35 + centroid[1] * 0.65,
    ] : null,
  ]);
  if (!baseCenters.length) return null;

  const axisRatio = axisSpan / crossSpan;
  const slender = axisRatio > 2.2;
  const angleStep = axisRatio < 1.45 ? 11 : 7;
  const desired = Math.max(1e-12, Number(desiredSupportLength) || axisSpan * 0.9);
  const supportCap = Math.max(1e-12, Number(maxSupportLength) || axisSpan * 0.98);
  const clampSpan = (value) => Math.max(1e-12, Math.min(supportCap, Number(value) || desired));

  // One representative span is enough for the broad search. Span is then one
  // of the dimensions refined around the best seeds, instead of multiplying
  // every center/orientation combination by three or four lengths.
  const coarseSpanFraction = slender ? 0.92 : 0.925;
  const coarseSpan = clampSpan(Math.max(
    desired * Math.min(1, coarseSpanFraction / 0.925),
    axisSpan * coarseSpanFraction,
  ));
  const coarseAngles = [preferred - angleStep, preferred, preferred + angleStep];
  const coarseAlongFractions = [-0.12, 0, 0.12];
  const coarseCrossFractions = slender ? [-0.24, 0, 0.24] : [-0.15, 0, 0.15];

  const candidates = [];
  const seen = new Set();
  let evaluated = 0;
  const keyFor = ({ center, angleDeg, chordLength, bendFactor }) => [
    Number(center?.[0] ?? 0).toFixed(9),
    Number(center?.[1] ?? 0).toFixed(9),
    Number(angleDeg ?? 0).toFixed(4),
    Number(chordLength ?? 0).toFixed(9),
    Number(bendFactor ?? 1).toFixed(4),
  ].join('|');

  const evaluate = ({ center, angleDeg, chordLength, bendFactor = 1 }) => {
    const normalized = {
      center,
      angleDeg,
      chordLength: clampSpan(chordLength),
      bendFactor,
    };
    const key = keyFor(normalized);
    if (seen.has(key)) return null;
    seen.add(key);

    const points = singleArcFromAxis({
      center: normalized.center,
      angleDeg: normalized.angleDeg,
      chordLength: normalized.chordLength,
      bendRatio: Math.min(0.11, Math.max(0, Number(bendRatio) * normalized.bendFactor)),
      bendSign,
      samples,
    });
    const metrics = scoreTerritorialArcCandidate({
      points,
      center: normalized.center,
      angleDeg: normalized.angleDeg,
      preferredAngleDeg: preferred,
      axisSpanWorld: axisSpan,
      crossSpanWorld: crossSpan,
      aspectRatio,
      coverageGrid,
    });
    evaluated += 1;
    const candidate = { points, ...normalized, ...metrics };
    candidates.push(candidate);
    return candidate;
  };

  for (const baseCenter of baseCenters) {
    for (const angleDeg of coarseAngles) {
      for (const alongFraction of coarseAlongFractions) {
        for (const crossFraction of coarseCrossFractions) {
          evaluate({
            center: shiftedCenter({
              baseCenter,
              angleDeg,
              alongOffset: axisSpan * alongFraction,
              crossOffset: crossSpan * crossFraction,
            }),
            angleDeg,
            chordLength: coarseSpan,
            bendFactor: 1,
          });
        }
      }
    }
  }

  const shortlist = [...candidates]
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
  const fineAngleStep = Math.max(2.25, angleStep * 0.45);
  const fineAlong = axisSpan * 0.045;
  const fineCross = crossSpan * (slender ? 0.085 : 0.07);
  const fineSpan = axisSpan * (slender ? 0.055 : 0.04);

  // Refine dimensions independently around each strong coarse seed. This is
  // intentionally NOT another cartesian product: four seeds × roughly a dozen
  // probes keeps the whole solve near ~120 evaluations instead of 400–1,800.
  for (const seed of shortlist) {
    evaluate({ ...seed, angleDeg: seed.angleDeg - fineAngleStep });
    evaluate({ ...seed, angleDeg: seed.angleDeg + fineAngleStep });
    evaluate({
      ...seed,
      center: shiftedCenter({ baseCenter: seed.center, angleDeg: seed.angleDeg, alongOffset: -fineAlong, crossOffset: 0 }),
    });
    evaluate({
      ...seed,
      center: shiftedCenter({ baseCenter: seed.center, angleDeg: seed.angleDeg, alongOffset: fineAlong, crossOffset: 0 }),
    });
    evaluate({
      ...seed,
      center: shiftedCenter({ baseCenter: seed.center, angleDeg: seed.angleDeg, alongOffset: 0, crossOffset: -fineCross }),
    });
    evaluate({
      ...seed,
      center: shiftedCenter({ baseCenter: seed.center, angleDeg: seed.angleDeg, alongOffset: 0, crossOffset: fineCross }),
    });
    evaluate({ ...seed, chordLength: seed.chordLength - fineSpan });
    evaluate({ ...seed, chordLength: seed.chordLength + fineSpan });
    if (slender) {
      evaluate({ ...seed, bendFactor: 0.8 });
      evaluate({ ...seed, bendFactor: 1.2 });
    }
  }

  const provisionalBest = candidates.reduce((winner, candidate) => (
    !winner || candidate.score > winner.score ? candidate : winner
  ), null);

  // If the normal ~90%-of-envelope label still bridges a substantial internal
  // gap, spend a tiny extra budget on smaller supports. Shrinking the word is
  // preferable to forcing it across water between nearby islands. This is
  // intentionally adaptive so continental labels keep the fast ~120-candidate
  // path and only multipart/coastal failures pay the extra probes.
  const needsCompactRecovery = Boolean(
    provisionalBest
    && (
      provisionalBest.internalGapFraction > 0.055
      || provisionalBest.ownCoverage < 0.88
      || provisionalBest.centerlineCoverage < 0.78
      || provisionalBest.edgeOutsideFraction > 0.08
    )
  );
  if (needsCompactRecovery) {
    const compactFractions = slender ? [0.52, 0.62, 0.70, 0.80] : [0.52, 0.62, 0.70, 0.78];
    const compactCenters = uniqueCenters([
      anchorPoint,
      provisionalBest?.center,
    ]);
    // Recovery must follow the angle that actually won the broad territorial
    // search. Resetting to the worker's preferred PCA angle can miss the only
    // compact corridor that fits a multipart/coastal polity (the live failure
    // mode was a long diagonal ribbon over water while a shorter ribbon at the
    // already-selected angle fit cleanly on land).
    const recoveryAngle = Number(provisionalBest?.angleDeg ?? preferred);
    const compactAngles = [...new Set([
      recoveryAngle - fineAngleStep,
      recoveryAngle,
      recoveryAngle + fineAngleStep,
      preferred,
    ].map((value) => Number(value.toFixed(6))))];
    for (const center of compactCenters) {
      for (const angleDeg of compactAngles) {
        for (const fraction of compactFractions) {
          evaluate({
            center,
            angleDeg,
            chordLength: axisSpan * fraction,
            bendFactor: slender ? 0.82 : 0.9,
          });
        }
      }
    }
  }

  const best = candidates.reduce((winner, candidate) => (
    !winner || candidate.score > winner.score ? candidate : winner
  ), null);

  return best ? {
    ...best,
    evaluated,
    coarseEvaluated: Math.min(evaluated, baseCenters.length * coarseAngles.length * coarseAlongFractions.length * coarseCrossFractions.length),
    refinedSeeds: shortlist.length,
    preferredAngleDeg: preferred,
    centroid,
  } : null;
};
