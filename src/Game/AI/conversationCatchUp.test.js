/*! Open Historia — conversation catch-up tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/AI/conversationCatchUp.test.js
//
// Runs without node_modules: conversationCatchUp.js imports nothing.
//
// The invariant: a conversation is told what is new since it last spoke — the
// time, the newest events, the Game Master's changes — and nothing when nothing
// is, so a message in an unchanged world goes exactly as the player typed it.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CATCH_UP_EVENTS_NAMED,
  bordersMovedIn,
  buildCatchUpNote,
  buildThreadCatchUp,
  eventsBetween,
  politiesChangedIn,
  withCatchUp,
} from "./conversationCatchUp.js";

test("a leader is told what changed in public since the thread last spoke: events, borders, polities, votes", () => {
  const record = [
    { date: "2014-04-10", title: "Before the last message" },
    { date: "2014-04-20", title: "Donetsk declares independence", impacts: {
      regionTransfers: [{ regionId: "UKR.5_1", regionName: "Donetsk", fromCode: "Ukraine", toCode: "Donetsk People's Republic", basis: "independence" }],
      polityChanges: [{ code: "Donetsk People's Republic", name: "Donetsk People's Republic", operation: "create" }],
    } },
    { date: "2014-04-28", title: "Luhansk falls", impacts: {
      regionControlOps: [{ op: "control", regionId: "UKR.12_1", regionName: "Luhansk", fromCode: "Ukraine", toCode: "Russian Federation" }],
      polityChanges: [{ code: "Kingdom of Ruritania", name: "Ruritania", operation: "rename" }],
    } },
  ];
  assert.deepEqual(bordersMovedIn(record), [
    "Donetsk passed from Ukraine to Donetsk People's Republic",
    "Luhansk came under Russian Federation's control, taken from Ukraine",
  ]);
  assert.deepEqual(politiesChangedIn(record), ["Donetsk People's Republic came into being", "Kingdom of Ruritania is now called Ruritania"]);
  const note = buildThreadCatchUp({
    previousDate: "2014-04-15",
    currentDate: "2014-05-01",
    events: record,
    votesSince: ['United States of America voted "Accept" on "A ceasefire?"'],
  });
  assert.match(note.text, /^\[Since this conversation last spoke: 2014-04-15 → 2014-05-01\]/);
  assert.match(note.text, /2 events are on the public record/);
  assert.doesNotMatch(note.text, /Before the last message/);
  assert.match(note.text, /Borders moved: Donetsk passed from Ukraine/);
  assert.match(note.text, /Among the polities: .*is now called Ruritania/);
  assert.match(note.text, /Votes cast in this conversation since your last turn: United States of America voted "Accept"/);
  assert.equal(note.label, "Since 2014-04-15 · 2 events · 2 border changes · 1 vote");
  assert.deepEqual(buildThreadCatchUp({ previousDate: "2014-05-01", currentDate: "2014-05-01", events: record }), { text: "", label: "" },
    "nothing moved and nobody voted: the message goes as typed");
});

const events = [
  { date: "2014-04-10", title: "Before the last reply" },
  { date: "2014-04-25", title: "Sanctions list extended" },
  { date: "2014-05-02", title: "Clashes in Odesa" },
  { date: "2014-05-11", title: "Referendums in the east" },
  { date: "2014-06-01", title: "After today" },
  { date: "2014-05-12", title: "" },
];

test("nothing happened, nothing said: the message goes as typed", () => {
  const note = buildCatchUpNote({ previousDate: "2014-04-21", currentDate: "2014-04-21", events });
  assert.deepEqual(note, { text: "", label: "" });
  assert.equal(withCatchUp("Where do we stand?", note.text), "Where do we stand?");
});

test("time passed: the span, and the events since, oldest first, titles only", () => {
  const { text, label } = buildCatchUpNote({ previousDate: "2014-04-21", currentDate: "2014-05-21", events });
  assert.match(text, /^\[Since your last reply: 2014-04-21 → 2014-05-21\]/);
  assert.match(text, /3 events are on the record since then: "Sanctions list extended" \(2014-04-25\); "Clashes in Odesa" \(2014-05-02\); "Referendums in the east" \(2014-05-11\)\./);
  assert.doesNotMatch(text, /Before the last reply|After today/);
  assert.match(text, /said before them; the briefing is current/);
  assert.equal(label, "Since 2014-04-21 · 3 events");
});

test("a long gap names only the newest few and counts the rest", () => {
  const many = Array.from({ length: 12 }, (_unused, index) => ({ date: `2014-05-${String(index + 10).padStart(2, "0")}`, title: `Event ${index + 1}` }));
  const { text } = buildCatchUpNote({ previousDate: "2014-05-01", currentDate: "2014-06-01", events: many });
  assert.match(text, /12 events are on the record since then, the newest:/);
  assert.equal((text.match(/"Event \d+"/g) ?? []).length, CATCH_UP_EVENTS_NAMED);
  assert.match(text, /"Event 12"/);
  assert.doesNotMatch(text, /"Event 7"/);
});

test("the Game Master's changes are told, with or without time passing", () => {
  const changes = [{ summary: "Annexed the whole of Crimea into the Russian Federation by hand (2 regions)." }];
  const still = buildCatchUpNote({ previousDate: "2014-04-21", currentDate: "2014-04-21", gmChanges: changes });
  assert.match(still.text, /^\[Since your last reply\]\nThe Game Master also changed the world by hand/);
  assert.match(still.text, /Annexed the whole of Crimea/);
  assert.equal(still.label, "1 change by the Game Master");
  const later = buildCatchUpNote({ previousDate: "2014-04-21", currentDate: "2014-05-21", events: [], gmChanges: changes });
  assert.match(later.text, /nothing on the record happened in between/);
  assert.match(later.text, /Annexed the whole of Crimea/);
});

test("dates are ordered by the comparison handed in, so BC years work", () => {
  const bc = [{ date: "-0044-03-15", title: "The Ides of March" }, { date: "-0049-01-10", title: "The Rubicon" }];
  // A minimal stand-in for gameDates.js: a negative year orders by its value.
  const compareDates = (a, b) => {
    const key = (value) => {
      const [, sign, year, month, day] = /^(-?)(\d+)-(\d+)-(\d+)$/.exec(value);
      return (sign ? -1 : 1) * Number(year) * 10000 + Number(month) * 100 + Number(day);
    };
    return key(a) - key(b);
  };
  const between = eventsBetween(bc, "-0050-01-01", "-0044-12-31", { compareDates });
  assert.deepEqual(between.map((event) => event.title), ["The Rubicon", "The Ides of March"]);
  const { text } = buildCatchUpNote({ previousDate: "-0050-01-01", currentDate: "-0044-12-31", events: bc, compareDates });
  assert.match(text, /2 events are on the record since then: "The Rubicon" .*; "The Ides of March"/);
  assert.equal(buildCatchUpNote({ previousDate: "-0044-12-31", currentDate: "-0050-01-01", events: bc, compareDates }).text, "", "time does not run backwards");
});

test("what became of the last reply is told first, and never shown in the label", () => {
  const { text, label } = buildCatchUpNote({
    previousDate: "2014-04-21",
    currentDate: "2014-04-21",
    replyProblems: ["your chart was not drawn: the chart had no data.labels"],
  });
  assert.match(text, /^\[Since your last reply\]\nWhat became of your last reply: your chart was not drawn: the chart had no data\.labels\. Do not build on any of that/);
  assert.equal(label, "", "the panel already shows the player; the note is the advisor's receipt");
  const later = buildCatchUpNote({ previousDate: "2014-04-21", currentDate: "2014-05-21", events, replyProblems: ["x"] }).text.split("\n");
  assert.match(later[1], /^What became of your last reply/, "before the time that passed");
});

test("the note rides ahead of what the player typed", () => {
  assert.equal(withCatchUp("Where do we stand?", "[Since your last reply]\nX"), "[Since your last reply]\nX\n\nWhere do we stand?");
  assert.equal(withCatchUp("Hello", "   "), "Hello");
});
