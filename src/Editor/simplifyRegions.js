/*!
 * Open Historia Map Editor
 * Copyright (c) 2026 Nicholas Krol - AGPL-3.0-or-later (see LICENSE).
 */

import MultiPolygon from "ol/geom/MultiPolygon.js";
import Polygon from "ol/geom/Polygon.js";
import { douglasPeucker } from "ol/geom/flat/simplify.js";

const EARTH_RADIUS = 6378137;
const SAMPLE_SEGMENTS = 200000;
export const MIN_DETAIL_METERS = 20;
export const MAX_DETAIL_METERS = 2000;

const groundScale = (y) => Math.cos(2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2);

const polygonsOf = (geometry) => {
  const type = geometry?.getType();
  if (type === "Polygon") return [geometry.getCoordinates()];
  if (type === "MultiPolygon") return geometry.getCoordinates();
  return [];
};

export const mapDetailMeters = (geometries) => {
  let total = 0;
  for (const geometry of geometries) total += geometry ? geometry.getFlatCoordinates().length / 2 : 0;
  const stride = Math.max(1, Math.floor(total / SAMPLE_SEGMENTS));
  const lengths = [];
  let at = 0;
  for (const geometry of geometries) {
    for (const polygon of polygonsOf(geometry)) {
      for (const ring of polygon) {
        for (let i = 1; i < ring.length; i += 1) {
          at += 1;
          if (at % stride) continue;
          const [x1, y1] = ring[i - 1];
          const [x2, y2] = ring[i];
          lengths.push(Math.hypot(x2 - x1, y2 - y1) * groundScale((y1 + y2) / 2));
        }
      }
    }
  }
  if (!lengths.length) return 0;
  lengths.sort((a, b) => a - b);
  return lengths[Math.floor(lengths.length / 2)];
};

export const detailToleranceMeters = (geometries) => Math.min(MAX_DETAIL_METERS, Math.max(MIN_DETAIL_METERS, mapDetailMeters(geometries) / 2));

const simplifyChain = (ids, xs, ys, squared) => {
  if (ids.length <= 2) return ids;
  const flat = new Array(ids.length * 2);
  for (let i = 0; i < ids.length; i += 1) {
    flat[2 * i] = xs[ids[i]];
    flat[2 * i + 1] = ys[ids[i]];
  }
  const out = [];
  const end = douglasPeucker(flat, 0, flat.length, 2, squared, out, 0);
  const kept = [];
  let at = 0;
  for (let i = 0; i < end; i += 2) {
    while (xs[ids[at]] !== out[i] || ys[ids[at]] !== out[i + 1]) at += 1;
    kept.push(ids[at]);
    at += 1;
  }
  return kept;
};

export const simplifyShared = (geometries, { tolerance, movable = null, toleranceAt = null }) => {
  const byX = new Map();
  const xs = [];
  const ys = [];
  const vertexOf = (x, y) => {
    let column = byX.get(x);
    if (!column) {
      column = new Map();
      byX.set(x, column);
    }
    let id = column.get(y);
    if (id === undefined) {
      id = xs.length;
      xs.push(x);
      ys.push(y);
      column.set(y, id);
    }
    return id;
  };
  const rings = [];
  const shape = geometries.map((geometry, owner) => polygonsOf(geometry).map((polygon) => polygon.map((ring) => {
    const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
    const count = closed ? ring.length - 1 : ring.length;
    const ids = new Array(count);
    for (let i = 0; i < count; i += 1) ids[i] = vertexOf(ring[i][0], ring[i][1]);
    rings.push({ owner, ids });
    return rings.length - 1;
  })));
  const stride = xs.length + 1;
  const edgeOf = (a, b) => (a < b ? a * stride + b : b * stride + a);
  const users = new Map();
  for (let id = 0; id < rings.length; id += 1) {
    const ring = rings[id];
    const { ids } = ring;
    ring.edges = new Array(ids.length);
    for (let i = 0; i < ids.length; i += 1) {
      const key = edgeOf(ids[i], ids[(i + 1) % ids.length]);
      ring.edges[i] = key;
      const list = users.get(key);
      if (list) {
        if (!list.includes(id)) list.push(id);
      } else users.set(key, [id]);
    }
  }
  const others = (id, edge) => {
    const list = users.get(rings[id].edges[edge]);
    if (!list || list.length === 1) return -1;
    if (list.length === 2) return list[0] === id ? list[1] : list[0];
    return list.filter((other) => other !== id).sort((x, y) => x - y).join(",");
  };
  const ownersOf = (id, edge) => {
    const list = users.get(rings[id].edges[edge]) || [id];
    return list.map((ring) => rings[ring].owner);
  };
  const done = new Map();
  const canMove = (owner) => !movable || movable[owner] === true;
  const result = rings.map((ring, id) => {
    const { ids } = ring;
    const n = ids.length;
    if (n < 3) return ids;
    const nodes = [];
    for (let i = 0; i < n; i += 1) {
      if (others(id, (i - 1 + n) % n) !== others(id, i)) nodes.push(i);
    }
    if (!nodes.length) {
      let least = 0;
      for (let i = 1; i < n; i += 1) {
        const a = ids[i];
        const b = ids[least];
        if (xs[a] < xs[b] || (xs[a] === xs[b] && ys[a] < ys[b])) least = i;
      }
      nodes.push(least);
    }
    const out = [];
    for (let k = 0; k < nodes.length; k += 1) {
      const from = nodes[k];
      const to = nodes[(k + 1) % nodes.length];
      const chain = [];
      for (let i = from; ; i = (i + 1) % n) {
        chain.push(ids[i]);
        if (i === to && chain.length > 1) break;
        if (chain.length > n + 1) break;
      }
      let simple = chain;
      if (ownersOf(id, from).some(canMove)) {
        const last = chain.length - 1;
        const forward = `${chain[0]},${chain[1]},${chain[last]},${chain.length}`;
        const backward = `${chain[last]},${chain[last - 1]},${chain[0]},${chain.length}`;
        const cached = done.get(forward) ?? (done.has(backward) ? done.get(backward).slice().reverse() : null);
        if (cached) simple = cached;
        else {
          const local = toleranceAt ? toleranceAt(ys[chain[0]]) : tolerance;
          simple = simplifyChain(chain, xs, ys, local * local);
          done.set(forward, simple);
        }
      }
      for (let i = 0; i < simple.length - 1; i += 1) out.push([xs[simple[i]], ys[simple[i]]]);
    }
    return out;
  });
  return geometries.map((geometry, owner) => {
    if (!geometry || !shape[owner].length) return geometry;
    const polygons = [];
    for (const polygon of shape[owner]) {
      const kept = [];
      polygon.forEach((id, at) => {
        const points = result[id];
        if (points.length >= 3) kept.push([...points, points[0]]);
        else if (at === 0) kept.length = 0;
      });
      if (kept.length && result[polygon[0]].length >= 3) polygons.push(kept);
    }
    if (!polygons.length) return geometry;
    return geometry.getType() === "Polygon" && polygons.length === 1 ? new Polygon(polygons[0]) : new MultiPolygon(polygons);
  });
};

export const toleranceAtLatitude = (meters) => (y) => meters / Math.max(0.05, groundScale(y));
