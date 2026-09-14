/*! Open Historia — targeted render repair for malformed political regions © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

const EMPTY_FC = Object.freeze({ type: "FeatureCollection", features: [] });
const AREA_EPSILON = 1e-12;
const COORD_EPSILON = 1e-10;
const DEFAULT_MAX_AREA_DRIFT_RATIO = 0.0025;
const DEFAULT_DETACHED_AREA_RATIO = 0.001;
const DEFAULT_DETACHED_FILL_RATIO = 0.002;
const DEFAULT_YIELD_EVERY = 48;
// A handful of legacy exports are GEOS-valid yet still hostile to GPU
// tessellation: they contain a duplicated vertex plus an almost perfectly
// collinear chord spanning most of the ring. Earcut can emit a numerically
// unstable triangle from that combination (the long legacy wedge is the known
// reproducer class). This is deliberately much stricter than ordinary simplification:
// only meter-scale deviation across a chord covering most of the polygon is
// considered redundant presentation geometry.
const PRECISION_HAZARD_RATIO = 2e-6;
const PRECISION_HAZARD_SPAN_FRACTION = 0.65;
const PRECISION_HAZARD_MIN_SPAN = 0.05;
// A second legacy-export signature is a nearly collinear hairpin: the ring
// advances along a boundary, overshoots, then doubles back on almost exactly
// the same line. GEOS can still call that polygon valid, but earcut receives a
// zero-area/near-zero-area spike and may connect it to a distant vertex. Requiring
// the SAME ring to contain a duplicate vertex keeps this detector tied to the known
// export corruption family rather than turning it into ordinary simplification.
const PRECISION_BACKTRACK_COS_THRESHOLD = -0.995;
const PRECISION_BACKTRACK_DISTANCE_RATIO = 1e-3;
const PRECISION_BACKTRACK_MIN_LEG = 0.05;

let polygonClipperPromise = null;
const getPolygonClipper = async () => {
  if (!polygonClipperPromise) {
    polygonClipperPromise = import("polygon-clipping").then((module) => module.default ?? module);
  }
  return polygonClipperPromise;
};

const featureId = (feature, index = 0) => {
  const props = feature?.properties ?? {};
  return String(feature?.id ?? props.id ?? props.GID_1 ?? `feature-${index}`);
};

export const isExplicitAuthoredGeometry = (feature, index = 0) => {
  const props = feature?.properties ?? {};
  const id = featureId(feature, index);
  return props.edited === true
    || props.authored === true
    || String(props.geometrySource ?? "").toLowerCase() === "authored"
    || id.startsWith("reg_");
};

const samePoint = (left, right, epsilon = COORD_EPSILON) => Boolean(
  Array.isArray(left)
  && Array.isArray(right)
  && Math.abs(Number(left[0]) - Number(right[0])) <= epsilon
  && Math.abs(Number(left[1]) - Number(right[1])) <= epsilon
);

const ringAreaSigned = (ring) => {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  let sum = 0;
  for (let index = 1; index < ring.length; index += 1) {
    const previous = ring[index - 1];
    const current = ring[index];
    if (!Array.isArray(previous) || !Array.isArray(current)) continue;
    sum += Number(previous[0] ?? 0) * Number(current[1] ?? 0)
      - Number(current[0] ?? 0) * Number(previous[1] ?? 0);
  }
  return sum / 2;
};

const polygonArea = (polygon) => {
  if (!Array.isArray(polygon) || !polygon.length) return 0;
  let area = Math.abs(ringAreaSigned(polygon[0]));
  for (let index = 1; index < polygon.length; index += 1) {
    area -= Math.abs(ringAreaSigned(polygon[index]));
  }
  return Math.max(0, area);
};

export const multiPolygonArea = (multiPolygon) => {
  if (!Array.isArray(multiPolygon)) return 0;
  let total = 0;
  for (const polygon of multiPolygon) total += polygonArea(polygon);
  return total;
};

export const geometryToMultiPolygon = (geometry) => {
  if (geometry?.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates];
  }
  if (geometry?.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }
  return null;
};

export const multiPolygonToGeometry = (multiPolygon) => {
  if (!Array.isArray(multiPolygon) || !multiPolygon.length) return null;
  return multiPolygon.length === 1
    ? { type: "Polygon", coordinates: multiPolygon[0] }
    : { type: "MultiPolygon", coordinates: multiPolygon };
};


const ringBounds = (ring) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring ?? []) {
    const x = Number(point?.[0]);
    const y = Number(point?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
};

const pointLineDistance = (point, a, b) => {
  const ax = Number(a?.[0]);
  const ay = Number(a?.[1]);
  const bx = Number(b?.[0]);
  const by = Number(b?.[1]);
  const px = Number(point?.[0]);
  const py = Number(point?.[1]);
  if (![ax, ay, bx, by, px, py].every(Number.isFinite)) return Infinity;
  const dx = bx - ax;
  const dy = by - ay;
  const span = Math.hypot(dx, dy);
  if (span <= COORD_EPSILON) return Infinity;
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / span;
};

const pointProjectsInsideSegment = (point, a, b) => {
  const dx = Number(b?.[0]) - Number(a?.[0]);
  const dy = Number(b?.[1]) - Number(a?.[1]);
  const px = Number(point?.[0]) - Number(a?.[0]);
  const py = Number(point?.[1]) - Number(a?.[1]);
  const lengthSquared = dx * dx + dy * dy;
  if (!Number.isFinite(lengthSquared) || lengthSquared <= COORD_EPSILON) return false;
  const projection = px * dx + py * dy;
  return projection >= -COORD_EPSILON && projection <= lengthSquared + COORD_EPSILON;
};

const precisionHazardCandidate = (points, index, diagonal) => {
  const previous = points[(index - 1 + points.length) % points.length];
  const point = points[index];
  const next = points[(index + 1) % points.length];
  const previousDx = Number(point[0]) - Number(previous[0]);
  const previousDy = Number(point[1]) - Number(previous[1]);
  const nextDx = Number(next[0]) - Number(point[0]);
  const nextDy = Number(next[1]) - Number(point[1]);
  const previousLength = Math.hypot(previousDx, previousDy);
  const nextLength = Math.hypot(nextDx, nextDy);
  const span = Math.hypot(Number(next[0]) - Number(previous[0]), Number(next[1]) - Number(previous[1]));

  const longChord = span >= PRECISION_HAZARD_MIN_SPAN
    && span >= diagonal * PRECISION_HAZARD_SPAN_FRACTION
    && pointProjectsInsideSegment(point, previous, next)
    && pointLineDistance(point, previous, next) / Math.max(span, COORD_EPSILON) <= PRECISION_HAZARD_RATIO;

  let backtrack = false;
  let backtrackScore = Infinity;
  if (previousLength >= PRECISION_BACKTRACK_MIN_LEG && nextLength >= PRECISION_BACKTRACK_MIN_LEG) {
    const cosine = (previousDx * nextDx + previousDy * nextDy)
      / Math.max(previousLength * nextLength, COORD_EPSILON);
    const lineDistance = pointLineDistance(point, previous, next);
    backtrackScore = lineDistance / Math.max(previousLength, nextLength, COORD_EPSILON);
    backtrack = cosine <= PRECISION_BACKTRACK_COS_THRESHOLD
      && Number.isFinite(backtrackScore)
      && backtrackScore <= PRECISION_BACKTRACK_DISTANCE_RATIO;
  }

  if (!longChord && !backtrack) return null;
  return {
    index,
    kind: backtrack ? "backtrack" : "long-chord",
    // Backtracks are the more dangerous tessellation input. Within a class,
    // prefer the numerically flattest candidate and remove one point per pass.
    score: backtrack
      ? backtrackScore
      : pointLineDistance(point, previous, next) / Math.max(span, COORD_EPSILON),
  };
};

const compactRing = (ring) => {
  const compact = [];
  let removedCount = 0;
  for (const point of ring ?? []) {
    if (compact.length && samePoint(compact[compact.length - 1], point)) {
      removedCount += 1;
      continue;
    }
    compact.push(point);
  }
  const closed = compact.length > 1 && samePoint(compact[0], compact[compact.length - 1]);
  return {
    points: closed ? compact.slice(0, -1) : compact.slice(),
    removedCount,
  };
};

export const ringHasPrecisionHazard = (ring) => {
  if (!Array.isArray(ring) || ring.length < 5) return false;
  let hasDuplicate = false;
  for (let index = 1; index < ring.length; index += 1) {
    if (samePoint(ring[index - 1], ring[index])) {
      hasDuplicate = true;
      break;
    }
  }
  if (!hasDuplicate) return false;

  const { points } = compactRing(ring);
  if (points.length < 3) return false;
  const bounds = ringBounds(points);
  if (!bounds) return false;
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  if (diagonal <= COORD_EPSILON) return false;

  return points.some((_, index) => Boolean(precisionHazardCandidate(points, index, diagonal)));
};

const simplifyPrecisionHazardRing = (ring) => {
  if (!ringHasPrecisionHazard(ring)) return { ring, changed: false, removedCount: 0 };

  const compact = compactRing(ring);
  let points = compact.points;
  let removedCount = compact.removedCount;

  // Remove one suspect vertex at a time and recalculate the local geometry.
  // This avoids a chain of adjacent deletions in a pathological ring. The area
  // guard and structural validator later in buildRegionRenderRepair remain the
  // final authority over whether the presentation repair is published.
  for (let pass = 0; pass < 4 && points.length > 3; pass += 1) {
    const bounds = ringBounds(points);
    if (!bounds) break;
    const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    if (diagonal <= COORD_EPSILON) break;
    const candidates = points
      .map((_, index) => precisionHazardCandidate(points, index, diagonal))
      .filter(Boolean)
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "backtrack" ? -1 : 1;
        return left.score - right.score;
      });
    if (!candidates.length) break;
    points = points.filter((_, index) => index !== candidates[0].index);
    removedCount += 1;
  }

  if (points.length < 3) return { ring, changed: false, removedCount: 0 };
  const simplified = [...points, points[0]];
  return {
    ring: simplified,
    changed: removedCount > 0,
    removedCount,
  };
};

export const simplifyPrecisionHazards = (multiPolygon) => {
  if (!Array.isArray(multiPolygon)) return { geometry: multiPolygon, changed: false, removedCount: 0 };
  let changed = false;
  let removedCount = 0;
  const geometry = multiPolygon.map((polygon) => (polygon ?? []).map((ring) => {
    const result = simplifyPrecisionHazardRing(ring);
    if (result.changed) changed = true;
    removedCount += result.removedCount;
    return result.ring;
  }));
  return { geometry, changed, removedCount };
};

const polygonBounds = (polygon) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of polygon ?? []) {
    for (const point of ring ?? []) {
      const x = Number(point?.[0]);
      const y = Number(point?.[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
};

const orientation = (a, b, c) => (
  (Number(b[0]) - Number(a[0])) * (Number(c[1]) - Number(a[1]))
  - (Number(b[1]) - Number(a[1])) * (Number(c[0]) - Number(a[0]))
);

const pointOnSegment = (point, a, b) => {
  if (Math.abs(orientation(a, b, point)) > COORD_EPSILON) return false;
  const x = Number(point[0]);
  const y = Number(point[1]);
  return x >= Math.min(Number(a[0]), Number(b[0])) - COORD_EPSILON
    && x <= Math.max(Number(a[0]), Number(b[0])) + COORD_EPSILON
    && y >= Math.min(Number(a[1]), Number(b[1])) - COORD_EPSILON
    && y <= Math.max(Number(a[1]), Number(b[1])) + COORD_EPSILON;
};

const segmentsIntersect = (left, right) => {
  const { a, b } = left;
  const { a: c, b: d } = right;
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (
    ((o1 > COORD_EPSILON && o2 < -COORD_EPSILON) || (o1 < -COORD_EPSILON && o2 > COORD_EPSILON))
    && ((o3 > COORD_EPSILON && o4 < -COORD_EPSILON) || (o3 < -COORD_EPSILON && o4 > COORD_EPSILON))
  ) return true;

  return (Math.abs(o1) <= COORD_EPSILON && pointOnSegment(c, a, b))
    || (Math.abs(o2) <= COORD_EPSILON && pointOnSegment(d, a, b))
    || (Math.abs(o3) <= COORD_EPSILON && pointOnSegment(a, c, d))
    || (Math.abs(o4) <= COORD_EPSILON && pointOnSegment(b, c, d));
};

const segmentsAreAdjacent = (leftIndex, rightIndex, segmentCount) => {
  const delta = Math.abs(leftIndex - rightIndex);
  return delta <= 1 || delta === segmentCount - 1;
};

/**
 * Detect non-adjacent ring crossings without an O(n²) all-pairs pass.
 * Segments are swept by min-x and compared only while their bounding boxes can
 * overlap. This is a worker-side validator for presentation safety, not a new
 * canonical geometry engine.
 */
