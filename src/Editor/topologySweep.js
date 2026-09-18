/*!
 * Open Historia Map Editor — save-time border cleanup
 * Copyright (c) 2026 Nicholas Krol - AGPL-3.0-or-later (see LICENSE).
 */

// Every scenario save (Save, Save & Exit, Apply & Play) first runs the Topology
// panel's conservative repair over EVERY region — enclosed cracks narrower than
// 500 m filled, thin overlaps trimmed — before the map is written
// (MapEditor.jsx persistScenario → OlMap.jsx repairTopologyEverywhere). This
// module is the pure part: how regions are grouped for the staged union, and
// what the loading screen says.
//
// The pass is not all-pairs. Overlap discovery asks the map's spatial index for
// extent neighbours only (the stock 4,848-region world: 14,011 pairs, ~3 s),
// and the gap search reads the holes of ONE union of every region on the map.
// That union is built in stages — each chunk of regions unioned, then the chunk
// results unioned — which is the same polygon set as a single call (union is
// associative; the stock world yields the identical 324 cracks crack by crack)
// with bounded memory (414 MB → ~200 MB of heap on the stock world) and a
// repaint between chunks. Searching each chunk on its own was rejected: a crack
// longer than a chunk, such as a double-traced border between two large
// countries, can have both end-caps outside any one chunk and go unseen.
//
// Two more measured facts shape the pass. Trimming a sliver can expose a
// hairline between the winner and a third region the trimmed region used to
// cover, so the pass repeats until it finds nothing (the stock world: 98
// cracks and 57 slivers, then nothing). And the save writes coordinates at
// five decimals, about a metre, which leaves centimetre slivers along every
// repaired border on reload — without a floor those would be "repaired" again
// on every save, moving hundreds of regions by centimetres each time.

export const BORDER_CLEANUP = Object.freeze({
  // Metres in the map projection: the Topology panel's default tolerance.
  maxWidth: 500,
  // Defects narrower than this are coordinate-rounding noise, invisible at any
  // zoom, and left alone.
  minWidth: 2,
  // A pass that repaired something is followed by another; stop when a pass
  // finds nothing, or after this many.
  maxPasses: 3,
  // A chunk is sized to about this many regions.
  targetRegionsPerChunk: 300,
  // Regions per overlap batch between repaints.
  overlapBatch: 200,
});

const count = (value) => Number(value) || 0;
const formatCount = (value) => count(value).toLocaleString("en-US");

// A square grid over the map's extent, sized so a cell holds roughly
// targetRegionsPerChunk regions. Returns null for nothing to chunk.
export const planTopologyChunks = (
  extent,
  regionCount,
  { targetRegionsPerChunk = BORDER_CLEANUP.targetRegionsPerChunk } = {},
) => {
  if (!Array.isArray(extent) || extent.length !== 4 || !extent.every(Number.isFinite)) return null;
  if (!(regionCount > 0)) return null;
  const cells = Math.max(1, Math.ceil(Math.sqrt(regionCount / Math.max(1, targetRegionsPerChunk))));
  const [minX, minY, maxX, maxY] = extent;
  return {
    extent: [minX, minY, maxX, maxY],
    cells,
    cellWidth: (maxX - minX) / cells,
    cellHeight: (maxY - minY) / cells,
  };
};

// Which cell a region belongs to: the one under the centre of its extent, so
// every region is unioned exactly once. (A region crossing cells is merged
// with its neighbours when the cell unions are unioned.)
export const chunkIndexFor = (plan, regionExtent) => {
  if (!plan || !Array.isArray(regionExtent) || regionExtent.length !== 4) return 0;
  const axis = (low, high, origin, size) => {
    if (!(size > 0)) return 0;
    const centre = (Number(low) + Number(high)) / 2;
    return Math.min(plan.cells - 1, Math.max(0, Math.floor((centre - origin) / size)));
  };
  const column = axis(regionExtent[0], regionExtent[2], plan.extent[0], plan.cellWidth);
  const row = axis(regionExtent[1], regionExtent[3], plan.extent[1], plan.cellHeight);
  return column * plan.cells + row;
};

