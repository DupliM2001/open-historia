export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const cubicBezierPoint = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  const uuu = uu * u;
  const ttt = tt * t;
  return [
    uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0],
    uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1],
  ];
};


export const quadraticBezierPoint = (p0, p1, p2, t) => {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
};

export const sampleQuadraticBezier = ({ p0, p1, p2, samples = 128 }) => {
  const count = Math.max(8, Math.floor(samples));
  return Array.from({ length: count }, (_, index) => (
    quadraticBezierPoint(p0, p1, p2, index / (count - 1))
  ));
};

export const sampleCubicBezier = ({ p0, p1, p2, p3, samples = 128 }) => {
  const count = Math.max(8, Math.floor(samples));
  return Array.from({ length: count }, (_, index) => (
    cubicBezierPoint(p0, p1, p2, p3, index / (count - 1))
  ));
};

export const cumulativeArcLengths = (points) => {
  if (!Array.isArray(points) || !points.length) return { cumulative: [], total: 0 };
  const cumulative = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    total += Math.hypot(x1 - x0, y1 - y0);
    cumulative.push(total);
  }
  return { cumulative, total };
};

export const maxTangentTurnDegrees = (points) => {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let maximum = 0;
  let previousAngle = null;
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index][0] - points[index - 1][0];
    const dy = points[index][1] - points[index - 1][1];
    if (Math.hypot(dx, dy) < 1e-12) continue;
    const angle = Math.atan2(dy, dx);
    if (previousAngle != null) {
      let delta = angle - previousAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      maximum = Math.max(maximum, Math.abs(delta) * 180 / Math.PI);
    }
    previousAngle = angle;
  }
  return maximum;
};


export const resamplePolylineByArcLength = (points, samples = 128) => {
  if (!Array.isArray(points) || points.length < 2) return Array.isArray(points) ? [...points] : [];
  const count = Math.max(2, Math.floor(samples));
  const { cumulative, total } = cumulativeArcLengths(points);
  if (!(total > 0)) return Array.from({ length: count }, () => [...points[0]]);

  const result = [];
  let segment = 1;
  for (let index = 0; index < count; index += 1) {
    const target = total * (index / (count - 1));
    while (segment < cumulative.length - 1 && cumulative[segment] < target) segment += 1;
    const startIndex = Math.max(0, segment - 1);
    const endIndex = Math.min(points.length - 1, segment);
    const startDistance = cumulative[startIndex];
    const endDistance = cumulative[endIndex];
    const span = Math.max(1e-15, endDistance - startDistance);
    const t = clamp((target - startDistance) / span, 0, 1);
    const [x0, y0] = points[startIndex];
    const [x1, y1] = points[endIndex];
    result.push([
      x0 + (x1 - x0) * t,
      y0 + (y1 - y0) * t,
    ]);
  }
  return result;
};

