import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCountryStatHistorySample,
  finalizeCountryStatSheet,
  isCompleteCustomCountryStatSheet,
  mergeCountryStatPatch,
  normalizeCountryStatHistorySample,
  normalizeCountryStatIndices,
} from "./countryStats.js";

test("legacy strategic-index normalization remains open to scenario-defined keys", () => {
  assert.deepEqual(
    normalizeCountryStatIndices(
      { timber: 73.6, goldAccess: 32, "bad key": 50, tooHigh: 120 },
      { allowedKeys: ["timber", "goldAccess", "tooHigh"] },
    ),
    { timber: 74, goldAccess: 32, tooHigh: 100 },
  );
});

test("full custom Stats values survive normalize/merge/finalize", () => {
  const merged = mergeCountryStatPatch(null, {
    customStats: { timber: 72, silver: 4210.5, grainYield: 18600 },
  });
  const finalized = finalizeCountryStatSheet(merged);

  assert.deepEqual(finalized.customStats, { timber: 72, silver: 4210.5, grainYield: 18600 });
  assert.equal(isCompleteCustomCountryStatSheet(finalized, ["timber", "silver", "grainYield"]), true);
  assert.equal(isCompleteCustomCountryStatSheet(finalized, ["timber", "silver", "grainYield", "ships"]), false);
});

test("partial custom patches update named values without erasing the rest", () => {
  const base = finalizeCountryStatSheet({ customStats: { timber: 72, silver: 4210.5, ships: 18 } });
  const merged = mergeCountryStatPatch(base, { customStats: { timber: 81, ships: 20 } });
  assert.deepEqual(merged.customStats, { timber: 81, silver: 4210.5, ships: 20 });
});

test("custom Stats travel through campaign history samples", () => {
  const sample = buildCountryStatHistorySample(
    { customStats: { timber: 72, silver: 4210.5 } },
    { date: "1000-06-01", round: 3 },
  );
  assert.deepEqual(sample.customStats, { timber: 72, silver: 4210.5 });
  assert.deepEqual(normalizeCountryStatHistorySample(sample).customStats, { timber: 72, silver: 4210.5 });
});
