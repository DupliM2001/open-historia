/*! Open Historia — the licence scenarios are shared under: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/scenarioLicense.test.js
//
// The owner's rule: every scenario made in Open Historia and then posted or
// distributed in any way is released under CC BY 4.0 (it was public domain
// for a day). These pin that it is said wherever a scenario leaves the game,
// and inside the file that leaves; and that the game only NAMES the licence:
// "dont say anywhere that credit must be given, just say they are under that
// liscense".

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SCENARIO_LICENSE_FILE,
  SCENARIO_LICENSE_ID,
  SCENARIO_LICENSE_NAME,
  SCENARIO_LICENSE_NOTICE,
  SCENARIO_LICENSE_TEXT,
  SCENARIO_LICENSE_URL,
  scenarioLicense,
  withScenarioLicense,
} from "./scenarioLicense.js";

const source = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

test("the licence is CC BY 4.0, with its address", () => {
  assert.equal(SCENARIO_LICENSE_ID, "CC-BY-4.0");
  assert.equal(SCENARIO_LICENSE_NAME, "Creative Commons Attribution 4.0 International");
  assert.equal(SCENARIO_LICENSE_URL, "https://creativecommons.org/licenses/by/4.0/");
  assert.deepEqual(Object.keys(scenarioLicense()), ["id", "name", "url", "notice"]);
  assert.match(SCENARIO_LICENSE_NOTICE, /posted or shared in any way are released under the Creative Commons Attribution 4\.0 International licence \(CC BY 4\.0\)\.$/);
});

test("the text a zipped scenario carries names the licence, and what it cannot cover", () => {
  assert.match(SCENARIO_LICENSE_TEXT, /^LICENCE\n/);
  assert.ok(SCENARIO_LICENSE_TEXT.includes(SCENARIO_LICENSE_URL));
  assert.match(SCENARIO_LICENSE_TEXT, /posted or shared in any way is\s+released under the Creative Commons Attribution 4\.0 International licence\s+\(CC BY 4\.0\)/);
  assert.match(SCENARIO_LICENSE_TEXT, /not its author's to license stays under its own terms/);
  assert.match(SCENARIO_LICENSE_TEXT, /detailed map or a music track the scenario only names is not part of this\s+file/);
  // Plain text: the hub refuses a .txt entry that holds anything else.
  assert.equal(/[\x00-\x08\x0b\x0e-\x1f]/.test(SCENARIO_LICENSE_TEXT), false);
  assert.equal(SCENARIO_LICENSE_FILE, "LICENSE.txt");
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
  assert.ok(hub.includes("Everything you publish to the Hub is released under CC BY 4.0."));
  assert.ok(hub.includes("Only publish what you made yourself, or what you may share under this licence."));
  assert.ok(hub.indexOf("Everything you publish to the Hub is released under CC BY 4.0.") < hub.indexOf("onClick={() => handlePublish(scenario)}"), "said before the scenario is chosen");
  assert.ok(hub.includes("Scenarios on the Hub are released under CC BY 4.0."));
  assert.ok(library.includes("A scenario you post or share in any way is released under CC BY 4.0."));
  assert.ok(source("../Game/GameUI/ScenarioSuggestions.jsx").includes("Changes you suggest are released under CC BY 4.0, like the scenario they are for."));
});

test("nothing of the game says a scenario is public domain any more, and nothing says what the licence asks", () => {
  const files = ["./scenarioLicense.js", "./library.js", "./scenarioSuggestion.js", "../Game/GameUI/communityHub.jsx", "../Game/GameUI/libraryBar.jsx", "../Game/GameUI/ScenarioSuggestions.jsx"];
  for (const file of files) {
    const text = source(file);
    // (The module's own comment tells the rule's history, in the owner's words.)
    const said = file === "./scenarioLicense.js" ? text.slice(text.indexOf("export const SCENARIO_LICENSE_ID")) : text;
    assert.equal(/CC0|PUBLIC-DOMAIN|What public domain means/.test(said), false, `${file} still speaks of the public domain`);
    assert.equal(/scenarios? (?:is|are) public domain/i.test(said), false, file);
    assert.equal(/must (?:be )?credit|credit must|as long as (?:you|they) credit|without (?:asking or )?credit|giving credit/i.test(said), false, `${file} says what the licence asks`);
  }
  const readme = source("../../README.md");
  const scenarios = readme.slice(readme.indexOf("## Scenarios Are"), readme.indexOf("## ", readme.indexOf("## Scenarios Are") + 5));
  assert.match(scenarios, /^## Scenarios Are Released Under CC BY 4\.0/);
  assert.ok(scenarios.includes("https://creativecommons.org/licenses/by/4.0/"));
  assert.equal(/public domain|CC0|credit/i.test(scenarios), false);
  const policy = source("../../public/privacy/index.html");
  assert.ok(policy.includes("<strong>Scenarios are released under CC BY 4.0.</strong>"));
  assert.equal(/Scenarios are public domain|publicdomain\/zero/.test(policy), false);
});
