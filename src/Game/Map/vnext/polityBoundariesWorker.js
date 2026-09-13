/*! Open Historia — Political Cartography Pipeline v2 worker © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */
import { toCountryName } from "../../../runtime/ownerNames.js";
import {
  affectedOwnersForRegionChanges,
  buildPoliticalBoundaryTopology,
  createPoliticalBoundaryState,
  politicalBoundaryStateCollection,
  updatePoliticalBoundaryState,
} from "./politicalBoundaryTopology.js";
import {
  aggregatePolityGeometry,
  aggregatePolityGeometryForOwners,
} from "./polityGeometry.js";
import { buildPolityLabelCollections } from "./polityLabels.js";
import { buildRegionDisplayMeshBlob, isExplicitAuthoredGeometry } from "./regionDisplayMesh.js";
import { REGION_DISPLAY_MESH_ENABLED } from "./regionDisplayMeshPolicy.js";

const EMPTY_FC = Object.freeze({ type: "FeatureCollection", features: [] });

let cachedRegions = EMPTY_FC;
let cachedRegionsUrl = "";
let cachedMetadata = null;
let cachedTopology = null;
let boundaryState = null;
let labelGeometryByOwner = new Map();
let labelsByOwner = new Map();
let currentOwnershipOverrides = {};
let currentLabelNames = {};
let displayMeshGeneration = 0;

const cancelDisplayMeshBuild = () => {
  displayMeshGeneration += 1;
};

const scheduleDisplayMeshBuild = ({ requestId, geometryEpoch, regions }) => {
  const generation = ++displayMeshGeneration;
  const sourceRegions = regions;

  // Catalog readiness and the first boundary/label snapshot publish first. The
  // topology-safe fill mesh is a geometry-epoch-scoped presentation enhancement
  // and must never delay gameplay or become canonical region geometry.
  Promise.resolve().then(async () => {
    const result = await buildRegionDisplayMeshBlob(sourceRegions, {
      shouldCancel: () => generation !== displayMeshGeneration,
    });
    if (generation !== displayMeshGeneration || result?.cancelled || !result?.blob) return;
    self.postMessage({
      messageType: "display-mesh-ready",
      requestId,
      geometryEpoch,
      displayBlob: result.blob,
      stats: result.stats ?? {},
    });
  }).catch((error) => {
    if (generation !== displayMeshGeneration) return;
    self.postMessage({
      messageType: "display-mesh-error",
      requestId,
      geometryEpoch,
      error: error instanceof Error ? error.message : String(error),
    });
  });
};

const toStringArray = (value) => Array.isArray(value)
  ? value.map((entry) => String(entry ?? "")).filter(Boolean)
  : [];

const buildMetadata = (regions) => {
  const records = [];
  const ownedCountryCodes = new Set();
  const editedStockIds = [];
  let drawnCount = 0;
  let stockCount = 0;

  const sourceFeatures = regions?.features ?? [];
  for (let index = 0; index < sourceFeatures.length; index += 1) {
    const feature = sourceFeatures[index];
    const props = feature?.properties ?? {};
    const id = props.id != null ? String(props.id) : props.GID_1 != null ? String(props.GID_1) : "";
    if (!id) continue;
    const authored = isExplicitAuthoredGeometry(feature, index);
    if (authored) drawnCount += 1;
    else stockCount += 1;
    if (props.edited === true) editedStockIds.push(id);

    const gid0 = String(props.gid0 ?? props.GID_0 ?? "").trim().toUpperCase();
    if (gid0) ownedCountryCodes.add(gid0);
    const centroid = props?.centroid?.coordinates;
    const lng = Number(Array.isArray(centroid) ? centroid[0] : props?.lng ?? props?.longitude);
    const lat = Number(Array.isArray(centroid) ? centroid[1] : props?.lat ?? props?.latitude);

    records.push({
      id,
      owner: props.owner ? String(props.owner) : "",
      gid0,
      edited: props.edited === true,
      authored,
      claimants: toStringArray(props.claimants),
      country: props.country ? String(props.country) : "",
      countryCode: gid0,
      name: String(props.name ?? props.NAME_1 ?? props.name_1 ?? id),
      lng: Number.isFinite(lng) ? lng : null,
      lat: Number.isFinite(lat) ? lat : null,
      tags: toStringArray(props.tags),
      type: props.type ? String(props.type) : "",
      adjacencies: toStringArray(props.adjacencies),
    });
  }

  return {
    records,
    ownedCountryCodes: [...ownedCountryCodes],
    editedStockIds,
    featureCount: records.length,
    hasDrawnGeometry: drawnCount > 0,
    fullyAuthoredGeometry: records.length > 0 && stockCount === 0,
  };
};

