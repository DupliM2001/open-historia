// The Logging file's settings block (settingsLog.js), read the way a report
// reads it: the line a player's file would carry.
//
// Run: node --test src/runtime/settingsLog.test.js
import test from "node:test";
import assert from "node:assert/strict";

import { createMemoryStorage } from "../Game/AI/requestBudget.js";
import { buildSettingsReport } from "./debugLog.js";
import { MAP_SETTING_KEYS } from "./mapSettings.js";
import "./settingsLog.js";

globalThis.localStorage = createMemoryStorage();

const line = async (label) => {
    const report = await buildSettingsReport();
    return report.split("\n").find((row) => row.trim().startsWith(`${label}:`))?.trim() ?? "";
};

test("Show what I am playing on Discord: the switch, and that it does nothing where Discord cannot be reached", async () => {
    // On unless turned off. Node is not a build with a local server beside a
    // Discord app, which is also what the website and the Android app are.
    assert.equal(await line("Show what I am playing on Discord"), "Show what I am playing on Discord: on (inactive: this build cannot reach Discord)");
    localStorage.setItem(MAP_SETTING_KEYS.discordPresence, "0");
    assert.equal(await line("Show what I am playing on Discord"), "Show what I am playing on Discord: off (inactive: this build cannot reach Discord)");
    localStorage.removeItem(MAP_SETTING_KEYS.discordPresence);
});

test("Count my visits: on only after a yes, and why it is off otherwise", async () => {
    // No consent.js on the page (the Android app): nothing is counted.
    assert.equal(await line("Count my visits"), "Count my visits: off (visits are not counted here)");
    const answer = { choice: "", signal: false };
    const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    globalThis.window = {
        ohConsent: { counted: () => true, get: () => answer.choice, refusedBySignal: () => answer.signal },
    };
    try {
        assert.equal(await line("Count my visits"), "Count my visits: off (not answered)");
        answer.signal = true;
        assert.equal(await line("Count my visits"), "Count my visits: off (the browser asks not to be tracked)");
        answer.choice = "yes";
        assert.equal(await line("Count my visits"), "Count my visits: on");
        answer.choice = "no";
        assert.equal(await line("Count my visits"), "Count my visits: off");
    } finally {
        if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
        else delete globalThis.window;
    }
});
