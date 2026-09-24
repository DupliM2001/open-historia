/*! Open Historia — polities founded by receiving territory © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// A polity comes into being the moment the world gives it land. A transfer,
// a capture, a contest or a claim that names a polity the map does not know
// founds it under exactly that name: the model does not have to remember a
// separate create entry first, and a breakaway, a successor state or a new
// republic can appear in the same event that hands it its first region.
//
// Two things stay strict. Names are exact — "Belgium" beside a map that says
// "Kingdom of Belgium" founds a second country, never joins the first
// (feedback: polity names are standardised, nothing is folded) — so the
// prompts tell the model to spell a new polity as it should appear and an
// existing one as the map does. And only RECEIVERS found: the loser of a
// transfer must already hold the land, a clear-contest claimant must already
// be on the region, and a dropped claim founds nobody.
//
// Two layers use this. The AI resolver (gameplay.js resolveRegionTransfers)
// founds at validation time and adds the create to the event's polityChanges,
// so the lifecycle runs first when the impacts apply and a GM preview lists the
// new polity like any other creation. The world state (gameState.js
// applyPolityAndTerritoryImpacts) founds again as a safety net for impacts
// that never met the resolver — a project's stored completion effects, the
// event editor, an older save replayed — but only for a name that is unknown
// to the world in every way.

import { isRealCountryName } from "./ownerNames.js";

const normalize = (value) => String(value ?? "").trim();
const fold = (value) => normalize(value).toLowerCase();

export const FOUNDING_NOTE = "Founded when it first received territory.";

// Receivers found a polity; nobody else does.
export const FOUNDING_ROLES = Object.freeze(new Set(["transfer", "control", "contest", "claim"]));

const hslToHex = (hue, saturation, lightness) => {
  const k = (n) => (n + hue / 30) % 12;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n) => lightness - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (value) => Math.round(value * 255).toString(16).padStart(2, "0");
  return `#${hex(channel(0))}${hex(channel(8))}${hex(channel(4))}`;
};

export const hexToRgb = (value) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(normalize(value));
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// A deterministic, reasonably vivid colour for a polity nobody has coloured:
// the same name always gets the same colour, on every machine, and two names
// rarely share a hue. The model (or the author) can still recolour it.
export const foundingColor = (name) => {
  const text = fold(name);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const hue = hash % 360;
  const saturation = 0.55 + ((hash >>> 9) % 20) / 100;
  const lightness = 0.42 + ((hash >>> 14) % 16) / 100;
  return hslToHex(hue, saturation, lightness);
};

// The lifecycle entry the resolver synthesises for a name it founds: the same
// shape as a model's own polityChanges create, so everything downstream (the
// preview, the map-changes list, the apply step) treats it as one.
export const foundingPolityChange = (name, { note = FOUNDING_NOTE } = {}) => {
  const code = normalize(name);
  return { operation: "create", code, name: code, color: foundingColor(code), aliases: [], note };
};

// Which names in a payload found a polity. `entries` are { token, role, path }
// rows — a transfer's toCode ("transfer"), a capture's toCode ("control"), a
// contest's actor ("contest"), a live claim's claimant ("claim"); any other
// role never founds. `ownerIsKnown` is the resolver's exact-name index, and
// `fold` its name key, so one name written twice founds one polity. Returns
// Map<folded key, { name, path }> in first-seen order.
export const collectFoundedPolities = (entries, { ownerIsKnown = () => false, sentinel = "", fold: foldKey = fold } = {}) => {
  const founded = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const name = normalize(entry?.token);
    if (!name || (sentinel && name === sentinel)) continue;
    if (!FOUNDING_ROLES.has(entry?.role)) continue;
    if (ownerIsKnown(name)) continue;
    const key = foldKey(name) || fold(name);
    if (!founded.has(key)) founded.set(key, { name, path: normalize(entry?.path) });
  }
  return founded;
};

// Unknown to the world in every way: no record, not a stock country the tiles
// may own through (a tier-1 map has no override for such a country, and a
// record would make it read as landless), and not already an owner, sovereign
// or claimant anywhere on the map.
export const isUnknownPolity = (world, name) => {
  const code = normalize(name);
  if (!code) return false;
  const overrides = world?.polityOverrides;
  if (overrides && typeof overrides === "object" && overrides[code]) return false;
  if (isRealCountryName(code)) return false;
  const key = fold(code);
  const same = (value) => fold(value) === key;
  const values = (record) => (record && typeof record === "object" ? Object.values(record) : []);
  if (values(world?.regionOwnershipOverrides).some(same)) return false;
  if (values(world?.regionSovereigntyOverrides).some(same)) return false;
  if (values(world?.regionClaimants).some((list) => Array.isArray(list) && list.some(same))) return false;
  return true;
};

// Register a polity the impacts name but the world does not know, with a
// colour of its own. Returns the new record, or null when nothing was founded.
export const foundPolityIfUnknown = (world, colors, name, { note = FOUNDING_NOTE } = {}) => {
  const code = normalize(name);
  if (!code || !world || typeof world !== "object" || !isUnknownPolity(world, code)) return null;
  if (!world.polityOverrides || typeof world.polityOverrides !== "object") world.polityOverrides = {};
  const color = foundingColor(code);
  world.polityOverrides[code] = { aliases: [], code, color, name: code, note, status: "active" };
  if (colors && typeof colors === "object" && !Array.isArray(colors[code])) colors[code] = hexToRgb(color);
  return world.polityOverrides[code];
};
