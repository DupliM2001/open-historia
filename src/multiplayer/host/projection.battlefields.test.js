/*! Open Historia — what one player may see of a battlefield: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/multiplayer/host/projection.battlefields.test.js
//
// A battlefield is seen whole, as units are. What must not cross the network
// to the other side is what a government has told its own troops to do next
// and what it holds in reserve; and nobody but the host is sent the engine's
// own bookkeeping.

import test from "node:test";
import assert from "node:assert/strict";

import { encodeMask, encodeTracks, encodeTroops } from "../../runtime/fronts/codec.js";
import { createFrame } from "../../runtime/fronts/frame.js";
import { projectForViewer } from "./projection.js";

const LATVIA = "Republic of Latvia"; // the host's own seat, at war with nobody
const RUSSIA = "Russian Federation"; // a second person
const ESTONIA = "Republic of Estonia"; // a third

const frame = createFrame({ west: 24, south: 56, east: 30, north: 60 });
const state = () => ({
  game: { country: LATVIA, humanCountries: [LATVIA, RUSSIA, ESTONIA], gameDate: "2014-04-01", round: 4 },
  world: {
    wars: [{ id: "war-1", status: "active", sideA: [RUSSIA], sideB: [ESTONIA] }],
    battlefields: [{
      name: "Narva front",
      warId: "war-1",
      status: "active",
      sides: [[RUSSIA], [ESTONIA]],
      openedDate: "2014-03-01",
      asOf: "2014-04-01",
      frame,
      field: { mask: encodeMask(new Uint8Array(frame.cols * frame.rows)), band: "CANARYBAND", key: "k" },
      troops: [encodeTroops([{ x: 5, y: 5, strength: 90 }]), encodeTroops([{ x: 9, y: 5, strength: 70 }])],
      pool: [321, 123],
      orders: [
        { s: 0, sector: "north", order: "spearhead", objective: "city: CANARY-RU-OBJECTIVE", since: "2014-03-20" },
        { s: 1, sector: "all", order: "dig in", objective: "city: CANARY-EST-OBJECTIVE", since: "2014-03-21" },
      ],
      replay: { d: "2014-04-01", n: 0, s: 0, e: 0, t: [encodeTracks([[{ day: 0, x: 6, y: 3, strength: 80, state: 0 }]]), ""], names: ["Russia", "Ukraine"], m: "", p: "" },
      brief: { km: 210 },
      log: [{ d: "2014-03-25", k: "city", s: 0, at: "city: Narva" }],
    }],
  },
  events: [],
  chat: [],
  actions: [],
  intercepts: {},
  colors: {},
  flags: {},
});

const seen = (viewer) => projectForViewer(state(), viewer).world.battlefields[0];

test("everyone is sent the battlefield, its line, its troops and its log", () => {
  for (const viewer of [LATVIA, RUSSIA, ESTONIA]) {
    const battlefield = seen(viewer);
    assert.equal(battlefield.name, "Narva front");
    assert.deepEqual(battlefield.replay.names, ["Russia", "Ukraine"]);
    assert.notEqual(battlefield.troops[0], "");
    assert.notEqual(battlefield.troops[1], "");
    assert.deepEqual(battlefield.log, [{ d: "2014-03-25", k: "city", s: 0, at: "city: Narva" }]);
    assert.equal(battlefield.field, undefined, "the engine's bookkeeping stays with the host");
    assert.equal(JSON.stringify(battlefield).includes("CANARYBAND"), false);
  }
});

test("a side's standing orders and reserves reach that side and nobody else", () => {
  const russia = JSON.stringify(seen(RUSSIA));
  const estonia = JSON.stringify(seen(ESTONIA));
  const bystander = JSON.stringify(seen(LATVIA));
  assert.ok(russia.includes("CANARY-RU-OBJECTIVE") && !russia.includes("CANARY-EST-OBJECTIVE"));
  assert.ok(estonia.includes("CANARY-EST-OBJECTIVE") && !estonia.includes("CANARY-RU-OBJECTIVE"));
  assert.ok(!bystander.includes("CANARY-RU-OBJECTIVE") && !bystander.includes("CANARY-EST-OBJECTIVE"));
  assert.deepEqual(seen(RUSSIA).pool, [321, 0]);
  assert.deepEqual(seen(ESTONIA).pool, [0, 123]);
  assert.deepEqual(seen(LATVIA).pool, [0, 0]);
});
