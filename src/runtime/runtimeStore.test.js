// Ten HUD panels each polled the same few runtime documents every 5s, and each
// tick woke every consumer of the document it read. These pin the two properties
// that replaced that: a subscriber hears only its own slice, and a read that
// would move the clock backwards is refused.
//
// Every case primes the store before subscribing, so no test reaches the
// network: subscribing to an unloaded document asks the store to fetch it.

import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetRuntimeStoreForTests,
  isStaleGameRead,
  primeRuntimeValue,
  runtimeGameStamp,
  subscribeRuntime,
} from "./runtimeStore.js";

const GAME = { country: "France", gameDate: "1914-06-28", round: 3, difficulty: "normal" };

test("a selector subscriber only hears about its own slice", (t) => {
  t.after(__resetRuntimeStoreForTests);
  __resetRuntimeStoreForTests();
  primeRuntimeValue("game", GAME);

  const dates = [];
  const rounds = [];
  subscribeRuntime("game", (date) => dates.push(date), { select: (game) => game?.gameDate || "" });
  subscribeRuntime("game", (round) => rounds.push(round), { select: (game) => Number(game?.round) || 0 });
  assert.deepEqual(dates, ["1914-06-28"]);
  assert.deepEqual(rounds, [3]);

  // A field neither selector reads: nobody is woken.
  primeRuntimeValue("game", { ...GAME, difficulty: "hard" });
  assert.deepEqual(dates, ["1914-06-28"]);
  assert.deepEqual(rounds, [3]);

  // The date moves without the round: only the date subscriber hears it.
  primeRuntimeValue("game", { ...GAME, difficulty: "hard", gameDate: "1914-07-28" });
  assert.deepEqual(dates, ["1914-06-28", "1914-07-28"]);
  assert.deepEqual(rounds, [3]);
});

test("re-publishing an identical document notifies nobody", (t) => {
  t.after(__resetRuntimeStoreForTests);
  __resetRuntimeStoreForTests();
  primeRuntimeValue("game", GAME);

  let calls = 0;
  subscribeRuntime("game", () => { calls += 1; });
  assert.equal(calls, 1);

  // A fresh object graph with the same content: what every poll used to hand
  // React, and what re-rendered the whole HUD five times a minute.
  primeRuntimeValue("game", { ...GAME });
  assert.equal(calls, 1);

  primeRuntimeValue("game", { ...GAME, round: 4 });
  assert.equal(calls, 2);
});

test("unsubscribing stops delivery", (t) => {
  t.after(__resetRuntimeStoreForTests);
  __resetRuntimeStoreForTests();
  primeRuntimeValue("game", GAME);

  let calls = 0;
  const unsubscribe = subscribeRuntime("game", () => { calls += 1; });
  primeRuntimeValue("game", { ...GAME, round: 4 });
  assert.equal(calls, 2);

  unsubscribe();
  primeRuntimeValue("game", { ...GAME, round: 5 });
  assert.equal(calls, 2);
});

test("a read behind the published turn is refused, an equal or newer one is not", () => {
  const published = runtimeGameStamp({ round: 4, gameDate: "1914-08-01" });

  // A poll that fired mid-jump and came back on the previous round.
  assert.equal(isStaleGameRead({ round: 3, gameDate: "1914-07-01" }, published), true);
  // Same round, earlier date: a write still settling.
  assert.equal(isStaleGameRead({ round: 4, gameDate: "1914-07-15" }, published), true);
  // The turn already on screen.
  assert.equal(isStaleGameRead({ round: 4, gameDate: "1914-08-01" }, published), false);
  // The turn after it.
  assert.equal(isStaleGameRead({ round: 5, gameDate: "1914-09-01" }, published), false);
});
