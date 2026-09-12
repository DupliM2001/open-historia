/*! Open Historia — portions (game settings in the diagnostics log) © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// The Logging file's "Settings when this file was saved" block: every setting a
// player can change, with the value in force as the file is built.
//
// The log records settings as they CHANGE (logSettingChange, called by each
// setter), but a switch flipped before the log's span — or never touched, sitting
// at its default — is in no log at all, and "was X on?" is the first question a
// report gets. So the file also states them all, read at the moment it is saved.
//
// One place for all of them, each read through the getter its owner already
// exports, so what the file says is what the game is running with. Registered
// into debugLog.js rather than imported by it, because these modules import that
// one. Imported by src/main.jsx at boot, so the block is there however the file
// is saved — Settings or a failure button.
//
// Labels match the Settings panel word for word, so a reader can find the switch;
// src/runtime/diagnosticsLogGuard.test.js fails if a switch in the panel is
// missing here.
//
// What a line may say: never a key (only "set" or "not set"), never custom
// parameters (they can carry headers — only their size), and an endpoint only by
// its host. Everything is redacted again as the file is built.
import { isDebugLogEnabled, isDebugLogVerbose, registerSettingsSnapshot } from "./debugLog.js";
import { MAP_SETTING_KEYS, getMapSetting, getMapSettingValue, resolveBetaUnits } from "./mapSettings.js";
import { getStoredChatLanguage, getStoredLanguage, languageDisplayName } from "./i18n.js";
import {
    AI_TASK_ROUTING,
    endpointHostForLog,
    getProviderField,
    getProviderMeta,
    getReasoningEnabled,
    getStoredProvider,
} from "../Game/AI/providerConfig.js";
import { isRatingEnabled, isTelemetryEnabled } from "../Game/AI/telemetry.js";

const onOff = (value) => (value ? "on" : "off");

// The globe and terrain switches are App.jsx state mirrored to localStorage as
// JSON booleans; App writes them on mount, so they are there by the time a file
// can be saved.
const storedBoolean = (key, fallback) => {
    try {
        const stored = localStorage.getItem(key);
        return stored === null ? fallback : JSON.parse(stored) === true;
    } catch {
        return fallback;
    }
};

registerSettingsSnapshot("Display", () => [
    ["UI language", languageDisplayName(getStoredLanguage())],
    ["AI chat language", languageDisplayName(getStoredChatLanguage())],
    ["Fullscreen", onOff(typeof document !== "undefined" && document.fullscreenElement)],
    // The umbrella switch: on exactly when both of the map's motion switches are.
    ["Reduce motion", onOff(getMapSetting(MAP_SETTING_KEYS.disableIdleRotation) && getMapSetting(MAP_SETTING_KEYS.disableEventCamera))],
]);

registerSettingsSnapshot("Map", () => [
    ["Basemap", getMapSettingValue(MAP_SETTING_KEYS.basemapStyle) || "scenario default"],
    ["Label font", getMapSettingValue(MAP_SETTING_KEYS.labelFont) || "scenario default"],
    ["3D Globe", onOff(storedBoolean("Globe", false))],
    ["3D Terrain", onOff(storedBoolean("Terrain", true))],
    ["Hide country labels", onOff(getMapSetting(MAP_SETTING_KEYS.hideCountryLabels))],
    ["Legacy map renderer", onOff(getMapSetting(MAP_SETTING_KEYS.legacyMapRenderer))],
    ["Disable idle globe rotation", onOff(getMapSetting(MAP_SETTING_KEYS.disableIdleRotation))],
    ["Disable camera movement during events", onOff(getMapSetting(MAP_SETTING_KEYS.disableEventCamera))],
]);

registerSettingsSnapshot("AI", () => {
    const provider = getStoredProvider();
    const field = (name) => String(getProviderField(provider, name) ?? "").trim();
    const items = [
        ["Provider", getProviderMeta(provider)?.label || provider],
        ["Model", field("model") || "(provider default)"],
        ["API key", field("apiKey") ? "set" : "not set"],
    ];
    // Only the self-hosted providers have an endpoint to point somewhere else.
    if (provider === "openai-compatible" || provider === "anthropic-compatible") {
        items.push(["Endpoint", endpointHostForLog(field("endpoint"))]);
    }
    const customParams = field("customParams");
    items.push(["Custom parameters", customParams ? `set (${customParams.length} characters)` : "none"]);
    items.push(["Structured output", field("structuredMode") || "auto"]);
    if (provider === "openai-compatible") items.push(["Strict tool schema", onOff(field("toolStrict") === "1")]);
    // Only the tasks routed away from the model above; every other task uses it.
    const overrides = AI_TASK_ROUTING
        .map(({ key, label }) => [`${label} model`, field(`model_${key}`)])
        .filter(([, model]) => model);
    if (overrides.length) items.push(...overrides);
    else items.push(["Per-task models", "none — every task uses the model above"]);
    items.push(
        ["Model reasoning", onOff(getReasoningEnabled())],
        ["Limit AI generation", onOff(getMapSetting(MAP_SETTING_KEYS.limitAiGeneration))],
        ["Generate long time skips in segments", onOff(getMapSetting(MAP_SETTING_KEYS.chunkLongJumps))],
        ["Batch background AI tasks", onOff(getMapSetting(MAP_SETTING_KEYS.batchBackgroundTasks))],
        ["Record AI telemetry", onOff(isTelemetryEnabled())],
        ["Rate AI generations", onOff(isRatingEnabled())],
    );
    return items;
});

// The save's own settings. Difficulty and the unit system the session is running
// are in the file's header already; this is what the save itself says, which a
// toggle flipped mid-session can make differ from the running one until reload.
registerSettingsSnapshot("This save", () => [
    ["Beta unit system", onOff(resolveBetaUnits())],
]);

// The server's LAN sharing, which is what lets a phone in. A request away, and
// absent on the web and Android builds (their in-browser API answers 404), where
// the section is left out.
registerSettingsSnapshot("Network", async () => {
    const response = await fetch("/api/server/network", { cache: "no-store" });
    if (!response.ok) return null;
    const state = await response.json();
    return [["Let other devices connect", `${onOff(state?.lanEnabled)}${state?.lockedByEnv ? " (set by OH_HOST)" : ""}`]];
});

registerSettingsSnapshot("Diagnostics", () => [
    ["Keep a diagnostics log", onOff(isDebugLogEnabled())],
    ["Detailed logging", onOff(isDebugLogVerbose())],
]);
