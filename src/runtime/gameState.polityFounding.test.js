/*! Open Historia — territory given to a polity that does not exist founds it © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/gameState.polityFounding.test.js
//
// The safety net in applyPolityAndTerritoryImpacts: impacts that never met the
// AI resolver (a project's stored completion effects, the event editor, an old
// save) still leave the world consistent — a name that receives land, takes it,
// contests it or claims it exists afterwards, with a record and a colour.

import test from "node:test";
import assert from "node:assert/strict";
import { applyEventImpactsToWorld } from "./gameState.js";
import { FOUNDING_NOTE, foundingColor, hexToRgb } from "./polityFounding.js";

const event = (impacts) => ({ date: "2014-04-07", title: "Test", description: "test", impacts });

test("a transfer to a polity that does not exist founds it", () => {
  const { world, colors } = applyEventImpactsToWorld({
    colors: {},
    world: { polityOverrides: {}, regionOwnershipOverrides: { "UKR.7_1": "Ukraine" } },
    events: [event({ regionTransfers: [{ regionId: "UKR.7_1", fromCode: "Ukraine", toCode: "Free State of Kharkiv" }] })],
  });
  assert.equal(world.regionOwnershipOverrides["UKR.7_1"], "Free State of Kharkiv");
  const record = world.polityOverrides["Free State of Kharkiv"];
  assert.ok(record, "a record exists");
  assert.equal(record.status, "active");
  assert.equal(record.name, "Free State of Kharkiv");
  assert.equal(record.note, FOUNDING_NOTE);
  assert.equal(record.color, foundingColor("Free State of Kharkiv"));
  assert.deepEqual(colors["Free State of Kharkiv"], hexToRgb(record.color));
  assert.ok(!world.polityOverrides.Ukraine, "the loser, a stock country, gets no record");
});

test("a capture by, a contest by, and a claim by an unknown polity found it too", () => {
  const { world } = applyEventImpactsToWorld({
    colors: {},
    world: { polityOverrides: {}, regionOwnershipOverrides: { A: "Ukraine", B: "Ukraine", C: "Ukraine" } },
    events: [event({
      regionControlOps: [
        { op: "control", regionId: "A", fromCode: "Ukraine", toCode: "Donbas Militia" },
        { op: "contest", regionId: "B", fromCode: "Ukraine", actorCode: "Luhansk Council" },
      ],
      regionClaims: [{ regionId: "C", claimantCode: "Kurdistan" }],
    })],
  });
  assert.equal(world.regionOwnershipOverrides.A, "Donbas Militia");
  assert.equal(world.polityOverrides["Donbas Militia"]?.status, "active");
  assert.ok(world.regionClaimants.B.includes("Luhansk Council"));
  assert.equal(world.polityOverrides["Luhansk Council"]?.status, "active");
  assert.ok(world.regionClaimants.C.includes("Kurdistan"));
  assert.equal(world.polityOverrides.Kurdistan?.status, "active", "a claimant with no land is a landless polity, not a phantom");
});

test("a dropped claim and an existing polity found nothing", () => {
  const { world } = applyEventImpactsToWorld({
    colors: {},
    world: {
      polityOverrides: { "Kingdom of Belgium": { code: "Kingdom of Belgium", name: "Kingdom of Belgium", aliases: [], color: "#123456" } },
      regionOwnershipOverrides: { A: "Netherlands" },
    },
    events: [event({
      regionTransfers: [{ regionId: "A", fromCode: "Netherlands", toCode: "Kingdom of Belgium" }],
      regionClaims: [{ regionId: "A", claimantCode: "Nobody Here", drop: true }],
    })],
  });
  assert.deepEqual(Object.keys(world.polityOverrides), ["Kingdom of Belgium"]);
  assert.equal(world.polityOverrides["Kingdom of Belgium"].color, "#123456", "an existing record keeps its colour");
});

test("a create in the same event wins over the safety net", () => {
  const { world, colors } = applyEventImpactsToWorld({
    colors: {},
    world: { polityOverrides: {}, regionOwnershipOverrides: { A: "Ukraine" } },
    events: [event({
      polityChanges: [{ operation: "create", code: "Free State of Kharkiv", color: "#ff0000", note: "declared" }],
      regionTransfers: [{ regionId: "A", fromCode: "Ukraine", toCode: "Free State of Kharkiv" }],
    })],
  });
  assert.equal(world.polityOverrides["Free State of Kharkiv"].color, "#ff0000");
  assert.equal(world.polityOverrides["Free State of Kharkiv"].note, "declared");
  assert.deepEqual(colors["Free State of Kharkiv"], [255, 0, 0]);
});
