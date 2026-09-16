// Open Historia — coarse region geometry.
//
// A scenario's regions.geojson is full resolution: the stock world is 221 MB
// and 2.6M+ vertices, a hand-drawn one can be as large. Anything that only ever
// shows the map zoomed OUT — the country picker, a preview card — must not
// download or parse that. This is the Douglas-Peucker coarsening the map's far
// tier uses; here it also serves the desktop server and the web store, which
// build a coarse copy of a scenario's regions on demand.
// Dependency-free on purpose: it runs in Node, in a worker and in the page.
//
// It lives under server/ because that is what the desktop app packages: the
// Electron build ships dist/ (the built client) and server/, never src/, so a
// server-side import of src/… loads in development and fails in the installed
// app ("Cannot find module …/app.asar/src/…" took the beta down at startup).
// Code both sides use goes here and the client imports it from ../../server/,
// like ownerMigration.js — server/serverImports.test.js enforces it.
//
// COARSE_TOLERANCE_DEG is the band: 0.01° is 0.64 px at z5.5 and under a pixel
// everywhere the coarse copy is drawn. COARSE_MIN_SPAN_DEG drops rings too
// small to see; a region whose every ring is that small keeps its largest one
// as a speck, so it stays on the map and clickable.

export const COARSE_TOLERANCE_DEG = 0.01;
export const COARSE_MIN_SPAN_DEG = 0.005;

// Squared perpendicular distance from p to segment ab. Squared throughout so the
// hot loop never calls Math.sqrt.
const segmentDistanceSq = (p, a, b) => {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
};

// Douglas-Peucker, iterative rather than recursive: a single coastline ring can
// run to tens of thousands of points, and recursing that deep risks the stack.
// First and last points are always kept, which is what keeps a ring closed.
export const simplifyRing = (ring, toleranceSq) => {
  if (ring.length < 5) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop();
    let furthest = -1;
    let best = toleranceSq;
    for (let i = lo + 1; i < hi; i += 1) {
      const d = segmentDistanceSq(ring[i], ring[lo], ring[hi]);
      if (d > best) {
        best = d;
        furthest = i;
      }
    }
    if (furthest !== -1) {
      keep[furthest] = 1;
      stack.push([lo, furthest], [furthest, hi]);
    }
  }
  const out = [];
  for (let i = 0; i < ring.length; i += 1) if (keep[i]) out.push(ring[i]);
  return out;
};

const ringSpan = (ring) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    if (point[0] < minX) minX = point[0];
    if (point[0] > maxX) maxX = point[0];
    if (point[1] < minY) minY = point[1];
    if (point[1] > maxY) maxY = point[1];
  }
  return Math.max(maxX - minX, maxY - minY);
};

// One polygon: [outerRing, ...holes]. A hole too small to see is dropped on its
// own; if the OUTER ring goes, the whole polygon does, because a hole without
// its shell would paint as land.
const coarsenPolygon = (rings, toleranceSq, minSpan) => {
  const out = [];
  for (let i = 0; i < rings.length; i += 1) {
    const isOuter = i === 0;
    if (ringSpan(rings[i]) < minSpan) {
      if (isOuter) return null;
      continue;
    }
    const simplified = simplifyRing(rings[i], toleranceSq);
    // Under four points there is no area left to fill: a closed ring repeats its
    // first point, so three entries is a degenerate sliver, not a triangle.
    if (simplified.length < 4) {
      if (isOuter) return null;
      continue;
    }
    out.push(simplified);
  }
  return out.length > 0 ? out : null;
};

// When nothing survives the thresholds (an atoll chain scattered over degrees
// of ocean, every ring a speck), keep the biggest single ring anyway: the
// region stays on the map as one speck rather than vanishing.
const largestOuterRing = (geometry) => {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best = null;
  let bestSpan = -1;
  for (const rings of polygons) {
    if (!rings?.length) continue;
    const span = ringSpan(rings[0]);
    if (span > bestSpan) {
      bestSpan = span;
      best = rings[0];
    }
  }
  return best;
};

export const coarsenGeometry = (geometry, {
  toleranceDeg = COARSE_TOLERANCE_DEG,
  minSpanDeg = COARSE_MIN_SPAN_DEG,
} = {}) => {
  const toleranceSq = toleranceDeg * toleranceDeg;
  let coarsened = null;
  if (geometry?.type === "Polygon") {
    const rings = coarsenPolygon(geometry.coordinates, toleranceSq, minSpanDeg);
    coarsened = rings ? { type: "Polygon", coordinates: rings } : null;
  } else if (geometry?.type === "MultiPolygon") {
    const polygons = [];
    for (const polygon of geometry.coordinates) {
      const rings = coarsenPolygon(polygon, toleranceSq, minSpanDeg);
      if (rings) polygons.push(rings);
    }
    coarsened = polygons.length > 0 ? { type: "MultiPolygon", coordinates: polygons } : null;
  } else {
    return null;
  }
  if (coarsened) return coarsened;

  const ring = largestOuterRing(geometry);
  if (!ring || ring.length < 4) return null;
  const simplified = simplifyRing(ring, toleranceSq);
  // Simplifying can flatten a speck below the four points a fill needs; the raw
  // ring is tiny by definition here, so keeping it costs nothing.
  return { type: "Polygon", coordinates: [simplified.length >= 4 ? simplified : ring] };
};

// A whole regions FeatureCollection, coarsened: every polygon feature keeps its
// id and properties (owner, name, claimants — everything a picker or preview
// reads) on a geometry a few hundred times lighter. Point and line features,
// which a regions file should not carry, are dropped.
export const coarsenFeatureCollection = (data, options = {}) => {
  const features = [];
  for (const feature of Array.isArray(data?.features) ? data.features : []) {
    const geometry = coarsenGeometry(feature?.geometry, options);
    if (!geometry) continue;
    const out = { type: "Feature", properties: feature?.properties && typeof feature.properties === "object" ? feature.properties : {}, geometry };
    if (feature?.id !== undefined) out.id = feature.id;
    features.push(out);
  }
  return { type: "FeatureCollection", features };
};

// Vertex count of a FeatureCollection — what the coarse copy is measured by.
export const countFeatureCollectionVertices = (data) => {
  let total = 0;
  const walk = (coords, depth) => {
    if (depth === 0) { total += 1; return; }
    for (const entry of coords) walk(entry, depth - 1);
  };
  for (const feature of Array.isArray(data?.features) ? data.features : []) {
    const geometry = feature?.geometry;
    if (geometry?.type === "Polygon") walk(geometry.coordinates, 2);
    else if (geometry?.type === "MultiPolygon") walk(geometry.coordinates, 3);
  }
  return total;
};
