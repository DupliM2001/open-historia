/*! Open Historia — chats an event opens tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/gameState.createdChats.test.js
//
// The invariant: a chat an event opens reaches the turn with its opener — who
// speaks first and what they say — so the turn can open the thread. The chat
// normalizer used to drop both, and no chat an event opened was ever opened.

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeEvents } from "./gameState.js";

const eventWith = (createdChats) => ({ id: "e1", date: "2014-05-01", title: "Moscow proposes talks", description: "A summit is proposed.", impacts: { createdChats } });

test("a chat an event opens keeps its opener through normalization, and again on every read", () => {
  const [event] = normalizeEvents([eventWith([{ countries: ["Russian Federation"], title: "Summit proposal", speaker: "Russian Federation", openingMessage: "We propose a summit in Minsk." }])]);
  const [chat] = event.impacts.createdChats;
  assert.equal(chat.openingMessage, "We propose a summit in Minsk.");
  assert.equal(chat.speaker, "Russian Federation");
  assert.equal(chat.title, "Summit proposal");
  assert.deepEqual(chat.countries.map((country) => country.name), ["Russian Federation"]);
  const [again] = normalizeEvents([event]);
  assert.deepEqual(again.impacts.createdChats, event.impacts.createdChats, "reading the stored event again changes nothing, its id included");
});

test("a chat with no one to open it to is still dropped, and one without an opener keeps what it had", () => {
  const [event] = normalizeEvents([eventWith([{ countries: [], title: "Nobody", openingMessage: "Hello?" }, { countries: ["France"], title: "Quiet" }])]);
  assert.equal(event.impacts.createdChats.length, 1);
  assert.equal(event.impacts.createdChats[0].title, "Quiet");
  assert.equal("openingMessage" in event.impacts.createdChats[0], false);
});
