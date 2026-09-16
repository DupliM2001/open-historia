/*! Open Historia — gameplay features a scenario can switch off and a game can override © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Shared by the server store, the web store and the client, so it lives under
// server/ and imports nothing (server code never imports src/).
//
// A scenario carries a COMPLETE configuration — every feature, every setting —
// which is the default for every game made from it. A game carries only the
// fields it overrides, so a scenario edited later still reaches every game that
// never overrode that field. Add a feature here and it appears in both editors
// and in resolveFeatures with its defaults; gate the code it controls with
// isFeatureEnabled (client: isActiveFeatureEnabled in src/runtime/gameFeatures.js).

export const FEATURE_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: "espionage",
    label: "Espionage",
    description: "Spies and what they intercept, cover stories, the intelligence readings behind them, and the agents other polities send. Off: the Spy tab is hidden, no service acts, and the simulator's spy orders are ignored.",
    settings: Object.freeze([]),
  }),
  Object.freeze({
    key: "idleDiplomacy",
    label: "Idle diplomacy",
    description: "While the game sits open between turns, a polity with a live reason to speak may send the player an unprompted note. The world's forces still shift a little on their own with this off.",
    settings: Object.freeze([
      Object.freeze({
        key: "averageMinutes",
        label: "One attempt every",
        unit: "minutes, on average",
        min: 1,
        max: 720,
        step: 1,
        defaultValue: 8,
        description: "How often, on average, the model is asked whether some polity would write. Most attempts send nothing; the roll only runs while the game is on screen.",
      }),
    ]),
  }),
]);

export const FEATURE_KEYS = Object.freeze(FEATURE_DEFINITIONS.map((definition) => definition.key));

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["true", "on", "yes", "enabled", "1"].includes(text)) return true;
    if (["false", "off", "no", "disabled", "0"].includes(text)) return false;
  }
  return null;
};

const readSetting = (value, setting) => {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const clamped = Math.min(setting.max, Math.max(setting.min, number));
  return setting.step >= 1 ? Math.round(clamped) : clamped;
};

// `{ espionage: false }` is accepted as shorthand for `{ espionage: { enabled: false } }`.
const readEntry = (entry) => (isRecord(entry) ? entry : { enabled: entry });

// The built-in defaults: everything on, every setting at its default.
export const featureDefaults = () => normalizeFeatureSettings(null);

// A scenario's configuration, made complete: every feature and every setting
// present, defaults filling anything missing or malformed.
export const normalizeFeatureSettings = (raw) => {
  const source = isRecord(raw) ? raw : {};
  const settings = {};
  for (const definition of FEATURE_DEFINITIONS) {
    const entry = readEntry(source[definition.key]);
    const resolved = { enabled: readBoolean(entry.enabled) ?? true };
    for (const setting of definition.settings) {
      resolved[setting.key] = readSetting(entry[setting.key], setting) ?? setting.defaultValue;
    }
    settings[definition.key] = resolved;
  }
  return settings;
};

// A game's overrides: only what it explicitly sets, so an unset field keeps
// following the scenario. Unknown features and malformed values are dropped.
export const normalizeFeatureOverrides = (raw) => {
  const source = isRecord(raw) ? raw : {};
  const overrides = {};
  for (const definition of FEATURE_DEFINITIONS) {
    if (source[definition.key] === undefined || source[definition.key] === null) continue;
    const entry = readEntry(source[definition.key]);
    const resolved = {};
    const enabled = readBoolean(entry.enabled);
    if (enabled !== null) resolved.enabled = enabled;
    for (const setting of definition.settings) {
      const value = readSetting(entry[setting.key], setting);
      if (value !== null) resolved[setting.key] = value;
    }
    if (Object.keys(resolved).length) overrides[definition.key] = resolved;
  }
  return overrides;
};

// What a game actually plays with: the scenario's configuration under the
// game's overrides.
export const resolveFeatures = (scenarioFeatures, gameFeatures) => {
  const base = normalizeFeatureSettings(scenarioFeatures);
  const overrides = normalizeFeatureOverrides(gameFeatures);
  const resolved = {};
  for (const definition of FEATURE_DEFINITIONS) {
    resolved[definition.key] = { ...base[definition.key], ...(overrides[definition.key] ?? {}) };
  }
  return resolved;
};

export const isFeatureEnabled = (features, key) => features?.[key]?.enabled !== false;

// Idle diplomacy rolls once a minute while the game is on screen; an average
// interval of N minutes is a chance of 1/N per roll. 0 when the feature is off.
export const idleDiplomacyChancePerMinute = (features) => {
  const idle = features?.idleDiplomacy;
  if (!idle || idle.enabled === false) return 0;
  const minutes = Number(idle.averageMinutes);
  return 1 / Math.max(1, Number.isFinite(minutes) ? minutes : 8);
};
