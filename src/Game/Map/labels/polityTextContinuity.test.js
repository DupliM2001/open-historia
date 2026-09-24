import test from "node:test";
import assert from "node:assert/strict";
import { diffPolityTextRecords, polityTextRecordFingerprint } from "./polityTextContinuity.js";

const record = (id, owner, text = owner, anchor = [0, 0]) => ({
  id,
  owner,
  text,
  siteRole: "sovereign-primary",
  anchor,
  baseline: [[0, 0], [1, 1]],
  priorityScale: 100,
  ptrAxisSpanWorld: 0.1,
  ptrCrossSpanWorld: 0.05,
  placementMode: "optimized",
});

test("incremental PTR diff ignores recreated-but-identical polity records", () => {
  const before = [record("a", "A"), record("b", "B"), record("c", "C")];
  const previous = new Map(before.map((item) => [item.id, polityTextRecordFingerprint(item)]));
  const recreated = before.map((item) => ({ ...item, baseline: item.baseline.map((p) => [...p]) }));
  const diff = diffPolityTextRecords(recreated, previous);
  assert.equal(diff.changedRecords.length, 0);
  assert.equal(diff.removedKeys.length, 0);
});

test("incremental PTR diff marks every actually affected polity record without an arbitrary owner cap", () => {
  const before = [record("a", "A"), record("b", "B"), record("c", "C"), record("d", "D")];
  const previous = new Map(before.map((item) => [item.id, polityTextRecordFingerprint(item)]));
  const after = [
    record("a", "A", "A", [1, 0]),
    record("b", "B"),
    record("c", "C", "C", [2, 0]),
    record("d", "D", "D", [3, 0]),
  ];
  const diff = diffPolityTextRecords(after, previous);
  assert.deepEqual(diff.changedRecords.map((item) => item.owner), ["A", "C", "D"]);
});

test("incremental PTR diff reports removed sites for atomic post-prepare swap", () => {
  const before = [record("a", "A"), record("b", "B")];
  const previous = new Map(before.map((item) => [item.id, polityTextRecordFingerprint(item)]));
  const diff = diffPolityTextRecords([record("a", "A")], previous);
  assert.deepEqual(diff.removedKeys, ["b"]);
});
