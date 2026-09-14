/*! Open Historia — PTR-1 worker-data bridge © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

// PTR-1.7 is scenario-agnostic: every canonical polity record emitted by the
// cartography worker is eligible for the replacement renderer. Historical,
// alternate-history and fictional names are presentation data, never an
// allowlist or identity gate. An optional owners filter remains only for tests
// and targeted diagnostics.

const stableNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const validCoordinates = (coordinates) => (
  Array.isArray(coordinates)
    ? coordinates.filter((point) => (
      Array.isArray(point)
      && Number.isFinite(Number(point[0]))
      && Number.isFinite(Number(point[1]))
    )).map(([lng, lat]) => [Number(lng), Number(lat)])
    : []
);

const baselineOf = (feature) => {
  const canonical = validCoordinates(feature?.properties?.cartographicBaseline);
  if (canonical.length >= 2) return canonical;
  if (feature?.geometry?.type === "LineString") {
    return validCoordinates(feature.geometry.coordinates);
  }
  return [];
};

const sourceOwnerOf = (feature) => String(
  feature?.properties?.sourceOwner
    ?? feature?.properties?.owner
    ?? "",
).trim();


const SECONDARY_OPTIMIZED_MIN_PRIORITY_SCALE = 100000;

const placementModeForSite = ({ siteRole, priorityScale }) => (
  siteRole === "sovereign-primary"
  || (siteRole === "sovereign-secondary" && Number(priorityScale) >= SECONDARY_OPTIMIZED_MIN_PRIORITY_SCALE)
    ? "optimized"
    : "fast"
);

const coverageGridOf = (value) => {
  const resolution = Math.floor(Number(value?.resolution) || 0);
  const bounds = Array.isArray(value?.bounds)
    ? value.bounds.slice(0, 4).map(Number)
    : [];
  const rows = Array.isArray(value?.rows)
    ? value.rows.slice(0, resolution).map((row) => String(row ?? ""))
    : [];
  if (resolution < 8 || bounds.length !== 4 || !bounds.every(Number.isFinite)) return null;
  if (rows.length !== resolution || rows.some((row) => row.length < resolution)) return null;
  return { resolution, bounds, rows };
};

export const buildPolityTextPtr1Records = ({
  ptrLabelData,
  labelData,
  lineLabelData,
  owners = null,
} = {}) => {
  const ownerSet = owners == null
    ? null
    : owners instanceof Set
      ? owners
      : new Set(owners ?? []);
  // PTR-1.8 consumes explicit worker-owned sovereign label sites first. This
  // supports metropole + large overseas holdings without semantic/history
  // special cases. Older logical/line collections remain migration fallbacks.
  const ptrFeatures = Array.isArray(ptrLabelData?.features) ? ptrLabelData.features : [];
  const canonicalFeatures = Array.isArray(labelData?.features) ? labelData.features : [];
  const legacyFeatures = Array.isArray(lineLabelData?.features) ? lineLabelData.features : [];
  const features = ptrFeatures.length
    ? ptrFeatures
    : canonicalFeatures.length
      ? canonicalFeatures
      : legacyFeatures;
  const records = [];
  const seen = new Set();

  for (const feature of features) {
    const properties = feature?.properties ?? {};
    const sourceOwner = sourceOwnerOf(feature);
    if (!sourceOwner) continue;
    if (ownerSet && !ownerSet.has(sourceOwner)) continue;

    const siteRole = String(
      properties.labelSiteRole
        ?? (properties.labelKind === "polity" ? "sovereign-primary" : ""),
    ).trim();
    if (siteRole && !["sovereign-primary", "sovereign-secondary"].includes(siteRole)) continue;
    if (!siteRole && properties.labelKind && properties.labelKind !== "polity") continue;

    const siteId = String(feature?.id ?? `${sourceOwner}:${siteRole || "legacy"}`).trim();
    if (!siteId || seen.has(siteId)) continue;

    const baseline = baselineOf(feature);
    const anchor = validCoordinates([feature?.geometry?.coordinates])[0] ?? null;
    const ptrAxisSpanWorld = Math.max(0, stableNumber(properties.ptrAxisSpanWorld, 0));
    const ptrCrossSpanWorld = Math.max(0, stableNumber(properties.ptrCrossSpanWorld, 0));
    const hasTerritorialEnvelope = Boolean(anchor && ptrAxisSpanWorld > 0 && ptrCrossSpanWorld > 0);
    // The replacement renderer can synthesize its final single-arc support
    // directly from the territorial envelope. Keep the old baseline when it
    // exists because it carries useful bend-sign information, but do not drop
    // a valid polity merely because the legacy-safe corridor could not be built.
    if (baseline.length < 2 && !hasTerritorialEnvelope) continue;

    const text = String(properties.name ?? sourceOwner).trim();
    if (!text) continue;

    seen.add(siteId);
    records.push({
      id: siteId,
      siteId,
      siteRole: siteRole || "sovereign-primary",
      polityId: String(properties.polityId ?? feature?.id ?? sourceOwner),
      owner: sourceOwner,
      text,
      baseline,
      minZoom: Math.max(0, stableNumber(properties.minZoom, 0)),
      maxZoom: 7.1,
      fadeInZoomSpan: 0.18,
      fadeOutStartZoom: 6.35,
      forceOverlapZoom: Math.max(0, stableNumber(properties.forceOverlapZoom, 99)),
      priorityScale: Math.max(0, stableNumber(properties.priorityScale, properties.areaScale)),
      visibilityScale: Math.max(0, stableNumber(properties.visibilityScale, properties.priorityScale)),
      // The worker's value is retained only as the requested visual size at z4.
      // Width/support fitting below is done from the browser's real font metrics.
      fontPxAtZoom4: Math.max(6, stableNumber(properties.fontPxAtZoom4, 24)),
      letterSpacingEm: Math.max(0, stableNumber(properties.letterSpacing, 0.08)),
      baselineKind: String(properties.baselineKind ?? "unknown"),
      curveBand: String(properties.curveBand ?? "none"),
      anchor,
      ptrPreferredAngle: stableNumber(properties.ptrPreferredAngle, properties.rotation),
      ptrAxisSpanWorld,
      ptrCrossSpanWorld,
      ptrCoverageGrid: coverageGridOf(properties.ptrCoverageGrid),
      // Primary sites always receive the candidate optimizer. Large/prominent
      // secondary sovereign sites do too: these are the metropole / major
      // disconnected landmasses where a cheap envelope-only diagonal can span
      // water or sit across the wrong island. Small secondary sites stay on the
      // fast path so historical empires do not multiply cold-start cost.
      placementMode: placementModeForSite({
        siteRole: siteRole || "sovereign-primary",
        priorityScale: Math.max(0, stableNumber(properties.priorityScale, properties.areaScale)),
      }),
    });
  }

  return records.sort((left, right) => (
    right.priorityScale - left.priorityScale
    || left.owner.localeCompare(right.owner)
    || left.siteId.localeCompare(right.siteId)
  ));
};
