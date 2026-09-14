/*! Open Historia — stock/scenario region authority policy © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

/**
 * True only when every non-authored scenario region has an exact id in the
 * region PMTiles archive that would replace it at close zoom.
 *
 * Punctuation, numeric-vs-string shape, gid0 and polity names intentionally do
 * not count as identity evidence. If exact identity cannot be proved, canonical
 * scenario geometry remains responsible for rendering and hit-testing.
 */
export const hasExactRegionTileIdentity = (records = [], tileRegionIds = new Set()) => {
  let stockLikeCount = 0;
  for (const record of records ?? []) {
    if (!record || record.authored === true) continue;
    stockLikeCount += 1;
    const id = String(record.id ?? "");
    if (!id || !tileRegionIds?.has?.(id)) return false;
  }
  return stockLikeCount > 0;
};
