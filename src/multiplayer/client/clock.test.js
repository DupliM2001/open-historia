/*! Open Historia — the clock a shared game's signaling is stamped by: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/multiplayer/client/clock.test.js
//
// Read from the desktop app's own server, which asks the relays; on the
// website, from the site's own answer; never from a computer's own clock, and
// not at all over relays of this device's own (a test, a developer).

import test from "node:test";
import assert from "node:assert/strict";
import { WORTH_CORRECTING_MS, describeClock, offsetClock, readSignalingClock } from "./clock.js";

const json = (body, ok = true) => ({ ok, json: async () => body });
const dated = (ahead) => ({ ok: true, headers: { get: (name) => (name === "date" ? new Date(Date.now() + ahead).toUTCString() : null) } });
const site = { hostname: "openhistoria.example", origin: "https://openhistoria.example" };
const desktop = { hostname: "localhost", origin: "http://localhost:3002" };

test("the desktop app's server says how far the relays' clock is", async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    return json({ offsetMs: 3_600_400, sources: 4 });
  };
  assert.deepEqual(await readSignalingClock({ fetchImpl, location: desktop }), { offsetMs: 3_600_400, source: "relays" });
  assert.deepEqual(asked, ["/api/multiplayer/clock"]);
});

test("a few seconds out is left alone", async () => {
  const fetchImpl = async () => json({ offsetMs: WORTH_CORRECTING_MS - 1, sources: 5 });
  assert.deepEqual(await readSignalingClock({ fetchImpl, location: desktop }), { offsetMs: 0, source: "relays" });
});

test("a server that could not ask two relays, or no server at all, on this computer: the clock as it is", async () => {
  assert.equal((await readSignalingClock({ fetchImpl: async () => json({ offsetMs: 999_999, sources: 1 }), location: desktop })).offsetMs, 0);
  assert.equal((await readSignalingClock({ fetchImpl: async () => { throw new Error("offline"); }, location: desktop })).offsetMs, 0);
});

test("on the website, the site's own answer says the time", async () => {
  const asked = [];
  const fetchImpl = async (url, options = {}) => {
    asked.push(`${options.method || "GET"} ${url}`);
    if (url === "/api/multiplayer/clock") return json(null, false);
    return dated(-7_200_000);
  };
  const { offsetMs, source } = await readSignalingClock({ fetchImpl, location: site });
  assert.equal(source, "site");
  assert.ok(Math.abs(offsetMs + 7_200_000) < 2000, `offset ${offsetMs}`);
  assert.deepEqual(asked, ["GET /api/multiplayer/clock", "HEAD https://openhistoria.example/"]);
});

test("over relays of this device's own, nothing is asked", async () => {
  let asked = 0;
  const result = await readSignalingClock({ fetchImpl: async () => { asked += 1; return json({ offsetMs: 9e6, sources: 5 }); }, customRelays: true, location: site });
  assert.deepEqual(result, { offsetMs: 0, source: "" });
  assert.equal(asked, 0);
});

test("the clock it makes, and what the log says of it", () => {
  const ahead = offsetClock(60_000)();
  assert.ok(Math.abs(ahead - (Date.now() + 60_000)) < 50);
  assert.ok(Math.abs(offsetClock(Number.NaN)() - Date.now()) < 50);
  assert.equal(describeClock({ offsetMs: 3_600_000, source: "relays" }), "this computer's clock is 1 h 0 min behind the relays'; the shared game's messages are stamped by theirs");
  assert.match(describeClock({ offsetMs: -90_000, source: "site" }), /2 min ahead of the website's/);
});