export const ringHasSelfIntersection = (ring) => {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const compact = [];
  for (const point of ring) {
    if (!compact.length || !samePoint(compact[compact.length - 1], point)) compact.push(point);
  }
  if (compact.length < 4) return false;
  const closed = samePoint(compact[0], compact[compact.length - 1]);
  const pointCount = closed ? compact.length : compact.length + 1;
  const segmentCount = pointCount - 1;
  const segments = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const a = compact[index];
    const b = index + 1 < compact.length ? compact[index + 1] : compact[0];
    if (!Array.isArray(a) || !Array.isArray(b)) return true;
    const ax = Number(a[0]);
    const ay = Number(a[1]);
    const bx = Number(b[0]);
    const by = Number(b[1]);
    if (![ax, ay, bx, by].every(Number.isFinite)) return true;
    // Consecutive duplicate vertices are redundant but MapLibre/GEOS tolerate
    // them; skip the zero-length edge instead of treating the whole polygon as
    // self-intersecting.
    if (samePoint(a, b)) continue;
    segments.push({
      index,
      a,
      b,
      minX: Math.min(ax, bx),
      maxX: Math.max(ax, bx),
      minY: Math.min(ay, by),
      maxY: Math.max(ay, by),
    });
  }

  segments.sort((left, right) => left.minX - right.minX || left.maxX - right.maxX);
  const active = [];

  for (const current of segments) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].maxX < current.minX - COORD_EPSILON) active.splice(index, 1);
    }
    for (const other of active) {
      if (segmentsAreAdjacent(current.index, other.index, segmentCount)) continue;
      if (other.maxY < current.minY - COORD_EPSILON || other.minY > current.maxY + COORD_EPSILON) continue;
      if (segmentsIntersect(current, other)) return true;
    }
    active.push(current);
  }
  return false;
};

