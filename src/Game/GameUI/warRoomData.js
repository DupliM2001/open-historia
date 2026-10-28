/*! Open Historia — the war room: which battlefields are the player's, and the words for what is on them © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// What the war room's button and its panel both need to know, kept light: the
// button is on screen for the whole of a game and must not load the panel to
// find out whether there is a war.

import { battlefieldSideOf, isOpenBattlefield } from "../../runtime/fronts/record.js";

const NONE = Object.freeze([]);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// The battlefields the player's troops are on, in the world's own order:
// [{ name, side, status }]. A battlefield counts while a war is being fought
// on it or is frozen there by a ceasefire; a border that is only fortified is
// no conflict, and one that has closed is over.
export const playerFronts = (battlefields, player, wars = null) => {
  const name = clean(player);
  if (!name || !Array.isArray(battlefields)) return NONE;
  const ended = new Set((Array.isArray(wars) ? wars : []).filter((war) => clean(war?.status).toLowerCase() === "ended").map((war) => clean(war?.id)));
  const found = [];
  for (const row of battlefields) {
    if (!row || !isOpenBattlefield(row) || !Array.isArray(row.sides)) continue;
    if (clean(row.warId) && ended.has(clean(row.warId))) continue;
    const sides = row.sides.map((members) => (Array.isArray(members) ? members.map(clean) : []));
    const side = battlefieldSideOf({ sides }, name);
    if (side === 0 || side === 1) found.push({ name: clean(row.name), side, status: row.status });
  }
  return found.length > 0 ? found : NONE;
};

// The same as one line of text, for a selector that must hand back a value
// that is equal while nothing has changed.
export const playerFrontsKey = (battlefields, player, wars = null) => playerFronts(battlefields, player, wars).map((front) => `${front.side}:${front.name}`).join("\n");

// ---- words ---------------------------------------------------------------------------

// A place as a person reads it: "city: Kharkiv" is Kharkiv.
export const placeName = (value) => clean(value).replace(/^(city|region)\s*:\s*/i, "");

// (The labels and sentences themselves are in warRoom.jsx, as JSX, where the
// interface's translator finds them.)
export const ORDER_KEYS = Object.freeze(["advance", "blitz", "spearhead", "flank", "encircle", "hold", "dig in", "fall back", "withdraw"]);
