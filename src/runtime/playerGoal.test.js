/*! Open Historia — the player's standing goal tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/playerGoal.test.js
//
// Runs without node_modules: playerGoal.js imports nothing.
//
// The invariant: a goal belongs to one polity, survives a save, is told to the
// advisor, the time skip and the suggestions in their own terms, and is gone
// when the player clears it.

import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAYER_GOAL_MAX_CHARS,
  describeGoalForAdvisor,
  describeGoalForSimulation,
  describeGoalForSuggestions,
  normalizePlayerGoals,
  playerGoalOf,
  withPlayerGoal,
} from "./playerGoal.js";

test("a goal is set for the player's polity, kept through a save, and cleared by an empty one", () => {
  let world = withPlayerGoal({}, "Kingdom of Sardinia", "  Unify   Italy by 1870 ", { round: 3, date: "1859-04-01" });
  assert.deepEqual(world.playerGoals, { "Kingdom of Sardinia": { text: "Unify Italy by 1870", round: 3, date: "1859-04-01" } });
  assert.equal(playerGoalOf(JSON.parse(JSON.stringify(world)), "kingdom of sardinia"), "Unify Italy by 1870", "names match however they are cased");
  assert.equal(playerGoalOf(world, "Austrian Empire"), "", "another polity's goal is not the player's");
  world = withPlayerGoal(world, "Kingdom of Sardinia", "Win Lombardy first");
  assert.equal(playerGoalOf(world, "Kingdom of Sardinia"), "Win Lombardy first");
  world = withPlayerGoal(world, "Kingdom of Sardinia", "   ");
  assert.deepEqual(world.playerGoals, {});
  assert.equal(withPlayerGoal({}, "", "anything").playerGoals, undefined, "no player, nothing set");
});

test("a malformed store reads as no goals, and an overlong goal is cut", () => {
  assert.deepEqual(normalizePlayerGoals(null), {});
  assert.deepEqual(normalizePlayerGoals([]), {});
  assert.deepEqual(normalizePlayerGoals({ "": { text: "x" }, France: { text: "" }, Spain: "Keep the peace" }), { Spain: { text: "Keep the peace" } });
  assert.equal(normalizePlayerGoals({ Spain: { text: "a".repeat(900) } }).Spain.text.length, PLAYER_GOAL_MAX_CHARS);
});

test("each reader is told the goal in its own terms, and nothing when there is none", () => {
  assert.match(describeGoalForAdvisor("Unify Italy"), /^\[Our Standing Goal\]\n.*"Unify Italy".*say plainly/s);
  const simulation = describeGoalForSimulation("Unify Italy", "Kingdom of Sardinia");
  assert.match(simulation, /^\[The Player's Standing Goal\]\nKingdom of Sardinia's government is steering toward: "Unify Italy"/);
  assert.match(simulation, /never creates an action the player did not order/);
  assert.match(simulation, /never makes success likelier/);
  assert.match(describeGoalForSuggestions("Unify Italy"), /serve it/);
  for (const describe of [describeGoalForAdvisor, describeGoalForSimulation, describeGoalForSuggestions]) assert.equal(describe(""), "");
});
