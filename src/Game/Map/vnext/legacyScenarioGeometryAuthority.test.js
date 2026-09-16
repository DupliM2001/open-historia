/*! Open Historia — legacy scenario geometry-authority compatibility tests © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */
import test from "node:test";
import assert from "node:assert/strict";
import { deriveLegacyAuthoritativeCountryCodes } from "./legacyScenarioGeometryAuthority.js";

test("an edited stock-region record promotes its scenario country geometry cohort", () => {
  assert.deepEqual(
    deriveLegacyAuthoritativeCountryCodes([
      { id: "AUT.8_1", gid0: "AUT", edited: true, authored: true },
      { id: "AUT.9_1", gid0: "AUT", edited: false, authored: false },
      { id: "DEU.1_1", gid0: "DEU", edited: false, authored: false },
    ]),
    ["AUT"],
  );
});

test("author-drawn regions alone do not suppress an entire stock country", () => {
  assert.deepEqual(
    deriveLegacyAuthoritativeCountryCodes([
      { id: "reg_custom", gid0: "FRA", edited: false, authored: true },
      { id: "FRA.1_1", gid0: "FRA", edited: false, authored: false },
    ]),
    [],
  );
});

test("country codes are normalized, deduplicated and empty codes are ignored", () => {
  assert.deepEqual(
    deriveLegacyAuthoritativeCountryCodes([
      { id: "a", gid0: " aut ", edited: true },
      { id: "b", countryCode: "AUT", edited: true },
      { id: "c", gid0: "", edited: true },
      { id: "d", gid0: "fra", edited: true },
    ]),
    ["AUT", "FRA"],
  );
});
