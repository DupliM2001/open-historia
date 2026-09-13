/*! Open Historia — Political Cartography Pipeline v2 architecture checks © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const nations = fs.readFileSync(new URL("../Nations.jsx", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("./polityBoundariesWorker.js", import.meta.url), "utf8");
const displayMesh = fs.readFileSync(new URL("./regionDisplayMesh.js", import.meta.url), "utf8");
const displayMeshPolicy = fs.readFileSync(new URL("./regionDisplayMeshPolicy.js", import.meta.url), "utf8");
const polityTextLayer = fs.readFileSync(new URL("../labels/PolityTextLayer.jsx", import.meta.url), "utf8");

// These are intentionally source-level architecture guards. They catch accidental
// reintroduction of the exact ownership/presentation coupling that caused the
// Russia→Poland stale-surface regression before runtime tests ever execute.

test("Pipeline v2 keeps canonical region fills authoritative and removes runtime dissolved polity surfaces", () => {
  assert.match(nations, /CUSTOM_FILL_COLOR/);
  assert.match(nations, /DETAIL_FILL_COLOR/);
  assert.match(nations, /custom-regions-fill/);
  assert.match(nations, /regions-fill/);
  assert.doesNotMatch(nations, /id="polity-surfaces-source"/);
  assert.doesNotMatch(nations, /derivePolitySurfaces/);
  assert.doesNotMatch(worker, /polygon-clipping/);
  assert.doesNotMatch(worker, /derivePolitySurfaces/);
});

test("Pipeline v2 discards obsolete worker revisions rather than publishing them", () => {
  assert.match(nations, /createPoliticalCartographyScheduler/);
  assert.match(nations, /scheduler\.complete\(result\?\.requestId\)/);
  assert.match(nations, /if \(!completion\.accepted\) \{\s*return;\s*\}/);
  assert.match(nations, /const request = completion\.request/);
});

test("catalog metadata stays early while scenario readiness waits for initial PTR first paint", () => {
  const catalogPost = worker.indexOf('messageType: "catalog-ready"');
  const initializeDerivation = worker.indexOf("initializePoliticalCartography");
  assert.ok(catalogPost >= 0);
  assert.ok(initializeDerivation >= 0);
  // Exact region identity still publishes before expensive derived cartography.
  const onMessage = worker.indexOf("self.onmessage");
  const postWithinHandler = worker.indexOf('messageType: "catalog-ready"', onMessage);
  const deriveMatch = /type === "initialize"\s*\? initializePoliticalCartography/g;
  deriveMatch.lastIndex = onMessage;
  const deriveWithinHandler = deriveMatch.exec(worker)?.index ?? -1;
  assert.ok(postWithinHandler >= 0 && deriveWithinHandler > postWithinHandler);
  assert.match(nations, /primeCustomRegionCatalogEntries/);
  assert.match(nations, /initialCartographySettled/);
  assert.match(nations, /ptrBlocksInitialReadiness/);
  assert.match(nations, /!ptrPolityTextStatus\.mounted[\s\S]*!ptrPolityTextStatus\.failed/);
  assert.match(nations, /markPolitiesReady\(regionsGeojsonUrl\)/);
});

test("production PTR placement search runs in a dedicated worker before custom-layer mount", () => {
  assert.match(polityTextLayer, /new Worker\(new URL\("\.\/polityTextPlacementWorker\.js"/);
  assert.match(polityTextLayer, /placementResolved:\s*true/);
  assert.match(polityTextLayer, /preparedEntries/);
});

test("label geometry is worker-owned and Nations never fits live polity polygons on the main thread", () => {
  assert.match(worker, /buildPolityLabelCollections/);
  assert.match(worker, /aggregatePolityGeometryForOwners/);
  assert.doesNotMatch(nations, /buildPolityLabelCollections/);
  assert.match(nations, /setPolityLabelCollections/);
});

test("ownership changes patch only dirty political boundaries and labels", () => {
  assert.match(worker, /updatePoliticalBoundaryState/);
  assert.match(worker, /changedRegionIds/);
  assert.match(nations, /visibleBoundaryFilter/);
  assert.match(nations, /dirtyPoliticalOwners/);
  assert.match(nations, /updateData/);
});

test("legal ownership animation is presentation-only over already-canonical region color", () => {
  assert.match(nations, /ownership-transition-fill/);
  assert.match(nations, /transitionColor/);
  assert.match(nations, /prefers-reduced-motion/);
  assert.match(nations, /Canonical ownership is\n  \/\/ already painted underneath/);
});

test("custom political maps do not build an unused stock-country label atlas", () => {
  assert.match(nations, /if \(customFlag\) \{[\s\S]*setPointLabelData\(EMPTY_FEATURE_COLLECTION\)[\s\S]*setCurvedLabelData\(EMPTY_FEATURE_COLLECTION\)/);
});

test("dirty boundary filtering is owner-list based rather than capped to four overlapping owners", () => {
  assert.match(nations, /\["in", owner, \["get", "ownerList"\]\]/);
});

test("coalesced ownership or claim revisions cannot swallow simultaneous label invalidation", () => {
  assert.match(
    nations,
    /affectedOwners:\s*\[\.\.\.new Set\(\[\.\.\.diff\.affectedOwners, \.\.\.changedLabelOwners\]\)\]/,
  );
  assert.match(
    nations,
    /type:\s*"update-claims"[\s\S]*?affectedOwners:\s*changedLabelOwners/,
  );
  assert.match(
    worker,
    /if \(type === "update-claims"\)[\s\S]*?rebuildLabelsForOwners\(owners\)/,
  );
});

test("switching custom-map geometry invalidates old derived cartography before the new worker publishes", () => {
  assert.match(nations, /const cartographyGeometryEpochRef = useRef\(""\)/);
  assert.match(nations, /previousGeometryEpoch !== geometryEpoch/);
  assert.match(nations, /if \(geometryChanged\) \{[\s\S]*?clearDerivedCartography\(\{ resetMetadata: true \}\)/);
  assert.match(nations, /let catalogReady = Boolean\(customRegionMeta\.ready && !geometryChanged\)/);
  assert.match(nations, /catalogReady = true;[\s\S]*?setCustomRegionMeta\(metadata\)/);
});

test("political fill opacity expressions keep zoom at MapLibre top level", () => {
  assert.match(nations, /const PAX_POLITICAL_FILL_OPACITY = \[\s*"interpolate", \["linear"\], \["zoom"\]/);
  assert.match(nations, /const DISPUTED_TILE_FILL_OPACITY = PAX_POLITICAL_FILL_OPACITY/);
  assert.doesNotMatch(nations, /\["\*", PAX_POLITICAL_FILL_OPACITY,/);
  assert.doesNotMatch(nations, /\["\*", TILE_FILL_FADE,/);
  assert.doesNotMatch(nations, /\["-", 1, TILE_FILL_FADE\]/);
});

test("experimental region display mesh is quarantined behind an explicit disabled rollout policy", () => {
  assert.match(worker, /buildRegionDisplayMeshBlob/);
  assert.match(worker, /messageType: "display-mesh-ready"/);
  assert.match(worker, /scheduleDisplayMeshBuild/);
  assert.match(worker, /REGION_DISPLAY_MESH_ENABLED && type === "initialize"/);
  assert.match(displayMeshPolicy, /REGION_DISPLAY_MESH_ENABLED = false/);
  assert.match(displayMesh, /canonical scenario geometry is never mutated/i);
  assert.match(displayMesh, /polygon-clipping/);
  assert.match(displayMesh, /id\.startsWith\("reg_"\)/);

  assert.match(nations, /REGION_DISPLAY_MESH_ENABLED[\s\S]*displayRegionMesh\.geometryEpoch === activeGeometryEpoch/);
  assert.match(nations, /data=\{renderedRegionsGeojsonUrl\}/);
  assert.match(nations, /tolerance=\{0\.001\}/);
  assert.match(nations, /filter=\{customFarStockGeometryFilter\}/);
  assert.match(nations, /filter=\{customAuthoritativeGeometryFilter\}/);
  assert.match(nations, /const shouldMountStockRegions = !customFlag/);
  assert.doesNotMatch(nations, /id="polity-surfaces-source"/);
});

test("hybrid map fallback keeps exact ownership and stock hit-testing even when authored geometry exists", () => {
  assert.match(
    nations,
    /for \(const \[regionId, owner\] of Object\.entries\(regionOwnershipOverrides \?\? \{\}\)\)[\s\S]*lookup\.set\(id, owner \?\? ""\)/,
  );
  assert.match(nations, /const candidateLayers = \(scenarioOwnsRegionGeometryAtAllZooms/);
  assert.match(nations, /"regions-fill"/);
  assert.doesNotMatch(nations, /const candidateLayers = \(hasDrawnGeometry/);
});

test("stock-vs-authored provenance is explicit rather than inferred from punctuation in region ids", () => {
  assert.match(worker, /isExplicitAuthoredGeometry\(feature, index\)/);
  assert.match(worker, /authored,/);
  assert.doesNotMatch(worker, /id\.includes\("\."\)/);
  assert.doesNotMatch(nations, /id\.includes\("\."\)/);
  assert.match(nations, /\["==", \["get", "edited"\], true\]/);
  assert.match(nations, /\["==", \["get", "geometrySource"\], "authored"\]/);
  assert.match(nations, /"reg_"/);
  assert.doesNotMatch(nations, /CUSTOM_GEOMETRY_FILTER/);
  assert.doesNotMatch(nations, /GADM_GEOMETRY_FILTER/);
});

test("legacy tier-2 scenario geometry can own an entire stock-country cohort without polity-name special cases", () => {
  assert.match(nations, /deriveLegacyAuthoritativeCountryCodes/);
  assert.match(nations, /const legacyAuthoritativeCountryCodes = useMemo/);
  assert.match(nations, /\["upcase", \["get", "GID_0"\]\], \["literal", legacyAuthoritativeCountryCodes\]/);
  assert.match(nations, /SCENARIO_GID0_EXPRESSION/);
  assert.match(nations, /filter=\{stockRegionsVisibilityFilter\}/);
  assert.match(nations, /filter=\{customAuthoritativeGeometryFilter\}/);
  assert.match(nations, /filter=\{customFarStockGeometryFilter\}/);
  assert.doesNotMatch(nations, /Austrian Empire|Niederösterreich|Vienna Outskirts/);
});

test("close-zoom region-tile authority requires exact scenario/catalog identity", () => {
  assert.match(nations, /loadRegionTileIdSet/);
  assert.match(nations, /hasExactRegionTileIdentity/);
  assert.match(nations, /const regionTileHandoffSafe = Boolean/);
  assert.match(nations, /const scenarioOwnsRegionGeometryAtAllZooms/);
  assert.match(nations, /const shouldMountStockRegions = !customFlag \|\| regionTileHandoffSafe/);
  assert.match(nations, /maxzoom=\{displayMeshReady \|\| !regionTileHandoffSafe \? undefined : STOCK_REGION_HANDOFF_ZOOM\}/);
  assert.match(nations, /const candidateLayers = \(scenarioOwnsRegionGeometryAtAllZooms/);
  assert.doesNotMatch(nations, /id\.includes\("\."\)/);
});