const deriveDisputedData = (ownershipOverrides = {}, regionClaimants = {}) => {
  const features = [];
  for (const feature of cachedRegions?.features ?? []) {
    const props = feature?.properties ?? {};
    const id = props.id != null ? String(props.id) : props.GID_1 != null ? String(props.GID_1) : "";
    if (!id) continue;
    const live = toStringArray(regionClaimants?.[id]);
    const claimants = live.length ? live : toStringArray(props.claimants);
    if (!claimants.length) continue;
    features.push({
      ...feature,
      properties: {
        ...props,
        id,
        _liveOwner: String(ownershipOverrides?.[id] ?? props.owner ?? ""),
        _liveClaimants: claimants,
      },
    });
  }
  return { type: "FeatureCollection", features };
};

const resetDerivedCaches = () => {
  cachedTopology = null;
  boundaryState = null;
  labelGeometryByOwner = new Map();
  labelsByOwner = new Map();
  currentOwnershipOverrides = {};
  currentLabelNames = {};
};

const loadRegionsFromUrl = async (url) => {
  const fetchStartedAt = performance.now();
  const response = await fetch(url, { cache: "default", credentials: "same-origin" });
  if (!response.ok) throw new Error(`regions fetch failed (${response.status})`);
  const text = await response.text();
  const fetchMs = performance.now() - fetchStartedAt;
  const parseStartedAt = performance.now();
  const parsed = JSON.parse(text);
  const parseMs = performance.now() - parseStartedAt;
  if (!parsed || !Array.isArray(parsed.features)) {
    throw new Error("regions payload is not a GeoJSON FeatureCollection");
  }
  cachedRegions = parsed;
  cachedRegionsUrl = url;
  cachedMetadata = buildMetadata(parsed);
  resetDerivedCaches();
  return { bytes: text.length, fetchMs, parseMs };
};

const labelName = (owner) => String(currentLabelNames?.[owner] ?? owner).trim() || owner;

const buildOwnerLabels = (geometryFeature) => {
  if (!geometryFeature) return null;
  const owner = toCountryName(geometryFeature?.properties?.owner ?? "");
  if (!owner) return null;
  const collections = buildPolityLabelCollections(
    { type: "FeatureCollection", features: [geometryFeature] },
    { nameResolver: () => labelName(owner) },
  );
  return {
    labelData: collections.labelData ?? EMPTY_FC,
    ptrLabelData: collections.ptrLabelData ?? EMPTY_FC,
    pointLabelData: collections.pointLabelData ?? EMPTY_FC,
    lineLabelData: collections.lineLabelData ?? EMPTY_FC,
  };
};

const setInitialLabelGeometry = (collection) => {
  labelGeometryByOwner = new Map();
  labelsByOwner = new Map();
  for (const feature of collection?.features ?? []) {
    const owner = toCountryName(feature?.properties?.owner ?? "");
    if (!owner) continue;
    labelGeometryByOwner.set(owner, feature);
    const labels = buildOwnerLabels(feature);
    if (labels) labelsByOwner.set(owner, labels);
  }
};

const patchLabelGeometryForOwners = (collection, affectedOwners) => {
  const normalized = [...new Set((affectedOwners ?? []).map(toCountryName).filter(Boolean))];
  for (const owner of normalized) {
    labelGeometryByOwner.delete(owner);
    labelsByOwner.delete(owner);
  }
  for (const feature of collection?.features ?? []) {
    const owner = toCountryName(feature?.properties?.owner ?? "");
    if (!owner) continue;
    labelGeometryByOwner.set(owner, feature);
    const labels = buildOwnerLabels(feature);
    if (labels) labelsByOwner.set(owner, labels);
  }
};

