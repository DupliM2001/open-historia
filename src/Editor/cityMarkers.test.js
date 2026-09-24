// Run: node --test src/Editor/cityMarkers.test.js
//
// The Province Map Importer's city rows have to become the editor's point
// features — the same shape a hand-placed city has, so buildCitiesForGame
// (exportPreset.js) exports them into the scenario's cities.geojson: coord,
// name, population, tags (capital), tier. Replace drops the old cities and keeps
// other point markers; merge updates a city found again by name and place and
// keeps its id.
import assert from "node:assert/strict";
import test from "node:test";

import { cityRowToFeature, isCityFeature, mergeCityMarkers } from "./cityMarkers.js";

// A row exactly as collectImportedCityPoints builds it from a GeoJSON Point with
// markerType "city" (the Fault Lines export's markers look like this).
const row = (overrides = {}) => ({
  sourceId: "5001",
  name: "Bogota",
  type: "Coordinate",
  symbol: "full-flag",
  coord: [-74.10473254739972, 4.634920075142489],
  country: "",
  owner: "Republic of Colombia",
  regionId: "312",
  sourceRegionId: "312",
  population: 2757300,
  tier: 3,
  tags: ["city", "capital"],
  labelScale: 1.4,
  labelPlacement: "top",
  ...overrides,
});

test("a row becomes the editor's city feature, in the shape buildCitiesForGame reads", () => {
  const feature = cityRowToFeature(row(), "feat_1");
  assert.deepEqual(feature, {
    id: "feat_1",
    name: "Bogota",
    type: "Coordinate",
    symbol: "full-flag",
    coord: [-74.10473254739972, 4.634920075142489],
    country: "",
    owner: "Republic of Colombia",
    regionId: "312",
    population: 2757300,
    tags: ["city", "capital"],
    tier: 3,
    labelScale: 1.4,
    labelPlacement: "top",
  });
  // What the export derives from it: capital "primary", the authored tier.
  assert.ok(feature.tags.includes("capital"));
  assert.equal(feature.tier, 3);
});

test("defaults: a plain marker is a square tier-less city; an unplaceable row is refused", () => {
  const plain = cityRowToFeature({ name: "Makoua", coord: [15.597, -0.008], population: 70600, tags: [] }, "feat_2");
  assert.equal(plain.symbol, "square");
  assert.deepEqual(plain.tags, ["city"]);
  assert.equal(plain.owner, null);
  assert.equal(plain.regionId, null);
  assert.equal("tier" in plain, false, "no authored tier: the export derives one from population");
  assert.equal(cityRowToFeature({ name: "", coord: [1, 1] }, "x"), null);
  assert.equal(cityRowToFeature({ name: "Nowhere", coord: [200, 1] }, "x"), null);
  assert.equal(cityRowToFeature({ name: "Nowhere" }, "x"), null);
});

test("replace: the old cities go, other point markers stay, every row is added", () => {
  let n = 0;
  const nextId = () => `feat_${(n += 1)}`;
  const existing = [
    { id: "old-city", name: "Paris", type: "Coordinate", symbol: "square", coord: [2.35, 48.85], tags: ["city", "capital"], population: 2000000 },
    { id: "poi", name: "Alamo", type: "Coordinate", symbol: "square", coord: [-98.5, 29.4], tags: ["landmark"], population: 0 },
  ];
  const result = mergeCityMarkers(existing, [row(), row({ name: "Makoua", coord: [15.597, -0.008], population: 70600, tier: 1, tags: ["city"], symbol: "square" })], { replaceExisting: true, nextId });
  assert.equal(result.count, 2);
  assert.equal(result.created, 2);
  assert.equal(result.updated, 0);
  assert.equal(result.replaced, 1, "one city replaced; the landmark is not a city");
  assert.deepEqual(result.features.map((f) => f.name), ["Alamo", "Bogota", "Makoua"]);
  assert.ok(result.features.every((f) => f.id), "every feature has an id");
  assert.equal(result.features.filter(isCityFeature).length, 2);
});

test("merge: a city found again by name and place is updated in place and keeps its id", () => {
  let n = 0;
  const nextId = () => `feat_${(n += 1)}`;
  const existing = [
    { id: "keep-me", name: "bogota", type: "Coordinate", symbol: "square", coord: [-74.1, 4.63], tags: ["city"], population: 1 },
  ];
  const result = mergeCityMarkers(existing, [row(), row({ name: "Cali", coord: [-76.5, 3.45], population: 2400000, tier: 3, tags: ["city"] })], { replaceExisting: false, nextId });
  assert.equal(result.count, 2);
  assert.equal(result.updated, 1);
  assert.equal(result.created, 1);
  assert.equal(result.replaced, 0);
  const bogota = result.features.find((f) => f.name === "Bogota");
  assert.equal(bogota.id, "keep-me", "the existing feature's id survives");
  assert.equal(bogota.population, 2757300);
  assert.deepEqual(bogota.tags, ["city", "capital"]);
  assert.equal(bogota.tier, 3);
  assert.equal(result.features.find((f) => f.name === "Cali").id, "feat_1");
});

test("merge: the same name far away is another city", () => {
  const existing = [{ id: "a", name: "Springfield", type: "Coordinate", symbol: "square", coord: [-89.65, 39.8], tags: ["city"], population: 100 }];
  const result = mergeCityMarkers(existing, [row({ name: "Springfield", coord: [-72.6, 42.1], population: 150000, tier: 2, tags: ["city"] })], { replaceExisting: false });
  assert.equal(result.created, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.features.length, 2);
});

test("rows the importer could not place are counted, not silently lost", () => {
  const result = mergeCityMarkers([], [row(), { name: "", coord: [0, 0] }, { name: "Nowhere" }], { replaceExisting: true });
  assert.equal(result.count, 1);
  assert.equal(result.skipped, 2);
});
