/*! Open Historia — diagnostic log store © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// The Desktop log: one append-only JSONL file where the desktop app's Electron
// process and this server write their own entries — the start-up failures,
// updater messages and server errors that happen where the page cannot see them,
// often before it even exists. Bug reports used to arrive as "it broke" with
// nothing to go on, and the EADDRINUSE port clash reached players as a bare
// dialog.
//
// It is not a second log. The page keeps the Diagnostics log in its own storage
// (src/runtime/debugLog.js), on every platform, and on desktop its Logging file
// merges these entries in by time (readLogSince, through GET /api/log). So the
// player sends one file, and each entry is stored exactly once, by whoever saw
// it, in the place that writer can reach. Older builds also had the page copy its
// entries and whole AI prompts in here; readLogSince leaves those out.
//
// Lives under the writable data dir (server/dataDir.js), so it lands beside the
// saves in every build: server/data/logs for the zip, the Electron userData dir
// for the installed app, and the sandbox path on Android.

import fs from "fs";
import os from "os";
import path from "path";
import { DATA_DIR } from "./dataDir.js";
import { redactLogText } from "./logRedaction.js";

const LOG_DIR = path.join(DATA_DIR, "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");
// Five files of five megabytes. Rotation is unchanged from when the page and the
// AI layer wrote here too; with only the desktop app and the server writing, it
// now takes a very long time to fill.
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 5;
// app.log, app.log.1, … — and anything a build with a larger MAX_FILES left.
const LOG_FILE_NAME = /^app\.log(\.\d+)?$/;

const LEVELS = new Set(["debug", "info", "warn", "error"]);
// The writers this file is for. Anything else in it was put there by an older
// build, and is not read back.
const OWN_SOURCES = new Set(["main", "server"]);

// What one entry may carry into a read, and what a whole read may carry. The
// Logging file holds at most 1 MB and trims each entry itself, so nothing past
// these could ever be used.
const READ_DATA_CHARS = 20_000;
const READ_LIMIT_CHARS = 1024 * 1024;

const HOME_DIR = (() => {
  try {
    return os.homedir();
  } catch {
    return "";
  }
})();

// Redaction happens HERE rather than at each caller: a key can reach this file
// from a request header, a relayed URL or a pasted error message, and a redactor
// placed at any one of those eventually misses a path. The rules are the ones
// the page and the Electron process use (logRedaction.js), plus this machine's
// literal home folder, which names the player.
export const redact = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (typeof text !== "string") return text;
  return redactLogText(text, { homeDir: HOME_DIR });
};

const rotate = () => {
  try {
    if (!fs.existsSync(LOG_FILE) || fs.statSync(LOG_FILE).size < MAX_BYTES) return;
    // Drop the oldest, shuffle the rest down, then move the live file aside.
    const oldest = `${LOG_FILE}.${MAX_FILES - 1}`;
    if (fs.existsSync(oldest)) fs.rmSync(oldest, { force: true });
    for (let index = MAX_FILES - 2; index >= 1; index -= 1) {
      const from = `${LOG_FILE}.${index}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${LOG_FILE}.${index + 1}`);
    }
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch {
    // A failed rotation must never take the app down; the next append just
    // grows the current file a little further.
  }
};

// Never throws. Logging is diagnostics — a broken log must not become the
// failure it was meant to explain.
export const appendLog = (entry) => {
  try {
    const level = LEVELS.has(entry?.level) ? entry.level : "info";
    const source = OWN_SOURCES.has(entry?.source) ? entry.source : "server";
    const line = JSON.stringify({
      at: new Date().toISOString(),
      level,
      source,
      event: String(entry?.event ?? "").slice(0, 120),
      message: redact(String(entry?.message ?? "")).slice(0, 8000),
      // Free-form context: request metadata, stacks. Redacted as a whole so a
      // key nested anywhere inside is caught too.
      ...(entry?.data === undefined ? {} : { data: redact(entry.data).slice(0, 200000) }),
    });
    fs.mkdirSync(LOG_DIR, { recursive: true });
    rotate();
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
  } catch {
    // swallow: see above
  }
};

// Every log file, oldest first: app.log.4 … app.log.1, then app.log.
const logFilesOldestFirst = () => {
  let names = [];
  try {
    names = fs.readdirSync(LOG_DIR).filter((name) => LOG_FILE_NAME.test(name));
  } catch {
    return [];
  }
  const rank = (name) => Number(name.split(".")[2] ?? 0);
  return names.sort((a, b) => rank(b) - rank(a)).map((name) => path.join(LOG_DIR, name));
};

// The desktop app's and the server's entries written at or after `since` (an ISO
// time), oldest first, for the Logging file. Reaches into the rotated files when
// the span goes back that far — a launch that failed a day ago is in app.log.1 by
// now. Redacted again on the way out, which covers what older builds wrote and
// what the Electron process wrote without the shared rules.
export const readLogSince = (since) => {
  const sinceMs = Number.isFinite(Date.parse(since)) ? Date.parse(since) : 0;
  const found = [];
  for (const file of logFilesOldestFirst()) {
    try {
      // A file last written before the span began holds nothing inside it.
      if (fs.statSync(file).mtimeMs < sinceMs) continue;
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line) continue;
        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          continue; // half a line from a crash mid-write
        }
        if (!OWN_SOURCES.has(entry?.source) || !(Date.parse(entry.at) >= sinceMs)) continue;
        found.push({
          at: String(entry.at),
          level: LEVELS.has(entry.level) ? entry.level : "info",
          source: entry.source,
          event: String(entry.event ?? "").slice(0, 120),
          message: redact(String(entry.message ?? "")),
          ...(entry.data === undefined ? {} : { data: redact(entry.data).slice(0, READ_DATA_CHARS) }),
        });
      }
    } catch {
      // An unreadable file loses its own entries, not the read.
    }
  }
  // Stable, so entries written in the same millisecond keep their file order.
  found.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  // Newest kept when there is more than the Logging file could hold.
  let total = 0;
  let first = found.length;
  while (first > 0) {
    const cost = JSON.stringify(found[first - 1]).length;
    if (total + cost > READ_LIMIT_CHARS) break;
    total += cost;
    first -= 1;
  }
  return found.slice(first);
};

// Deletes the Desktop log and every rotated file. Only ever done because the
// player turned Logging off on this machine (Settings → Diagnostics); nothing
// else removes these files. Never throws.
export const clearLog = () => {
  let removed = 0;
  for (const file of logFilesOldestFirst()) {
    try {
      fs.rmSync(file, { force: true });
      removed += 1;
    } catch {
      // A file held open elsewhere stays; the rest still go.
    }
  }
  return removed;
};
