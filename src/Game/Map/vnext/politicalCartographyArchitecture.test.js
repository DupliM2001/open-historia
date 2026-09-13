/*! Open Historia — Political Cartography Pipeline v2 architecture checks © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const nations = fs.readFileSync(new URL("../Nations.jsx", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("./polityBoundariesWorker.js", import.meta.url), "utf8");
const displayMesh = fs.readFileSync(new URL("./regionDisplayMesh.js", import.meta.url), "utf8");

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
  assert.doesNotMatch(worker, /(?:from\s+|import\()["\']polygon-clipping["\']/);
  assert.doesNotMatch(worker, /derivePolitySurfaces/);
});

test("Pipeline v2 discards obsolete worker revisions rather than publishing them", () => {
  assert.match(nations, /createPoliticalCartographyScheduler/);
  assert.match(nations, /scheduler\.complete\(result\?\.requestId\)/);
  assert.match(nations, /if \(!completion\.accepted\) \{\s*return;\s*\}/);
  assert.match(nations, /const request = completion\.request/);
});

test("catalog readiness is published before topology, borders and labels finish", () => {
  const catalogPost = worker.indexOf('messageType: "catalog-ready"');
  const initializeDerivation = worker.indexOf("initializePoliticalCartography");
  assert.ok(catalogPost >= 0);
  assert.ok(initializeDerivation >= 0);
  // The post lives in the initialize message branch before the derivation call.
  const onMessage = worker.indexOf("self.onmessage");
  const postWithinHandler = worker.indexOf('messageType: "catalog-ready"', onMessage);
  const deriveWithinHandler = worker.indexOf('? initializePoliticalCartography', onMessage);
  assert.ok(postWithinHandler >= 0 && deriveWithinHandler > postWithinHandler);
  assert.match(nations, /primeCustomRegionCatalogEntries/);
  assert.match(nations, /markPolitiesReady\(regionsGeojsonUrl\)/);
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
  assert.match(nations, /Canonical ownership is\r?\n  \/\/ already painted underneath/);
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

test("topology-safe region mesh remains an isolated experiment outside the beta worker graph", () => {
  // Keep the experiment available for dedicated wedge research, but the live
  // beta worker must not import/schedule it. Its dynamic clipping dependency
  // otherwise forces worker code-splitting and breaks Vite's default worker build.
  assert.doesNotMatch(worker, /regionDisplayMesh/);
  assert.doesNotMatch(worker, /buildRegionDisplayMeshBlob/);
  assert.doesNotMatch(worker, /messageType: "display-mesh-ready"/);
  assert.doesNotMatch(worker, /scheduleDisplayMeshBuild/);

  assert.match(displayMesh, /canonical scenario geometry is never mutated/i);
  assert.match(displayMesh, /polygon-clipping/);
  assert.match(displayMesh, /id\.startsWith\("reg_"\)/);
  assert.match(displayMesh, /polygonNeedsRenderSubdivision/);
  assert.match(displayMesh, /clipper\.intersection/);
  assert.match(displayMesh, /rogue translucent/);

  // Canonical region geometry remains the live renderer input. Dormant UI-side
  // display-mesh plumbing can be removed separately; it has no worker producer.
  assert.match(nations, /data=\{renderedRegionsGeojsonUrl\}/);
  assert.match(nations, /tolerance=\{0\.001\}/);
  assert.match(nations, /filter=\{STOCK_GEOMETRY_FILTER\}/);
  assert.match(nations, /filter=\{AUTHORED_GEOMETRY_FILTER\}/);
  assert.doesNotMatch(nations, /id="polity-surfaces-source"/);
});

test("CP4.2 live renderer uses the worker baseline threshold without a hidden half-zoom delay", () => {
  assert.match(
    nations,
    /\["<=", \["coalesce", \["get", "curveMinZoom"\], 99\], currentLabelZoom\]/,
  );
  assert.doesNotMatch(
    nations,
    /\["\+", \["coalesce", \["get", "curveMinZoom"\], 99\], 0\.45\]/,
  );
});
