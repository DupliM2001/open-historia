/*! Open Historia — incremental PTR continuity helpers © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

export const polityTextRecordKey = (record) => String(
  record?.id ?? record?.siteId ?? `${record?.owner ?? ""}:${record?.siteRole ?? ""}`,
);

export const polityTextRecordFingerprint = (record) => JSON.stringify({
  id: record?.id ?? "",
  siteId: record?.siteId ?? "",
  siteRole: record?.siteRole ?? "",
  owner: record?.owner ?? "",
  text: record?.text ?? "",
  baseline: record?.baseline ?? [],
  minZoom: record?.minZoom ?? 0,
  maxZoom: record?.maxZoom ?? 0,
  fadeInZoomSpan: record?.fadeInZoomSpan ?? 0,
  fadeOutStartZoom: record?.fadeOutStartZoom ?? 0,
  priorityScale: record?.priorityScale ?? 0,
  fontPxAtZoom4: record?.fontPxAtZoom4 ?? 0,
  letterSpacingEm: record?.letterSpacingEm ?? 0,
  anchor: record?.anchor ?? null,
  ptrPreferredAngle: record?.ptrPreferredAngle ?? 0,
  ptrAxisSpanWorld: record?.ptrAxisSpanWorld ?? 0,
  ptrCrossSpanWorld: record?.ptrCrossSpanWorld ?? 0,
  ptrCoverageGrid: record?.ptrCoverageGrid ?? null,
  placementMode: record?.placementMode ?? "",
});

export const diffPolityTextRecords = (records, previousFingerprints = new Map()) => {
  const nextFingerprints = new Map();
  const changedRecords = [];
  const nextKeys = new Set();
  for (const record of records ?? []) {
    const key = polityTextRecordKey(record);
    if (!key) continue;
    const fingerprint = polityTextRecordFingerprint(record);
    nextKeys.add(key);
    nextFingerprints.set(key, fingerprint);
    if (previousFingerprints.get(key) !== fingerprint) changedRecords.push(record);
  }
  const removedKeys = [...previousFingerprints.keys()].filter((key) => !nextKeys.has(key));
  return { nextFingerprints, changedRecords, removedKeys };
};
