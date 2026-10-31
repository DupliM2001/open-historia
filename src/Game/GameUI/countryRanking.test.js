/*! Open Historia — the Stats pane's ranking of countries: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/GameUI/countryRanking.test.js
//
// "A cross-country ranking tab in Stats. It is small, but thin while only the
// player and tracked countries have stat sheets."

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { countryWeight } from "../../runtime/countryWeight.js";
import { RANKING_METRICS, buildRanking, openingMetric, rankingMetricsFor, rankingValue, regionCountsOf } from "./countryRanking.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(here, name), "utf8").split("\r\n").join("\n");
const metric = (key) => RANKING_METRICS.find((entry) => entry.key === key);

// Four countries on a map of ten regions. Aland and Borduria have been assessed; Cisland has only what its
// scenario's author gave it; Dorland has nothing but its land.
const catalog = [
  ...["a1", "a2", "a3", "a4"].map((id) => ({ id, name: id, country: "Aland" })),
  ...["b1", "b2", "b3"].map((id) => ({ id, name: id, country: "Borduria" })),
  ...["c1", "c2"].map((id) => ({ id, name: id, country: "Cisland" })),
  { id: "d1", name: "d1", country: "Dorland" },
];
const world = (extra = {}) => ({
  countryStats: {
    Aland: { stability: 71, population: { total: 40e6 }, economy: { gdp: 9e11, gdpPerCapita: 22500 }, indices: { internationalReputation: 64 } },
    Borduria: { stability: 44, population: { total: 90e6 }, economy: { gdp: 6e11, gdpPerCapita: 6667 } },
  },
  polityOverrides: { Cisland: { name: "Cisland", population: 12e6 } },
  internationalReputation: { Borduria: 31 },
  // Borduria has taken one of Aland's regions.
  regionOwnershipOverrides: { a4: "Borduria" },
  ...extra,
});
const countries = ["Aland", "Borduria", "Cisland", "Dorland"].map((key) => ({ key, label: key }));
const rank = (key, extra) => buildRanking({ world: world(extra), countries, metric: metric(key), catalog });
const table = (ranking) => ranking.rows.map((row) => [row.rank, row.key, row.value]);

test("land held is counted for every country, by who holds each region now", () => {
  const counts = regionCountsOf(catalog, world());
  assert.deepEqual([counts.get("aland"), counts.get("borduria"), counts.get("cisland"), counts.get("dorland")], [3, 4, 2, 1]);
  const ranking = rank("regions");
  assert.deepEqual(table(ranking), [[1, "Borduria", 4], [2, "Aland", 3], [3, "Cisland", 2], [4, "Dorland", 1]]);
  assert.deepEqual([ranking.unranked, ranking.total, ranking.most], [0, 4, 4]);
  // A region the world names and the catalog does not list still counts.
  assert.equal(regionCountsOf(catalog, world({ regionOwnershipOverrides: { a4: "Borduria", z9: "Dorland" } })).get("dorland"), 2);
  assert.equal(regionCountsOf(null, {}).size, 0);
});

test("a figure from a country's sheet ranks the countries that have one and counts the rest", () => {
  const economy = rank("gdp");
  assert.deepEqual(table(economy), [[1, "Aland", 9e11], [2, "Borduria", 6e11]]);
  assert.deepEqual([economy.unranked, economy.total], [2, 4], "thin until more of the world has been assessed, and it says so");
  assert.deepEqual(table(rank("gdpPerCapita")), [[1, "Aland", 22500], [2, "Borduria", 6667]]);
  assert.deepEqual(table(rank("stability")), [[1, "Aland", 71], [2, "Borduria", 44]]);
  // People: a sheet's, else what the scenario's author gave the country.
  assert.deepEqual(table(rank("population")), [[1, "Borduria", 90e6], [2, "Aland", 40e6], [3, "Cisland", 12e6]]);
  // Reputation: where the game has moved it, else what its sheet says.
  assert.deepEqual(table(rank("reputation")), [[1, "Aland", 64], [2, "Borduria", 31]]);
  // Nobody is at war: nobody is weary, and the figure is not offered at all.
  assert.deepEqual(rank("weariness").rows, []);
  assert.equal(rankingMetricsFor({ world: world() }).some((entry) => entry.key === "weariness"), false);
  const weary = { warWeariness: [{ country: "Borduria", value: 62.4 }, { country: "Aland", value: 18 }] };
  assert.deepEqual(table(rank("weariness", weary)), [[1, "Borduria", 62], [2, "Aland", 18]]);
  assert.equal(rankingMetricsFor({ world: world(weary) }).some((entry) => entry.key === "weariness"), true);
});

test("military power is the land war's own weight at the figures every country has, for every country whose people are known", () => {
  assert.equal(metric("military").label, "Military power");
  const ranking = rank("military");
  // "remove region count power entirely" (the owner, 2026-10-16): Dorland, known only by its land, is left out until
  // the AI gives it its people and figures (Game/AI/militaryRating.js).
  assert.equal(ranking.unranked, 1);
  const of = (key) => ranking.rows.find((row) => row.key === key).value;
  // (Two sheets are too few to compare funding by: a treasury in balance leaves the weight as it is.)
  assert.equal(of("Borduria"), Math.round(countryWeight({ population: 90e6 }) * 10) / 10);
  assert.equal(of("Aland"), Math.round(countryWeight({ population: 40e6 }) * 10) / 10);
  assert.equal(of("Cisland"), Math.round(countryWeight({ population: 12e6 }) * 10) / 10, "the people its author gave it");
  assert.equal(ranking.rows.some((row) => row.key === "Dorland"), false, "never by the land it holds");
  assert.deepEqual(ranking.rows.map((row) => row.key), ["Borduria", "Aland", "Cisland"]);
  assert.equal(rankingValue(metric("military"), {}, "Nowhere", { regions: new Map() }), null, "nothing known of it: no figure");
});

test("a country's own military figures move its power: quality, technology, its share of people, weariness and its arms", () => {
  const figures = (military) => ({ polityOverrides: { Cisland: { name: "Cisland", population: 12e6, military } } });
  const of = (extra, key = "Cisland") => rank("military", extra).rows.find((row) => row.key === key)?.value;
  const usual = countryWeight({ population: 12e6 });
  assert.equal(of(figures({ quality: 100 })), Math.round(usual * 1.5 * 10) / 10);
  assert.equal(of(figures({ technology: 0 })), Math.round(usual * 0.7 * 10) / 10);
  assert.equal(of(figures({ manpowerShare: 48 })), Math.round(countryWeight({ population: 48e6 }) * 10) / 10, "four times the share, twice the weight");
  assert.equal(of(figures({ sea: 0 })), Math.round(usual * 0.75 * 10) / 10, "no navy");
  assert.equal(of(figures({ land: 0, sea: 0, air: 0 })), 0, "no forces at all");
  assert.equal(of({ warWeariness: [{ country: "Borduria", value: 100 }] }, "Borduria"), Math.round(countryWeight({ population: 90e6 }) * 0.6 * 10) / 10);
  // A scenario that does not count countries' own figures ranks them as before.
  assert.equal(of({ ...figures({ quality: 100 }), warSettings: { mechanics: { military: false } } }), Math.round(usual * 10) / 10);
  // Figures of its own reorder the list: an elite army outranks a bigger levy.
  const elite = rank("military", { polityOverrides: { Cisland: { name: "Cisland", population: 12e6, military: { quality: 100, technology: 100, land: 100 } } } });
  assert.deepEqual(elite.rows.map((row) => row.key), ["Borduria", "Cisland", "Aland"]);
});

test("countries level on a figure share a rank, and a country is listed once", () => {
  const level = { countryStats: { Aland: { stability: 50 }, Borduria: { stability: 50 }, Cisland: { stability: 70 }, Dorland: { stability: 20 } } };
  const ranking = buildRanking({ world: level, countries: [...countries, { key: "aland", label: "aland" }, { key: "" }], metric: metric("stability"), catalog: [] });
  assert.deepEqual(table(ranking), [[1, "Cisland", 70], [2, "Aland", 50], [2, "Borduria", 50], [4, "Dorland", 20]]);
  assert.equal(ranking.total, 4);
  assert.deepEqual(buildRanking({ world: {}, countries: [], metric: metric("gdp") }), { rows: [], unranked: 0, total: 0, most: 0 });
  assert.deepEqual(buildRanking().rows, []);
});

test("a scenario with a sheet of its own is ranked by its own values, and its hidden backend is not shown", () => {
  const definition = { custom: true, sections: [] };
  const rows = [{ key: "legions", label: "Legions", kind: "number" }, { key: "piety", label: "Piety", kind: "index" }, { key: "", label: "x" }];
  const metrics = rankingMetricsFor({ definition, rows, world: {} });
  assert.deepEqual(metrics.map((entry) => entry.key), ["custom:legions", "custom:piety", "military", "regions", "reputation"]);
  assert.equal(metrics.some((entry) => ["population", "gdp", "gdpPerCapita", "stability"].includes(entry.key)), false, "people and an economy are the backend: a player of such a scenario never sees them");
  assert.deepEqual([metrics[0].label, metrics[0].kind, metrics[1].kind, metrics[0].stat], ["Legions", "number", "index", rows[0]]);
  const rome = { countryStats: { Aland: { customStats: { legions: 28, piety: 60 }, population: { total: 5e7 } }, Borduria: { customStats: { legions: 9 } } } };
  assert.deepEqual(table(buildRanking({ world: rome, countries, metric: metrics[0], catalog })), [[1, "Aland", 28], [2, "Borduria", 9]]);
  assert.deepEqual(table(buildRanking({ world: rome, countries, metric: metrics[1], catalog })), [[1, "Aland", 60]]);
  // An ordinary scenario is ranked by the standard sheet.
  assert.deepEqual(rankingMetricsFor({ definition: { custom: false }, world: {} }).map((entry) => entry.key), ["population", "gdp", "gdpPerCapita", "military", "regions", "stability", "reputation"]);
});

test("the tab opens on a figure a few countries have, so a game nobody has assessed does not open on an empty list", () => {
  const all = rankingMetricsFor({ world: {} });
  // Sheets for two countries and an authored figure for a third: people can be ranked.
  assert.equal(openingMetric({ world: world(), countries, metrics: all, catalog }).key, "population");
  // Nobody assessed, nothing authored: the first figure the game works out for everybody, the land each holds
  // (military power needs a country's people: "remove region count power entirely", the owner, 2026-10-16).
  const bare = { regionOwnershipOverrides: {} };
  assert.equal(openingMetric({ world: bare, countries, metrics: all, catalog }).key, "regions");
  // One country with a sheet is not a ranking; a list of one is still better than none when it is all there is.
  const lone = { countryStats: { Aland: { stability: 60 } } };
  assert.equal(openingMetric({ world: lone, countries, metrics: all, catalog }).key, "regions");
  // Authored people for a few: their military power can be ranked.
  const peopled = { polityOverrides: { Aland: { population: 4e6 }, Borduria: { population: 9e6 }, Cisland: { population: 2e6 } } };
  assert.equal(openingMetric({ world: peopled, countries, metrics: all.filter((entry) => entry.key !== "population"), catalog }).key, "military");
  assert.equal(openingMetric({ world: lone, countries, metrics: all.filter((entry) => entry.key === "stability" || entry.key === "gdp"), catalog: [] }).key, "stability");
  assert.equal(openingMetric({ world: {}, countries: [], metrics: all }).key, "population", "nothing anywhere: the first of them");
  assert.equal(openingMetric({ metrics: [] }), null);
  assert.ok(read("stats.jsx").includes("const metric = metrics.find((entry) => entry.key === metricKey) ?? opening;"));
});

test("the tab is in the Stats pane, opens a country from a row, and asks no model for anything", () => {
  const pane = read("stats.jsx");
  assert.ok(pane.includes(">🏆 Ranking</button>"));
  assert.ok(pane.includes("aria-pressed={statsView === \"ranking\"}"));
  assert.ok(pane.includes("{statsView === \"ranking\" && (\n                <RankingSection"));
  assert.ok(pane.includes("onPick={setTargetCountry}"));
  // Going down the list assesses nobody: the tab loads what is there and generates nothing.
  assert.ok(pane.includes("} else if (statsView === \"ranking\") {\n            // (Going down a ranking is not asking for each country it lists to be assessed: no request is made.)\n            void loadSheet({ generate: false });"));
  const section = pane.slice(pane.indexOf("const RankingSection = "), pane.indexOf("const StatsPaneBody = "));
  for (const call of ["ensureCountryAssessed", "generateCountryStatSheet", "writeWorldState("]) assert.equal(section.includes(call), false, call);
  // Names and figures are not the translator's to touch; the wording is.
  assert.ok(section.split("data-no-translate").length - 1 >= 4);
  assert.ok(section.includes("Countries that have not been assessed are left out."));
  assert.equal(section.toLowerCase().includes("gradient"), false);
});