export const smoothPolylineChaikin = (points, iterations = 3) => {
  let current = Array.isArray(points)
    ? points.filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
      .map(([x, y]) => [x, y])
    : [];
  if (current.length < 3) return current;

  const passes = Math.max(0, Math.min(6, Math.floor(iterations)));
  for (let pass = 0; pass < passes; pass += 1) {
    const next = [current[0]];
    for (let index = 0; index < current.length - 1; index += 1) {
      const [x0, y0] = current[index];
      const [x1, y1] = current[index + 1];
      next.push([
        x0 * 0.75 + x1 * 0.25,
        y0 * 0.75 + y1 * 0.25,
      ]);
      next.push([
        x0 * 0.25 + x1 * 0.75,
        y0 * 0.25 + y1 * 0.75,
      ]);
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
};

const pointAtArcDistance = (points, cumulative, distance) => {
  if (!points.length) return null;
  const total = cumulative[cumulative.length - 1] ?? 0;
  const target = clamp(distance, 0, total);
  let segment = 1;
  while (segment < cumulative.length - 1 && cumulative[segment] < target) segment += 1;
  const startIndex = Math.max(0, segment - 1);
  const endIndex = Math.min(points.length - 1, segment);
  const startDistance = cumulative[startIndex] ?? 0;
  const endDistance = cumulative[endIndex] ?? startDistance;
  const span = Math.max(1e-15, endDistance - startDistance);
  const t = clamp((target - startDistance) / span, 0, 1);
  const [x0, y0] = points[startIndex];
  const [x1, y1] = points[endIndex];
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
};

export const extractCenteredSubpathByArcLength = (
  points,
  desiredLength,
  { centerFraction = 0.5, samples = 96 } = {},
) => {
  if (!Array.isArray(points) || points.length < 2) return Array.isArray(points) ? [...points] : [];
  const { cumulative, total } = cumulativeArcLengths(points);
  if (!(total > 0)) return [...points];

  const length = clamp(Number(desiredLength) || total, 1e-12, total);
  const center = clamp(Number(centerFraction) || 0.5, 0, 1) * total;
  let start = center - length / 2;
  let end = center + length / 2;
  if (start < 0) {
    end = Math.min(total, end - start);
    start = 0;
  }
  if (end > total) {
    start = Math.max(0, start - (end - total));
    end = total;
  }

  const count = Math.max(8, Math.floor(samples));
  return Array.from({ length: count }, (_, index) => {
    const distance = start + (end - start) * (index / (count - 1));
    return pointAtArcDistance(points, cumulative, distance);
  }).filter(Boolean);
};


const sanitizePolyline = (points) => (
  Array.isArray(points)
    ? points.filter((point) => (
      Array.isArray(point)
      && Number.isFinite(Number(point[0]))
      && Number.isFinite(Number(point[1]))
    )).map(([x, y]) => [Number(x), Number(y)])
    : []
);

/**
 * Convert an arbitrary worker corridor into one deliberately cartographic arc.
 *
 * The worker baseline is allowed to contain local bends because its job is to
 * stay inside the polity. The typography renderer has a different job: present
 * one calm label. This function therefore treats the worker path as a hint for
 * bend direction/magnitude, but outputs a single quadratic Bezier. A quadratic
 * has one curvature sign and cannot form an S-curve or local wiggle.
 */
export const canonicalSingleArcFromPolyline = (
  points,
  {
    samples = 128,
    bendScale = 0.85,
    minBendRatio = 0.006,
    maxBendRatio = 0.06,
  } = {},
) => {
  const input = sanitizePolyline(points);
  if (input.length < 2) return input;

  const start = input[0];
  const end = input[input.length - 1];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const chordLength = Math.hypot(dx, dy);
  const count = Math.max(8, Math.floor(samples));

  if (!(chordLength > 1e-12)) {
    return resamplePolylineByArcLength(input, count);
  }

  // Left-hand unit normal to the start -> end chord. The sign of a point's
  // projection onto this normal says which side of the chord the worker path
  // occupies. We use weighted "energy" rather than only one middle vertex so
  // noisy/S-shaped inputs still resolve to the dominant cartographic bow.
  const nx = -dy / chordLength;
  const ny = dx / chordLength;
  const probe = resamplePolylineByArcLength(input, Math.max(33, input.length * 8));
  let positiveEnergy = 0;
  let negativeEnergy = 0;
  let positivePeak = 0;
  let negativePeak = 0;

  for (let index = 1; index < probe.length - 1; index += 1) {
    const t = index / (probe.length - 1);
    const weight = Math.sin(Math.PI * t) ** 2;
    const vx = probe[index][0] - start[0];
    const vy = probe[index][1] - start[1];
    const signed = vx * nx + vy * ny;
    if (signed >= 0) {
      positiveEnergy += signed * weight;
      positivePeak = Math.max(positivePeak, signed);
    } else {
      const magnitude = -signed;
      negativeEnergy += magnitude * weight;
      negativePeak = Math.max(negativePeak, magnitude);
    }
  }

  const side = positiveEnergy >= negativeEnergy ? 1 : -1;
  const dominantPeak = side > 0 ? positivePeak : negativePeak;
  const rawBendRatio = dominantPeak / chordLength;

  // A nearly straight legal corridor stays straight. Otherwise preserve the
  // worker's broad intent but cap it to a restrained cartographic C-shape.
  // The cap is intentionally global/generic; there are no polity-specific rules.
  const bendRatio = rawBendRatio < minBendRatio
    ? 0
    : clamp(rawBendRatio * bendScale, minBendRatio, maxBendRatio);

  const midpoint = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
  ];

  // For a quadratic Bezier, the curve at t=0.5 lies halfway between the chord
  // midpoint and control point, hence a 2x control offset gives the requested
  // midpoint sagitta.
  const sagitta = side * bendRatio * chordLength;
  const control = [
    midpoint[0] + nx * sagitta * 2,
    midpoint[1] + ny * sagitta * 2,
  ];

  const dense = sampleQuadraticBezier({
    p0: start,
    p1: control,
    p2: end,
    samples: Math.max(256, count * 4),
  });
  return resamplePolylineByArcLength(dense, count);
};

export const signedBendMetrics = (points) => {
  const input = sanitizePolyline(points);
  if (input.length < 3) return { sign: 0, bendRatio: 0 };
  const start = input[0];
  const end = input[input.length - 1];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const chord = Math.hypot(dx, dy);
  if (!(chord > 1e-12)) return { sign: 0, bendRatio: 0 };
  const nx = -dy / chord;
  const ny = dx / chord;
  let weighted = 0;
  let weightTotal = 0;
  let maximum = 0;
  for (let index = 1; index < input.length - 1; index += 1) {
    const t = index / (input.length - 1);
    const chordPoint = [start[0] + dx * t, start[1] + dy * t];
    const ox = input[index][0] - chordPoint[0];
    const oy = input[index][1] - chordPoint[1];
    const signed = ox * nx + oy * ny;
    const weight = Math.sin(Math.PI * t) ** 2;
    weighted += signed * weight;
    weightTotal += weight;
    maximum = Math.max(maximum, Math.abs(signed));
  }
  const average = weightTotal > 0 ? weighted / weightTotal : 0;
  return {
    sign: Math.abs(average) < chord * 1e-5 ? 0 : Math.sign(average),
    bendRatio: maximum / chord,
  };
};

export const singleArcFromAxis = ({
  center,
  angleDeg,
  chordLength,
  bendRatio = 0.04,
  bendSign = 1,
  samples = 128,
}) => {
  if (!Array.isArray(center) || center.length < 2) return [];
  const length = Math.max(0, Number(chordLength) || 0);
  if (!(length > 1e-12)) return [];
  const angle = (Number(angleDeg) || 0) * Math.PI / 180;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const half = length / 2;
  const start = [center[0] - ux * half, center[1] - uy * half];
  const end = [center[0] + ux * half, center[1] + uy * half];
  const signedRatio = clamp(Math.abs(Number(bendRatio) || 0), 0, 0.12)
    * (Number(bendSign) < 0 ? -1 : 1);
  // For a quadratic Bezier, the midpoint deviation is half of the control
  // point's offset from the chord midpoint.
  const controlOffset = length * signedRatio * 2;
  const control = [center[0] + nx * controlOffset, center[1] + ny * controlOffset];
  const dense = sampleQuadraticBezier({ p0: start, p1: control, p2: end, samples: Math.max(64, samples * 2) });
  return resamplePolylineByArcLength(dense, samples);
};
