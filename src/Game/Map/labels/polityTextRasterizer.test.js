import test from "node:test";
import assert from "node:assert/strict";
import { buildFontFamilyCss } from "./polityTextRasterizer.js";

test("PTR-0 arbitrary scenario font stack becomes valid Canvas CSS", () => {
  assert.equal(
    buildFontFamilyCss(["Cinzel Decorative", "Georgia", "serif"]),
    '"Cinzel Decorative", "Georgia", serif',
  );
  assert.equal(buildFontFamilyCss([]), "serif");
});
