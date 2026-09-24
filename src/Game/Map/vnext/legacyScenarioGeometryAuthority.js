/*! Open Historia — legacy scenario geometry-authority compatibility © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

const normalizeCountryCode = (value) => String(value ?? "").trim().toUpperCase();

/**
 * Return stock country codes whose scenario GeoJSON must be treated as the
 * authoritative geometry cohort at every zoom.
 *
 * Modern tier-2 scenario exports mark every reshaped stock feature with
 * `edited: true`. Some older scenarios predate that invariant: they can contain
 * a mixture where at least one reshaped feature retained `edited: true`, while
 * sibling scenario geometry from the same stock country did not. If the
 * renderer hands those unmarked siblings back to PMTiles at close zoom, the
 * underlying modern stock province can reappear as a differently shaped,
 * differently owned (or unclaimed) ghost.
 *
 * One explicit `edited: true` record is therefore a conservative compatibility
 * signal that this country's serialized scenario geometry, not the stock tile
 * partition, owns the visible/hit-test partition for that scenario. This is
 * deliberately country-code based rather than polity-name based, so historical,
 * alternate, fictional-name, and renamed-polity scenarios all behave the same.
 *
 * Author-drawn `reg_*` features alone do NOT trigger country-wide takeover.
 * Those already render authoritatively feature-by-feature and may coexist with
 * untouched PMTiles geometry.
 */
export const deriveLegacyAuthoritativeCountryCodes = (records = []) => {
  const result = new Set();
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.edited !== true) continue;
    const code = normalizeCountryCode(record?.gid0 ?? record?.countryCode);
    if (code) result.add(code);
  }
  return [...result].sort();
};
