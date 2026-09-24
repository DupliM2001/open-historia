/*! Open Historia — render-safe political region display mesh © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

const EMPTY_FC = Object.freeze({ type: "FeatureCollection", features: [] });
const DEFAULT_MAX_STOCK_LOSS_RATIO = 0.15;
const DEFAULT_MAX_AUTHORED_LOSS_RATIO = 0.75;
const DEFAULT_CLIP_BATCH = 16;
const DEFAULT_YIELD_EVERY = 24;
const DEFAULT_RENDER_SAFE_MAX_POINTS = 24;
const DEFAULT_RENDER_SAFE_MAX_SPAN_DEGREES = 1.5;
const DEFAULT_RENDER_SAFE_MAX_DEPTH = 6;
const DEFAULT_RENDER_SAFE_MAX_PARTS = 96;
const DEFAULT_RENDER_SAFE_AREA_DRIFT_RATIO = 0.0025;
const AREA_EPSILON = 1e-12;

let polygonClipperPromise = null;

const getPolygonClipper = async () => {
  if (!polygonClipperPromise) {
    polygonClipperPromise = import("polygon-clipping").then((module) => module.default ?? module);
  }
  return polygonClipperPromise;
};

const featureId = (feature, index) => {
  const props = feature?.properties ?? {};
  return String(feature?.id ?? props.id ?? props.GID_1 ?? `feature-${index}`);
};

/**
 * Explicit authored geometry provenance only.
 *
 * Do NOT infer this from dots in an id or from a missing gid0/GID_0. Historical
 * stock catalogs exist with dotless/numeric region ids. The editor's own
 * persistence contract marks drawn geometry with reg_* ids and reshaped stock
 * geometry with edited=true. Presentation repair may safely normalize every
 * feature, but only explicitly authored geometry is protected from automatic
 * inter-feature overlap subtraction.
 */
export const isExplicitAuthoredGeometry = (feature, index = 0) => {
  const props = feature?.properties ?? {};
  const id = featureId(feature, index);
  return props.edited === true
    || props.authored === true
    || String(props.geometrySource ?? "").toLowerCase() === "authored"
    || id.startsWith("reg_");
};

const ringAreaSigned = (ring) => {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  let sum = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[previous];
    const b = ring[index];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    sum += Number(a[0] ?? 0) * Number(b[1] ?? 0) - Number(b[0] ?? 0) * Number(a[1] ?? 0);
  }
  return sum / 2;
};

