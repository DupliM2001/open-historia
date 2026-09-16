import test from "node:test";
import assert from "node:assert/strict";
import {
  FEATURE_DEFINITIONS,
  featureDefaults,
  idleDiplomacyChancePerMinute,
  isFeatureEnabled,
  normalizeFeatureOverrides,
  normalizeFeatureSettings,
  resolveFeatures,
} from "./gameFeatures.js";

test("the defaults switch every feature on with its settings at their defaults", () => {
  const defaults = featureDefaults();
  for (const definition of FEATURE_DEFINITIONS) {
    assert.equal(defaults[definition.key].enabled, true, definition.key);
    for (const setting of definition.settings) {
      assert.equal(defaults[definition.key][setting.key], setting.defaultValue, `${definition.key}.${setting.key}`);
    }
  }
  assert.equal(defaults.idleDiplomacy.averageMinutes, 8);
});

test("a scenario's configuration is made complete, with malformed values replaced", () => {
  const settings = normalizeFeatureSettings({
    espionage: { enabled: "off" },
    idleDiplomacy: { enabled: true, averageMinutes: "not a number" },
    unknownFeature: { enabled: false },
  });
  assert.deepEqual(settings, {
    espionage: { enabled: false },
    idleDiplomacy: { enabled: true, averageMinutes: 8 },
  });
  // The boolean shorthand and clamping to the setting's range.
  assert.deepEqual(normalizeFeatureSettings({ espionage: false, idleDiplomacy: { averageMinutes: 100000 } }), {
    espionage: { enabled: false },
    idleDiplomacy: { enabled: true, averageMinutes: 720 },
  });
  assert.deepEqual(normalizeFeatureSettings("garbage"), featureDefaults());
});

test("a game's overrides keep only what it set", () => {
  assert.deepEqual(normalizeFeatureOverrides({ espionage: { enabled: false } }), { espionage: { enabled: false } });
  assert.deepEqual(normalizeFeatureOverrides({ idleDiplomacy: { averageMinutes: 30 } }), { idleDiplomacy: { averageMinutes: 30 } });
  assert.deepEqual(normalizeFeatureOverrides({ idleDiplomacy: { enabled: "maybe", averageMinutes: "" } }), {});
  assert.deepEqual(normalizeFeatureOverrides({ espionage: true, nonsense: { enabled: false } }), { espionage: { enabled: true } });
  assert.deepEqual(normalizeFeatureOverrides(null), {});
});

test("a game follows its scenario except where it overrides it", () => {
  const scenario = { espionage: { enabled: false }, idleDiplomacy: { enabled: true, averageMinutes: 20 } };
  assert.deepEqual(resolveFeatures(scenario, {}), normalizeFeatureSettings(scenario));
  const resolved = resolveFeatures(scenario, { espionage: { enabled: true }, idleDiplomacy: { averageMinutes: 5 } });
  assert.equal(resolved.espionage.enabled, true);
  assert.equal(resolved.idleDiplomacy.enabled, true);
  assert.equal(resolved.idleDiplomacy.averageMinutes, 5);
  // A scenario edited later reaches a game that never overrode that field.
  const later = resolveFeatures({ ...scenario, idleDiplomacy: { enabled: false, averageMinutes: 20 } }, { idleDiplomacy: { averageMinutes: 5 } });
  assert.equal(later.idleDiplomacy.enabled, false);
  assert.equal(later.idleDiplomacy.averageMinutes, 5);
});

test("isFeatureEnabled and the idle diplomacy chance read the resolved configuration", () => {
  const resolved = resolveFeatures({ idleDiplomacy: { averageMinutes: 4 } }, {});
  assert.equal(isFeatureEnabled(resolved, "espionage"), true);
  assert.equal(isFeatureEnabled(resolveFeatures({ espionage: false }, {}), "espionage"), false);
  assert.equal(isFeatureEnabled(resolved, "featureNobodyDefined"), true);
  assert.equal(idleDiplomacyChancePerMinute(resolved), 0.25);
  assert.equal(idleDiplomacyChancePerMinute(resolveFeatures({ idleDiplomacy: false }, {})), 0);
  assert.equal(idleDiplomacyChancePerMinute(null), 0);
});
