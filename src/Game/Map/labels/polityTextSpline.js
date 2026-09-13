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
