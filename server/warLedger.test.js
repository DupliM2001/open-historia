// Run: node --test server/warLedger.test.js
//
// The war ledger's binding of a record to the event that establishes it, and
// the last-attempt repair that keeps a finished segment when the model could
// not fix its records. A real fallback report started this: a "start" record
// whose event carried no warId was told, twice, to "reference the event number
// that establishes this transition" for a number it had already given, and a
// year of events fell to the canned fallback over it.

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeWorldWarEventLinks,
  repairWarLedgerPayload,
  validateWarLedgerPayload,
} from "../src/Game/AI/nativeWarLedger.js";

const event = (id, title, extra = {}) => ({
  id,
  date: "2016-03-01",
  title,
  description: "",
  kind: "military",
  ...extra,
});

// id~op~actorsCSV~opponentsCSV~eventNumbersCSV~note (event numbers are 1-based)
const record = (id, op, actors, opponents, eventNumbers, note = "") =>
  [id, op, actors, opponents, eventNumbers, note].join("~");

const world = {};

test("a supplied event number survives when no event carries the warId, so the validator names the real defect", () => {
  const candidate = {
    events: [event("e1", "Mexico declares war on the cartel state")],
    warUpdates: record("mexican-pacification-2016", "start", "Mexico", "Cartel State", "1"),
  };
  normalizeWorldWarEventLinks(candidate);
  assert.deepEqual(candidate.warUpdates[0].eventIndexes, [0], "the model's own number is kept, not blanked");

  const error = validateWarLedgerPayload(candidate, { world });
  assert.match(error, /missing event\.warId="mexican-pacification-2016"/, "the event, not the number, is what is missing");
  assert.doesNotMatch(error, /must reference the event number/);
});

test("the engine still rebinds a wrong number to the one event carrying the warId", () => {
  const candidate = {
    events: [
      event("e1", "Trade talks resume in Vienna", { kind: "economic" }),
      event("e2", "Ruritania declares war on Borduria", { warId: "rur-bor" }),
    ],
    warUpdates: record("rur-bor", "start", "Ruritania", "Borduria", "1"),
  };
  normalizeWorldWarEventLinks(candidate);
  assert.deepEqual(candidate.warUpdates[0].eventIndexes, [1]);
  assert.equal(validateWarLedgerPayload(candidate, { world }), "");
});

test("a record with no number and no event carrying its warId is still told to reference the event", () => {
  const candidate = {
    events: [event("e1", "Ruritania declares war on Borduria")],
    warUpdates: record("rur-bor", "start", "Ruritania", "Borduria", ""),
  };
  normalizeWorldWarEventLinks(candidate);
  assert.deepEqual(candidate.warUpdates[0].eventIndexes, []);
  assert.match(validateWarLedgerPayload(candidate, { world }), /must reference the event number/);
});

test("repair: the record's own number declares the link, so its event is stamped with the warId", () => {
  const candidate = {
    events: [event("e1", "Mexico declares war on the cartel state")],
    warUpdates: record("mexican-pacification-2016", "start", "Mexico", "Cartel State", "1", "pacification campaign"),
  };
  normalizeWorldWarEventLinks(candidate);
  assert.match(validateWarLedgerPayload(candidate, { world }), /missing event\.warId/);

  const repair = repairWarLedgerPayload(candidate, { world });
  assert.deepEqual(repair, { stamped: 1, droppedIds: [], strippedEvents: 0, residual: "" });
  assert.equal(candidate.events[0].warId, "mexican-pacification-2016");
  assert.equal(candidate.warUpdates.length, 1, "the war record is kept");
  assert.equal(validateWarLedgerPayload(candidate, { world }), "");
});

test("repair: a record that cannot bind is dropped with its event's war bindings while the good one is kept", () => {
  const candidate = {
    events: [
      event("e1", "Ruritania declares war on Borduria"),
      event("e2", "Ruritania and Syldavia sign a trade pact", { kind: "economic", combatants: ["Ruritania", "Syldavia"] }),
    ],
    warUpdates: [
      record("rur-bor", "start", "Ruritania", "Borduria", "1"),
      // A trade pact cannot start a canonical war, whatever the record says.
      record("rur-syl", "start", "Ruritania", "Syldavia", "2"),
    ].join("\n"),
  };
  normalizeWorldWarEventLinks(candidate);
  assert.notEqual(validateWarLedgerPayload(candidate, { world }), "");

  const repair = repairWarLedgerPayload(candidate, { world });
  assert.equal(repair.stamped, 2);
  assert.deepEqual(repair.droppedIds, ["rur-syl"]);
  assert.equal(repair.strippedEvents, 1);
  assert.equal(repair.residual, "");
  assert.deepEqual(candidate.warUpdates.map((update) => update.id), ["rur-bor"]);
  assert.equal(candidate.events[0].warId, "rur-bor");
  assert.equal(candidate.events[1].warId, "");
  assert.deepEqual(candidate.events[1].combatants, [], "the dropped war's combatants go with it");
  assert.equal(validateWarLedgerPayload(candidate, { world }), "");
});

test("repair: when nothing binds, the records go, the events stay as narrative, and what the ledger still says is reported", () => {
  const candidate = {
    events: [event("e1", "Ruritania declares war on Borduria")],
    // No opponents: a start the ledger can never apply, and the title reads
    // like a declaration whatever record is behind it.
    warUpdates: record("rur-bor", "start", "Ruritania", "", "1"),
  };
  const repair = repairWarLedgerPayload(candidate, { world });
  assert.equal(repair.stamped, 1);
  assert.deepEqual(repair.droppedIds, ["rur-bor"]);
  assert.equal(repair.strippedEvents, 1);
  assert.match(repair.residual, /no matching warUpdates record/);
  assert.deepEqual(candidate.warUpdates, []);
  assert.equal(candidate.events[0].warId, "");
  assert.equal(candidate.events[0].title, "Ruritania declares war on Borduria", "the event itself is untouched");
});

test("repair: an event of a war that already exists keeps its binding when another record is dropped", () => {
  const worldWithWar = {
    wars: [{ id: "old-war", status: "active", sideA: ["Ruritania"], sideB: ["Borduria"], startedDate: "2015-01-01" }],
  };
  const candidate = {
    events: [
      event("e1", "Ruritanian artillery bombardment of Bordurian lines", { warId: "old-war", combatants: ["Ruritania", "Borduria"] }),
      event("e2", "Syldavia opens a consulate", { kind: "diplomatic" }),
    ],
    warUpdates: record("syl-bor", "start", "Syldavia", "Borduria", "2"),
  };
  const repair = repairWarLedgerPayload(candidate, { world: worldWithWar });
  assert.deepEqual(repair.droppedIds, ["syl-bor"]);
  assert.equal(repair.residual, "");
  assert.equal(candidate.events[0].warId, "old-war", "the existing war's event keeps its warId");
  assert.deepEqual(candidate.events[0].combatants, ["Ruritania", "Borduria"]);
  assert.equal(candidate.events[1].warId, "");
});