const ringIsStructurallyInvalid = (ring) => {
  if (!Array.isArray(ring) || ring.length < 4) return true;
  if (!samePoint(ring[0], ring[ring.length - 1])) return true;
  const unique = [];
  for (const point of ring.slice(0, -1)) {
    if (!unique.some((candidate) => samePoint(candidate, point))) unique.push(point);
    if (unique.length >= 3) break;
  }
  if (unique.length < 3) return true;
  if (Math.abs(ringAreaSigned(ring)) <= AREA_EPSILON) return true;
  return ringHasSelfIntersection(ring);
};

const polygonHasInvalidRing = (polygon) => (
  !Array.isArray(polygon)
  || !polygon.length
  || polygon.some((ring) => ringIsStructurallyInvalid(ring))
);

export const stripDegenerateDetachedPolygons = (multiPolygon, {
  maxAreaRatio = DEFAULT_DETACHED_AREA_RATIO,
  maxFillRatio = DEFAULT_DETACHED_FILL_RATIO,
} = {}) => {
  if (!Array.isArray(multiPolygon) || multiPolygon.length < 2) {
    return { geometry: multiPolygon, changed: false, removedCount: 0 };
  }

  const areas = multiPolygon.map((polygon) => polygonArea(polygon));
  let largestIndex = 0;
  for (let index = 1; index < areas.length; index += 1) {
    if (areas[index] > areas[largestIndex]) largestIndex = index;
  }
  const largestArea = Math.max(areas[largestIndex], AREA_EPSILON);
  const kept = [];
  let removedCount = 0;

  for (let index = 0; index < multiPolygon.length; index += 1) {
    const polygon = multiPolygon[index];
    if (index === largestIndex) {
      kept.push(polygon);
      continue;
    }

    const area = Math.max(0, areas[index]);
    const bounds = polygonBounds(polygon);
    const boundsArea = bounds
      ? Math.max(0, (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY))
      : 0;
    const fillRatio = boundsArea > AREA_EPSILON ? area / boundsArea : 0;
    const areaRatio = area / largestArea;
    const degenerate = area <= AREA_EPSILON
      || (areaRatio <= maxAreaRatio && fillRatio <= maxFillRatio);

    if (degenerate) removedCount += 1;
    else kept.push(polygon);
  }

  return {
    geometry: kept.length ? kept : [multiPolygon[largestIndex]],
    changed: removedCount > 0,
    removedCount,
  };
};

