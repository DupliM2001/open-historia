/*! Open Historia — orders after a turn tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/actionSettlement.test.js

import assert from "node:assert/strict";
import test from "node:test";

import { MAX_MISSED_TURNS, normalizeActions, settleActionsAfterTurn } from "./gameState.js";
import { buildActionHistoryText } from "../Game/AI/promptContext.js";

const order = (id, title, extra = {}) => ({ id, title, text: title, status: "planned", ...extra });
const statusOf = (actions) => Object.fromEntries(actions.map((action) => [action.id, `${action.status}:${action.missedTurns ?? 0}`]));

test("only the orders an event cites are resolved; the rest wait, counted (#798)", () => {
  const actions = [
    order("action-1", "Annex Timor-Leste under the treaty"),
    order("action-2", "Fast-track the Leopard deal"),
    order("action-3", "Open talks with Australia", { kind: "chat" }),
    { ...order("action-4", "Old order"), status: "resolved" },
  ];
  const events = [{ impacts: { actionIds: ["ACTION-2"] } }, { impacts: { actionIds: [] } }];
  assert.deepEqual(statusOf(settleActionsAfterTurn(actions, events)), {
    "action-1": "planned:1",
    "action-2": "resolved:0",
    "action-3": "resolved:0",
    "action-4": "resolved:0",
  });
});

test("an order cited by its title counts, and one undone too long is let go", () => {
  const once = settleActionsAfterTurn([order("action-1", "Annex Timor-Leste")], [{ impacts: { actionIds: ["annex timor-leste"] } }]);
  assert.equal(once[0].status, "resolved");
  let actions = [order("action-1", "Annex Timor-Leste")];
  for (let turn = 1; turn <= MAX_MISSED_TURNS; turn += 1) actions = settleActionsAfterTurn(actions, []);
  assert.equal(actions[0].status, "resolved");
  assert.equal(normalizeActions(actions)[0].missedTurns, MAX_MISSED_TURNS, "the count survives a save");
});

test("the turn prompt shows each queued order's id, and flags one left undone", () => {
  const text = buildActionHistoryText([order("action-1", "Annex Timor-Leste", { missedTurns: 1 }), order("action-2", "Build roads")]);
  assert.match(text, /Annex Timor-Leste \[id action-1\] \[NOT YET CARRIED OUT: ordered 2 turns ago/);
  assert.match(text, /Build roads \[id action-2\]: /);
});
