/*! Open Historia — the clock a shared game's signaling is stamped by © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Every signaling message carries the sender's time twice: the relay event's
// created_at, which a relay refuses when it is more than about a minute old by
// ITS clock ("invalid: ephemeral event expired"), and the payload's own ts,
// which the other side refuses when it is five minutes off by its clock
// (session/messages.js isFresh). A computer whose clock ran an hour behind was
// heard by nobody and heard nobody, and its player was told no host was found.
//
// So a shared game reads the time from the relays themselves before it starts
// (server/clockOffset.js, through the desktop app's own server) and stamps its
// messages by that. On the website, where there is no such server, the site's
// own answer says what time its server makes it. A clock within
// WORTH_CORRECTING_MS of theirs is left alone: those few seconds are within
// what everyone allows, and nothing is gained by trusting a guess over it.

export const WORTH_CORRECTING_MS = 15_000;

const isLocalHost = (hostname) => /^(localhost|127(?:\.\d+){3}|\[::1\]|::1)$/i.test(String(hostname || ""));

const withTimeout = async (run, ms) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

// { offsetMs, source }: what to add to this computer's clock for the relays'
// time, and where that came from ("relays" | "site" | ""). Never throws.
//   customRelays  the page signals over relays of its own (a test, a developer):
//                 nothing outside is asked, and the clock is taken as it is
export const readSignalingClock = async ({
  fetchImpl = globalThis.fetch,
  location = globalThis.location,
  customRelays = false,
  now = () => Date.now(),
  timeoutMs = 6000,
} = {}) => {
  if (customRelays || typeof fetchImpl !== "function") return { offsetMs: 0, source: "" };
  const kept = (offsetMs, source) => (Math.abs(offsetMs) >= WORTH_CORRECTING_MS ? { offsetMs: Math.round(offsetMs), source } : { offsetMs: 0, source });
  try {
    const answer = await withTimeout((signal) => fetchImpl("/api/multiplayer/clock", { signal }), timeoutMs);
    const body = answer?.ok ? await answer.json().catch(() => null) : null;
    if (body && Number.isFinite(body.offsetMs) && Number(body.sources) >= 2) return kept(body.offsetMs, "relays");
  } catch {
    // no desktop server here
  }
  // The website: its own server's Date header is the time. A page served by
  // this computer (the desktop app, a development server) has only this
  // computer's own clock to offer, which is the one in question.
  if (!location || isLocalHost(location.hostname)) return { offsetMs: 0, source: "" };
  try {
    const sent = now();
    const answer = await withTimeout((signal) => fetchImpl(`${location.origin}/`, { method: "HEAD", cache: "no-store", signal }), timeoutMs);
    const back = now();
    const date = Date.parse(answer?.headers?.get?.("date") || "");
    if (!Number.isFinite(date)) return { offsetMs: 0, source: "" };
    return kept(date + 500 - (sent + back) / 2, "site");
  } catch {
    return { offsetMs: 0, source: "" };
  }
};

// A clock that reads `offsetMs` ahead of this computer's own.
export const offsetClock = (offsetMs) => {
  const offset = Number.isFinite(offsetMs) ? offsetMs : 0;
  return () => Date.now() + offset;
};

// "this computer's clock is 1 h 0 min behind the relays' …", for the log.
export const describeClock = ({ offsetMs, source }) => {
  const seconds = Math.round(Math.abs(offsetMs) / 1000);
  const span = seconds >= 3600 ? `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min` : seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
  return `this computer's clock is ${span} ${offsetMs > 0 ? "behind" : "ahead of"} ${source === "site" ? "the website's" : "the relays'"}; the shared game's messages are stamped by theirs`;
};