// Groups regions by cell; empty cells are dropped, order is by cell index.
export const bucketRegions = (plan, regions, extentOf) => {
  if (!plan) return regions.length ? [regions.slice()] : [];
  const buckets = new Map();
  for (const region of regions) {
    const index = chunkIndexFor(plan, extentOf(region));
    if (!buckets.has(index)) buckets.set(index, []);
    buckets.get(index).push(region);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, bucket]) => bucket);
};

// Lets the browser paint between chunks: React commits the progress state and
// the frame is drawn before the next chunk starts. Plain macrotask in Node.
export const yieldToBrowser = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });

const plural = (n, word) => `${formatCount(n)} ${word}${count(n) === 1 ? "" : word.endsWith("s") ? "es" : "s"}`;

// The one-line result shown after the save (and inside the loading screen
// while the scenario is being written).
export const describeCleanupResult = (result, error = "") => {
  if (error) return `Border cleanup was skipped (${error}); the map was saved as it is.`;
  if (!result) return "";
  if (!result.changed) {
    return `Borders checked: no cracks or slivers between ${BORDER_CLEANUP.minWidth} m and ${BORDER_CLEANUP.maxWidth} m across ${plural(result.regionCount, "region")}.`;
  }
  const passes = count(result.passes) > 1 ? ` in ${plural(result.passes, "pass")}` : "";
  return `Borders cleaned${passes}: ${plural(result.gaps, "crack")} filled and ${plural(result.overlaps, "sliver")} trimmed across ${plural(result.affectedRegions, "region")}.`;
};

// What the loading screen shows for a progress state from
// repairTopologyEverywhere: a fraction for the bar (phases weighted by their
// measured cost; the bar restarts on a follow-up pass) and two lines of
// plain words.
export const describeCleanupProgress = (state) => {
  if (!state) return { fraction: 0, headline: "Preparing", detail: "" };
  const regions = count(state.regionCount);
  const share = (done, total) => (total > 0 ? Math.min(1, Math.max(0, done / total)) : 0);
  const pass = count(state.pass);
  const passLabel = pass > 1 ? `Pass ${pass} of up to ${count(state.maxPasses) || BORDER_CLEANUP.maxPasses}, checking the repairs left nothing behind — ` : "";
  switch (state.phase) {
    case "gaps": {
      const chunkCount = Math.max(1, count(state.chunkCount));
      const chunkIndex = count(state.chunkIndex);
      const merging = chunkIndex >= chunkCount;
      return {
        fraction: 0.05 + 0.2 * share(chunkIndex, chunkCount),
        headline: `${passLabel}looking for cracks between regions`,
        detail: merging
          ? `${plural(regions, "region")} · merging ${plural(chunkCount, "chunk")} into one map and reading every enclosed gap`
          : `${plural(regions, "region")} · merging chunk ${Math.min(chunkIndex + 1, chunkCount)} of ${chunkCount}`,
      };
    }
    case "overlaps":
      return {
        fraction: 0.25 + 0.5 * share(count(state.regionsChecked), regions),
        headline: `${passLabel}looking for thin slivers where regions overlap`,
        detail: `${formatCount(state.regionsChecked)} of ${plural(regions, "region")} checked · ${plural(state.overlapsFound, "sliver")} so far · ${plural(state.gapsFound, "crack")} found`,
      };
    case "apply": {
      const total = count(state.repairCount);
      return {
        fraction: 0.75 + 0.2 * share(count(state.repairsDone), total),
        headline: total ? `${passLabel}repairing` : `${passLabel}nothing to repair`,
        detail: total
          ? `${formatCount(state.repairsDone)} of ${plural(total, "repair")} this pass · ${plural(state.gapsFilled, "crack")} filled, ${plural(state.overlapsTrimmed, "sliver")} trimmed so far`
          : "",
      };
    }
    case "save":
      return {
        fraction: 0.97,
        headline: "saving the map into the scenario",
        detail: describeCleanupResult(state.result, state.error),
      };
    default:
      return { fraction: 1, headline: "done", detail: "" };
  }
};
