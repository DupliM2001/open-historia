import test from "node:test";
import assert from "node:assert/strict";
import { mergeImportedFeatures, parseFeatureImport } from "./featureImport.js";

test("GeoJSON points become features; other geometries are counted as skipped", () => {
  const { features, skipped, format } = parseFeatureImport(JSON.stringify({
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [2.35, 48.86] }, properties: { name: "Paris", symbol: "star", tags: "capital, city", country: "France", population: "2100000" } },
      { type: "Feature", geometry: { type: "MultiPoint", coordinates: [[0, 0], [1, 1]] }, properties: { title: "Buoys", kind: "sea" } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { name: "An area" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [999, 0] }, properties: { name: "Off the map" } },
    ],
  }));
  assert.equal(format, "geojson");
  assert.equal(skipped, 2);
  assert.equal(features.length, 3);
  assert.deepEqual(features[0].coord, [2.35, 48.86]);
  assert.equal(features[0].name, "Paris");
  assert.equal(features[0].symbol, "star");
  assert.deepEqual(features[0].tags, ["capital", "city"]);
  assert.equal(features[0].country, "France");
  assert.equal(features[0].population, 2100000);
  assert.equal(features[0].type, "Coordinate");
  assert.match(features[0].id, /^feat_/);
  assert.equal(features[1].name, "Buoys");
  assert.deepEqual(features[1].tags, ["sea"]);
  assert.deepEqual(features[2].coord, [1, 1]);
  assert.notEqual(features[0].id, features[1].id);
});

test("a Workshop document and plain rows import too", () => {
  const doc = parseFeatureImport({ name: "My map", features: [{ name: "Fort", coord: [10, 20], symbol: "triangle", tags: ["fort"] }, { name: "Nowhere" }] });
  assert.equal(doc.format, "document");
  assert.equal(doc.features.length, 1);
  assert.equal(doc.skipped, 1);
  assert.equal(doc.features[0].symbol, "triangle");

  const rows = parseFeatureImport([{ name: "Harbour", lng: "12.5", lat: "-3.25" }, { label: "Peak", longitude: 7, latitude: 46 }, "not a row", { name: "No place" }]);
  assert.equal(rows.format, "rows");
  assert.deepEqual(rows.features.map((f) => f.name), ["Harbour", "Peak"]);
  assert.deepEqual(rows.features[0].coord, [12.5, -3.25]);
  assert.equal(rows.skipped, 2);
  // A nameless feature is still named.
  assert.equal(parseFeatureImport([{ lon: 1, lat: 2 }]).features[0].name, "Feature 1");
});

test("files without any point refuse with a reason", () => {
  assert.throws(() => parseFeatureImport("{}"), /holds no features/);
  assert.throws(() => parseFeatureImport("not json"), SyntaxError);
  assert.throws(() => parseFeatureImport([{ name: "x", lon: 500, lat: 0 }]), /usable point/);
});

test("merging drops exact duplicates of what is already there", () => {
  const existing = [{ id: "a", name: "Paris", coord: [2.35, 48.86] }];
  const { imported } = { imported: parseFeatureImport([{ name: "Paris", lon: 2.35, lat: 48.86 }, { name: "Lyon", lon: 4.83, lat: 45.76 }]).features };
  const merged = mergeImportedFeatures(existing, imported);
  assert.equal(merged.added, 1);
  assert.equal(merged.duplicates, 1);
  assert.equal(merged.features.length, 2);
  assert.equal(merged.features[1].name, "Lyon");
});
