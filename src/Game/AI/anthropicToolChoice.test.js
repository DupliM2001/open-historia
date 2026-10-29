/*! Open Historia — Anthropic tool choice tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/AI/anthropicToolChoice.test.js
//
// #901: Sonnet 5.5, Opus 5.5 and Fable 5.1 refuse forced tool use and
// budget_tokens thinking. main.jsx cannot load in node, so the helpers are read
// out of its source and run, and the three request paths are checked to use them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./main.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const helpers = source.slice(source.indexOf("const anthropicAutoToolModels"), source.indexOf("// Prompt-cache boundary"));
const load = () => new Function(`${helpers}
  return { anthropicAutoToolModels, anthropicAdaptiveThinkingModels, isForcedToolRefusal, isBudgetThinkingRefusal, anthropicThinking, anthropicToolChoice, withToolInstruction };`)();

test("the refusals are recognised from the API's own message", () => {
  const h = load();
  assert.ok(h.isForcedToolRefusal('tool_choice: type "tool" and "any" are not supported for this model.'));
  assert.ok(!h.isForcedToolRefusal("max_tokens: 70000 > 64000, which is the maximum"));
  assert.ok(h.isBudgetThinkingRefusal('thinking.type "enabled" is not supported for this model. Use "adaptive" instead.'));
});

test("a model that refused forcing is asked with auto, and told to call the function", () => {
  const h = load();
  assert.deepEqual(h.anthropicToolChoice("claude-haiku-4-5", "submit", false), { type: "tool", name: "submit" });
  assert.deepEqual(h.anthropicToolChoice("claude-haiku-4-5", "submit", true), { type: "any" });
  assert.equal(h.withToolInstruction("SYS", "claude-haiku-4-5", "submit", false), "SYS", "untouched until learned");

  h.anthropicAutoToolModels.add("claude-opus-5-5");
  assert.deepEqual(h.anthropicToolChoice("claude-opus-5-5", "submit", true), { type: "auto" });
  assert.match(h.withToolInstruction("SYS", "claude-opus-5-5", "submit", true), /^SYS\n\nAnswer by calling the submit function \(or a lookup function first\)/);
  assert.match(h.withToolInstruction("SYS", "claude-opus-5-5", "submit", false, true), /Your last reply did not call submit\./);
});

test("thinking turns adaptive once budget_tokens is refused", () => {
  const h = load();
  assert.deepEqual(h.anthropicThinking("claude-sonnet-5-5"), { type: "enabled", budget_tokens: 4096 });
  h.anthropicAdaptiveThinkingModels.add("claude-sonnet-5-5");
  assert.deepEqual(h.anthropicThinking("claude-sonnet-5-5"), { type: "adaptive" });
});

test("native, compatible and batch requests all go through the helpers", () => {
  assert.equal(/tool_choice: \{ type: "tool"|tool_choice: lookupDeclarations/.test(source), false, "no forced choice is hard-coded");
  assert.equal((source.match(/tool_choice: anthropicToolChoice\(/g) ?? []).length, 3);
  assert.equal((source.match(/thinking: anthropicThinking\(model\)/g) ?? []).length, 2);
  assert.equal((source.match(/isForcedToolRefusal\(message\)/g) ?? []).length, 2, "both live paths learn from the 400");
});
