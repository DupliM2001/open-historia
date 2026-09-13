/*! Open Historia — production polity-label real-geometry regression harness © 2026 Open Historia contributors, AGPL-3.0-or-later. */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { aggregatePolityGeometry } from "../src/Game/Map/vnext/polityGeometry.js";
import { buildPolityLabelCollections } from "../src/Game/Map/vnext/polityLabels.js";

const MODERN_REGIONS = JSON.parse(
  fs.readFileSync(new URL("./seed/default/regions.geojson", import.meta.url), "utf8"),
);

const REPRESENTATIVE_OWNERS = Object.freeze([
  "United States of America",
  "Canada",
  "Russian Federation",
  "People's Republic of China",
  "Ukraine",
  "Italian Republic",
  "Republic of Kazakhstan",
  "Kingdom of Denmark",
  "Hellenic Republic",
  "New Zealand",
]);

const representativeRegions = {
  type: "FeatureCollection",
  features: MODERN_REGIONS.features.filter((feature) => (
    REPRESENTATIVE_OWNERS.includes(String(feature?.properties?.owner ?? ""))
  )),
};

const representativeGeometry = aggregatePolityGeometry(representativeRegions);
const geometryByOwner = new Map(
  representativeGeometry.features.map((feature) => [feature.properties.owner, feature]),
);

const layoutFor = (owner, name = owner) => {
  const geometry = geometryByOwner.get(owner);
  assert.ok(geometry, `missing real-geometry fixture for ${owner}`);
  return buildPolityLabelCollections(
    { type: "FeatureCollection", features: [geometry] },
    { nameResolver: () => name },
  );
};

const primaryLabelFor = (collections, owner) => (
  collections.labelData.features.find((feature) => feature?.properties?.owner === owner)
);

const primaryLineFor = (collections, owner) => (
  collections.lineLabelData.features.find((feature) => feature?.properties?.owner === owner)
);

test("real-geometry harness preserves highly fragmented production polity inputs", () => {
  const usa = geometryByOwner.get("United States of America");
  const china = geometryByOwner.get("People's Republic of China");
  const denmark = geometryByOwner.get("Kingdom of Denmark");

  assert.ok(usa?.properties?.regionCount >= 250, `USA regionCount=${usa?.properties?.regionCount}`);
  assert.ok(usa?.geometry?.coordinates?.length > 64, "USA fixture must exceed the old 64-polygon fitting cap");
  assert.ok(china?.properties?.regionCount >= 180, `China regionCount=${china?.properties?.regionCount}`);
  assert.ok(china?.geometry?.coordinates?.length > 100, "China fixture must preserve real administrative fragmentation");
  assert.ok(denmark?.geometry?.coordinates?.length > 1, "Denmark fixture must include detached landmasses");
});

test("production worker-safe label engine is deterministic on representative real geometry", () => {
  const first = buildPolityLabelCollections(representativeGeometry, { nameResolver: (owner) => owner });
  const second = buildPolityLabelCollections(representativeGeometry, { nameResolver: (owner) => owner });

  assert.deepEqual(second, first);
  for (const owner of REPRESENTATIVE_OWNERS) {
    assert.ok(primaryLabelFor(first, owner), `missing primary logical label for ${owner}`);
  }
});

test("real-geometry harness exercises the production name resolver", () => {
  const short = layoutFor("People's Republic of China", "CHINA");
  const formal = layoutFor("People's Republic of China", "PEOPLE'S REPUBLIC OF CHINA");

  assert.equal(primaryLabelFor(short, "People's Republic of China")?.properties?.name, "CHINA");
  assert.equal(
    primaryLabelFor(formal, "People's Republic of China")?.properties?.name,
    "PEOPLE'S REPUBLIC OF CHINA",
  );
});

test("CP2 real geometry: short/formal/localized names preserve anchor, axis and spine", () => {
  const variants = [
    ["People's Republic of China", ["CHINA", "PEOPLE'S REPUBLIC OF CHINA", "中华人民共和国"]],
    ["United States of America", ["USA", "UNITED STATES OF AMERICA"]],
  ];

  for (const [owner, names] of variants) {
    const layouts = names.map((name) => layoutFor(owner, name));
    const baseline = primaryLabelFor(layouts[0], owner);
    const baselineLine = primaryLineFor(layouts[0], owner);
    assert.ok(baseline, `missing baseline logical label for ${owner}`);

    for (let index = 1; index < layouts.length; index += 1) {
      const candidate = primaryLabelFor(layouts[index], owner);
      const candidateLine = primaryLineFor(layouts[index], owner);
      assert.ok(candidate, `missing ${owner} variant ${names[index]}`);
      assert.deepEqual(candidate.geometry, baseline.geometry, `${owner} anchor moved after rename`);
      assert.equal(candidate.properties.rotation, baseline.properties.rotation, `${owner} axis changed after rename`);
      assert.equal(candidate.properties.curveBand, baseline.properties.curveBand, `${owner} curve class changed after rename`);
      assert.equal(candidate.properties.safeWarp, baseline.properties.safeWarp, `${owner} line eligibility changed after rename`);
      assert.equal(candidate.properties.pathLength, baseline.properties.pathLength, `${owner} path length changed after rename`);
      assert.equal(candidate.properties.pathWidth, baseline.properties.pathWidth, `${owner} path width changed after rename`);
      assert.equal(Boolean(candidateLine), Boolean(baselineLine), `${owner} line existence changed after rename`);
      if (baselineLine && candidateLine) {
        assert.deepEqual(candidateLine.geometry, baselineLine.geometry, `${owner} territorial spine changed after rename`);
      }
    }
  }
});

test("CP3 real geometry: selected components are fitted without administrative-piece truncation", () => {
  const checks = [
    ["United States of America", 200],
    ["People's Republic of China", 150],
    ["Russian Federation", 250],
  ];

  for (const [owner, minimumPieces] of checks) {
    const collections = layoutFor(owner);
    const primary = primaryLabelFor(collections, owner);
    assert.ok(primary, `missing primary label for ${owner}`);
    assert.ok(primary.properties.geometryPieceCount >= minimumPieces,
      `${owner} component should retain real fragmentation, got ${primary.properties.geometryPieceCount}`);
    assert.equal(primary.properties.fittedPieceCount, primary.properties.geometryPieceCount,
      `${owner} fitter dropped component polygons`);
    assert.equal(primary.properties.fittedAreaShare, 1, `${owner} must fit the complete selected component`);
  }
});

// Remaining geometry-v2 acceptance criteria. These stay explicit TODOs until
// Checkpoints 4-6 replace the placement solver and detached-territory policy.
test.todo("real geometry: primary point anchors remain inside the selected polity component");
test.todo("real geometry: every accepted line path remains inside the selected polity component");
test.todo("real geometry: one polity emits exactly one sovereign presentation across detached landmasses");
test.todo("real geometry: equivalent owner surfaces remain stable across administrative subdivision changes");
test.todo("real geometry: overview/detail presentations simplify one placement instead of relocating it");