const rebuildLabelsForOwners = (owners) => {
  for (const rawOwner of owners ?? []) {
    const owner = toCountryName(rawOwner);
    if (!owner) continue;
    const geometry = labelGeometryByOwner.get(owner);
    if (!geometry) labelsByOwner.delete(owner);
    else {
      const labels = buildOwnerLabels(geometry);
      if (labels) labelsByOwner.set(owner, labels);
    }
  }
};

const combinedLabels = () => {
  const logical = [];
  const ptr = [];
  const points = [];
  const lines = [];
  for (const collections of labelsByOwner.values()) {
    logical.push(...(collections?.labelData?.features ?? []));
    ptr.push(...(collections?.ptrLabelData?.features ?? []));
    points.push(...(collections?.pointLabelData?.features ?? []));
    lines.push(...(collections?.lineLabelData?.features ?? []));
  }
  return {
    labelData: { type: "FeatureCollection", features: logical },
    ptrLabelData: { type: "FeatureCollection", features: ptr },
    pointLabelData: { type: "FeatureCollection", features: points },
    lineLabelData: { type: "FeatureCollection", features: lines },
  };
};

const fullSnapshotFromCurrentCaches = ({ ownershipOverrides = {}, regionClaimants = {}, rebuildLabels = false } = {}) => {
  ensureTopology();
  if (!boundaryState) boundaryState = createPoliticalBoundaryState(cachedTopology, ownershipOverrides);
  if (rebuildLabels) {
    // Recovery after an unpublished specialized revision must not assume the
    // renderer saw the worker's prior label cache. Rebuild the complete current
    // label set against the newest names/ownership before publishing one
    // self-contained renderer snapshot. This is rare recovery work, not the
    // ordinary incremental path.
    setInitialLabelGeometry(aggregatePolityGeometry(cachedRegions, ownershipOverrides));
  }
  return {
    boundaryPatch: {
      removeAll: true,
      upsert: politicalBoundaryStateCollection(boundaryState).features,
    },
    labels: combinedLabels(),
    disputedData: deriveDisputedData(ownershipOverrides, regionClaimants),
  };
};

const ensureTopology = () => {
  if (cachedTopology) return { elapsedMs: 0, reused: true, ...(cachedTopology.stats ?? {}) };
  const startedAt = performance.now();
  cachedTopology = buildPoliticalBoundaryTopology(cachedRegions);
  return { elapsedMs: performance.now() - startedAt, reused: false, ...(cachedTopology.stats ?? {}) };
};

const inferChangedRegionIds = (previousOverrides = {}, nextOverrides = {}) => {
  const ids = new Set([...Object.keys(previousOverrides ?? {}), ...Object.keys(nextOverrides ?? {})]);
  const changed = [];
  for (const id of ids) {
    const index = cachedTopology?.regionIndexById?.get(String(id));
    const baseOwner = index == null ? "" : cachedTopology.baseOwners[index];
    const before = toCountryName(previousOverrides?.[id] ?? baseOwner ?? "");
    const after = toCountryName(nextOverrides?.[id] ?? baseOwner ?? "");
    if (before !== after) changed.push(String(id));
  }
  return changed;
};

const initializePoliticalCartography = ({ ownershipOverrides, regionClaimants }) => {
  const startedAt = performance.now();
  const topologyStats = ensureTopology();

  const boundaryStartedAt = performance.now();
  boundaryState = createPoliticalBoundaryState(cachedTopology, ownershipOverrides);
  const boundaryData = politicalBoundaryStateCollection(boundaryState);
  const boundaryMs = performance.now() - boundaryStartedAt;

  const labelGeometryStartedAt = performance.now();
  const labelGeometry = aggregatePolityGeometry(cachedRegions, ownershipOverrides);
  const labelGeometryMs = performance.now() - labelGeometryStartedAt;
  const labelStartedAt = performance.now();
  setInitialLabelGeometry(labelGeometry);
  const labels = combinedLabels();
  const labelMs = performance.now() - labelStartedAt;

  return {
    boundaryPatch: { removeAll: true, upsert: boundaryData.features },
    labels,
    disputedData: deriveDisputedData(ownershipOverrides, regionClaimants),
    stats: {
      topologyMs: topologyStats.elapsedMs,
      boundaryMs,
      boundaryGroupCount: boundaryData.features.length,
      labelGeometryMs,
      labelMs,
      elapsedMs: performance.now() - startedAt,
    },
  };
};

