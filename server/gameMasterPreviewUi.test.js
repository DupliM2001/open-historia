import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cheatsPath = new URL("../src/Game/GameUI/cheats.jsx", import.meta.url);
const sourceText = () => readFile(cheatsPath, "utf8");

test("large GM territory previews render four rows and expand on demand", async () => {
  const source = await sourceText();
  assert.match(source, /GM_COLLAPSED_OPERATION_LIMIT\s*=\s*4/);
  assert.match(source, /entries\.slice\(0, GM_COLLAPSED_OPERATION_LIMIT\)/);
  assert.match(source, /… \$\{hidden\} more · click to show all/);
  assert.match(source, /Show fewer/);
  assert.match(source, /visibleOperationRows\("territory-sovereignty", transferOps\)/);
  assert.match(source, /visibleOperationRows\("territory-control", controlOps\)/);
  assert.match(source, /visibleOperationRows\("territory-claims", claimOps\)/);
  assert.doesNotMatch(source, /Jump To/i);
});

test("GM Apply does not synchronously refresh the heavy admin panel before map presentation", async () => {
  const source = await sourceText();
  const applyStart = source.indexOf("const result = await applyGameMasterPreview(gmPreview)");
  assert.ok(applyStart >= 0);
  const branch = source.slice(applyStart, applyStart + 1800);
  assert.match(branch, /requestIdleCallback/);
  assert.match(branch, /setTimeout\(refreshLater, 0\)/);
  assert.doesNotMatch(branch, /await refresh\(\)/);
});
