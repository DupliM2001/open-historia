/*! Open Historia — live unit flag replacement architecture tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const icons = fs.readFileSync(path.join(here, "unitFlagIcons.js"), "utf8");
const units = fs.readFileSync(path.join(here, "Units.jsx"), "utf8");

test("unit flag pixels are cached by stable owner plus URL, not owner alone", () => {
  assert.match(icons, /unitFlagPixelCacheKey = \(ownerCode, url\)/);
  assert.match(icons, /pixelCache\.get\(cacheKey\)/);
  assert.match(icons, /inFlight\.has\(cacheKey\)/);
  assert.doesNotMatch(icons, /pixelCache\.get\(ownerCode\)/);
});

test("a new flag URL replaces the image under the same stable MapLibre icon id", () => {
  assert.match(icons, /map\.updateImage\(id, pixels\)/);
  assert.match(icons, /installedUrlByMap = new WeakMap\(\)/);
  assert.match(icons, /urls\.get\(ownerCode\) === url/);
});

test("unit counters refresh flags and colours on runtime writes and game switches", () => {
  assert.match(units, /addEventListener\("oh:flags-updated", onFlagsUpdated\)/);
  assert.match(units, /addEventListener\("oh:colors-updated", onColorsUpdated\)/);
  const gameSwitchListeners = units.match(/addEventListener\("oh:active-game-changed"/g) ?? [];
  assert.ok(gameSwitchListeners.length >= 2);
  assert.match(units, /getNationFlags\(\{ force \}\)/);
  assert.match(units, /getNationColors\(\)/);
});