const updateOwnershipCartography = ({
  previousOwnershipOverrides,
  ownershipOverrides,
  regionClaimants,
  affectedOwners = [],
  changedRegionIds = [],
  forceFullSnapshot = false,
}) => {
  const startedAt = performance.now();
  ensureTopology();
  if (!boundaryState) boundaryState = createPoliticalBoundaryState(cachedTopology, previousOwnershipOverrides);

  // A full recovery snapshot is defined by the worker's last actual ownership
  // state versus the newest canonical ownership snapshot. Do not trust an
  // incremental changed-id hint here: intermediate UI revisions may have been
  // coalesced before they ever reached the worker.
  const exactChangedIds = forceFullSnapshot
    ? inferChangedRegionIds(previousOwnershipOverrides, ownershipOverrides)
    : changedRegionIds?.length
      ? [...new Set(changedRegionIds.map(String).filter(Boolean))]
      : inferChangedRegionIds(previousOwnershipOverrides, ownershipOverrides);

  const normalizedAffected = new Set(
    (affectedOwners ?? []).map(toCountryName).filter(Boolean),
  );
  for (const owner of affectedOwnersForRegionChanges(
    cachedTopology,
    previousOwnershipOverrides,
    ownershipOverrides,
    exactChangedIds,
  )) normalizedAffected.add(owner);
  const ownerList = [...normalizedAffected];

  const boundaryStartedAt = performance.now();
  const boundaryResult = updatePoliticalBoundaryState(boundaryState, ownershipOverrides, exactChangedIds);
  const boundaryMs = performance.now() - boundaryStartedAt;

  const labelGeometryStartedAt = performance.now();
  const labelGeometry = aggregatePolityGeometryForOwners(cachedRegions, ownershipOverrides, ownerList);
  const labelGeometryMs = performance.now() - labelGeometryStartedAt;
  const labelStartedAt = performance.now();
  patchLabelGeometryForOwners(labelGeometry, ownerList);
  const labels = combinedLabels();
  const labelMs = performance.now() - labelStartedAt;

  return {
    boundaryPatch: boundaryResult.patch,
    labels,
    disputedData: deriveDisputedData(ownershipOverrides, regionClaimants),
    stats: {
      ...boundaryResult.stats,
      affectedOwnerCount: ownerList.length,
      changedRegionCount: exactChangedIds.length,
      boundaryMs,
      labelGeometryMs,
      labelMs,
      elapsedMs: performance.now() - startedAt,
    },
  };
};

