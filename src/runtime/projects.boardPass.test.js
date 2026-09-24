/*! Open Historia — does the Projects board need a pass this turn: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/projects.boardPass.test.js
//
// Runs in a bare checkout: projects.js is import-free on purpose.
//
// boardPassReasons decides whether a time skip pays a request for the board. Too
// eager and a player with one overdue programme pays double for every turn they
// ever play; too shy and the board stops opening entries and goes quiet, which
// is the failure the board exists to prevent. Both directions are pinned.

import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_PASS_QUIET_ROUNDS, STALE_ROUNDS, boardPassReasons, eventStartsLongEffort } from "./projects.js";

const entry = (overrides = {}) => ({
  id: "p1",
  name: "Project Leviathan",
  summary: "A deep-water dreadnought squadron built at the Kronstadt yards.",
  status: "active",
  progress: 40,
  ownerCode: "",
  priority: "normal",
  targetDate: "2016-01-01",
  milestones: [],
  updatedRound: 9,
  ...overrides,
});

const event = (title, description = "") => ({ title, description, date: "2014-03-10" });

const NOW = { gameDate: "2014-03-30", round: 10, playerCountry: "Russian Federation" };

test("a quiet turn on a healthy board asks for nothing", () => {
  const reasons = boardPassReasons({
    ...NOW,
    board: [entry()],
    events: [event("Grain prices ease in Odessa", "A good harvest brings bread prices down across the south.")],
  });
  assert.deepEqual(reasons, []);
  assert.deepEqual(boardPassReasons(), []);
  assert.deepEqual(boardPassReasons({ ...NOW, board: [], events: [] }), []);
});

test("an event that names an open entry asks for a pass", () => {
  const reasons = boardPassReasons({
    ...NOW,
    board: [entry()],
    events: [event("Project Leviathan slips", "Steel shortages delay Project Leviathan by a season.")],
  });
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /concerns "Project Leviathan"/);
});

test("an event about a closed entry does not", () => {
  const reasons = boardPassReasons({
    ...NOW,
    board: [entry({ status: "complete" })],
    events: [event("Project Leviathan remembered", "Veterans of Project Leviathan gather for an anniversary.")],
  });
  assert.deepEqual(reasons, []);
});

test("an event that reads like the start of a long effort asks for a pass, even on an empty board", () => {
  const starts = [
    event("Moscow launches a rearmament programme", "The cabinet approves ten years of naval spending."),
    event("Ground broken on the Volga canal", "Engineers break ground on a canal linking the Volga to the Don."),
    event("Parliament authorises the modernization of the Black Sea Fleet"),
  ];
  for (const candidate of starts) {
    assert.equal(eventStartsLongEffort(candidate), true, candidate.title);
    assert.match(boardPassReasons({ ...NOW, board: [], events: [candidate] })[0], /may start a new entry/);
  }
  const ordinary = [
    event("Border guards exchange fire near Luhansk", "Two soldiers are wounded in a brief clash."),
    event("The president addresses the nation", "A televised speech calls for calm."),
    event("Grain prices ease in Odessa", "A good harvest brings bread prices down across the south."),
  ];
  for (const candidate of ordinary) assert.equal(eventStartsLongEffort(candidate), false, candidate.title);
});

test("the calendar asks: an overdue entry, a slipped milestone, a long silence", () => {
  const overdue = boardPassReasons({ ...NOW, board: [entry({ targetDate: "2014-01-01", updatedRound: 8 })] });
  assert.match(overdue[0], /past its target date/);

  const slipped = boardPassReasons({
    ...NOW,
    board: [entry({ updatedRound: 8, milestones: [{ id: "m1", title: "Keel laid", date: "2014-02-01", status: "pending" }] })],
  });
  assert.match(slipped[0], /missed a milestone/);

  const silent = boardPassReasons({ ...NOW, board: [entry({ updatedRound: NOW.round - STALE_ROUNDS })] });
  assert.match(silent[0], /no report for 3 rounds/);
});

test("an entry looked at last round is left alone this round, however overdue it is", () => {
  const board = [entry({ targetDate: "2014-01-01", updatedRound: NOW.round - 1 })];
  assert.deepEqual(boardPassReasons({ ...NOW, board }), []);
  assert.equal(boardPassReasons({ ...NOW, board: [entry({ targetDate: "2014-01-01", updatedRound: NOW.round - BOARD_PASS_QUIET_ROUNDS })] }).length, 1);
});

test("a pass that ran last round and rightly touched nothing still buys the board a round of quiet", () => {
  const board = [entry({ targetDate: "2014-01-01", updatedRound: 3 })];
  assert.equal(boardPassReasons({ ...NOW, board, reviewedRound: 0 }).length, 1, "never reviewed");
  assert.deepEqual(boardPassReasons({ ...NOW, board, reviewedRound: NOW.round - 1 }), []);
  assert.equal(boardPassReasons({ ...NOW, board, reviewedRound: NOW.round - BOARD_PASS_QUIET_ROUNDS }).length, 1);
  // But never from an event: that is news, not the calendar.
  const withNews = boardPassReasons({
    ...NOW, board, reviewedRound: NOW.round - 1,
    events: [event("Project Leviathan slips", "Steel shortages delay Project Leviathan.")],
  });
  assert.equal(withNews.length, 1);
});

test("a reviewed round from another campaign's future counts as never", () => {
  const board = [entry({ targetDate: "2014-01-01", updatedRound: 0 })];
  assert.equal(boardPassReasons({ ...NOW, round: 2, board, reviewedRound: 41 }).length, 1);
});

test("the player's own HIGH PRIORITY entry is assessed at least every second skip", () => {
  const mine = entry({ priority: "high", updatedRound: NOW.round - BOARD_PASS_QUIET_ROUNDS });
  assert.match(boardPassReasons({ ...NOW, board: [mine] })[0], /HIGH PRIORITY/);
  assert.deepEqual(boardPassReasons({ ...NOW, board: [entry({ priority: "high", updatedRound: NOW.round - 1 })] }), []);
  // A rival's programme is not the player's to prioritise, and buys nothing.
  const theirs = entry({ priority: "high", ownerCode: "Ukraine", updatedRound: NOW.round - BOARD_PASS_QUIET_ROUNDS });
  assert.deepEqual(boardPassReasons({ ...NOW, board: [theirs] }), []);
});

test("an entry that has never carried a round is looked at once", () => {
  assert.match(boardPassReasons({ ...NOW, board: [entry({ targetDate: "2014-01-01", updatedRound: 0 })] })[0], /past its target date/);
});

// The false positive a live run turned up (2026-09-17): the engine's own covert
// entry is called "Agent in <country>", so in a campaign fought over that
// country every event naming it matched, and the board job bought a request a
// skip. The engine syncs those entries itself, before the board pass runs.
test("the engine's own covert entries never buy the board a request", () => {
  const covertEntry = {
    id: "proj-spy-1",
    name: "Agent in Ukraine",
    kind: "operation",
    secrecy: "covert",
    status: "active",
    ongoing: true,
    summary: "An agent of ours is in place inside Ukraine, reading its private diplomacy.",
    linkedSpyIds: ["spy-1"],
    updatedRound: 1,
  };
  const event = {
    title: "Fighting spreads in eastern Ukraine",
    description: "Separatist columns push west of Donetsk; Ukraine mobilises two more brigades.",
  };

  assert.deepEqual(
    boardPassReasons({ board: [covertEntry], events: [event], round: 9, reviewedRound: 0, playerCountry: "Poland" }),
    [],
    "an ordinary war event must not wake the board just because the agent's entry names the country",
  );
  // ...and the calendar does not wake it for one either: it is never overdue,
  // never stale in a way the model could fix, and the engine closes it itself.
  assert.deepEqual(
    boardPassReasons({ board: [{ ...covertEntry, updatedRound: 1 }], events: [], round: 30, reviewedRound: 0, playerCountry: "Poland" }),
    [],
  );

  // A real entry of the player's own, with the same words, still does.
  const realEntry = { ...covertEntry, id: "proj-2", name: "Ukraine Support Programme", linkedSpyIds: [], summary: "Arms and training for Ukraine's brigades." };
  assert.ok(
    boardPassReasons({ board: [realEntry], events: [event], round: 9, reviewedRound: 0, playerCountry: "Poland" }).length > 0,
    "a genuine entry the model owns is still a reason",
  );
});
