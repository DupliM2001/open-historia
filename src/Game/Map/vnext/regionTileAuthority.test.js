/*! Open Historia — stock/scenario region authority tests © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */
import test from "node:test";
import assert from "node:assert/strict";
import { hasExactRegionTileIdentity } from "./regionTileAuthority.js";

test("legacy numeric/UUID catalogs cannot hand authority to unrelated current tiles", () => {
  const currentTileIds = new Set(["RUS.12_1", "DEU.1_1"]);
  assert.equal(hasExactRegionTileIdentity([
    { id: "2415", authored: false },
    { id: "950f884b-1d72-4ae3-8400-fef4d18be920", authored: false },
  ], currentTileIds), false);
});

test("exact identity, not punctuation, authorizes region-tile handoff", () => {
  const currentTileIds = new Set(["2415", "dotless-stock-id"]);
  assert.equal(hasExactRegionTileIdentity([
    { id: "2415", authored: false },
    { id: "dotless-stock-id", authored: false },
  ], currentTileIds), true);
});

test("authored geometry is ignored while remaining stock-like records must match exactly", () => {
  const currentTileIds = new Set(["DEU.1_1"]);
  assert.equal(hasExactRegionTileIdentity([
    { id: "DEU.1_1", authored: false },
    { id: "reg_custom", authored: true },
  ], currentTileIds), true);
});

test("fully authored scenarios do not claim a stock PMTiles handoff", () => {
  assert.equal(hasExactRegionTileIdentity([
    { id: "reg_a", authored: true },
    { id: "reg_b", authored: true },
  ], new Set(["reg_a", "reg_b"])), false);
});
