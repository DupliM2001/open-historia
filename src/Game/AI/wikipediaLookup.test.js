/*! Open Historia — Wikipedia lookups tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/AI/wikipediaLookup.test.js

import assert from "node:assert/strict";
import test from "node:test";

import { WIKIPEDIA_TOOLS, executeWikipediaLookup } from "./wikipediaLookup.js";

const fake = (body, seen = []) => async (url) => {
  seen.push(url);
  return { ok: true, json: async () => body };
};

test("search returns titles with plain snippets, from the language asked", async () => {
  const seen = [];
  const answer = await executeWikipediaLookup("search_wikipedia", { query: "HDZ", language: "hr" }, {
    fetchImpl: fake({ query: { search: [{ title: "Hrvatska demokratska zajednica", snippet: "<span>stranka</span> &amp; više" }] } }, seen),
  });
  assert.deepEqual(answer, { language: "hr", results: [{ title: "Hrvatska demokratska zajednica", snippet: "stranka & više" }] });
  assert.match(seen[0], /^https:\/\/hr\.wikipedia\.org\/w\/api\.php\?/);
});

test("only a language code reaches the host name", async () => {
  const seen = [];
  await executeWikipediaLookup("search_wikipedia", { query: "x", language: "evil.com/" }, { fetchImpl: fake({}, seen) });
  assert.match(seen[0], /^https:\/\/en\.wikipedia\.org\//);
});

test("read cuts long articles, and failures come back as errors, not throws", async () => {
  const long = await executeWikipediaLookup("read_wikipedia", { title: "X" }, {
    fetchImpl: fake({ query: { pages: { 1: { title: "X", extract: "a".repeat(20000) } } } }),
  });
  assert.equal(long.text.length, 9000);
  assert.equal(long.truncated, true);
  const missing = await executeWikipediaLookup("read_wikipedia", { title: "Nope" }, { fetchImpl: fake({ query: { pages: { "-1": { missing: "" } } } }) });
  assert.match(missing.error, /No en Wikipedia article/);
  const down = await executeWikipediaLookup("search_wikipedia", { query: "x" }, { fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.match(down.error, /503/);
  assert.deepEqual(WIKIPEDIA_TOOLS.map((tool) => tool.name), ["search_wikipedia", "read_wikipedia"]);
});
