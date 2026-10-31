/*! Open Historia — what the lobby screens say about network addresses is what the code does © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/multiplayer/ui/lobbyAddressNotes.test.js
//
// The two notes on the Lobbies tab used to say that the host sees a joiner's IP
// address and other players cannot. The second half was a promise the protocol
// does not keep: an offer carries its sender's connection details (the ICE
// candidates ride inside the SDP, transport/peer.js), and it is sealed with a
// key derived from the invite token and nothing else (invite.js). Anybody who
// was given the token can therefore read every other joiner's offer, with a
// game changed to show it. The first test here does exactly that, over
// in-memory relays, so the notes are checked against the wire and not against
// a reading of it; the rest pin the words and the other facts they state.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createHostSession } from "../session/host.js";
import { createClientSession } from "../session/client.js";
import { createIdentity } from "../identity.js";
import { createInvite, deriveRoomKeys, parseInvite } from "../invite.js";
import { createNostrChannel, DEFAULT_RELAYS } from "../signaling/nostr.js";
import { createFakeRelayNetwork, settle } from "../testing/fakeRelays.js";
import { createFakeRtcNetwork } from "../testing/fakeRtc.js";
import { createPeer, DEFAULT_ICE_SERVERS } from "../transport/peer.js";
import { randomBytes } from "../bytes.js";

const RELAYS = ["wss://one.test", "wss://two.test"];
const VERSION = "0.0.51-alpha";

const until = async (check, ms = 20_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return true;
    await settle(10);
  }
  return check();
};

test("somebody who only holds the invite code can read a joiner's offer and the host's answer", async () => {
  const relays = createFakeRelayNetwork();
  const rtc = createFakeRtcNetwork();
  const channelFactory = (options) => createNostrChannel({ ...options, relays: RELAYS, WebSocketImpl: relays.WebSocket });
  const peerFactory = (options) => createPeer({ ...options, RTCPeerConnectionImpl: rtc.RTCPeerConnection });
  const hostKey = createIdentity();
  const invite = createInvite(hostKey.publicKey);
  const host = createHostSession({
    invite: parseInvite(invite.token), host: hostKey, room: { name: "The Cold War", seats: 4, version: VERSION },
    channelFactory, peerFactory, limits: { beaconIntervalMs: 200, pingIntervalMs: 100_000 },
  });

  // The third party: the token as text, and nothing else. No device key, no
  // seat, no offer of its own, no connection to the host.
  const keys = deriveRoomKeys(parseInvite(invite.token));
  const overheard = [];
  const listener = createNostrChannel({
    topic: keys.topic, key: keys.signalKey, relays: RELAYS, WebSocketImpl: relays.WebSocket,
    onPayload: (payload) => overheard.push(payload),
  });
  // And somebody on the same relays without the token, for contrast.
  const outside = [];
  const stranger = createNostrChannel({
    topic: keys.topic, key: randomBytes(32), relays: RELAYS, WebSocketImpl: relays.WebSocket,
    onPayload: (payload) => outside.push(payload),
  });

  const ada = createClientSession({
    token: invite.token, device: createIdentity(), name: "Ada", version: VERSION,
    channelFactory, peerFactory, offerIntervalMs: 100, findTimeoutMs: 40_000, joinTimeoutMs: 20_000,
  });
  try {
    host.start();
    await settle();
    ada.connect();
    assert.ok(await until(() => ada.state === "connected"), "Ada joined");
    await settle();

    const offer = overheard.find((payload) => payload.t === "offer");
    assert.ok(offer, "the offer was read with the token alone");
    assert.equal(offer.name, "Ada");
    // The SDP is the part that names addresses in a real connection.
    assert.match(offer.sdp, /^v=0\r\n/);
    const answer = overheard.find((payload) => payload.t === "answer" && payload.session === offer.session);
    assert.ok(answer, "and so was the host's answer to it");
    assert.match(answer.sdp, /^v=0\r\n/);
    assert.notEqual(answer.sdp, offer.sdp, "each side's own connection details");

    assert.deepEqual(outside, [], "without the token nothing can be read");
  } finally {
    ada.leave();
    host.stop();
    listener.close();
    stranger.close();
  }
});

test("the stock game shows no player another's connection details", () => {
  // A joining page takes only what the host signed and what answers its own
  // offer; another joiner's offer is dropped unread.
  const client = fs.readFileSync(new URL("../session/client.js", import.meta.url), "utf8");
  assert.match(client, /if \(message\.t === "beacon"\) \{/);
  assert.match(client, /if \(!current \|\| message\.session !== current\.session\) return undefined;\s*if \(message\.t === "answer"\) \{/);
  assert.doesNotMatch(client, /message\.t === "offer"/, "a joiner never handles an offer");
});

test("the services that see a device's address are the ones the notes name", () => {
  // Public relay servers: every device opens a socket to each.
  assert.ok(DEFAULT_RELAYS.length > 0 && DEFAULT_RELAYS.every((url) => url.startsWith("wss://")));
  // Google's and Cloudflare's address-lookup (STUN) servers, and no relay
  // (TURN) server: the connection itself is direct.
  const urls = DEFAULT_ICE_SERVERS.flatMap((server) => server.urls);
  assert.deepEqual(urls, ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"]);
  const peer = fs.readFileSync(new URL("../transport/peer.js", import.meta.url), "utf8");
  assert.match(peer, /relayOnly = false,/, "direct unless a caller says otherwise");
  // And no caller does: nothing else in multiplayer names the relay-only switch.
  const root = new URL("../", import.meta.url);
  const naming = [];
  const walk = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const next = new URL(`${item.name}${item.isDirectory() ? "/" : ""}`, directory);
      if (item.isDirectory()) walk(next);
      else if (/\.jsx?$/.test(item.name) && !/\.test\.js$/.test(item.name) && fs.readFileSync(next, "utf8").includes("relayOnly")) {
        naming.push(next.href.slice(root.href.length));
      }
    }
  };
  walk(root);
  assert.deepEqual(naming, ["transport/peer.js"]);
});

test("the two notes say so, each as one whole sentence run", () => {
  const tab = fs.readFileSync(new URL("./LobbiesTab.jsx", import.meta.url), "utf8");
  const joiner = "The host and the services that connect you (public relay servers, and Google's and Cloudflare's address-lookup servers) see your network address. The game does not show it to other players, but anyone who has the invite code could find it out.";
  const host = "Players connect straight to your computer: you and each player see each other's network address, and so do the services that connect you (public relay servers, and Google's and Cloudflare's address-lookup servers). The game does not show a player's address to other players, but anyone you give the invite code to could find it out, so share the code only with people you trust. Some strict networks (many mobile carriers) cannot connect this way.";
  assert.ok(tab.includes(`<p style={note}>{${JSON.stringify(joiner)}}</p>`), "the joiner's note");
  assert.ok(tab.includes(`<p style={note}>{${JSON.stringify(host)}}</p>`), "the host's note");
  // What they replaced.
  for (const gone of ["Other players cannot.", "Players never see one another", "Until relays are available"]) {
    assert.equal(tab.includes(gone), false, gone);
  }
});
