/*! Open Historia — what the jump is told about voice, orders and the world © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/AI/jumpPromptCraft.test.js
//
// Runs without node_modules.
//
// Four passages both jump templates carry. Three are guidance an author may
// rewrite — how an event is written, what an order can do, how the world answers —
// and one is not: the order of authority between the current map, the game's
// events and the world before round 1 is a rule the engine depends on, and a
// scenario that edited it away would go back to calling a polity an ally because
// it was one in 1914. These hold where each passage sits, which of them can be
// edited, and that none of them costs the prompt cache anything.

import test from "node:test";
import assert from "node:assert/strict";
import defaultPrompts from "./defaultPrompts.json" with { type: "json" };
import { PROMPT_GUIDANCE, locateSegment } from "./promptGuidance.js";
import { STATIC_PROMPT_KEYS } from "./promptLayout.js";

const JUMP_TASKS = ["jumpForward", "autoJumpForward"];
const EDITABLE = { orders: "[What an Order Can Do]", reactions: "[The World Answers Back]", voice: "[Event Voice]" };
const TECHNICAL = "[What Is True Now]";

const template = (task) => defaultPrompts.tasks[task];
const once = (text, needle) => text.split(needle).length - 1 === 1;

test("both jump templates carry all four passages, once each", () => {
  for (const task of JUMP_TASKS) {
    for (const header of [...Object.values(EDITABLE), TECHNICAL]) {
      assert.ok(once(template(task), header), `${task}: ${header}`);
    }
  }
});

test("each passage sits beside the section it extends", () => {
  for (const task of JUMP_TASKS) {
    const text = template(task);
    const at = (needle) => text.indexOf(needle);
    // Never acting for the player, then what the player's own orders can do.
    assert.ok(at("[Player Agency — critical]") < at(EDITABLE.orders), task);
    assert.ok(at(EDITABLE.orders) < at("[The World Before Round 1]"), task);
    // The lore, then how much it counts for.
    assert.ok(at("[The World Before Round 1]") < at(TECHNICAL), task);
    assert.ok(at(TECHNICAL) < at("[What to Simulate]"), task);
    // What to simulate, then who else is simulating.
    assert.ok(at("[What to Simulate]") < at(EDITABLE.reactions), task);
    // What an event contains, then how it is written.
    assert.ok(at("[Event Quality]") < at(EDITABLE.voice), task);
  }
});

test("the three guidance passages are editable, on both tasks, under the same ids", () => {
  for (const task of JUMP_TASKS) {
    const segments = PROMPT_GUIDANCE.tasks[task];
    for (const [id, header] of Object.entries(EDITABLE)) {
      const segment = segments.find((entry) => entry.id === id);
      assert.ok(segment, `${task} has no "${id}" segment`);
      assert.equal(segment.start, header);
      const located = locateSegment(template(task), segment);
      assert.ok(located && located.end > located.start, `${task}.${id} is not located`);
    }
  }
});

test("the order of authority is not something a scenario can edit away", () => {
  for (const task of JUMP_TASKS) {
    const text = template(task);
    const at = text.indexOf(TECHNICAL);
    for (const segment of PROMPT_GUIDANCE.tasks[task]) {
      const located = locateSegment(text, segment);
      assert.ok(located, `${task}.${segment.id}`);
      assert.ok(at < located.start || at >= located.end, `${task}.${segment.id} covers ${TECHNICAL}`);
    }
    // And it says the three things it exists to say.
    const end = text.indexOf("\n[", at + 1);
    const passage = text.slice(at, end);
    assert.match(passage, /current map/);
    assert.match(passage, /never evidence of who holds what today/);
    assert.match(passage, /because it was one when the game began/);
  }
});

test("none of the passages costs the prompt cache anything", () => {
  const placeholder = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  for (const task of JUMP_TASKS) {
    const text = template(task);
    let firstDynamic = text.length;
    for (const match of text.matchAll(placeholder)) {
      if (!STATIC_PROMPT_KEYS.has(match[1])) { firstDynamic = match.index; break; }
    }
    for (const header of [...Object.values(EDITABLE), TECHNICAL]) {
      const at = text.indexOf(header);
      const end = text.indexOf("\n[", at + 1);
      assert.ok(end < firstDynamic, `${task}: ${header} reaches past the cacheable prefix`);
      for (const match of text.slice(at, end).matchAll(placeholder)) {
        assert.ok(STATIC_PROMPT_KEYS.has(match[1]), `${task}: ${header} uses the per-turn variable \${${match[1]}}`);
      }
    }
  }
});

test("the voice passage states its five rules, and the orders passage its five", () => {
  for (const task of JUMP_TASKS) {
    const text = template(task);
    const section = (header) => { const at = text.indexOf(header); return text.slice(at, text.indexOf("\n[", at + 1)); };
    assert.equal((section(EDITABLE.voice).match(/^ {2}• /gm) ?? []).length, 5, `${task} voice`);
    assert.equal((section(EDITABLE.orders).match(/^ {2}• /gm) ?? []).length, 5, `${task} orders`);
    assert.equal((section(EDITABLE.reactions).match(/^ {2}• /gm) ?? []).length, 4, `${task} reactions`);
  }
});
