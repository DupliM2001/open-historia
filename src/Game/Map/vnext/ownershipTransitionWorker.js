/*! Open Historia — bounded ownership sweep geometry worker © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

let polygonClipperPromise = null;
const loadPolygonClipper = () => {
  if (globalThis.__OH_POLYGON_CLIPPER_TEST__) {
    return Promise.resolve(globalThis.__OH_POLYGON_CLIPPER_TEST__);
  }
  if (!polygonClipperPromise) {
    polygonClipperPromise = import("polygon-clipping").then((module) => module.default ?? module);
  }
  return polygonClipperPromise;
};

const ringsOfGeometry = (geometry) => {
  if (geometry?.type === "Polygon") return geometry.coordinates ?? [];
  if (geometry?.type === "MultiPolygon") return (geometry.coordinates ?? []).flat();
  return [];
};

const vertexCountOf = (geometry) => ringsOfGeometry(geometry)
  .reduce((sum, ring) => sum + (Array.isArray(ring) ? ring.length : 0), 0);

const pointsOf = (geometry) => ringsOfGeometry(geometry)
  .flatMap((ring) => (Array.isArray(ring) ? ring : []))
  .filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
  .map(([x, y]) => [Number(x), Number(y)]);

const normalizedDirection = (dx, dy) => {
  const x = Number(dx);
  const y = Number(dy);
  const length = Math.hypot(x, y);
  if (!(length > 1e-9)) return [1, 0];
  return [x / length, y / length];
};

const stripPolygon = ({ center, d, n, t0, t1, nMin, nMax }) => {
  const point = (t, normal) => [
    center[0] + d[0] * t + n[0] * normal,
    center[1] + d[1] * t + n[1] * normal,
  ];
  return [[
    point(t0, nMin),
    point(t1, nMin),
    point(t1, nMax),
    point(t0, nMax),
    point(t0, nMin),
  ]];
};

export const sliceOwnershipTransitionFeature = async (feature) => {
  const geometry = feature?.geometry;
  const points = pointsOf(geometry);
  if (!points.length || !["Polygon", "MultiPolygon"].includes(geometry?.type)) return [];

  const center = points.reduce((sum, [x, y]) => [sum[0] + x, sum[1] + y], [0, 0])
    .map((value) => value / points.length);

  // sweepDx/sweepDy describe the desired LOCAL RENDERED/Mercator direction.
  // The clipping strips themselves are built in raw lon/lat coordinates.
  // Locally, MapLibre magnifies latitude by ~1/cos(lat), so converting a
  // rendered vector back to geographic degrees must MULTIPLY its latitude
  // component by cos(lat). Dividing here double-amplifies north/south motion
  // and was the reason high-latitude sweeps (Finland) looked almost vertical.
  const [screenDx, screenDy] = normalizedDirection(
    feature?.properties?.sweepDx,
    feature?.properties?.sweepDy,
  );
  const centerLat = Number(center[1]);
  const cosLat = Math.max(
    0.2,
    Math.cos(((Number.isFinite(centerLat) ? centerLat : 0) * Math.PI) / 180),
  );
  const [dx, dy] = normalizedDirection(screenDx, screenDy * cosLat);
  const nx = -dy;
  const ny = dx;

  let minT = Infinity;
  let maxT = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [x, y] of points) {
    const rx = x - center[0];
    const ry = y - center[1];
    const t = rx * dx + ry * dy;
    const normal = rx * nx + ry * ny;
    minT = Math.min(minT, t);
    maxT = Math.max(maxT, t);
    minN = Math.min(minN, normal);
    maxN = Math.max(maxN, normal);
  }
  if (![minT, maxT, minN, maxN].every(Number.isFinite) || maxT - minT <= 1e-9) return [];

  const vertices = vertexCountOf(geometry);
  // More complex provinces still animate directionally; they simply use fewer
  // strips so a cosmetic effect cannot become another topology workload.
  const bandCount = vertices > 20000 ? 8 : vertices > 8000 ? 12 : 20;
  const pad = Math.max(1e-4, (maxN - minN) * 0.05);
  const bandWidth = (maxT - minT) / bandCount;
  const clipper = await loadPolygonClipper();
  const subject = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const output = [];

  for (let band = 0; band < bandCount; band += 1) {
    const t0 = minT + bandWidth * band - (band === 0 ? 1e-7 : 0);
    const t1 = band === bandCount - 1 ? maxT + 1e-7 : minT + bandWidth * (band + 1);
    const clipPolygon = stripPolygon({
      center,
      d: [dx, dy],
      n: [nx, ny],
      t0,
      t1,
      nMin: minN - pad,
      nMax: maxN + pad,
    });
    let clipped;
    try {
      clipped = clipper.intersection(subject, clipPolygon);
    } catch {
      return [{
        type: "Feature",
        id: `${feature.id ?? feature?.properties?.id ?? "region"}:0`,
        geometry,
        properties: {
          ...(feature.properties ?? {}),
          transitionBand: 0,
          transitionBandCount: 1,
          transitionT: 1,
        },
      }];
    }
    if (!Array.isArray(clipped) || !clipped.length) continue;
    output.push({
      type: "Feature",
      id: `${feature.id ?? feature?.properties?.id ?? "region"}:${band}`,
      geometry: { type: "MultiPolygon", coordinates: clipped },
      properties: {
        ...(feature.properties ?? {}),
        transitionBand: band,
        transitionBandCount: bandCount,
        transitionT: (band + 1) / bandCount,
      },
    });
  }

  return output.length ? output : [{
    type: "Feature",
    id: `${feature.id ?? feature?.properties?.id ?? "region"}:0`,
    geometry,
    properties: {
      ...(feature.properties ?? {}),
      transitionBand: 0,
      transitionBandCount: 1,
    },
  }];
};


const MAX_MERCATOR_LAT = 85.05112878;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mercatorY = (lat) => {
  const limited = clamp(Number(lat) || 0, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT);
  const radians = limited * Math.PI / 180;
  return (1 - (Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI)) / 2;
};
const wrappedLongitudeDelta = (fromLng, toLng) => {
  let delta = (Number(toLng) || 0) - (Number(fromLng) || 0);
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
};
const mercatorPoint = ([lng, lat], anchorLng) => {
  const unwrappedLng = Number(anchorLng) + wrappedLongitudeDelta(anchorLng, lng);
  return [(unwrappedLng + 180) / 360, mercatorY(lat)];
};
const polygonSetsOf = (geometry) => {
  if (geometry?.type === "Polygon") return [geometry.coordinates ?? []];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates ?? [];
  return [];
};

const gridResolutionForBounds = ({ spanX, spanY, vertexCount }) => {
  const aspect = clamp(spanX / Math.max(1e-12, spanY), 0.125, 8);
  // One bounded field now represents the entire transferred region, including
  // all of its multipolygon/island components. 144-224 is enough for a smooth
  // front once the scalar field is filtered, and keeps preparation below the
  // perceptual "instant" budget on ordinary provinces.
  const complexityBase = vertexCount > 12000 ? 176 : vertexCount > 4000 ? 160 : 144;
  const root = Math.sqrt(aspect);
  const width = clamp(Math.round(complexityBase * root), 64, 224);
  const height = clamp(Math.round(complexityBase / root), 64, 224);
  return { width, height };
};

const rasterizePolygonSetMask = ({ polygons, bounds, width, height }) => {
  const mask = new Uint8Array(width * height);
  const spanX = Math.max(1e-12, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-12, bounds.maxY - bounds.minY);

  // Rasterize each polygon component independently and OR it into the region
  // mask. This preserves holes with even/odd fill while avoiding the old bug
  // where hundreds of multipolygon components became hundreds of flood fields.
  for (let row = 0; row < height; row += 1) {
    const y = bounds.minY + (((row + 0.5) / height) * spanY);
    for (const rings of polygons) {
      const intersections = [];
      for (const ring of rings) {
        for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
          const a = ring[previous];
          const b = ring[index];
          if (!a || !b) continue;
          const ay = Number(a[1]);
          const by = Number(b[1]);
          if ((ay > y) === (by > y)) continue;
          const ax = Number(a[0]);
          const bx = Number(b[0]);
          const denominator = by - ay;
          if (Math.abs(denominator) <= 1e-18) continue;
          const x = ax + (((y - ay) * (bx - ax)) / denominator);
          if (Number.isFinite(x)) intersections.push(x);
        }
      }
      intersections.sort((a, b) => a - b);
      for (let pair = 0; pair + 1 < intersections.length; pair += 2) {
        const x0 = intersections[pair];
        const x1 = intersections[pair + 1];
        const c0 = clamp(Math.ceil((((x0 - bounds.minX) / spanX) * width) - 0.5), 0, width - 1);
        const c1 = clamp(Math.floor((((x1 - bounds.minX) / spanX) * width) - 0.5), 0, width - 1);
        for (let col = c0; col <= c1; col += 1) mask[(row * width) + col] = 1;
      }
    }
  }
  return mask;
};

class MinHeap {
  constructor() { this.items = []; }
  push(index, distance) {
    const item = [distance, index];
    this.items.push(item);
    let cursor = this.items.length - 1;
    while (cursor > 0) {
      const parent = Math.floor((cursor - 1) / 2);
      if (this.items[parent][0] <= distance) break;
      this.items[cursor] = this.items[parent];
      cursor = parent;
    }
    this.items[cursor] = item;
  }
  pop() {
    if (!this.items.length) return null;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      let cursor = 0;
      while (true) {
        const left = (cursor * 2) + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        let child = left;
        if (right < this.items.length && this.items[right][0] < this.items[left][0]) child = right;
        if (this.items[child][0] >= last[0]) break;
        this.items[cursor] = this.items[child];
        cursor = child;
      }
      this.items[cursor] = last;
    }
    return { distance: first[0], index: first[1] };
  }
  get size() { return this.items.length; }
}

const connectedComponents = (mask, width, height) => {
  const componentByCell = new Int32Array(mask.length);
  componentByCell.fill(-1);
  const components = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || componentByCell[start] >= 0) continue;
    const id = components.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    componentByCell[start] = id;
    const cells = [];
    while (head < tail) {
      const index = queue[head++];
      cells.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || !mask[neighbor] || componentByCell[neighbor] >= 0) continue;
        componentByCell[neighbor] = id;
        queue[tail++] = neighbor;
      }
    }
    components.push(cells);
  }
  return { componentByCell, components };
};

const addFrontierSeeds = ({
  frontierSegments, anchorLng, bounds, width, height, mask, seedCosts, direction,
}) => {
  const spanX = Math.max(1e-12, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-12, bounds.maxY - bounds.minY);
  const rawSeeds = [];
  const toGrid = ([mx, my]) => [
    ((mx - bounds.minX) / spanX) * width - 0.5,
    ((my - bounds.minY) / spanY) * height - 0.5,
  ];

  for (const segment of frontierSegments ?? []) {
    if (!Array.isArray(segment) || segment.length < 2) continue;
    const a = toGrid(mercatorPoint(segment[0], anchorLng));
    const b = toGrid(mercatorPoint(segment[1], anchorLng));
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = clamp(Math.ceil(length * 1.4), 1, 768);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const gx = a[0] + ((b[0] - a[0]) * t);
      const gy = a[1] + ((b[1] - a[1]) * t);
      const cx = Math.round(gx);
      const cy = Math.round(gy);
      let best = -1;
      let bestDistance = Infinity;
      for (let radius = 0; radius <= 2; radius += 1) {
        for (let yy = cy - radius; yy <= cy + radius; yy += 1) {
          if (yy < 0 || yy >= height) continue;
          for (let xx = cx - radius; xx <= cx + radius; xx += 1) {
            if (xx < 0 || xx >= width) continue;
            const index = (yy * width) + xx;
            if (!mask[index]) continue;
            const distance = ((xx - gx) ** 2) + ((yy - gy) ** 2);
            if (distance < bestDistance) { best = index; bestDistance = distance; }
          }
        }
        if (best >= 0) break;
      }
      if (best >= 0) rawSeeds.push(best);
    }
  }

  const unique = [...new Set(rawSeeds)];
  if (!unique.length) return [];
  let minProjection = Infinity;
  let maxProjection = -Infinity;
  const projections = new Map();
  for (const index of unique) {
    const x = index % width;
    const y = Math.floor(index / width);
    const projection = (x * direction[0]) + (y * direction[1]);
    projections.set(index, projection);
    minProjection = Math.min(minProjection, projection);
    maxProjection = Math.max(maxProjection, projection);
  }
  const span = Math.max(1e-6, maxProjection - minProjection);
  for (const index of unique) {
    const phase = (projections.get(index) - minProjection) / span;
    seedCosts.set(index, Math.min(seedCosts.get(index) ?? Infinity, phase * Math.max(width, height) * 0.08));
  }
  return unique;
};

const hashString01 = (value) => {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000003) / 1000003;
};

const buildPropagationCostField = ({ mask, width, height, seedKey = "" }) => {
  const costs = new Float32Array(mask.length);
  const phase = hashString01(seedKey) * Math.PI * 2;
  const phaseB = hashString01(`${seedKey}:b`) * Math.PI * 2;
  const phaseC = hashString01(`${seedKey}:c`) * Math.PI * 2;
  const tau = Math.PI * 2;

  // A low-frequency deterministic speed field makes a real distance flood read
  // as a flood even when the political frontier itself is almost perfectly
  // straight. The variation changes traversal SPEED, not final arrival values,
  // so the advancing front stays connected and cannot spawn target-colour
  // islands ahead of itself. Keep the range deliberately restrained: geography
  // and recipient-mass direction still dominate the motion.
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / Math.max(1, height);
    for (let x = 0; x < width; x += 1) {
      const index = (y * width) + x;
      if (!mask[index]) continue;
      const u = (x + 0.5) / Math.max(1, width);
      const wave = (0.46 * Math.sin((u * tau * 1.17) + (v * tau * 0.43) + phase))
        + (0.34 * Math.sin((u * tau * 0.61) - (v * tau * 1.29) + phaseB))
        + (0.20 * Math.sin((u * tau * 1.91) + (v * tau * 0.77) + phaseC));
      costs[index] = clamp(1 + (wave * 0.20), 0.80, 1.20);
    }
  }
  return costs;
};

const solveDistanceField = ({ mask, width, height, seedCosts, propagationCosts = null }) => {
  const distances = new Float64Array(mask.length);
  distances.fill(Infinity);
  const heap = new MinHeap();
  for (const [index, cost] of seedCosts) {
    if (!mask[index]) continue;
    distances[index] = cost;
    heap.push(index, cost);
  }
  const neighbors = [
    [-1, -1, Math.SQRT2], [0, -1, 1], [1, -1, Math.SQRT2],
    [-1, 0, 1], [1, 0, 1],
    [-1, 1, Math.SQRT2], [0, 1, 1], [1, 1, Math.SQRT2],
  ];
  let maxDistance = 0;
  while (heap.size) {
    const item = heap.pop();
    if (!item || item.distance > distances[item.index] + 1e-5) continue;
    maxDistance = Math.max(maxDistance, item.distance);
    const x = item.index % width;
    const y = Math.floor(item.index / width);
    for (const [ox, oy, cost] of neighbors) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const next = (ny * width) + nx;
      if (!mask[next]) continue;
      // Do not let a diagonal hop cut through a one-cell geographic corner.
      if (ox && oy) {
        if (!mask[(y * width) + nx] && !mask[(ny * width) + x]) continue;
      }
      const localCost = propagationCosts
        ? Math.max(0.2, ((propagationCosts[item.index] || 1) + (propagationCosts[next] || 1)) * 0.5)
        : 1;
      const candidate = item.distance + (cost * localCost);
      if (candidate + 1e-6 >= distances[next]) continue;
      distances[next] = candidate;
      heap.push(next, candidate);
    }
  }
  return { distances, maxDistance };
};

const smoothMaskedScalar = ({ values, mask, width, height, passes = 2 }) => {
  let source = values;
  for (let pass = 0; pass < passes; pass += 1) {
    const target = new Float32Array(source.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width) + x;
        if (!mask[index]) continue;
        let total = 0;
        let weight = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          const yy = y + oy;
          if (yy < 0 || yy >= height) continue;
          for (let ox = -1; ox <= 1; ox += 1) {
            const xx = x + ox;
            if (xx < 0 || xx >= width) continue;
            const neighbor = (yy * width) + xx;
            if (!mask[neighbor]) continue;
            const w = (ox === 0 && oy === 0) ? 4 : (ox === 0 || oy === 0) ? 2 : 1;
            total += source[neighbor] * w;
            weight += w;
          }
        }
        target[index] = weight ? total / weight : source[index];
      }
    }
    source = target;
  }
  return source;
};

const buildFloodFieldForFeature = (feature) => {
  const polygonsLngLat = polygonSetsOf(feature?.geometry)
    .filter((rings) => Array.isArray(rings) && rings.some((ring) => Array.isArray(ring) && ring.length >= 3));
  if (!polygonsLngLat.length) return null;

  const firstPoint = polygonsLngLat
    .flatMap((rings) => rings)
    .flatMap((ring) => ring)
    .find((point) => Array.isArray(point) && point.length >= 2);
  if (!firstPoint) return null;
  const anchorLng = Number(firstPoint[0]) || 0;
  const projectedPolygons = polygonsLngLat.map((rings) => rings.map((ring) => ring
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map((point) => mercatorPoint(point, anchorLng))));
  const points = projectedPolygons.flat(2);
  if (!points.length) return null;

  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  if (![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite)) return null;
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  if (!(spanX > 1e-12) || !(spanY > 1e-12)) return null;

  const vertexCount = projectedPolygons.reduce(
    (sum, rings) => sum + rings.reduce((inner, ring) => inner + ring.length, 0),
    0,
  );
  const { width, height } = gridResolutionForBounds({ spanX, spanY, vertexCount });
  const mask = rasterizePolygonSetMask({ polygons: projectedPolygons, bounds, width, height });
  if (!mask.some(Boolean)) return null;

  const screenDx = Number(feature?.properties?.sweepDx) || 1;
  const screenDy = Number(feature?.properties?.sweepDy) || 0;
  const length = Math.hypot(screenDx, screenDy) || 1;
  // sweepDy is north-positive while Mercator y grows southward.
  const direction = [screenDx / length, -screenDy / length];
  const seedCosts = new Map();
  const frontierSeeds = addFrontierSeeds({
    frontierSegments: feature?.properties?.frontierSegments ?? [],
    anchorLng, bounds, width, height, mask, seedCosts, direction,
  });
  const { componentByCell, components } = connectedComponents(mask, width, height);
  const seededComponents = new Set(frontierSeeds.map((index) => componentByCell[index]).filter((id) => id >= 0));
  const detachedComponents = new Set();

  for (let componentId = 0; componentId < components.length; componentId += 1) {
    if (seededComponents.has(componentId)) continue;
    detachedComponents.add(componentId);
    const cells = components[componentId];
    let minProjection = Infinity;
    let maxProjection = -Infinity;
    for (const index of cells) {
      const x = index % width;
      const y = Math.floor(index / width);
      const projection = (x * direction[0]) + (y * direction[1]);
      minProjection = Math.min(minProjection, projection);
      maxProjection = Math.max(maxProjection, projection);
    }
    const threshold = minProjection + (Math.max(1e-6, maxProjection - minProjection) * 0.035);
    for (const index of cells) {
      const x = index % width;
      const y = Math.floor(index / width);
      const projection = (x * direction[0]) + (y * direction[1]);
      if (projection <= threshold) seedCosts.set(index, Math.min(seedCosts.get(index) ?? Infinity, 0));
    }
  }

  const propagationCosts = buildPropagationCostField({
    mask,
    width,
    height,
    seedKey: feature?.properties?.id ?? feature?.id ?? "region",
  });
  const { distances, maxDistance } = solveDistanceField({
    mask, width, height, seedCosts, propagationCosts,
  });
  let minDir = Infinity;
  let maxDir = -Infinity;
  let maxFiniteDistance = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const projection = (x * direction[0]) + (y * direction[1]);
    minDir = Math.min(minDir, projection);
    maxDir = Math.max(maxDir, projection);
    if (Number.isFinite(distances[index])) maxFiniteDistance = Math.max(maxFiniteDistance, distances[index]);
  }
  const dirSpan = Math.max(1e-6, maxDir - minDir);
  maxFiniteDistance = Math.max(1e-6, maxFiniteDistance);

  const arrival = new Float32Array(mask.length);
  let minArrival = Infinity;
  let maxArrival = -Infinity;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const dirT = (((x * direction[0]) + (y * direction[1])) - minDir) / dirSpan;
    const distT = clamp(distances[index] / maxFiniteDistance, 0, 1);
    // The path-distance already contains the restrained coherent speed warp.
    // Keep recipient-mass direction as a macro prior, but do not let it flatten
    // the field back into a geometric wipe on straight borders.
    let value = (0.82 * distT) + (0.18 * dirT);
    if (detachedComponents.has(componentByCell[index])) {
      const localVariation = clamp((propagationCosts[index] - 0.80) / 0.40, 0, 1);
      value = 0.18 + (0.48 * dirT) + (0.06 * localVariation);
    }
    arrival[index] = value;
    minArrival = Math.min(minArrival, value);
    maxArrival = Math.max(maxArrival, value);
  }

  const arrivalSpan = Math.max(1e-6, maxArrival - minArrival);
  const detachedOnly = detachedComponents.size === components.length;
  const normalized = new Float32Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    normalized[index] = detachedOnly
      ? clamp(arrival[index], 0, 1)
      : clamp((arrival[index] - minArrival) / arrivalSpan, 0, 1);
  }
  const filtered = smoothMaskedScalar({ values: normalized, mask, width, height, passes: 2 });

  const textureData = new Uint8Array(width * height * 4);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    textureData[offset] = Math.round(clamp(filtered[index], 0, 1) * 255);
    textureData[offset + 1] = detachedComponents.has(componentByCell[index]) ? 255 : 0;
    textureData[offset + 2] = 0;
    textureData[offset + 3] = 255;
  }

  const travelFraction = clamp(maxDistance / Math.max(1, Math.hypot(width, height)), 0, 1);
  return {
    regionId: String(feature?.properties?.id ?? feature?.id ?? ""),
    polygonIndex: 0,
    width, height, bounds, textureData,
    fromColor: feature?.properties?.fromColor ?? "rgb(128, 128, 128)",
    toColor: feature?.properties?.toColor ?? "rgb(128, 128, 128)",
    durationMs: detachedOnly ? 300 : Math.round(clamp(320 + (travelFraction * 280), 320, 650)),
    feather: detachedOnly ? 0.18 : clamp(3.5 / Math.max(width, height), 0.024, 0.05),
    detached: detachedOnly,
    sweepBasis: feature?.properties?.sweepBasis ?? "",
    componentCount: components.length,
  };
};

export const buildOwnershipFloodFields = (feature) => {
  const field = buildFloodFieldForFeature(feature);
  return field ? [field] : [];
};

if (typeof self !== "undefined") self.onmessage = async ({ data: message }) => {
  const requestId = message?.requestId;
  if (!requestId) return;
  const startedAt = performance.now();
  try {
    if (message?.type === "build-ownership-flood") {
      const fields = [];
      for (const feature of message?.features ?? []) fields.push(...buildOwnershipFloodFields(feature));
      const transfer = fields.map((field) => field.textureData?.buffer).filter(Boolean);
      self.postMessage({
        type: "ownership-transition-flood",
        requestId,
        fields,
        elapsedMs: performance.now() - startedAt,
      }, transfer);
      return;
    }
    if (message?.type !== "slice-ownership-transition") return;
    const features = [];
    for (const feature of message?.features ?? []) {
      features.push(...await sliceOwnershipTransitionFeature(feature));
    }
    self.postMessage({
      type: "ownership-transition-slices",
      requestId,
      data: { type: "FeatureCollection", features },
      elapsedMs: performance.now() - startedAt,
    });
  } catch (error) {
    self.postMessage({
      type: "ownership-transition-error",
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