self.onmessage = async ({ data: message }) => {
  const {
    requestId,
    type,
    ownershipOverrides = {},
    regionClaimants = {},
    regionsUrl = "",
    labelNames = {},
    affectedOwners = [],
    changedRegionIds = [],
    geometryEpoch = "",
    forceFullSnapshot = false,
  } = message ?? {};
  if (!requestId) return;

  try {
    let loadStats = null;
    if (type === "initialize") {
      cancelDisplayMeshBuild();
      if (message.regions?.features) {
        cachedRegions = message.regions;
        cachedRegionsUrl = "";
        cachedMetadata = buildMetadata(cachedRegions);
        resetDerivedCaches();
      } else if (regionsUrl) {
        if (regionsUrl !== cachedRegionsUrl || !cachedRegions?.features?.length) {
          loadStats = await loadRegionsFromUrl(regionsUrl);
        }
      } else {
        cachedRegions = EMPTY_FC;
        cachedRegionsUrl = "";
        cachedMetadata = buildMetadata(cachedRegions);
        resetDerivedCaches();
      }

      // Geometry/catalog readiness is intentionally independent of political
      // cartography. Exact region identity becomes available as soon as the
      // authored GeoJSON parses; topology/labels may continue for much longer.
      self.postMessage({
        messageType: "catalog-ready",
        requestId,
        geometryEpoch,
        metadata: cachedMetadata,
        stats: loadStats ?? {},
      });
    } else if (!["update-ownership", "update-claims", "update-labels"].includes(type)) {
      return;
    }

    currentLabelNames = { ...(labelNames ?? {}) };

    if (type === "update-claims") {
      currentOwnershipOverrides = ownershipOverrides;
      const startedAt = performance.now();
      const owners = [...new Set((affectedOwners ?? []).map(toCountryName).filter(Boolean))];
      let recoverySnapshot = null;
      let labels = null;
      if (forceFullSnapshot) {
        recoverySnapshot = fullSnapshotFromCurrentCaches({
          ownershipOverrides,
          regionClaimants,
          // The superseding claim request may also carry newer display names
          // than the discarded revision, so make the recovery snapshot fully
          // current rather than merely replaying worker-local label caches.
          rebuildLabels: true,
        });
      } else if (owners.length) {
        // Claims and display-name changes can be coalesced into one React
        // revision. Rebuild only the explicitly dirty labels and publish them
        // with the new dispute state so neither domain is lost.
        rebuildLabelsForOwners(owners);
        labels = combinedLabels();
      }
      self.postMessage({
        messageType: "cartography-result",
        requestId,
        geometryEpoch,
        ...(recoverySnapshot ?? {
          disputedData: deriveDisputedData(ownershipOverrides, regionClaimants),
          ...(labels ? { labels } : {}),
        }),
        stats: {
          claimsOnly: true,
          forceFullSnapshot,
          affectedOwnerCount: owners.length,
          elapsedMs: performance.now() - startedAt,
        },
      });
      return;
    }

    if (type === "update-labels") {
      currentOwnershipOverrides = ownershipOverrides;
      const startedAt = performance.now();
      const owners = [...new Set((affectedOwners ?? []).map(toCountryName).filter(Boolean))];
      const recoverySnapshot = forceFullSnapshot
        ? fullSnapshotFromCurrentCaches({ ownershipOverrides, regionClaimants, rebuildLabels: true })
        : null;
      if (!recoverySnapshot) rebuildLabelsForOwners(owners);
      self.postMessage({
        messageType: "cartography-result",
        requestId,
        geometryEpoch,
        ...(recoverySnapshot ?? { labels: combinedLabels() }),
        stats: {
          labelsOnly: true,
          forceFullSnapshot,
          affectedOwnerCount: owners.length,
          elapsedMs: performance.now() - startedAt,
        },
      });
      return;
    }

    const previousOwnershipOverrides = currentOwnershipOverrides;
    let derived = type === "initialize"
      ? initializePoliticalCartography({ ownershipOverrides, regionClaimants })
      : updateOwnershipCartography({
          previousOwnershipOverrides,
          ownershipOverrides,
          regionClaimants,
          affectedOwners,
          changedRegionIds,
          forceFullSnapshot,
        });
    currentOwnershipOverrides = ownershipOverrides;

    // A superseded initialize still primed worker caches. The first accepted
    // ownership revision can promote a complete CURRENT boundary/label snapshot
    // without rerunning unrelated polity work.
    if (forceFullSnapshot && type !== "initialize") {
      derived = {
        ...derived,
        boundaryPatch: {
          removeAll: true,
          upsert: politicalBoundaryStateCollection(boundaryState).features,
        },
        labels: combinedLabels(),
      };
    }

    self.postMessage({
      messageType: "cartography-result",
      requestId,
      geometryEpoch,
      ...derived,
      stats: { ...derived.stats, ...(loadStats ?? {}) },
    });

    if (REGION_DISPLAY_MESH_ENABLED && type === "initialize" && cachedRegions?.features?.length) {
      scheduleDisplayMeshBuild({
        requestId,
        geometryEpoch,
        regions: cachedRegions,
      });
    }
  } catch (error) {
    self.postMessage({
      messageType: "cartography-result",
      requestId,
      geometryEpoch,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
