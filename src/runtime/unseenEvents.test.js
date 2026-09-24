/*! Open Historia — unseen events tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/unseenEvents.test.js
//
// Runs without node_modules: unseenEvents.js imports nothing.
//
// The invariant: until the reveal reaches an event, nothing the player is shown
// — and nothing the AI speaking to them is shown — contains it or anything it
// brought; and only the newest skip is ever unseen.

import test from "node:test";
import assert from "node:assert/strict";

import {
  UNSEEN_EVENTS_KEY,
  createMemoryStorage,
  createUnseenEvents,
  latestTurnEventIds,
  unseenIn,
  withSeenThrough,
  withTurnUnseen,
  withoutUnseenChats,
  withoutUnseenEvents,
  withoutUnseenIntercepts,
  withoutUnseenMessages,
  withoutUnseenReports,
} from "./unseenEvents.js";

const turn = ["e1", "e2", "e3", "e4"];
const worldWith = (eventIds) => ({ simulationHistory: [{ eventIds }, { eventIds: ["old-1"] }] });

test("a skip shows its first event; the reveal uncovers the rest in order", () => {
  let state = withTurnUnseen({ turns: [] }, turn);
  assert.deepEqual([...unseenIn(state, turn)], ["e2", "e3", "e4"]);
  state = withSeenThrough(state, turn, 2);
  assert.deepEqual([...unseenIn(state, turn)], ["e3", "e4"]);
  const same = withSeenThrough(state, turn, 2);
  assert.equal(same, state, "revealing what was already shown changes nothing");
  state = withSeenThrough(state, turn, 4);
  assert.equal(unseenIn(state, turn).size, 0);
});

test("only the turn a reveal belongs to is ever unseen", () => {
  const state = withTurnUnseen({ turns: [] }, turn);
  assert.equal(unseenIn(state, ["other-1", "other-2"]).size, 0, "a different turn has nothing unseen");
  assert.equal(unseenIn(state, []).size, 0);
  assert.deepEqual(latestTurnEventIds(worldWith(turn)), turn);
  assert.deepEqual(latestTurnEventIds({}), []);
  // A later skip starts its own reveal; the earlier one is kept for its save.
  const later = withTurnUnseen(state, ["n1", "n2"]);
  assert.deepEqual([...unseenIn(later, ["n1", "n2"])], ["n2"]);
  assert.deepEqual([...unseenIn(later, turn)], ["e2", "e3", "e4"]);
});

test("the store remembers the reveal across reads, and an undo ends it", () => {
  const storage = createMemoryStorage();
  let heard = 0;
  const store = createUnseenEvents({ storage, onChange: () => { heard += 1; } });
  store.markTurnUnseen(turn);
  assert.deepEqual([...store.unseenFor(worldWith(turn))], ["e2", "e3", "e4"]);
  store.markSeenThrough(turn, 3);
  assert.deepEqual([...createUnseenEvents({ storage }).unseenFor(worldWith(turn))], ["e4"], "a reload reads the same reveal");
  store.markSeenThrough(turn, 3);
  assert.equal(heard, 2, "a click that uncovers nothing new announces nothing");
  store.clear();
  assert.equal(store.unseenFor(worldWith(turn)).size, 0);
  assert.equal(heard, 3);
});

test("a damaged or refused store reads as nothing unseen, never a stuck reveal", () => {
  for (const stored of ["not json", "[]", "null", JSON.stringify({ turns: [{ unseen: ["e2"] }] })]) {
    const store = createUnseenEvents({ storage: createMemoryStorage({ [UNSEEN_EVENTS_KEY]: stored }), onChange: () => {} });
    assert.equal(store.unseenFor(worldWith(turn)).size, 0, stored);
  }
  const refusing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  const store = createUnseenEvents({ storage: refusing, onChange: () => {} });
  store.markTurnUnseen(turn);
  assert.equal(store.unseenFor(worldWith(turn)).size, 0);
});

test("what an unseen event brought is not shown: its thread, its message, its stolen copy, its paper", () => {
  const unseen = new Set(["e3"]);
  const events = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];
  assert.deepEqual(withoutUnseenEvents(events, unseen).map((event) => event.id), ["e1", "e2"]);
  assert.equal(withoutUnseenEvents(events, new Set()), events, "nothing unseen: the same list back");

  const opened = { id: "c-new", linkedEventId: "e3", countries: [{ name: "Russian Federation" }], messages: [{ text: "We propose talks.", eventId: "e3" }] };
  const outreach = { id: "c-outreach", linkedEventId: "", countries: [{ name: "France" }], messages: [{ text: "A feeler.", eventId: "e3" }] };
  const written = {
    id: "c-old", countries: [{ name: "Poland" }],
    messages: [{ text: "Earlier." }, { text: "📄 A letter.", eventId: "e3" }],
    events: [{ id: "m1", kind: "message", text: "Earlier." }, { id: "m2", kind: "message", text: "📄 A letter.", eventId: "e3" }, { id: "r1", kind: "reaction", target: "m2", emoji: "👍" }],
  };
  const untouched = { id: "c-quiet", countries: [{ name: "Spain" }], messages: [{ text: "Hello." }] };
  const shown = withoutUnseenChats([opened, outreach, written, untouched], unseen);
  assert.deepEqual(shown.map((chat) => chat.id), ["c-old", "c-quiet"], "the threads the unseen event opened are not there yet");
  assert.deepEqual(shown[0].messages.map((message) => message.text), ["Earlier."]);
  assert.deepEqual(shown[0].events.map((entry) => entry.id), ["m1", "r1"]);
  assert.equal(shown[1], untouched, "a thread the unseen event did not touch is the same object");
  assert.deepEqual(withoutUnseenMessages(written.messages, unseen).map((message) => message.text), ["Earlier."]);

  const intercepts = {
    "Russian Federation": { exchanges: [{ id: "doc-protocol", eventId: "e3" }, { id: "traffic-1" }] },
    Hungary: { exchanges: [{ id: "doc-lone", eventId: "e3" }] },
    Serbia: { exchanges: [{ id: "traffic-2" }] },
  };
  const file = withoutUnseenIntercepts(intercepts, unseen);
  assert.deepEqual(file["Russian Federation"].exchanges.map((exchange) => exchange.id), ["traffic-1"]);
  assert.equal(file.Hungary, undefined);
  assert.equal(file.Serbia, intercepts.Serbia);
  assert.equal(withoutUnseenIntercepts(intercepts, new Set(["e9"])), intercepts, "nothing to hide: the same object back");

  const reports = [{ id: "a", sourceEventId: "e1" }, { id: "b", sourceEventId: "e3" }];
  assert.deepEqual(withoutUnseenReports(reports, unseen).map((report) => report.id), ["a"]);
});
