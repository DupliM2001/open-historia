/*! Open Historia — how far this computer's clock is from the relays': tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test server/clockOffset.test.js
//
// A player whose computer clock was an hour behind had every signaling message
// refused by the relays ("ephemeral event expired"). The relays' own servers
// say what time it is; these read it, against stand-ins for them.

import assert from "node:assert/strict";
import test from "node:test";
import { CLOCK_SOURCES, createClockOffsetCache, measureClockOffset } from "./clockOffset.js";
import { DEFAULT_RELAYS } from "../src/multiplayer/signaling/nostr.js";

// A stand-in fetch: each source answers with a Date header `ahead` ms from now.
const sourcesAhead = (aheadBySource) => async (url) => {
  const ahead = aheadBySource[url];
  if (ahead === undefined) throw new Error("unreachable");
  if (ahead === null) return { headers: { get: () => null } };
  return { headers: { get: (name) => (name === "date" ? new Date(Date.now() + ahead).toUTCString() : null) } };
};

test("the sources are the game's own relays, nothing else", () => {
  assert.deepEqual(CLOCK_SOURCES, DEFAULT_RELAYS.map((url) => url.replace(/^wss:/, "https:")));
});

test("an hour behind is read as an hour, from the middle of what the relays say", async () => {
  const hour = 3600_000;
  const [a, b, c] = CLOCK_SOURCES;
  const { offsetMs, sources } = await measureClockOffset({
    sources: [a, b, c],
    fetchImpl: sourcesAhead({ [a]: hour, [b]: hour + 1000, [c]: 5 * hour }),
  });
  assert.equal(sources, 3);
  // The Date header is to the second: within a couple of seconds.
  assert.ok(Math.abs(offsetMs - (hour + 1000)) < 2000, `offset ${offsetMs}`);
});

test("one answer is no answer, and a source that says nothing usable is passed over", async () => {
  const [a, b, c] = CLOCK_SOURCES;
  assert.deepEqual(await measureClockOffset({ sources: [a, b, c], fetchImpl: sourcesAhead({ [a]: 60_000, [b]: null }) }), { offsetMs: 0, sources: 1 });
  const two = await measureClockOffset({ sources: [a, b, c], fetchImpl: sourcesAhead({ [a]: -120_000, [b]: -120_000, [c]: null }) });
  assert.equal(two.sources, 2);
  assert.ok(Math.abs(two.offsetMs + 120_000) < 2000, `offset ${two.offsetMs}`);
});

test("a source that never answers is given up on", async () => {
  const [a, b] = CLOCK_SOURCES;
  const started = Date.now();
  const hanging = (url, { signal }) => new Promise((resolve, reject) => {
    if (url === a) return resolve({ headers: { get: () => new Date().toUTCString() } });
    signal.addEventListener("abort", () => reject(new Error("aborted")));
    return undefined;
  });
  const result = await measureClockOffset({ sources: [a, b], fetchImpl: hanging, timeoutMs: 100 });
  assert.equal(result.sources, 1);
  assert.ok(Date.now() - started < 2000);
});

test("the answer is kept for a while, and one asking at a time", async () => {
  let asked = 0;
  let clock = 1_000_000;
  const cache = createClockOffsetCache({
    measure: async () => {
      asked += 1;
      return { offsetMs: 42_000, sources: 3 };
    },
    now: () => clock,
  });
  const [first, second] = await Promise.all([cache(), cache()]);
  assert.deepEqual(first, { offsetMs: 42_000, sources: 3 });
  assert.deepEqual(second, first);
  assert.equal(asked, 1);
  clock += 5 * 60_000;
  await cache();
  assert.equal(asked, 1);
  clock += 6 * 60_000;
  await cache();
  assert.equal(asked, 2);
});

test("a failed reading is not kept: the next asks again", async () => {
  let asked = 0;
  const cache = createClockOffsetCache({ measure: async () => { asked += 1; return { offsetMs: 0, sources: 0 }; } });
  await cache();
  await cache();
  assert.equal(asked, 2);
});
