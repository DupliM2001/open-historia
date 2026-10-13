/*! Open Historia — scenarios are public domain © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// The owner's rule (2026-10-13): every scenario made in Open Historia and then
// posted or distributed in any way is public domain.
//
// "Public domain" is written as CC0 1.0, because a bare "this is public domain"
// has no effect in countries where an author cannot give up their rights by
// saying so; CC0 says the same thing and falls back to a licence with no
// conditions where a dedication is not possible.
//
// The rule is said in three places, so nobody shares a scenario without having
// been told and nobody receives one without being able to find out:
//   - on the screens a scenario leaves the game from (Community → Publish to
//     Hub, a scenario's Bundles tab, Suggest changes);
//   - in the file itself: the bundle's `license` record and, in a .zip,
//     PUBLIC-DOMAIN.txt;
//   - on the hub's post form, its README and the website, which are not in
//     this repository.
//
// It covers the scenario and what its author made for it. It cannot cover what
// was never theirs to give (a picture found elsewhere), and it does not reach a
// detailed map a scenario only names: that is a separate download with its own
// licence on its own post.

export const SCENARIO_LICENSE_ID = "CC0-1.0";
export const SCENARIO_LICENSE_NAME = "CC0 1.0 Universal (Public Domain Dedication)";
export const SCENARIO_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
// The entry a zipped scenario or suggestion carries. Plain text, which the hub
// keeps (it rebuilds every zip from checked entries) and every import ignores.
export const SCENARIO_LICENSE_FILE = "PUBLIC-DOMAIN.txt";

export const SCENARIO_LICENSE_NOTICE = "Scenarios made in Open Historia that are posted or shared in any way are public domain (CC0 1.0): anyone may copy, change, publish and use them, for any purpose, without asking and without giving credit.";

export const SCENARIO_LICENSE_TEXT = [
  "PUBLIC DOMAIN",
  "",
  "This scenario was made with Open Historia (https://openhistoria.com).",
  "",
  "Every scenario made in Open Historia that is posted or shared in any way is",
  "public domain. Whoever posts or shares this file gives up all copyright and",
  "related rights in it, everywhere in the world, under the Creative Commons",
  "CC0 1.0 Universal Public Domain Dedication:",
  "",
  `    ${SCENARIO_LICENSE_URL}`,
  "",
  "Anyone may copy, change, publish and use this scenario, for any purpose,",
  "without asking and without giving credit.",
  "",
  "This covers the scenario and everything its author made for it. Anything in",
  "this file that was not its author's to give away stays under its own terms.",
  "A detailed map the scenario only names is not part of this file and keeps",
  "the licence on its own post.",
  "",
].join("\n");

// The record an exported scenario carries beside its schema and version. An
// import reads the parts it knows by name, so a build from before this simply
// does not see it.
export const scenarioLicense = () => ({
  id: SCENARIO_LICENSE_ID,
  name: SCENARIO_LICENSE_NAME,
  url: SCENARIO_LICENSE_URL,
  notice: SCENARIO_LICENSE_NOTICE,
});

export const withScenarioLicense = (bundle) => (
  bundle && typeof bundle === "object" && !Array.isArray(bundle)
    ? { ...bundle, license: scenarioLicense() }
    : bundle
);
