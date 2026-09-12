/*! Open Historia — Political Cartography Pipeline v2 worker protocol tests © 2026 Open Historia contributors, AGPL-3.0-or-later. */
import test from "node:test";
import assert from "node:assert/strict";

const rectangle = (id, owner, x0, x1) => ({
  type: "Feature",
  id,
  properties: { id, owner, name: id },
  geometry: {
    type: "Polygon",
    coordinates: [[
      [x0, 0], [x1, 0], [x1, 1], [x0, 1], [x0, 0],
    ]],
  },
});

const regions = {
  type: "FeatureCollection",
  features: [
    rectangle("a1", "A", 0, 1),
    rectangle("a2", "A", 1, 2),
    rectangle("b1", "B", 2, 3),
    rectangle("c1", "C", 3, 4),
  ],
};

const messages = [];
globalThis.self = {
  postMessage(message) {
    messages.push(message);
  },
};
await import(`./polityBoundariesWorker.js?protocol-test=${Date.now()}`);

const send = async (data) => {
  const start = messages.length;
  await globalThis.self.onmessage({ data });
  return messages.slice(start);
};

test("worker publishes compact catalog before initial political cartography", async () => {
  const out = await send({
    requestId: 1,
    type: "initialize",
    geometryEpoch: "g1",
    regions,
    ownershipOverrides: {},
    regionClaimants: {},
    labelNames: { A: "A", B: "B", C: "C" },
  });
  assert.equal(out[0]?.messageType, "catalog-ready");
  assert.equal(out[0]?.metadata?.records?.length, 4);
  assert.equal(out[1]?.messageType, "cartography-result");
  assert.equal(out[1]?.boundaryPatch?.removeAll, true);
});

test("ownership update removes a polity label when its canonical region membership reaches zero", async () => {
  const out = await send({
    requestId: 2,
    type: "update-ownership",
    geometryEpoch: "g1",
    ownershipOverrides: { a1: "B", a2: "B" },
    regionClaimants: {},
    labelNames: { A: "A", B: "B", C: "C" },
    affectedOwners: ["A", "B"],
    changedRegionIds: ["a1", "a2"],
  });
  assert.equal(out.length, 1);
  const result = out[0];
  assert.equal(result.messageType, "cartography-result");
  const owners = new Set((result.labels?.labelData?.features ?? []).map((feature) => feature?.properties?.sourceOwner ?? feature?.properties?.owner));
  assert.equal(owners.has("A"), false, "a vanished polity must not retain a derived label");
  assert.equal(owners.has("B"), true);
  assert.ok((result.boundaryPatch?.removeIds?.length ?? 0) + (result.boundaryPatch?.upsert?.length ?? 0) > 0);
});

test("forceFullSnapshot returns a self-contained current boundary snapshot after an unpublished worker revision", async () => {
  const out = await send({
    requestId: 3,
    type: "update-ownership",
    geometryEpoch: "g1",
    ownershipOverrides: { a1: "C", a2: "B" },
    regionClaimants: {},
    labelNames: { A: "A", B: "B", C: "C" },
    affectedOwners: ["B", "C"],
    changedRegionIds: ["a1"],
    forceFullSnapshot: true,
  });
  const result = out[0];
  assert.equal(result?.boundaryPatch?.removeAll, true);
  assert.ok(Array.isArray(result?.boundaryPatch?.upsert));
  assert.ok((result?.labels?.labelData?.features?.length ?? 0) >= 2);
});


test("forceFullSnapshot on claim-only recovery republishes boundaries labels and current disputes", async () => {
  const out = await send({
    requestId: 4,
    type: "update-claims",
    geometryEpoch: "g1",
    ownershipOverrides: { a1: "C", a2: "B" },
    regionClaimants: { a1: ["A"] },
    labelNames: { A: "Alpha", B: "Beta", C: "Gamma" },
    forceFullSnapshot: true,
  });
  const result = out[0];
  assert.equal(result?.boundaryPatch?.removeAll, true);
  assert.ok(Array.isArray(result?.boundaryPatch?.upsert));
  assert.ok((result?.labels?.labelData?.features?.length ?? 0) >= 2);
  const dispute = (result?.disputedData?.features ?? []).find((feature) => feature?.properties?.id === "a1");
  assert.deepEqual(dispute?.properties?._liveClaimants, ["A"]);
});

test("forceFullSnapshot on label-only recovery also republishes current dispute state", async () => {
  const out = await send({
    requestId: 5,
    type: "update-labels",
    geometryEpoch: "g1",
    ownershipOverrides: { a1: "C", a2: "B" },
    regionClaimants: { a1: ["A"] },
    labelNames: { A: "Alpha", B: "Beta", C: "Gamma Prime" },
    affectedOwners: ["C"],
    forceFullSnapshot: true,
  });
  const result = out[0];
  assert.equal(result?.boundaryPatch?.removeAll, true);
  assert.ok((result?.labels?.labelData?.features?.length ?? 0) >= 2);
  const dispute = (result?.disputedData?.features ?? []).find((feature) => feature?.properties?.id === "a1");
  assert.deepEqual(dispute?.properties?._liveClaimants, ["A"]);
});

test("claim and display-name changes coalesce without losing the label revision", async () => {
  await send({
    requestId: 6,
    type: "update-labels",
    geometryEpoch: "g1",
    ownershipOverrides: { a1: "C", a2: "B" },
    regionClaimants: {},
    labelNames: { A: "Alpha", B: "Beta", C: "Gamma Before" },
    affectedOwners: ["C"],
  });

  const out = await send({
    requestId: 7,
    type: "update-claims",
    geometryEpoch: "g1",
    ownershipOverrides: { a1: "C", a2: "B" },
    regionClaimants: { a1: ["A"] },
    labelNames: { A: "Alpha", B: "Beta", C: "Gamma After" },
    affectedOwners: ["C"],
  });
  const result = out[0];
  assert.ok(result?.disputedData?.features?.length > 0);
  const cLabel = (result?.labels?.labelData?.features ?? []).find(
    (feature) => (feature?.properties?.sourceOwner ?? feature?.properties?.owner) === "C",
  );
  assert.equal(cLabel?.properties?.name, "GAMMA AFTER");
});

test("forceFullSnapshot derives the complete ownership delta from worker state, not an incomplete hint", async () => {
  await send({
    requestId: 8,
    type: "initialize",
    geometryEpoch: "g2",
    regions,
    ownershipOverrides: {},
    regionClaimants: {},
    labelNames: { A: "A", B: "B", C: "C" },
  });

  const out = await send({
    requestId: 9,
    type: "update-ownership",
    geometryEpoch: "g2",
    ownershipOverrides: { a1: "C", c1: "A" },
    regionClaimants: {},
    labelNames: { A: "A", B: "B", C: "C" },
    // Simulate a coalesced UI hint that only mentions the final incremental leg.
    changedRegionIds: ["c1"],
    affectedOwners: ["A", "C"],
    forceFullSnapshot: true,
  });
  const result = out[0];
  const ownerGroups = new Set(
    (result?.boundaryPatch?.upsert ?? []).map((feature) => feature?.properties?.owners),
  );
  assert.equal(result?.boundaryPatch?.removeAll, true);
  assert.ok(ownerGroups.has("A | C"), "a1 must be reclassified even though the incremental hint omitted it");
});