export const analyzeRegionRenderSafety = (geometry) => {
  const multiPolygon = geometryToMultiPolygon(geometry);
  if (!multiPolygon) {
    return {
      supported: false,
      unsafe: false,
      invalidRing: false,
      detachedSliverCount: 0,
      precisionHazard: false,
    };
  }
  const stripped = stripDegenerateDetachedPolygons(multiPolygon);
  const precision = simplifyPrecisionHazards(stripped.geometry);
  const invalidRing = precision.geometry.some((polygon) => polygonHasInvalidRing(polygon));
  return {
    supported: true,
    unsafe: invalidRing || stripped.changed || precision.changed,
    invalidRing,
    detachedSliverCount: stripped.removedCount,
    precisionHazard: precision.changed,
  };
};

const defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Build a SMALL presentation-only collection containing only geometry that is
 * demonstrably unsafe for MapLibre tessellation. Canonical scenario geometry,
 * ids, ownership and save data are never rewritten.
 */
export const buildRegionRenderRepair = async (featureCollection, {
  clipper = null,
  maxAreaDriftRatio = DEFAULT_MAX_AREA_DRIFT_RATIO,
  yieldEvery = DEFAULT_YIELD_EVERY,
  yieldTask = defaultYield,
  shouldCancel = () => false,
} = {}) => {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const source = featureCollection?.type === "FeatureCollection" ? featureCollection : EMPTY_FC;
  const features = Array.isArray(source.features) ? source.features : [];
  const repairedFeatures = [];
  const repairedIds = [];

  let scannedFeatureCount = 0;
  let unsafeFeatureCount = 0;
  let normalizedFeatureCount = 0;
  let detachedSliverFeatureCount = 0;
  let removedDetachedPolygonCount = 0;
  let precisionHazardFeatureCount = 0;
  let removedPrecisionVertexCount = 0;
  let rejectedAreaDriftCount = 0;
  let repairErrorCount = 0;
  let polygonClipping = clipper;

  for (let index = 0; index < features.length; index += 1) {
    if (shouldCancel()) {
      return { cancelled: true, data: null, repairedIds: [], stats: { scannedFeatureCount } };
    }

    const feature = features[index];
    const subject = geometryToMultiPolygon(feature?.geometry);
    if (!subject) continue;
    scannedFeatureCount += 1;

    const stripped = stripDegenerateDetachedPolygons(subject);
    const precision = simplifyPrecisionHazards(stripped.geometry);
    const invalidRing = precision.geometry.some((polygon) => polygonHasInvalidRing(polygon));
    if (!stripped.changed && !precision.changed && !invalidRing) {
      if (scannedFeatureCount % Math.max(1, Number(yieldEvery) || DEFAULT_YIELD_EVERY) === 0) await yieldTask();
      continue;
    }

    unsafeFeatureCount += 1;
    if (stripped.changed) {
      detachedSliverFeatureCount += 1;
      removedDetachedPolygonCount += stripped.removedCount;
    }
    if (precision.changed) {
      precisionHazardFeatureCount += 1;
      removedPrecisionVertexCount += precision.removedCount;
    }

    const originalArea = Math.max(multiPolygonArea(subject), Number.EPSILON);
    let repaired = precision.geometry;

    try {
      if (invalidRing) {
        polygonClipping ??= await getPolygonClipper();
        repaired = polygonClipping.union(repaired);
        normalizedFeatureCount += 1;
      }
    } catch {
      repairErrorCount += 1;
      continue;
    }

    if (!Array.isArray(repaired) || repaired.some((polygon) => polygonHasInvalidRing(polygon))) {
      repairErrorCount += 1;
      continue;
    }

    const geometry = multiPolygonToGeometry(repaired);
    if (!geometry) {
      repairErrorCount += 1;
      continue;
    }

    const repairedArea = multiPolygonArea(repaired);
    const areaDriftRatio = Math.abs(repairedArea - originalArea) / originalArea;
    if (!Number.isFinite(areaDriftRatio) || areaDriftRatio > maxAreaDriftRatio) {
      rejectedAreaDriftCount += 1;
      continue;
    }

    const id = featureId(feature, index);
    repairedIds.push(id);
    repairedFeatures.push({
      ...feature,
      properties: { ...(feature?.properties ?? {}), id },
      geometry,
    });

    if (scannedFeatureCount % Math.max(1, Number(yieldEvery) || DEFAULT_YIELD_EVERY) === 0) await yieldTask();
  }

  const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
  return {
    cancelled: false,
    data: { type: "FeatureCollection", features: repairedFeatures },
    repairedIds,
    stats: {
      scannedFeatureCount,
      unsafeFeatureCount,
      repairedFeatureCount: repairedFeatures.length,
      normalizedFeatureCount,
      detachedSliverFeatureCount,
      removedDetachedPolygonCount,
      precisionHazardFeatureCount,
      removedPrecisionVertexCount,
      rejectedAreaDriftCount,
      repairErrorCount,
      elapsedMs,
    },
  };
};
