/*!
 * Open Historia Map Editor
 * Copyright (c) 2026 Nicholas Krol - AGPL-3.0-or-later (see LICENSE).
 */

import Feature from "ol/Feature.js";
import MultiPolygon from "ol/geom/MultiPolygon.js";
import Polygon, { fromExtent as polygonFromExtent } from "ol/geom/Polygon.js";
import VectorSource from "ol/source/Vector.js";
import { buffer as bufferExtent, containsExtent, getCenter, getHeight, getWidth, intersects } from "ol/extent.js";
import { douglasPeucker } from "ol/geom/flat/simplify.js";

const ZOOM0_RESOLUTION = 156543.03392804097;
export const FAR_DETAIL = 0;

export const detailOf = (resolution) => Math.max(0, Math.floor(Math.log2(ZOOM0_RESOLUTION / resolution) + 1e-9));
export const toleranceOf = (detail, pixelRatio = 1) => ZOOM0_RESOLUTION / 2 ** (detail + 1) / Math.max(1, pixelRatio);

const simplifyRings = (flat, offset, ends, squared, out) => {
  const kept = [];
  let start = offset;
  for (let i = 0; i < ends.length; i += 1) {
    const end = ends[i];
    const before = out.length;
    const after = douglasPeucker(flat, start, end, 2, squared, out, before);
    out.length = after;
    if (after - before < 8) {
      out.length = before;
      if (i === 0) return null;
    } else {
      kept.push(after);
    }
    start = end;
  }
  return kept;
};

export const simplifyRegion = (geometry, tolerance) => {
  const type = geometry?.getType();
  if (type !== "Polygon" && type !== "MultiPolygon") return geometry ?? null;
  const squared = tolerance * tolerance;
  const flat = geometry.getFlatCoordinates();
  const out = [];
  if (type === "Polygon") {
    const ends = simplifyRings(flat, 0, geometry.getEnds(), squared, out);
    return ends ? new Polygon(out, "XY", ends) : polygonFromExtent(geometry.getExtent());
  }
  const endss = [];
  let offset = 0;
  for (const ends of geometry.getEndss()) {
    const before = out.length;
    const kept = simplifyRings(flat, offset, ends, squared, out);
    if (kept) endss.push(kept);
    else out.length = before;
    offset = ends[ends.length - 1];
  }
  return endss.length ? new MultiPolygon(out, "XY", endss) : polygonFromExtent(geometry.getExtent());
};

const nextFrame = (fn) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : setTimeout(fn, 0));

export const createRegionDisplay = ({ regionSource, pixelRatio = 1, sliceMs = 8, schedule = nextFrame }) => {
  const source = new VectorSource({ wrapX: false });
  const proxies = new Map();
  const shapes = new WeakMap();
  let detail = FAR_DETAIL;
  let near = null;
  let pending = [];

  const shapeAt = (original, level) => {
    const geometry = original.getGeometry();
    if (!geometry) return null;
    let entry = shapes.get(original);
    if (!entry || entry.geometry !== geometry || entry.revision !== geometry.getRevision()) {
      entry = { geometry, revision: geometry.getRevision(), byDetail: new Map() };
      shapes.set(original, entry);
    }
    let shape = entry.byDetail.get(level);
    if (!shape) {
      shape = simplifyRegion(geometry, toleranceOf(level, pixelRatio));
      entry.byDetail.set(level, shape);
    }
    return shape;
  };

  const levelFor = (original) => {
    if (!near) return detail;
    const geometry = original.getGeometry();
    return geometry && intersects(geometry.getExtent(), near) ? detail : FAR_DETAIL;
  };

  const place = (original) => {
    const proxy = proxies.get(original);
    if (!proxy) return false;
    const shape = shapeAt(original, levelFor(original));
    if (proxy.getGeometry() === shape) return false;
    proxy.setGeometry(shape);
    return true;
  };

  const flush = () => {
    const list = pending;
    pending = [];
    if (list.length) source.addFeatures(list);
  };

  const adopt = (original) => {
    if (proxies.has(original) || !original.getGeometry()) return;
    const proxy = new Feature();
    proxy.region = original;
    proxies.set(original, proxy);
    proxy.setGeometry(shapeAt(original, levelFor(original)));
    pending.push(proxy);
    if (pending.length === 1) queueMicrotask(flush);
  };

  const drop = (original) => {
    const proxy = proxies.get(original);
    if (!proxy) return;
    proxies.delete(original);
    const at = pending.indexOf(proxy);
    if (at >= 0) pending.splice(at, 1);
    else if (source.hasFeature(proxy)) source.removeFeature(proxy);
  };

  regionSource.on("addfeature", (event) => adopt(event.feature));
  regionSource.on("removefeature", (event) => drop(event.feature));
  regionSource.on("changefeature", (event) => {
    const original = event.feature;
    if (!proxies.has(original)) {
      adopt(original);
      return;
    }
    if (!original.getGeometry()) {
      drop(original);
      return;
    }
    if (!place(original)) proxies.get(original).changed();
  });
  regionSource.on("clear", () => {
    proxies.clear();
    pending = [];
    source.clear(true);
  });
  for (const original of regionSource.getFeatures()) adopt(original);

  let queue = [];
  let queued = false;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const work = () => {
    queued = false;
    const until = now() + sliceMs;
    while (queue.length) {
      place(queue.pop());
      if (now() >= until) break;
    }
    if (queue.length) {
      queued = true;
      schedule(work);
    }
  };
  const drain = () => {
    while (queue.length) place(queue.pop());
  };

  const setView = (resolution, extent) => {
    const level = detailOf(resolution);
    const reach = Math.max(getWidth(extent), getHeight(extent)) / 4;
    const keep = near && level === detail && containsExtent(near, extent);
    if (keep) return false;
    detail = level;
    near = bufferExtent(extent, reach);
    const [cx, cy] = getCenter(extent);
    const distance = (original) => {
      const box = original.getGeometry()?.getExtent();
      if (!box) return Infinity;
      const dx = Math.max(box[0] - cx, 0, cx - box[2]);
      const dy = Math.max(box[1] - cy, 0, cy - box[3]);
      return dx * dx + dy * dy;
    };
    queue = [...proxies.keys()].map((original) => [distance(original), original]).sort((a, b) => b[0] - a[0]).map((entry) => entry[1]);
    if (!queued) {
      queued = true;
      schedule(work);
    }
    return true;
  };

  return {
    source,
    setView,
    drain,
    flush,
    originalOf: (feature) => feature?.region ?? feature,
    copyOf: (original) => proxies.get(original) ?? null,
    levelOf: (original) => levelFor(original),
  };
};
