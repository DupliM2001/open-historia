// Run: node --test src/Editor/topologySweep.test.js
//
// The save-time border cleanup reads the holes of one union of every region,
// built in stages. These pin that the grid groups every region exactly once,
// that the staged union finds exactly what one direct union finds — including
// a crack sitting on a chunk boundary that no single chunk encloses — and what
// the loading screen says at each phase.
import assert from "node:assert/strict";
import test from "node:test";

import Polygon from "ol/geom/Polygon.js";

import { enclosedGapGeoms, enclosedGapsOfUnion, overlapGeoms, unionAllGeoms } from "./geometry.js";
import {
  BORDER_CLEANUP,
  bucketRegions,
  chunkIndexFor,
  describeCleanupProgress,
  describeCleanupResult,
  planTopologyChunks,
  yieldToBrowser,
} from "./topologySweep.js";

// A 4×4 grid of 1 km squares in a planar (metre) frame with two defects:
// square (1,1) is 20 m short on its east side — a 20 m crack enclosed by its
// four neighbours, lying exactly on the 2×2 chunk boundary at x=2000 — and
// square (2,2) reaches 30 m west into (1,2), a thin overlap.
const square = (column, row, { eastInset = 0, westOverhang = 0 } = {}) => {
  const x0 = column * 1000 - westOverhang;
  const x1 = (column + 1) * 1000 - eastInset;
  const y0 = row * 1000;
  const y1 = (row + 1) * 1000;
  return new Polygon([[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]);
};
const grid = [];
for (let column = 0; column < 4; column += 1) {
  for (let row = 0; row < 4; row += 1) {
    grid.push({
      id: `${column},${row}`,
      geom: square(column, row, {
        eastInset: column === 1 && row === 1 ? 20 : 0,
        westOverhang: column === 2 && row === 2 ? 30 : 0,
      }),
    });
  }
}
const key = (gap) => `${gap.geom.getExtent().map((v) => Math.round(v)).join(",")}:${Math.round(gap.area)}`;

test("the grid groups every region exactly once by the centre of its extent", () => {
  const plan = planTopologyChunks([0, 0, 4000, 4000], 16, { targetRegionsPerChunk: 4 });
  assert.equal(plan.cells, 2, "16 regions at 4 per chunk → a 2×2 grid");
  assert.equal(chunkIndexFor(plan, [0, 0, 1000, 1000]), 0);
  assert.equal(chunkIndexFor(plan, [3000, 3000, 4000, 4000]), 3);
  assert.equal(chunkIndexFor(plan, [1000, 0, 3000, 1000]), 2, "a region straddling cells goes with its centre (column 1, row 0)");
  assert.equal(chunkIndexFor(plan, [-500, -500, 4500, 4500]), 3, "beyond the edge is clamped");
  const buckets = bucketRegions(plan, grid, (region) => region.geom.getExtent());
  assert.equal(buckets.length, 4);
  assert.equal(buckets.flat().length, grid.length, "every region lands in exactly one bucket");
  assert.equal(new Set(buckets.flat()).size, grid.length);
  assert.equal(planTopologyChunks([0, 0, 100, 100], 10).cells, 1, "a small map is one chunk");
  assert.equal(planTopologyChunks([0, 0, 100, 100], 4848).cells, 5, "the stock world is a 5×5 grid at 300 regions per chunk");
  assert.equal(planTopologyChunks([0, 0, 100, 100], 25000).cells, 10, "a 25,000-region import is a 10×10 grid");
  assert.equal(planTopologyChunks(null, 10), null);
  assert.equal(planTopologyChunks([0, 0, 1, 1], 0), null);
  assert.deepEqual(bucketRegions(null, grid, () => [0, 0, 0, 0]).length, 1, "no plan → one bucket of everything");
  assert.equal(chunkIndexFor(planTopologyChunks([5, 5, 5, 5], 3), [5, 5, 5, 5]), 0, "a zero-size map does not divide by zero");
});

test("the staged union finds exactly what one direct union finds, including a crack on a chunk boundary that no single chunk encloses", () => {
  const direct = enclosedGapGeoms(grid.map((region) => region.geom), { maxWidth: 500 });
  assert.equal(direct.length, 1);
  assert.ok(direct[0].width > 19 && direct[0].width < 21, `the crack is ~20 m wide, got ${direct[0].width}`);

  const plan = planTopologyChunks([0, 0, 4000, 4000], grid.length, { targetRegionsPerChunk: 4 });
  const buckets = bucketRegions(plan, grid, (region) => region.geom.getExtent());
  const partials = buckets.map((bucket) => unionAllGeoms(bucket.map((region) => region.geom)));
  for (const partial of partials) {
    assert.equal(enclosedGapsOfUnion(partial, { maxWidth: 500 }).length, 0, "no chunk on its own encloses the crack");
  }
  const staged = enclosedGapsOfUnion(unionAllGeoms(partials), { maxWidth: 500 });
  assert.deepEqual(staged.map(key), direct.map(key), "the union of the chunk unions has the same holes as one union of everything");
  assert.equal(enclosedGapsOfUnion(null).length, 0);
});

test("overlaps are a pairwise check that does not depend on chunks", () => {
  const a = grid.find((region) => region.id === "1,2").geom;
  const b = grid.find((region) => region.id === "2,2").geom;
  const pieces = overlapGeoms(a, b, { maxWidth: 500 });
  assert.equal(pieces.length, 1);
  assert.ok(pieces[0].width > 28 && pieces[0].width < 31, `the sliver is ~30 m wide, got ${pieces[0].width}`);
  assert.equal(overlapGeoms(a, b, { maxWidth: 10 }).length, 0, "wider than the tolerance is left alone");
  assert.equal(overlapGeoms(a, b, { maxWidth: 500, minWidth: 31 }).length, 0, "narrower than the floor is left alone");
  assert.equal(overlapGeoms(a, b, { maxWidth: 500, minWidth: 2 }).length, 1, "the sweep's 2 m floor keeps a real sliver");
});

test("the save-time floor ignores cracks too narrow to be anything but rounding noise", () => {
  const geoms = grid.map((region) => region.geom);
  assert.equal(enclosedGapGeoms(geoms, { maxWidth: 500, minWidth: 25 }).length, 0, "a 20 m crack is below a 25 m floor");
  assert.equal(enclosedGapGeoms(geoms, { maxWidth: 500, minWidth: BORDER_CLEANUP.minWidth }).length, 1, "and above the sweep's 2 m floor");
  assert.ok(BORDER_CLEANUP.minWidth >= 1 && BORDER_CLEANUP.minWidth < 10, "the floor is about the size of the save's coordinate rounding");
});

test("the loading screen reports each phase in plain words with a bar that only moves forward", () => {
  const gaps = describeCleanupProgress({ phase: "gaps", regionCount: 4848, chunkIndex: 3, chunkCount: 25, pass: 1 });
  assert.match(gaps.headline, /^looking for cracks between regions/);
  const second = describeCleanupProgress({ phase: "gaps", regionCount: 4848, chunkIndex: 3, chunkCount: 25, pass: 2, maxPasses: 3 });
  assert.match(second.headline, /^Pass 2 of up to 3, checking the repairs left nothing behind — looking for cracks/);
  assert.match(gaps.detail, /4,848 regions · merging chunk 4 of 25/);
  const merging = describeCleanupProgress({ phase: "gaps", regionCount: 4848, chunkIndex: 25, chunkCount: 25 });
  assert.match(merging.detail, /merging 25 chunks into one map and reading every enclosed gap/);
  const overlaps = describeCleanupProgress({ phase: "overlaps", regionCount: 4848, regionsChecked: 2400, overlapsFound: 1, gapsFound: 12 });
  assert.match(overlaps.detail, /2,400 of 4,848 regions checked · 1 sliver so far · 12 cracks found/);
  const apply = describeCleanupProgress({ phase: "apply", repairsDone: 40, repairCount: 353, gapsFilled: 12, overlapsTrimmed: 28 });
  assert.match(apply.detail, /40 of 353 repairs this pass · 12 cracks filled, 28 slivers trimmed so far/);
  const save = describeCleanupProgress({ phase: "save", result: { changed: true, gaps: 12, overlaps: 41, affectedRegions: 48, regionCount: 4848, passes: 2 } });
  assert.equal(save.headline, "saving the map into the scenario");
  assert.equal(save.detail, "Borders cleaned in 2 passes: 12 cracks filled and 41 slivers trimmed across 48 regions.");
  assert.ok(gaps.fraction < merging.fraction && merging.fraction <= overlaps.fraction && overlaps.fraction < apply.fraction && apply.fraction < save.fraction);
  assert.ok(describeCleanupProgress({ phase: "gaps", regionCount: 10, chunkIndex: 0, chunkCount: 0 }).fraction >= 0);
  assert.equal(describeCleanupProgress(null).fraction, 0);
  assert.equal(describeCleanupProgress({ phase: "apply", repairCount: 0 }).headline, "nothing to repair");
});

test("the note after a save says what changed, that nothing did, or that the cleanup was skipped", () => {
  assert.equal(
    describeCleanupResult({ changed: false, regionCount: 4848 }),
    `Borders checked: no cracks or slivers between ${BORDER_CLEANUP.minWidth} m and ${BORDER_CLEANUP.maxWidth} m across 4,848 regions.`,
  );
  assert.equal(describeCleanupResult({ changed: true, gaps: 1, overlaps: 2, affectedRegions: 3, passes: 1 }), "Borders cleaned: 1 crack filled and 2 slivers trimmed across 3 regions.");
  assert.equal(describeCleanupResult({ changed: true, gaps: 98, overlaps: 57, affectedRegions: 140, passes: 2 }), "Borders cleaned in 2 passes: 98 cracks filled and 57 slivers trimmed across 140 regions.");
  assert.match(describeCleanupResult(null, "boom"), /^Border cleanup was skipped \(boom\); the map was saved as it is\.$/);
  assert.equal(describeCleanupResult(null), "");
});

test("yielding resolves on its own (a macrotask here, a frame plus a macrotask in a browser)", async () => {
  const started = Date.now();
  await yieldToBrowser();
  assert.ok(Date.now() - started < 1000);
});