const polygonArea = (rings) => {
  if (!Array.isArray(rings) || !rings.length) return 0;
  let area = Math.abs(ringAreaSigned(rings[0]));
  for (let index = 1; index < rings.length; index += 1) {
    area -= Math.abs(ringAreaSigned(rings[index]));
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

const multiPolygonBounds = (multiPolygon) => {
  if (!Array.isArray(multiPolygon)) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of multiPolygon) {
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
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
};

const geometryBounds = (geometry) => multiPolygonBounds(geometryToMultiPolygon(geometry));

const boundsOverlap = (left, right) => Boolean(
  left
  && right
  && left.minX < right.maxX
  && left.maxX > right.minX
  && left.minY < right.maxY
  && left.maxY > right.minY
);

const polygonPointCount = (polygon) => (polygon ?? []).reduce(
  (total, ring) => total + (Array.isArray(ring) ? ring.length : 0),
  0,
);

const polygonBounds = (polygon) => multiPolygonBounds([polygon]);

const rectanglePolygon = (minX, minY, maxX, maxY) => [[
  [minX, minY],
  [maxX, minY],
  [maxX, maxY],
  [minX, maxY],
  [minX, minY],
]];

export const polygonNeedsRenderSubdivision = (polygon, {
  maxPoints = DEFAULT_RENDER_SAFE_MAX_POINTS,
  maxSpanDegrees = DEFAULT_RENDER_SAFE_MAX_SPAN_DEGREES,
} = {}) => {
  const bounds = polygonBounds(polygon);
  if (!bounds) return false;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return polygonPointCount(polygon) > maxPoints
    || width > maxSpanDegrees
    || height > maxSpanDegrees
    || (polygon?.length ?? 0) > 1;
};

const sameBounds = (left, right) => Boolean(
  left
  && right
  && Math.abs(left.minX - right.minX) < 1e-10
  && Math.abs(left.minY - right.minY) < 1e-10
  && Math.abs(left.maxX - right.maxX) < 1e-10
  && Math.abs(left.maxY - right.maxY) < 1e-10
);

const splitPolygonForRender = (clipper, polygon, bounds) => {
  if (typeof clipper?.intersection !== "function" || !bounds) return null;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (!(width > 0) || !(height > 0)) return null;

  const splitX = width >= height;
  const midpoint = splitX
    ? (bounds.minX + bounds.maxX) / 2
    : (bounds.minY + bounds.maxY) / 2;

  const firstClip = splitX
    ? rectanglePolygon(bounds.minX, bounds.minY, midpoint, bounds.maxY)
    : rectanglePolygon(bounds.minX, bounds.minY, bounds.maxX, midpoint);
  const secondClip = splitX
    ? rectanglePolygon(midpoint, bounds.minY, bounds.maxX, bounds.maxY)
    : rectanglePolygon(bounds.minX, midpoint, bounds.maxX, bounds.maxY);

  const parts = [
    ...(clipper.intersection(polygon, firstClip) ?? []),
    ...(clipper.intersection(polygon, secondClip) ?? []),
  ].filter((part) => polygonArea(part) > AREA_EPSILON);

  if (parts.length < 2) return null;
  if (parts.length === 1 && sameBounds(polygonBounds(parts[0]), bounds)) return null;
  return parts;
};

/**
 * Normalize/subdivide one feature's DISPLAY geometry before MapLibre sees it.
 *
 * The failure this targets is not canonical polygon overlap: a logically valid,
 * non-overlapping neighbouring region can still produce a rogue translucent
 * triangle outside its hit-test polygon when a large/complex ring is tessellated.
 * Rebuilding risky geometry through polygon-clipping and recursively partitioning
 * it into bounded pieces keeps the exact union while preventing one long Earcut
 * triangulation from spanning an entire complex province.
 */
export const buildRenderSafeMultiPolygon = (clipper, subject, {
  maxPoints = DEFAULT_RENDER_SAFE_MAX_POINTS,
  maxSpanDegrees = DEFAULT_RENDER_SAFE_MAX_SPAN_DEGREES,
  maxDepth = DEFAULT_RENDER_SAFE_MAX_DEPTH,
  maxParts = DEFAULT_RENDER_SAFE_MAX_PARTS,
  maxAreaDriftRatio = DEFAULT_RENDER_SAFE_AREA_DRIFT_RATIO,
} = {}) => {
  if (!Array.isArray(subject) || !subject.length) {
    return { geometry: subject, changed: false, subdivided: false, fallback: false, partCount: 0 };
  }

  const canNormalize = typeof clipper?.union === "function";
  const canSplit = typeof clipper?.intersection === "function";
  const risky = subject.some((polygon) => polygonNeedsRenderSubdivision(polygon, { maxPoints, maxSpanDegrees }));
  if (!risky || !canNormalize) {
    return {
      geometry: subject,
      changed: false,
      subdivided: false,
      fallback: false,
      partCount: subject.length,
    };
  }

  const originalArea = Math.max(multiPolygonArea(subject), Number.EPSILON);
  let normalized;
  try {
    normalized = clipper.union(subject);
  } catch {
    return { geometry: subject, changed: false, subdivided: false, fallback: true, partCount: subject.length };
  }
  if (!Array.isArray(normalized) || !normalized.length) {
    return { geometry: subject, changed: false, subdivided: false, fallback: true, partCount: subject.length };
  }

  let pieces = normalized;
  let subdivided = false;
  if (canSplit) {
    const queue = normalized.map((polygon) => ({ polygon, depth: 0 }));
    pieces = [];

    while (queue.length) {
      if (pieces.length + queue.length > maxParts) {
        return { geometry: subject, changed: false, subdivided: false, fallback: true, partCount: subject.length };
      }

      const current = queue.shift();
      if (!current?.polygon) continue;
      if (
        current.depth >= maxDepth
        || !polygonNeedsRenderSubdivision(current.polygon, { maxPoints, maxSpanDegrees })
      ) {
        pieces.push(current.polygon);
        continue;
      }

      const bounds = polygonBounds(current.polygon);
      let splitParts = null;
      try {
        splitParts = splitPolygonForRender(clipper, current.polygon, bounds);
      } catch {
        splitParts = null;
      }
      if (!splitParts?.length) {
        pieces.push(current.polygon);
        continue;
      }

      subdivided = true;
      for (const part of splitParts) queue.push({ polygon: part, depth: current.depth + 1 });
    }
  }

  const resultArea = multiPolygonArea(pieces);
  const areaDriftRatio = Math.abs(resultArea - originalArea) / originalArea;
  if (!Number.isFinite(areaDriftRatio) || areaDriftRatio > maxAreaDriftRatio || !pieces.length) {
    return { geometry: subject, changed: false, subdivided: false, fallback: true, partCount: subject.length };
  }

  return {
    geometry: pieces,
    changed: true,
    subdivided,
    fallback: false,
    partCount: pieces.length,
  };
};

const comparePriority = (left, right) => {
  // Explicitly authored/edited geometry is presentation authority and is never
  // changed by INTER-FEATURE overlap subtraction. Every feature may still be
  // render-safety normalized/subdivided because canonical geometry is untouched.
  if (left.protected !== right.protected) return left.protected ? -1 : 1;
  if (left.area !== right.area) return left.area - right.area;
  return left.id.localeCompare(right.id);
};

/**
 * Build a deterministic overlap-clipping plan without touching geometry.
 *
 * Each pair is oriented once: the higher-priority feature remains unchanged by
 * inter-feature subtraction; the lower-priority stock-like feature subtracts it
 * from its display-only geometry. The canonical scenario geometry is never mutated.
 */
export const buildRegionDisplayRepairPlan = (featureCollection) => {
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
  const records = features.map((feature, index) => {
    const multiPolygon = geometryToMultiPolygon(feature?.geometry);
    return {
      index,
      id: featureId(feature, index),
      protected: isExplicitAuthoredGeometry(feature, index),
      area: multiPolygonArea(multiPolygon),
      bounds: geometryBounds(feature?.geometry),
      clips: [],
      protectedClipCount: 0,
    };
  });

  const sortable = records
    // Dateline-spanning multipolygons (Aleutians, Chukotka, Fiji, etc.) have
    // a naive longitude bbox covering most of the planet. Treating that bbox
    // as a local overlap would schedule hundreds of unrelated clips. Leave
    // those rare wraparound pairs out of the inter-feature overlap pass.
    .filter((record) => record.bounds && (record.bounds.maxX - record.bounds.minX) <= 180)
    .slice()
    .sort((left, right) => left.bounds.minX - right.bounds.minX || left.bounds.maxX - right.bounds.maxX);

  let candidatePairCount = 0;
  const active = [];
  for (const current of sortable) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].bounds.maxX <= current.bounds.minX) active.splice(index, 1);
    }

    for (const other of active) {
      if (!boundsOverlap(current.bounds, other.bounds)) continue;
      candidatePairCount += 1;

      // Two explicitly authored/edited features may deliberately overlap.
      if (current.protected && other.protected) continue;

      const priority = comparePriority(current, other);
      const keeper = priority <= 0 ? current : other;
      const clipped = priority <= 0 ? other : current;
      if (clipped.protected) continue;
      clipped.clips.push(keeper.index);
      if (keeper.protected) clipped.protectedClipCount += 1;
    }
    active.push(current);
  }

  return {
    records,
    candidatePairCount,
    plannedFeatureCount: records.filter((record) => record.clips.length > 0).length,
    maxClipCount: records.reduce((max, record) => Math.max(max, record.clips.length), 0),
  };
};

const defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));

const applyDifferenceBatches = (clipper, subject, clips, batchSize) => {
  let current = subject;
  for (let index = 0; index < clips.length; index += batchSize) {
    const batch = clips.slice(index, index + batchSize);
    if (!current?.length) return [];
    current = clipper.difference(current, ...batch);
  }
  return current;
};

/**
 * Build a render-safe DISPLAY mesh for political fills.
 *
 * Canonical region geometry remains untouched and continues to own identity,
 * selection, borders, GM scope and simulation. The display mesh has two jobs:
 * 1) normalize/subdivide complex rings so MapLibre cannot throw long rogue fill
 *    triangles outside a region's logical hit-test polygon; and
 * 2) remove microscopic inter-feature overlap slivers that would otherwise
 *    double-paint translucent political colour.
 */
export const repairRegionDisplayMesh = async (featureCollection, {
  clipper = null,
  maxStockLossRatio = DEFAULT_MAX_STOCK_LOSS_RATIO,
  maxAuthoredLossRatio = DEFAULT_MAX_AUTHORED_LOSS_RATIO,
  clipBatchSize = DEFAULT_CLIP_BATCH,
  yieldEvery = DEFAULT_YIELD_EVERY,
  yieldTask = defaultYield,
  shouldCancel = () => false,
  renderSafeMaxPoints = DEFAULT_RENDER_SAFE_MAX_POINTS,
  renderSafeMaxSpanDegrees = DEFAULT_RENDER_SAFE_MAX_SPAN_DEGREES,
  renderSafeMaxDepth = DEFAULT_RENDER_SAFE_MAX_DEPTH,
  renderSafeMaxParts = DEFAULT_RENDER_SAFE_MAX_PARTS,
  renderSafeAreaDriftRatio = DEFAULT_RENDER_SAFE_AREA_DRIFT_RATIO,
} = {}) => {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const source = featureCollection?.type === "FeatureCollection" ? featureCollection : EMPTY_FC;
  const features = Array.isArray(source.features) ? source.features : [];
  const plan = buildRegionDisplayRepairPlan(source);
  const polygonClipping = clipper ?? await getPolygonClipper();
  const output = new Array(features.length);
  const baseDisplayGeometry = new Array(features.length);
  const baseChanged = new Array(features.length).fill(false);

  let renderSafeFeatureCount = 0;
  let renderSafeSubdivisionCount = 0;
  let renderSafePartCount = 0;
  let renderSafeFallbackCount = 0;

  // Pass 1: every risky feature gets a presentation-only normalization pass,
  // including explicitly authored geometry. "Authored" protects semantics from
  // neighbour subtraction; it does not require feeding pathological rings to GL.
  for (const record of plan.records) {
    if (shouldCancel()) {
      return {
        cancelled: true,
        data: null,
        stats: {
          candidatePairCount: plan.candidatePairCount,
          plannedFeatureCount: plan.plannedFeatureCount,
          renderSafeFeatureCount,
        },
      };
    }

    const canonical = geometryToMultiPolygon(features[record.index]?.geometry);
    if (!canonical) {
      baseDisplayGeometry[record.index] = canonical;
      continue;
    }

    const safe = buildRenderSafeMultiPolygon(polygonClipping, canonical, {
      maxPoints: renderSafeMaxPoints,
      maxSpanDegrees: renderSafeMaxSpanDegrees,
      maxDepth: renderSafeMaxDepth,
      maxParts: renderSafeMaxParts,
      maxAreaDriftRatio: renderSafeAreaDriftRatio,
    });

    baseDisplayGeometry[record.index] = safe.geometry;
    baseChanged[record.index] = safe.changed;
    if (safe.changed) renderSafeFeatureCount += 1;
    if (safe.subdivided) renderSafeSubdivisionCount += 1;
    if (safe.changed) renderSafePartCount += safe.partCount;
    if (safe.fallback) renderSafeFallbackCount += 1;
  }

  let repairedFeatureCount = 0;
  let topologyClippedFeatureCount = 0;
  let unchangedFeatureCount = 0;
  let lossFallbackCount = 0;
  let emptyFallbackCount = 0;
  let errorFallbackCount = 0;
  let processedPlanned = 0;

  // Pass 2: clip true inter-feature display overlaps using the already-normalized
  // geometries. This is independent of the tessellation-safety pass above.
  for (const record of plan.records) {
    if (shouldCancel()) {
      return {
        cancelled: true,
        data: null,
        stats: {
          candidatePairCount: plan.candidatePairCount,
          plannedFeatureCount: plan.plannedFeatureCount,
          repairedFeatureCount,
          renderSafeFeatureCount,
        },
      };
    }

    const feature = features[record.index];
    const subject = baseDisplayGeometry[record.index] ?? geometryToMultiPolygon(feature?.geometry);
    if (!subject) {
      output[record.index] = feature;
      unchangedFeatureCount += 1;
      continue;
    }

    let finalMultiPolygon = subject;
    let overlapChanged = false;

    if (!record.protected && record.clips.length) {
      processedPlanned += 1;
      try {
        const clipGeometries = record.clips
          .map((index) => baseDisplayGeometry[index] ?? geometryToMultiPolygon(features[index]?.geometry))
          .filter(Boolean);
        const result = applyDifferenceBatches(
          polygonClipping,
          subject,
          clipGeometries,
          Math.max(1, Number(clipBatchSize) || DEFAULT_CLIP_BATCH),
        );
        const geometry = multiPolygonToGeometry(result);
        if (!geometry) {
          emptyFallbackCount += 1;
        } else {
          const originalArea = Math.max(record.area, Number.EPSILON);
          const resultArea = multiPolygonArea(result);
          const lossRatio = Math.max(0, (originalArea - resultArea) / originalArea);
          const lossLimit = record.protectedClipCount > 0
            ? maxAuthoredLossRatio
            : maxStockLossRatio;
          if (!Number.isFinite(lossRatio) || lossRatio > lossLimit) {
            lossFallbackCount += 1;
          } else {
            finalMultiPolygon = result;
            overlapChanged = true;
            topologyClippedFeatureCount += 1;
          }
        }
      } catch {
        errorFallbackCount += 1;
      }
    }

    const finalGeometry = multiPolygonToGeometry(finalMultiPolygon);
    if (!finalGeometry) {
      output[record.index] = feature;
      unchangedFeatureCount += 1;
    } else if (baseChanged[record.index] || overlapChanged) {
      output[record.index] = { ...feature, geometry: finalGeometry };
      repairedFeatureCount += 1;
    } else {
      output[record.index] = feature;
      unchangedFeatureCount += 1;
    }

    if (processedPlanned > 0 && processedPlanned % Math.max(1, Number(yieldEvery) || DEFAULT_YIELD_EVERY) === 0) {
      await yieldTask();
    }
  }

  const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
  return {
    cancelled: false,
    data: { type: "FeatureCollection", features: output },
    stats: {
      featureCount: features.length,
      candidatePairCount: plan.candidatePairCount,
      plannedFeatureCount: plan.plannedFeatureCount,
      maxClipCount: plan.maxClipCount,
      repairedFeatureCount,
      topologyClippedFeatureCount,
      renderSafeFeatureCount,
      renderSafeSubdivisionCount,
      renderSafePartCount,
      renderSafeFallbackCount,
      unchangedFeatureCount,
      lossFallbackCount,
      emptyFallbackCount,
      errorFallbackCount,
      elapsedMs,
    },
  };
};

export const buildRegionDisplayMeshBlob = async (featureCollection, options = {}) => {
  const result = await repairRegionDisplayMesh(featureCollection, options);
  if (result.cancelled || !result.data) return { ...result, blob: null };
  const stringifyStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const blob = new Blob([JSON.stringify(result.data)], { type: "application/geo+json" });
  const stringifyMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - stringifyStartedAt;
  return {
    ...result,
    data: null,
    blob,
    stats: {
      ...result.stats,
      bytes: blob.size,
      stringifyMs,
    },
  };
};
