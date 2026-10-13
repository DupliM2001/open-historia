/*! Open Historia — scenarios are public domain: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/scenarioLicense.test.js
//
// The owner's rule (2026-10-13): every scenario made in Open Historia and then
// posted or distributed in any way is public domain. These pin that it is said
// wherever a scenario leaves the game, and inside the file that leaves.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SCENARIO_LICENSE_FILE,
  SCENARIO_LICENSE_ID,
  SCENARIO_LICENSE_NOTICE,
  SCENARIO_LICENSE_TEXT,
  SCENARIO_LICENSE_URL,
  scenarioLicense,
  withScenarioLicense,
} from "./scenarioLicense.js";

const source = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

test("public domain is written as CC0 1.0, with its address", () => {
  assert.equal(SCENARIO_LICENSE_ID, "CC0-1.0");
  assert.equal(SCENARIO_LICENSE_URL, "https://creativecommons.org/publicdomain/zero/1.0/");
  assert.deepEqual(Object.keys(scenarioLicense()), ["id", "name", "url", "notice"]);
  assert.match(SCENARIO_LICENSE_NOTICE, /posted or shared in any way are public domain \(CC0 1\.0\)/);
});

test("the text a zipped scenario carries says who gives what up, and what it cannot cover", () => {
  assert.match(SCENARIO_LICENSE_TEXT, /^PUBLIC DOMAIN\n/);
  assert.ok(SCENARIO_LICENSE_TEXT.includes(SCENARIO_LICENSE_URL));
  assert.match(SCENARIO_LICENSE_TEXT, /posted or shared in any way is\s+public domain/);
  assert.match(SCENARIO_LICENSE_TEXT, /without asking and without giving credit/);
  assert.match(SCENARIO_LICENSE_TEXT, /not its author's to give away stays under its own terms/);
  assert.match(SCENARIO_LICENSE_TEXT, /detailed map the scenario only names is not part of this file/);
  // Plain text: the hub refuses a .txt entry that holds anything else.
  assert.equal(/[\x00-\x08\x0b\x0e-\x1f]/.test(SCENARIO_LICENSE_TEXT), false);
  assert.match(SCENARIO_LICENSE_FILE, /\.txt$/);
});

test("an exported scenario carries the record; anything else is left alone", () => {
  const bundle = { schema: "open-historia-scenario-bundle/2", version: 2, scenario: { id: "x" }, data: {}, assets: {} };
  const stamped = withScenarioLicense(bundle);
  assert.deepEqual(stamped.license, scenarioLicense());
  assert.equal(stamped.schema, bundle.schema);
  assert.equal(Object.hasOwn(bundle, "license"), false, "the bundle handed in is not changed");
  assert.equal(withScenarioLicense(null), null);
  assert.deepEqual(withScenarioLicense([1]), [1]);
});

test("every way a scenario leaves the game says so", () => {
  // The one export every screen calls.
  assert.match(source("./library.js"), /export const exportScenarioBundle = async \(scenarioId\) =>\s*\n\s*withScenarioLicense\(await requestJson\(/);
  // The three .zip writers.
  const hub = source("../Game/GameUI/communityHub.jsx");
  const library = source("../Game/GameUI/libraryBar.jsx");
  const suggestion = source("./scenarioSuggestion.js");
  for (const [name, text] of [["Publish to Hub", hub], ["Bundles", library], ["a suggestion", suggestion]]) {
    assert.ok(text.includes("files[SCENARIO_LICENSE_FILE] = SCENARIO_LICENSE_TEXT;"), `${name}: the .zip holds the text`);
  }
  assert.ok(suggestion.includes("license: scenarioLicense()"));
  // And the screens, before the file is made.
  assert.ok(hub.includes("Everything you publish to the Hub is public domain (CC0 1.0)."));
  assert.ok(hub.includes("Only publish what you made yourself, or what is already free to give away like this."));
  assert.ok(hub.indexOf("Everything you publish to the Hub is public domain") < hub.indexOf("onClick={() => handlePublish(scenario)}"), "said before the scenario is chosen");
  assert.ok(hub.includes("Scenarios on the Hub are public domain (CC0 1.0): free to play, change and share."));
  assert.ok(library.includes("A scenario you post or share in any way is public domain (CC0 1.0)."));
  assert.ok(source("../Game/GameUI/ScenarioSuggestions.jsx").includes("Changes you suggest are public domain (CC0 1.0), like the scenario they are for."));
});
