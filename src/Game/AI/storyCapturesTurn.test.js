/*! Open Historia — a region the story says was taken, and the troops that took it: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/AI/storyCapturesTurn.test.js
//
// "make sure the simulation ai is able to say that a region is taken by an army
// which causes the nearest troops to move accordingly so when that event
// happens, the region has been taken" (the owner, 2026-10-28). The front
// engine's half is tested in runtime/fronts/storyCaptures.test.js.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gameplay = readFileSync(new URL("./gameplay.js", import.meta.url), "utf8");

test("the skip is told it may have an army take a region, on the event, with the formation that took it", () => {
  assert.match(gameplay, /\[Taking Ground\]\r?\nAn army may take a region in this period wherever what has led up to it makes that likely, or where history took it at this time/);
  assert.match(gameplay, /a regionControlOps control entry, basis occupation, the region by name\. Move the formation that took it there in the same event/);
});

test("off any battlefield, the taker's nearest free land formation marches into a region taken with nobody sent", () => {
  const body = gameplay.slice(gameplay.indexOf("const marchCapturersIn = async"), gameplay.indexOf("// Where the places a turn's strikes name are"));
  assert.ok(body.length > 0);
  // Not a garrison, not covert, not one fighting on a battlefield, and within reach.
  assert.match(gameplay, /const STORY_MARCHERS = new Set\(\["infantry", "armor", "artillery"\]\);/);
  assert.match(gameplay, /const STORY_MARCH_KM = 800;/);
  assert.match(body, /unit\.covert \|\| normalizeString\(unit\.committedTo\)/);
  // Nothing moved where the event already sent a formation there, or one already stands in it.
  assert.match(body, /if \(ownMoves\.some\(\(\{ unit, point \}\) => samePower\(unit\.ownerCode, taker\)/);
  assert.match(body, /op: "move", unitId: best\.unit\.id, toLng: to\[0\], toLat: to\[1\]/);
  // Run on the answer that is kept, after the narrated captures.
  assert.match(gameplay, /await completeNarratedCaptures\(containers, world, \{ receipt, renderedRegions, lookupContext \}\);\r?\n  \}\r?\n[\s\S]{0,200}if \(!strict && !resolvedRegionIdsOnly && Array\.isArray\(candidate\?\.events\)\) \{\r?\n    await marchCapturersIn\(containers, world, \{ receipt, renderedRegions, lookupContext \}\);/);
});
