/*! Open Historia — a shared game's institutions, run by the host: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/multiplayer/host/institutions.test.js
//
// The host founding an institution in a shared game was refused ("409"): every
// screen of a shared game is a player's, and none writes the game. Now each
// asks the host, which runs the game's own institution functions for the
// asker's country. These hold the host to that: the country is the seat's
// whatever the request names, only what the screens send gets through, and a
// thread made for a guest is the guest's.

import test from "node:test";
import assert from "node:assert/strict";
import { createInstitutionDesk, governanceCommandFor, lifecycleCommandFor } from "./institutions.js";

const HOST = "Abkhazia";
const GUEST = "Russia";

test("a lifecycle command acts for the seat, with the player's authority, and carries only what the screens send", () => {
  const command = lifecycleCommandFor({
    type: "invite", institutionId: "baltic-pact", initiatedBy: "Latvia", polity: "Estonia",
    requestedStatus: "member", reason: "Neighbours", authority: "admin", sneaky: true,
  }, GUEST);
  assert.deepEqual(command, {
    type: "invite", authority: "player", institutionId: "baltic-pact", polity: "Estonia",
    requestedStatus: "member", reason: "Neighbours", initiatedBy: GUEST,
  });
  // Founding names its founder by the player alone: no founder field at all.
  const founding = lifecycleCommandFor({
    type: "found", name: "Baltic Pact", kind: "security_alliance", founder: "Latvia",
    invitees: ["Estonia", "Lithuania"], minimumFoundingMembers: "999", allowObserver: false,
  }, GUEST);
  assert.equal(founding.founder, undefined);
  assert.equal(founding.authority, "player");
  assert.deepEqual(founding.invitees, ["Estonia", "Lithuania"]);
  assert.equal(founding.minimumFoundingMembers, 64);
  assert.equal(founding.allowObserver, false);
  assert.equal(lifecycleCommandFor({ type: "Cancel Application", caseId: "c1" }, GUEST).polity, GUEST);
  assert.throws(() => lifecycleCommandFor({ type: "seize-treasury" }, GUEST), /not something a player can do/);
});

test("a governance command is only one the screens send, and it is the seat's", () => {
  assert.deepEqual(governanceCommandFor({ type: "vote", proposalId: "p1", choice: "yes", polity: "Latvia", authority: "npc" }, GUEST), {
    type: "vote", polity: GUEST, proposalId: "p1", choice: "yes", authority: "player", finalizeWhenComplete: true, implementWhenPassed: true,
  });
  assert.deepEqual(governanceCommandFor({ type: "amendment", proposalId: "p1", proposer: "Latvia", amendment: { text: "Add a clause" } }, GUEST), {
    type: "amendment", proposer: GUEST, proposalId: "p1", amendment: { text: "Add a clause" },
  });
  for (const type of ["status", "open-voting", "create", "call-vote"]) {
    assert.throws(() => governanceCommandFor({ type, proposalId: "p1" }, GUEST), /not something a player can do/, type);
  }
});

// The game's functions, recorded, over an in-memory list of threads.
const fakeGame = ({ chats = [], made = {} } = {}) => {
  const state = { chats: [...chats], calls: [] };
  const record = (name, result) => async (args) => {
    state.calls.push({ name, args });
    if (typeof result === "function") return result(args);
    return result;
  };
  state.game = {
    lifecycle: record("lifecycle", made.lifecycle ?? {}),
    negotiation: record("negotiation", made.negotiation ?? {}),
    channel: record("channel", made.channel ?? {}),
    proposal: record("proposal", made.proposal ?? {}),
    voteRequest: record("voteRequest", made.voteRequest ?? {}),
    governance: record("governance", made.governance ?? {}),
    message: record("message", made.message ?? {}),
    chatTurn: record("chatTurn", {}),
    readChats: async () => state.chats,
    updateChats: async (fn) => {
      const next = fn(state.chats);
      if (next) state.chats = next;
    },
  };
  return state;
};

test("a guest founds an institution: run for the guest, and the founding table made is the guest's", async () => {
  const state = fakeGame({ chats: [{ id: "thread-host", countries: ["Russia"] }] });
  state.game.lifecycle = async (args) => {
    state.calls.push({ name: "lifecycle", args });
    state.chats = [...state.chats, { id: "founding-1", countries: ["Estonia"] }];
    return { institution: { id: "baltic-pact" }, createdChat: { id: "founding-1" } };
  };
  const desk = createInstitutionDesk({ host: HOST, game: state.game });
  const made = await desk({ seat: GUEST, call: "lifecycle", args: { command: { type: "found", name: "Baltic Pact", invitees: ["Estonia"] } } });
  assert.deepEqual(made, { institutionId: "baltic-pact", proposalId: "", proposalStatus: "", chatId: "founding-1" });
  assert.equal(state.calls[0].args.playerCountry, GUEST);
  assert.equal(state.chats.find((chat) => chat.id === "founding-1").player, GUEST, "the founding table is the guest's");
  assert.equal(state.chats.find((chat) => chat.id === "thread-host").player, undefined, "the host's thread keeps its owner");
});

test("a thread that was there before keeps its owner, and the host's own make no owner", async () => {
  // The host's Council, which the guest now speaks in.
  const state = fakeGame({ chats: [{ id: "council-baltic", institutionId: "baltic-pact", countries: ["Russia"] }], made: { message: { channel: { id: "council-baltic" } } } });
  const desk = createInstitutionDesk({ host: HOST, game: state.game });
  await desk({ seat: GUEST, call: "message", args: { institutionId: "baltic-pact", text: "We object." } });
  assert.equal(state.chats[0].player, undefined);
  // The host founding: its table is its own, as every host thread is.
  state.game.lifecycle = async () => {
    state.chats = [...state.chats, { id: "founding-2", countries: ["Georgia"] }];
    return { institution: { id: "caucasus-forum" }, createdChat: { id: "founding-2" } };
  };
  await desk({ seat: HOST, call: "lifecycle", args: { command: { type: "found", name: "Caucasus Forum" } } });
  assert.equal(state.chats.find((chat) => chat.id === "founding-2").player, undefined);
});

test("the Council's turn says the comment first, then runs the turn the chat panel would, for the seat", async () => {
  const state = fakeGame({ made: { message: { channel: { id: "council-baltic" } }, channel: { channel: { id: "council-baltic" } } } });
  const desk = createInstitutionDesk({ host: HOST, game: state.game });
  const made = await desk({ seat: GUEST, call: "council", args: { institutionId: "baltic-pact", proposalId: "p1", kind: "vote", comment: "Vote now." } });
  assert.equal(made.chatId, "council-baltic");
  assert.deepEqual(state.calls.map((entry) => entry.name), ["message", "chatTurn"]);
  const turn = state.calls[1].args;
  assert.equal(turn.seat, GUEST);
  assert.equal(turn.formalBusinessRequested, true);
  assert.equal(turn.institutionProposalId, "p1");
  assert.equal(turn.playerMessage, "");
  await assert.rejects(desk({ seat: GUEST, call: "council", args: { institutionId: "baltic-pact" } }), /Which institution/);
});

test("a hearing is answered only for someone at it", async () => {
  const state = fakeGame({ chats: [
    { id: "hearing-1", player: GUEST, countries: ["Latvia"] },
    { id: "host-private", countries: ["Georgia"] },
  ] });
  const desk = createInstitutionDesk({ host: HOST, game: state.game });
  await desk({ seat: GUEST, call: "hearing", args: { thread: "hearing-1" } });
  assert.equal(state.calls.at(-1).args.lifecycleResponseRequested, true);
  await assert.rejects(desk({ seat: GUEST, call: "hearing", args: { thread: "host-private" } }), /not in that conversation/);
  await assert.rejects(desk({ seat: GUEST, call: "hearing", args: { thread: "nowhere" } }), /not there/);
  await assert.rejects(desk({ seat: GUEST, call: "summon-army", args: {} }), /not something a player can do/);
});
