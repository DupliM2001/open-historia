/*! Open Historia — a country's military power, as the player is shown it © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Wars and Fronts Pt.2. "All 4 of these backend stats (quality, technology,
// manpower share, weariness) should decide what the country's overall
// frontend military power is", and its land, sea and air capabilities are
// "ANOTHER set of stats that affect the overall front end military strength".
//
// A country's MILITARY POWER, the figure the Stats pane shows on its Military
// card and ranks countries by (Game/GameUI/countryRanking.js), is its weight in
// a land war (countryWeight.js: its people, and what its forces have to spend),
// taken through its own military figures (militaryStats.js; what each does in a
// war: fronts/military.js). Never the land it holds: "remove region count power
// entirely" (the owner, 2026-10-16). A country whose people nobody knows has no
// power yet: the AI rates its people and figures against every other country's
// when the game first needs them (Game/AI/militaryRating.js), if its scenario's
// designer did not.
//
//   manpower share  its people are counted at the share of them who can fight
//                   against the twelve in a hundred every country had, so a
//                   country of the usual share weighs what it always did.
//   spending        what its forces have to spend, against the others (50 the
//                   middle), where it was rated; else what its economy pays for
//                   (militaryFunding.js forcesFunding)
//   quality         0.5 to 1.5, and technology 0.7 to 1.3, as its troops fight
//                   (statFactor: 1 at 50)
//   weariness       nothing up to 50; past it, less and less, to 0.6 at 100: a
//                   weary country fights less willingly. The game's own figure
//                   for it (warWeariness.js), else the one its author gave it to
//                   begin with.
//   arms            its land, sea and air arms, each 0.5 to 1.5 (1 at 50; an
//                   arm at 0 counts nothing), weighed 0.6, 0.25 and 0.15
//
// At the figures every country has (50 each, a share of twelve, no weariness)
// it is the weight to the last digit, so a game whose scenario gives nobody any
// figures ranks its countries exactly as it did. A scenario that turns
// countries' figures off (warSettings.js mechanics.military) leaves every
// country at those, its own share of people aside, which the engine counts
// either way; one that leaves air out of its battles (mechanics.air) weighs
// the land and the sea alone.
//
// Pure, and loads in plain Node.

import { RESOURCES_FULL, RESOURCES_SHORTAGE_MOST, economyRate, refillAMonth, resourceShortage, resourcesOf } from "./warResources.js";
import { normalizeBlockades } from "./naval/blockade.js";
import { countryWeight, middleWeight } from "./countryWeight.js";
import { MANPOWER_SHARE } from "./fronts/constants.js";
import { ARM_FACTORS, QUALITY_FACTORS, TECHNOLOGY_FACTORS, readMilitary, statFactor } from "./fronts/military.js";
import { forcesFunding, middleFundingPerHead } from "./militaryFunding.js";
import { militaryLookup } from "./militaryStats.js";
import { populationFigureOf } from "./populationFigure.js";
import { warSettingsOf } from "./warSettings.js";

// The share of its people every country could put under arms before, in percent.
export const MANPOWER_PERCENT = Math.round(MANPOWER_SHARE * 1000) / 10;
export const ARM_WEIGHTS = Object.freeze({ land: 0.6, sea: 0.25, air: 0.15 });
// Weariness costs nothing up to WEARY_POWER_FROM, and WEARY_POWER_COST_MOST at 100.
export const WEARY_POWER_FROM = 50;
export const WEARY_POWER_COST_MOST = 0.4;
// What a country with no war resources left loses of its power (warResources.js): its armies short, its power less.
export const SPENT_POWER_COST_MOST = 0.3;

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const fold = (value) => clean(value).toLowerCase();
const within = (value, least, most) => Math.min(most, Math.max(least, value));

// A record of a keyed map, by its key, else by its key or its name in any case.
const recordIn = (map, name) => {
  if (!isRecord(map) || !clean(name)) return null;
  if (isRecord(map[clean(name)])) return map[clean(name)];
  const key = fold(name);
  for (const [other, record] of Object.entries(map)) {
    if (isRecord(record) && (fold(other) === key || fold(record.name) === key)) return record;
  }
  return null;
};

// A country's people as the game knows them: its sheet's, else what the
// scenario's author gave it (or the group of that name). 0 where nobody says.
export const peopleFor = (world, name) => {
  const total = Number(recordIn(world?.countryStats, name)?.population?.total);
  if (Number.isFinite(total) && total > 0) return total;
  return populationFigureOf(recordIn(world?.polityOverrides, name)) || populationFigureOf(recordIn(world?.groups, name));
};

// How weary of war a country is now, 0 to 100, and whose figure that is:
// "game" (world.warWeariness), "own" (what its author gave it to begin with),
// or "none".
const wearinessFor = (world, name, given) => {
  const key = fold(name);
  for (const entry of Array.isArray(world?.warWeariness) ? world.warWeariness : []) {
    const value = Number(entry?.value);
    if (key && fold(entry?.country) === key && Number.isFinite(value)) return { value: within(value, 0, 100), from: "game" };
  }
  const own = Number(given?.weariness);
  if (given?.weariness !== undefined && given?.weariness !== null && Number.isFinite(own)) return { value: within(own, 0, 100), from: "own" };
  return { value: 0, from: "none" };
};

// What an arm is worth to the power: nothing at 0.
const armFactor = (value) => (value <= 0 ? 0 : statFactor(value, ARM_FACTORS[0], ARM_FACTORS[1]));

// Everything a country's military power is read from, and the power.
//   middle    middleFundingPerHead of the world's sheets; worked out here when not given
//   lookup    militaryLookup(world), to read many countries of one world
// Returns {
//   power     the figure, or null where its people are not known
//   base      its weight at its share of people and its spending, before its figures
//   figures   { quality, technology, land, sea, air, spending, manpowerShare, weariness } as they count
//   own       for each figure, whether it is the country's own (its author's, its
//             sheet's, or for weariness the game's) rather than every country's
//   factors   { quality, technology, weariness, arms }
//   counted   whether the scenario counts countries' own figures at all
// }
export const militaryProfile = (world, name, { middle = null, lookup = null } = {}) => {
  const settings = warSettingsOf(world);
  const counted = settings.mechanics.military;
  const given = counted ? (typeof lookup === "function" ? lookup : militaryLookup(world))(name) : null;
  const read = readMilitary(given);
  const share = read.manpowerShare ?? settings.manpowerShare ?? MANPOWER_PERCENT;
  const weary = wearinessFor(world, name, given);
  const figures = {
    quality: read.quality,
    technology: read.technology,
    land: read.land,
    sea: read.sea,
    air: read.air,
    spending: Number.isFinite(Number(given?.spending)) && given?.spending !== null && given?.spending !== undefined ? Number(given.spending) : 50,
    manpowerShare: share,
    weariness: weary.value,
  };
  const has = (key) => given?.[key] !== undefined && given?.[key] !== null;
  const own = {
    quality: has("quality"),
    technology: has("technology"),
    land: has("land"),
    sea: has("sea"),
    air: has("air"),
    spending: has("spending"),
    manpowerShare: read.manpowerShare !== null,
    weariness: weary.from !== "none",
  };

  // (A ratio of exactly 1 at the usual share: the people are the people.)
  const ratio = share / MANPOWER_PERCENT;
  const people = peopleFor(world, name);
  const paid = forcesFunding({ sheet: recordIn(world?.countryStats, name), middle: middle ?? middleFundingPerHead(world?.countryStats), military: given });
  const base = people > 0 ? countryWeight({ population: people * ratio, funding: paid }) : null;

  const landArm = armFactor(figures.land);
  const seaArm = armFactor(figures.sea);
  const arms = settings.mechanics.air
    ? ARM_WEIGHTS.land * landArm + ARM_WEIGHTS.sea * seaArm + ARM_WEIGHTS.air * armFactor(figures.air)
    : (ARM_WEIGHTS.land * landArm + ARM_WEIGHTS.sea * seaArm) / (ARM_WEIGHTS.land + ARM_WEIGHTS.sea);
  const factors = {
    quality: statFactor(figures.quality, QUALITY_FACTORS[0], QUALITY_FACTORS[1]),
    technology: statFactor(figures.technology, TECHNOLOGY_FACTORS[0], TECHNOLOGY_FACTORS[1]),
    weariness: 1 - (WEARY_POWER_COST_MOST * Math.max(0, figures.weariness - WEARY_POWER_FROM)) / (100 - WEARY_POWER_FROM),
    arms,
  };
  // What it has left to fight with, where the scenario's wars use war resources (warResources.js).
  const supplied = settings.mechanics.supply === true;
  if (supplied) {
    figures.resources = resourcesOf(world?.warResources, name);
    own.resources = figures.resources < RESOURCES_FULL;
    factors.resources = 1 - (SPENT_POWER_COST_MOST * resourceShortage(figures.resources)) / RESOURCES_SHORTAGE_MOST;
  }
  // How fast its economy refills them, in points a month, under the blockade on it if any (warResources.js economyRate).
  const blockade = supplied ? normalizeBlockades(world?.blockades).find((entry) => String(entry.country).toLowerCase() === String(name ?? "").replace(/\s+/g, " ").trim().toLowerCase()) : null;
  const refill = supplied ? refillAMonth(economyRate({ sheet: recordIn(world?.countryStats, name), middle: middle ?? middleFundingPerHead(world?.countryStats), pressure: blockade?.pressure ?? 0 })) : null;
  const power = base === null ? null : base * factors.quality * factors.technology * factors.weariness * factors.arms * (supplied ? factors.resources : 1);
  return { power, base, figures, own, factors, counted, supplied, refill };
};

// A country's military power: null where its people are not known.
export const militaryPower = (world, name, options = {}) => militaryProfile(world, name, options).power;

// What each country of a world weighs in a land war, as the engine sizes its troops (countryWeight.js; the turn's
// own reader: Game/AI/frontTurn.js frontWorldReaders): its people and what its forces have to spend; one whose
// people nobody knows yet, the middle of those whose people are known. Never the land it holds: "remove region
// count power entirely" (the owner, 2026-10-16). (name) => weight.
export const landWeightsOf = (world) => {
  const counted = warSettingsOf(world).mechanics.military;
  const lookup = counted ? militaryLookup(world) : null;
  const middle = middleFundingPerHead(world?.countryStats);
  const weightOf = (name) => countryWeight({
    population: peopleFor(world, name),
    funding: forcesFunding({ sheet: recordIn(world?.countryStats, name), middle, military: lookup ? lookup(name) : null }),
  });
  let unknown = null;
  return (name) => {
    const weight = weightOf(name);
    if (weight !== null) return weight;
    if (unknown === null) {
      const names = new Set();
      for (const source of [world?.countryStats, world?.polityOverrides, world?.groups]) for (const key of Object.keys(isRecord(source) ? source : {})) names.add(key);
      unknown = middleWeight([...names].map(weightOf).filter((weight) => weight !== null));
    }
    return unknown;
  };
};
