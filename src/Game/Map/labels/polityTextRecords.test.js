import test from "node:test";
import assert from "node:assert/strict";
import { buildPolityTextPtr1Records } from "./polityTextRecords.js";

const logical = (owner, name, baseline, extra = {}) => ({
  type: "Feature",
  id: `logical-${owner}`,
  geometry: { type: "Point", coordinates: baseline?.[Math.floor((baseline?.length ?? 1) / 2)] ?? [10, 10] },
  properties: {
    owner,
    sourceOwner: owner,
    labelKind: "polity",
    name,
    cartographicBaseline: baseline ?? [],
    minZoom: 1.2,
    priorityScale: 100,
    visibilityScale: 90,
    fontPxAtZoom4: 31,
    letterSpacing: 0.12,
    ptrPreferredAngle: 12,
    ptrAxisSpanWorld: 0.2,
    ptrCrossSpanWorld: 0.08,
    ptrCoverageGrid: {
      resolution: 8,
      bounds: [0.2, 0.2, 0.8, 0.8],
      rows: [
        "00000000",
        "00111100",
        "01111110",
        "01111110",
        "01111110",
        "01111110",
        "00111100",
        "00000000",
      ],
    },
    ...extra,
  },
});

test("PTR-1.7 ingests every canonical polity name without a scenario-name allowlist", () => {
  const data = {
    type: "FeatureCollection",
    features: [
      logical("Russian Empire", "RUSSIAN EMPIRE", [[30, 55], [90, 61], [130, 55]]),
      logical("Qing Empire", "QING EMPIRE", [[80, 35], [105, 38], [128, 42]]),
      logical("German Empire", "GERMAN EMPIRE", [[6, 49], [12, 53], [16, 55]]),
      logical("Completely Fictional Polity", "THE AURELIAN LEAGUE", [[-12, 5], [0, 10], [12, 6]]),
    ],
  };

  const records = buildPolityTextPtr1Records({ labelData: data });
  assert.equal(records.length, 4);
  assert.deepEqual(
    new Set(records.map((record) => record.text)),
    new Set(["RUSSIAN EMPIRE", "QING EMPIRE", "GERMAN EMPIRE", "THE AURELIAN LEAGUE"]),
  );
  const russia = records.find((record) => record.owner === "Russian Empire");
  assert.deepEqual(russia.baseline, [[30, 55], [90, 61], [130, 55]]);
  assert.equal(russia.polityId, "logical-Russian Empire");
});

test("PTR-1.8 keeps multiple sovereign label sites while excluding geographic territory names", () => {
  const primary = logical(
    "British Empire",
    "BRITISH EMPIRE",
    [[-8, 54], [-2, 55], [2, 53]],
    { priorityScale: 500, labelSiteRole: "sovereign-primary" },
  );
  primary.id = "british-primary-ptr";
  const secondary = logical(
    "British Empire",
    "BRITISH EMPIRE",
    [[68, 23], [78, 25], [88, 23]],
    {
      priorityScale: 300,
      labelKind: "territory",
      labelSiteRole: "sovereign-secondary",
      owner: "__part_british_india__",
      sourceOwner: "British Empire",
    },
  );
  secondary.id = "british-india-ptr";
  const geographic = logical(
    "British Empire",
    "NEWFOUNDLAND",
    [[-58, 49], [-55, 50], [-53, 48]],
    {
      priorityScale: 200,
      labelKind: "territory",
      labelSiteRole: "geographic-territory",
      owner: "__territory_newfoundland__",
      sourceOwner: "British Empire",
    },
  );
  geographic.id = "newfoundland-geographic";
  const data = { type: "FeatureCollection", features: [secondary, geographic, primary, primary] };
  const first = buildPolityTextPtr1Records({ ptrLabelData: data });
  const second = buildPolityTextPtr1Records({ ptrLabelData: data });
  assert.equal(first.length, 2);
  assert.equal(first.filter((record) => record.owner === "British Empire").length, 2);
  assert.deepEqual(new Set(first.map((record) => record.siteRole)), new Set(["sovereign-primary", "sovereign-secondary"]));
  assert.equal(first.find((record) => record.siteRole === "sovereign-secondary")?.placementMode, "fast");
  assert.deepEqual(first, second);
});

test("PTR-1.7 may still be narrowed explicitly for targeted diagnostics", () => {
  const data = {
    type: "FeatureCollection",
    features: [
      logical("Russian Empire", "RUSSIAN EMPIRE", [[30, 55], [90, 61], [130, 55]]),
      logical("Qing Empire", "QING EMPIRE", [[80, 35], [105, 38], [128, 42]]),
    ],
  };
  const records = buildPolityTextPtr1Records({ labelData: data, owners: new Set(["Qing Empire"]) });
  assert.equal(records.length, 1);
  assert.equal(records[0].owner, "Qing Empire");
});

test("PTR-1.7 keeps a valid polity when only its territorial envelope exists", () => {
  const feature = logical("Tiny Kingdom", "TINY KINGDOM", [], {
    cartographicBaseline: [],
    ptrAxisSpanWorld: 0.015,
    ptrCrossSpanWorld: 0.008,
  });
  feature.geometry.coordinates = [14, 47];
  const records = buildPolityTextPtr1Records({
    labelData: { type: "FeatureCollection", features: [feature] },
  });
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].baseline, []);
  assert.deepEqual(records[0].anchor, [14, 47]);
});

test("PTR-1.7 keeps a temporary legacy line-data fallback for migration snapshots", () => {
  const lineData = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "legacy-russia",
      geometry: { type: "LineString", coordinates: [[30, 55], [90, 61], [130, 55]] },
      properties: {
        owner: "Russian Empire",
        sourceOwner: "Russian Empire",
        labelKind: "polity",
        name: "RUSSIAN EMPIRE",
        priorityScale: 100,
        fontPxAtZoom4: 31,
      },
    }],
  };
  const records = buildPolityTextPtr1Records({ lineLabelData: lineData });
  assert.equal(records.length, 1);
  assert.equal(records[0].owner, "Russian Empire");
});


test("prominent secondary sovereign sites use optimized placement while small sites stay fast", () => {
  const prominent = logical(
    "Maritime Empire",
    "MARITIME EMPIRE",
    [[-8, 54], [-2, 55], [2, 53]],
    {
      priorityScale: 120000,
      labelKind: "territory",
      labelSiteRole: "sovereign-secondary",
      owner: "__part_maritime_metropole__",
      sourceOwner: "Maritime Empire",
    },
  );
  prominent.id = "maritime-prominent-ptr";
  const small = logical(
    "Maritime Empire",
    "MARITIME EMPIRE",
    [[68, 23], [78, 25], [88, 23]],
    {
      priorityScale: 80000,
      labelKind: "territory",
      labelSiteRole: "sovereign-secondary",
      owner: "__part_maritime_small__",
      sourceOwner: "Maritime Empire",
    },
  );
  small.id = "maritime-small-ptr";

  const records = buildPolityTextPtr1Records({
    ptrLabelData: { type: "FeatureCollection", features: [prominent, small] },
  });
  assert.equal(records.find((record) => record.siteId === "maritime-prominent-ptr")?.placementMode, "optimized");
  assert.equal(records.find((record) => record.siteId === "maritime-small-ptr")?.placementMode, "fast");
});
