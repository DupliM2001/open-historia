// Guards that keep the two logs from growing back into one another.
//
// Run: node --test src/runtime/diagnosticsLogGuard.test.js
//
// The page keeps the Diagnostics log (debugLog.js) and never writes to the
// Desktop log; the desktop app and the server write the Desktop log, and the
// Logging file merges the two. Before that, the page copied every entry into the
// Desktop log and the AI layer wrote whole system prompts there regardless of
// the player's switches. These read the source as text, like the turn-ordering
// guards, because the thing to protect is an absence.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const SRC = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..");

const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) return item.name === "generated" ? [] : sourceFiles(full);
    return /\.(jsx?|mjs)$/.test(item.name) && !/\.test\.js$/.test(item.name) ? [full] : [];
});

const files = sourceFiles(SRC).map((file) => ({ file: path.relative(SRC, file).replace(/\\/g, "/"), text: fs.readFileSync(file, "utf8") }));

test("the page's old sender to the Desktop log is gone", () => {
    assert.equal(fs.existsSync(path.join(SRC, "runtime", "logClient.js")), false);
    const importers = files.filter(({ text }) => /logClient(\.js)?["']/.test(text)).map(({ file }) => file);
    assert.deepEqual(importers, [], "nothing may import the page-to-server log sender");
});

test("only the Diagnostics log talks to the log endpoint, and only to read or clear it", () => {
    const callers = files.filter(({ text }) => text.includes("/api/log")).map(({ file }) => file);
    assert.deepEqual(callers, ["runtime/debugLog.js"]);
    const debugLog = files.find(({ file }) => file === "runtime/debugLog.js").text;
    assert.equal(/method:\s*["']POST["']/.test(debugLog), false, "the page must never write into the Desktop log");
});

test("Settings says honestly what turning Logging off leaves behind", () => {
    const settings = files.find(({ file }) => file === "Game/GameUI/settings.jsx").text;
    assert.match(settings, /Off: nothing is recorded and the log on this device is deleted\. The desktop app still notes its own start-up and server errors, which never include your campaign\./);
});

test("the log is looked at in Settings, not in Cheats", () => {
    const cheats = files.find(({ file }) => file === "Game/GameUI/cheats.jsx").text;
    assert.equal(/Diagnostics Log/.test(cheats), false);
    const settings = files.find(({ file }) => file === "Game/GameUI/settings.jsx").text;
    assert.match(settings, /getLoggingFileEntries/, "View log shows the same entries the file holds");
});

test("the AI layer never logs a whole system prompt", () => {
    const gameplay = files.find(({ file }) => file === "Game/AI/gameplay.js").text;
    assert.equal(gameplay.includes("logAi("), false);
    // The fingerprint is handed the prompt to measure, and that is the one place
    // it may go.
    const calls = gameplay.split("logDebugEvent(").slice(1)
        .map((rest) => rest.slice(0, rest.indexOf(");")).replace(/buildPromptFingerprint\(\{[\s\S]*?\}\)/g, ""));
    const leaking = calls.filter((call) => /\bsystemPrompt\b(?!\.length)/.test(call));
    assert.deepEqual(leaking, [], "a log entry may carry the prompt's size or fingerprint, never the prompt");
});
