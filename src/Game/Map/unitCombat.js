/*! Open Historia — unit reach and feasibility © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// How far a formation can be asked to go in one order. Units can't act across
// the planet at will: a movement order beyond an era- and type-appropriate
// leash is a multi-turn campaign the engine advances, never a teleport (the
// native unit director reads these when it grounds the model's unit ops).

const EARTH_RADIUS_KM = 6371;

export const distanceKm = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad((b.lat ?? 0) - (a.lat ?? 0));
  const dLng = toRad((b.lng ?? 0) - (a.lng ?? 0));
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat ?? 0)) * Math.cos(toRad(b.lat ?? 0)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
};

// One-order movement leash: how far a single move order may relocate a unit
// before it has to become a multi-turn campaign the engine advances realistically.
const MOVE_LEASH_KM = {
  garrison: 200,
  infantry: 800,
  artillery: 800,
  armor: 1000,
  naval: 4000,
  air: 3000,
};

// Logistics scale with the era: a 1200 BC army does not operate like 1944.
export const eraReachFactor = (gameDate) => {
  const match = /(-?\d{3,4})/.exec(String(gameDate ?? ""));
  const bce = /BC|BCE/i.test(String(gameDate ?? ""));
  const year = match ? Number(match[1]) * (bce ? -1 : 1) : 2000;
  if (year < 1500) return 0.5;
  if (year < 1850) return 0.7;
  if (year < 1945) return 1;
  return 1.15;
};

export const moveLeashKm = (type, gameDate) =>
  Math.round((MOVE_LEASH_KM[type] ?? 800) * eraReachFactor(gameDate));
