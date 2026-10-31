/*! Open Historia — battlefields and fronts: what one government may see of one © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// There is no fog of war here: a battlefield is seen whole, the line, both
// sides' troops, what has been taken and lost. What a government keeps to
// itself is what it has told its own side to do next, what it holds in
// reserve, and what goes on in its war room: its orders for troops picked out,
// its planned movements and diversions (plans.js), what its generals are
// called and what was said to them (command.js). In a shared game those are
// all that is held back from the other side (multiplayer/host/projection.js);
// the prompt's text for a battlefield leaves the same out for a leader on the
// other side (brief.js).
//
// What a side's AGENTS carry off of the other side's plans is another matter
// (plans.js knownPlans): it is worked out from the whole record, by whoever
// holds it.

import { battlefieldSideOf } from "./record.js";

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const pair = (value) => (Array.isArray(value) ? value : []);

// The engine's memory of a battlefield (brief.carry) as one side may have it.
// The orders a viewer is sent are his own alone, so what points into the list
// of orders is pointed into the list he gets.
const carryFor = (carry, orders, side) => {
  if (!isRecord(carry)) return carry;
  const kept = new Map();
  orders.forEach((order, index) => {
    if (order?.s === side) kept.set(index, kept.size);
  });
  const seen = { ...carry };
  if (Array.isArray(carry.under)) {
    seen.under = [0, 1].map((index) => pair(carry.under[index]).map((serves) => (index === side ? kept.get(serves) ?? -1 : -1)));
  }
  if (Array.isArray(carry.ages)) seen.ages = carry.ages.filter((_, index) => kept.has(index));
  // How far along a route drawn for it each troop has got says who is on one.
  if (Array.isArray(carry.next)) seen.next = [0, 1].map((index) => pair(carry.next[index]).map((point) => (index === side ? point : -1)));
  // Which general each troop is under is drawn for both sides, and says
  // nothing a map does not; who they are and what they were told is a side's own.
  // (And what its members are still owed of their levies, muster.js: a side's own, as its reserves are; and
  // where its new troops come in, deploy.js.)
  // (And what its own staff means to do, mind/planner.js: the other side's agents may find that out, not its map.)
  for (const key of ["generals", "talk", "plans", "levy", "deploy", "staff"]) {
    if (Array.isArray(carry[key])) seen[key] = [0, 1].map((index) => (index === side ? pair(carry[key][index]) : []));
  }
  // Where a side waits in a halt, and for how long, is its own too.
  if (Array.isArray(carry.halts)) seen.halts = carry.halts.filter((halt) => halt?.s === side);
  return seen;
};

// A battlefield as `viewer` (a country or a group) is sent it. `field` is the
// engine's own bookkeeping and stays with whoever runs the engine: a map that
// only draws reads the saved moments.
export const battlefieldForViewer = (battlefield, viewer) => {
  if (!battlefield || typeof battlefield !== "object") return battlefield;
  const side = battlefieldSideOf(battlefield, viewer);
  const { field: _field, ...seen } = battlefield;
  const orders = Array.isArray(battlefield.orders) ? battlefield.orders : [];
  const view = {
    ...seen,
    orders: orders.filter((order) => order?.s === side),
    pool: [0, 1].map((index) => (index === side ? Number(battlefield.pool?.[index]) || 0 : 0)),
  };
  if (isRecord(battlefield.brief)) {
    const brief = { ...battlefield.brief, carry: carryFor(battlefield.brief.carry, orders, side) };
    // What each body of troops is at is its general's to know.
    if (Array.isArray(brief.commands)) brief.commands = [0, 1].map((index) => (index === side ? pair(brief.commands[index]) : []));
    if (Array.isArray(brief.strength)) {
      brief.strength = brief.strength.map((entry, index) => (index === side || !isRecord(entry) ? entry : { ...entry, reserves: 0 }));
    }
    view.brief = brief;
  }
  return view;
};

export const battlefieldsForViewer = (battlefields, viewer) =>
  (Array.isArray(battlefields) ? battlefields : []).map((battlefield) => battlefieldForViewer(battlefield, viewer));
