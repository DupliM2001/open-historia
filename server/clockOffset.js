/*! Open Historia — how far this computer's clock is from the signaling relays' © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// A shared game finds its host through public Nostr relays
// (src/multiplayer/signaling/nostr.js), and a relay refuses a signaling message
// stamped more than about a minute before its own clock: "invalid: ephemeral
// event expired". A player whose computer clock ran an hour behind had every
// message refused by all five relays, and was told no host was found.
//
// The relays' own HTTPS servers say what time they make it (every response
// carries a Date header), so this asks them, from the server where no browser
// rule hides that header, and the page stamps its messages by their clock
// (src/multiplayer/client/clock.js). Only the hosts the game already uses for
// signaling are asked, and only when a shared game is joined or hosted.

// The game's public relays (src/multiplayer/signaling/nostr.js DEFAULT_RELAYS),
// as https: server code never imports src/, and clockOffset.test.js holds the
// two lists together.
export const CLOCK_SOURCES = Object.freeze([
  "https://relay.damus.io",
  "https://nos.lol",
  "https://relay.primal.net",
  "https://nostr.mom",
  "https://relay.nostr.net",
]);

// One source: its Date header against the middle of the round trip. The header
// is to the second, so the second's middle is taken. null when it says nothing
// usable in time.
const askOne = async (url, { fetchImpl, now, timeoutMs }) => {
  const controller = new AbortController();
  // A plain timer, not AbortSignal.timeout: that one is unref'd, and a server
  // test waiting only on it is cancelled on some runners.
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const sent = now();
    const response = await fetchImpl(url, { method: "HEAD", redirect: "manual", signal: controller.signal });
    const back = now();
    const date = Date.parse(response?.headers?.get?.("date") || "");
    if (!Number.isFinite(date)) return null;
    return date + 500 - (sent + back) / 2;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// { offsetMs, sources }: how many milliseconds to add to this computer's clock
// to read the relays' time, the middle of what at least two of them said.
// Fewer than two answers is no answer: { offsetMs: 0, sources }.
export const measureClockOffset = async ({
  sources = CLOCK_SOURCES,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = 4000,
} = {}) => {
  const offsets = (await Promise.all(sources.map((url) => askOne(url, { fetchImpl, now, timeoutMs }))))
    .filter((offset) => Number.isFinite(offset))
    .sort((a, b) => a - b);
  if (offsets.length < 2) return { offsetMs: 0, sources: offsets.length };
  const middle = offsets.length % 2
    ? offsets[(offsets.length - 1) / 2]
    : (offsets[offsets.length / 2 - 1] + offsets[offsets.length / 2]) / 2;
  return { offsetMs: Math.round(middle), sources: offsets.length };
};

// The route's answer, kept for ten minutes: one shared game asks once.
export const createClockOffsetCache = ({ measure = measureClockOffset, now = () => Date.now(), keepMs = 10 * 60_000 } = {}) => {
  let kept = null;
  let pending = null;
  return async () => {
    if (kept && Math.abs(now() - kept.at) < keepMs) return kept.value;
    pending ??= measure().then((value) => {
      if (value.sources >= 2) kept = { at: now(), value };
      return value;
    }).finally(() => {
      pending = null;
    });
    return pending;
  };
};
