/*! Open Historia — dark National Geographic style adapter tests © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNatGeoDarkStyle,
  classifyNatGeoDarkLabelLayer,
  darkenNatGeoColor,
  normalizeNatGeoVectorSource,
} from "./natGeoDarkStyle.js";

const style = {
  version: 8,
  sprite: "../sprites/sprite",
  glyphs: "https://basemaps.arcgis.com/fonts/{fontstack}/{range}.pbf",
  sources: {
    esri: { type: "vector", url: "https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer" },
    relativeTiles: { type: "raster", tiles: ["../../tiles/{z}/{x}/{y}.png"] },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#fff" } },
    { id: "Land", type: "fill", source: "esri", "source-layer": "Land", paint: { "fill-color": "#e6d8ae" } },
    { id: "Forest", type: "fill", source: "esri", "source-layer": "Vegetation", paint: { "fill-color": "#7fa66a" } },
    { id: "Water", type: "fill", source: "esri", "source-layer": "Water area", paint: { "fill-color": "#8bc4dd" } },
    { id: "Admin0 ribbon L4 outer/0", type: "fill", source: "esri", "source-layer": "Admin0 ribbon L4 outer", paint: { "fill-color": "#f00" } },
    { id: "Admin0 boundary", type: "line", source: "esri", "source-layer": "Admin0 boundary", paint: { "line-color": "#000", "line-pattern": "dash" } },
    { id: "Admin0 point/large", type: "symbol", source: "esri", "source-layer": "Admin0 point", layout: { "text-field": "{_name}" } },
    { id: "Admin1 point/medium", type: "symbol", source: "esri", "source-layer": "Province", layout: { "text-field": "{_name}" } },
    { id: "City small scale/x large admin0 capital", type: "symbol", source: "esri", "source-layer": "City small scale", minzoom: 3, layout: { "text-field": "{_name}", "icon-image": "city-dot" } },
    { id: "Marine waterbody/label", type: "symbol", source: "esri", "source-layer": "Marine waterbody", layout: { "text-field": "{_name}", "icon-image": "water" } },
    { id: "Landform/label/Round large", type: "symbol", source: "esri", "source-layer": "Landform/label", layout: { "text-field": "{_name}" } },
    { id: "Road/label", type: "symbol", source: "esri", "source-layer": "Road", minzoom: 8, layout: { "text-field": "{_name}" } },
    { id: "POI/label", type: "symbol", source: "esri", "source-layer": "POI", layout: { "text-field": "{_name}" } },
  ],
};

const luminance = (hex) => {
  const value = hex.replace("#", "").slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
};


test("ArcGIS VectorTileServer sources are converted to explicit PBF tiles for MapLibre", () => {
  const normalized = normalizeNatGeoVectorSource({
    type: "vector",
    url: "https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer",
  });
  assert.equal(normalized.url, undefined);
  assert.deepEqual(normalized.tiles, [
    "https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer/tile/{z}/{y}/{x}.pbf",
  ]);
  assert.equal(normalized.minzoom, 0);
  assert.equal(normalized.maxzoom, 16);
});

test("label policy suppresses only sovereign country labels while keeping rich NatGeo reference layers", () => {
  assert.equal(classifyNatGeoDarkLabelLayer(style.layers[6]), "suppress");
  assert.equal(classifyNatGeoDarkLabelLayer(style.layers[7]), "region");
  assert.equal(classifyNatGeoDarkLabelLayer(style.layers[8]), "place");
  assert.equal(classifyNatGeoDarkLabelLayer(style.layers[9]), "water");
  assert.equal(classifyNatGeoDarkLabelLayer(style.layers[10]), "terrain");
  assert.equal(classifyNatGeoDarkLabelLayer(style.layers[11]), "street");
  assert.equal(classifyNatGeoDarkLabelLayer(style.layers[12]), "poi");
});

test("dark palette compresses luminance without flattening NatGeo source hues", () => {
  const desert = darkenNatGeoColor("#e6d8ae");
  const forest = darkenNatGeoColor("#7fa66a");
  const water = darkenNatGeoColor("#8bc4dd", { water: true });
  assert.ok(luminance(desert) < 0.40);
  assert.ok(luminance(forest) < 0.36);
  assert.ok(luminance(water) < 0.36);
  assert.notEqual(desert, forest);
  assert.notEqual(forest, water);
  assert.notEqual(desert, water);
});

test("dark NatGeo preserves rich reference cartography while removing only country labels", () => {
  const result = buildNatGeoDarkStyle(style);
  const ids = result.layers.map((layer) => layer.id);
  assert.ok(ids.includes("Land"));
  assert.ok(ids.includes("Forest"));
  assert.ok(ids.includes("Water"));
  assert.ok(ids.includes("Admin0 boundary"));
  assert.ok(ids.includes("Admin1 point/medium"));
  assert.ok(ids.includes("City small scale/x large admin0 capital"));
  assert.ok(ids.includes("Marine waterbody/label"));
  assert.ok(ids.includes("Landform/label/Round large"));
  assert.ok(ids.includes("Road/label"));
  assert.ok(ids.includes("POI/label"));
  assert.ok(!ids.includes("Admin0 ribbon L4 outer/0"));
  assert.ok(!ids.includes("Admin0 point/large"));
  assert.ok(ids.includes("oh-natgeo-dark-physical"));
  assert.match(result.sprite, /sprites\/sprite$/);
  assert.match(result.glyphs, /\{fontstack\}\/\{range\}\.pbf$/);
  assert.match(result.sources.relativeTiles.tiles[0], /\{z\}\/\{x\}\/\{y\}\.png$/);
  assert.equal(result.sources.esri.url, undefined);
  assert.match(result.sources.esri.tiles[0], /VectorTileServer\/tile\/\{z\}\/\{y\}\/\{x\}\.pbf$/);
  assert.equal(result.sources.esri.maxzoom, 16);

  const road = result.layers.find((layer) => layer.id === "Road/label");
  assert.equal(road.minzoom, 8);

  const city = result.layers.find((layer) => layer.id === "City small scale/x large admin0 capital");
  assert.equal(city.layout["icon-image"], "city-dot");

  const adminBoundary = result.layers.find((layer) => layer.id === "Admin0 boundary");
  assert.equal(adminBoundary.metadata["openhistoria:natgeo-reference-tier"], "line");
  assert.equal(city.metadata["openhistoria:natgeo-reference-tier"], "label");
  assert.equal(road.metadata["openhistoria:natgeo-reference-tier"], "label");

  const land = result.layers.find((layer) => layer.id === "Land");
  const forest = result.layers.find((layer) => layer.id === "Forest");
  assert.notEqual(land.paint["fill-color"], forest.paint["fill-color"]);
});


test("dark NatGeo scales expression fill opacity instead of hiding its physical foundation", () => {
  const expressionStyle = {
    ...style,
    layers: style.layers.map((layer) => layer.id === "Forest"
      ? { ...layer, paint: { ...layer.paint, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.2, 8, 1] } }
      : layer),
  };
  const result = buildNatGeoDarkStyle(expressionStyle);
  const forest = result.layers.find((layer) => layer.id === "Forest");
  assert.deepEqual(forest.paint["fill-opacity"].slice(0, 2), ["*", 0.36]);
});

test("dark NatGeo uses a distinct physical-map foundation and remains terrain-capable", () => {
  const result = buildNatGeoDarkStyle(style, {
    terrainEnabled: true,
    terrainTileTemplate: "https://example.invalid/{z}/{x}/{y}.png",
  });
  assert.equal(result.sources["terrain-source"].type, "raster-dem");
  assert.match(result.sources["oh-natgeo-dark-physical"].tiles[0], /World_Physical_Map/);
  assert.equal(result.layers.find((layer) => layer.id === "background").paint["background-color"], "#111416");
});
