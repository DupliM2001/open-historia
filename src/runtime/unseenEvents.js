/*! Open Historia — what the player has not been shown yet © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run the tests: node --test src/runtime/unseenEvents.test.js
//
// A time skip is written whole — the world, the events, the chats, the papers —
// and then shown to the player one event at a time (time.jsx). Until the reveal
// reaches an event the player has not seen it, and until they have, nothing
// else may show it to them either: not the advisor, not a leader answering a
// letter, not the thread that event opened, not the copy an agent stole in it.
// Intervene can still discard it; an advisor who had spoken of it would have
// spoken of something that, for the player, never happened.
//
// This module keeps which of the newest skip's events are still unseen, and the
// rules that take what is unseen out of what the player and the AI are shown.
// Anything a turn produces beside its events — a message in a thread, a stolen
// copy — carries `eventId`: the event whose reveal shows it.
//
// Kept on this device, beside the other per-player settings: how far the player
// has read is their progress through the record, not part of the record, and a
// "next event" click must not rewrite a quarter-megabyte save. Only the newest
// skip is ever unseen — a later skip starts a new reveal, and an undo or an
// Intervene ends it — so each entry is keyed by its turn's first event and the
// rules only ever apply it to the turn the world says is newest.
//
// Import-free, like requestBudget.js: the storage is handed in, the rules are
// plain data, and all of it is tested under bare node.

const asArray = (value) => (Array.isArray(value) ? value : []);
const asText = (value) => String(value ?? "").trim();

export const UNSEEN_EVENTS_KEY = "oh_unseen_turn_events";
// Reveals remembered at once: one per recent turn across the saves on this device.
const TURNS_KEPT = 6;

// --- Where it is kept ---------------------------------------------------------

export const createMemoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
};

// Resolved at every read: the harness installs its localStorage after the game's
// modules load, and a browser that refuses storage runs on memory — nothing is
// then unseen after a reload, which is the old behaviour, never a stuck reveal.
const fallbackMemory = createMemoryStorage();
const resolveStorage = () => {
  try {
    if (typeof localStorage !== "undefined" && localStorage) return localStorage;
  } catch { /* refused */ }
  return fallbackMemory;
};
const liveStorage = {
  getItem: (key) => resolveStorage().getItem(key),
  setItem: (key, value) => resolveStorage().setItem(key, value),
};

const readState = (storage) => {
  try {
    const raw = JSON.parse(storage.getItem(UNSEEN_EVENTS_KEY) ?? "null");
    return {
      turns: asArray(raw?.turns)
        .map((turn) => ({ key: asText(turn?.key), unseen: asArray(turn?.unseen).map(asText).filter(Boolean) }))
        .filter((turn) => turn.key),
    };
  } catch {
    return { turns: [] };
  }
};

const writeState = (storage, state) => {
  try {
    storage.setItem(UNSEEN_EVENTS_KEY, JSON.stringify(state));
  } catch { /* full or refused: the reveal simply is not remembered */ }
};

// --- The rules ---------------------------------------------------------------

const idsOf = (turnEventIds) => asArray(turnEventIds).map(asText).filter(Boolean);

// The newest turn's events, in the order the reveal shows them.
export const latestTurnEventIds = (world) => idsOf(world?.simulationHistory?.[0]?.eventIds);

// Which of a turn's events are still unseen.
export const unseenIn = (state, turnEventIds) => {
  const ids = idsOf(turnEventIds);
  if (!ids.length) return new Set();
  const entry = asArray(state?.turns).find((turn) => turn.key === ids[0]);
  if (!entry) return new Set();
  const inTurn = new Set(ids);
  return new Set(entry.unseen.filter((id) => inTurn.has(id)));
};

// A skip has just landed and shows its first `shown` events.
export const withTurnUnseen = (state, turnEventIds, { shown = 1 } = {}) => {
  const ids = idsOf(turnEventIds);
  if (!ids.length) return state;
  const rest = asArray(state?.turns).filter((turn) => turn.key !== ids[0]);
  return { turns: [{ key: ids[0], unseen: ids.slice(Math.max(0, shown)) }, ...rest].slice(0, TURNS_KEPT) };
};

// The reveal has reached the `count`-th event of the turn.
export const withSeenThrough = (state, turnEventIds, count) => {
  const ids = idsOf(turnEventIds);
  const entry = ids.length ? asArray(state?.turns).find((turn) => turn.key === ids[0]) : null;
  if (!entry) return state;
  const seen = new Set(ids.slice(0, Math.max(0, count)));
  const unseen = entry.unseen.filter((id) => !seen.has(id));
  if (unseen.length === entry.unseen.length) return state;
  return { turns: state.turns.map((turn) => (turn === entry ? { ...turn, unseen } : turn)) };
};

// --- The store -----------------------------------------------------------------

export const UNSEEN_EVENTS_CHANGED = "oh:unseen-events-changed";

const announce = () => {
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof Event === "function") {
      window.dispatchEvent(new Event(UNSEEN_EVENTS_CHANGED));
    }
  } catch { /* no window: nothing is listening */ }
};

export const createUnseenEvents = ({ storage = liveStorage, onChange = announce } = {}) => {
  const change = (next) => {
    writeState(storage, next);
    try { onChange(); } catch { /* a listener that fell over costs nothing */ }
  };
  return {
    // What of the world's newest turn the player has not been shown.
    unseenFor: (world) => unseenIn(readState(storage), latestTurnEventIds(world)),
    unseenInTurn: (turnEventIds) => unseenIn(readState(storage), turnEventIds),
    markTurnUnseen: (turnEventIds, options) => change(withTurnUnseen(readState(storage), turnEventIds, options)),
    markSeenThrough: (turnEventIds, count) => {
      const before = readState(storage);
      const next = withSeenThrough(before, turnEventIds, count);
      if (next !== before) change(next);
    },
    // An undo or an Intervene: whatever was left of the reveal no longer exists.
    clear: () => change({ turns: [] }),
  };
};

export const unseenEvents = createUnseenEvents();

// --- Taking the unseen out -------------------------------------------------------

const hidden = (unseen, item) => unseen.has(asText(item?.eventId));

export const withoutUnseenEvents = (events, unseen) => (unseen?.size
  ? asArray(events).filter((event) => !unseen.has(asText(event?.id)))
  : events);

export const withoutUnseenMessages = (messages, unseen) => (unseen?.size
  ? asArray(messages).filter((message) => !hidden(unseen, message))
  : messages);

// Threads as the player has been shown them. A thread an unseen event opened —
// its linked event, or every one of its messages, came with such an event — is
// not there yet; a thread an unseen event wrote into shows the rest. Only ever
// for showing: a panel that writes chats back must write the stored ones.
export const withoutUnseenChats = (chats, unseen) => {
  if (!unseen?.size) return chats;
  const out = [];
  for (const chat of asArray(chats)) {
    if (unseen.has(asText(chat?.linkedEventId))) continue;
    const messages = asArray(chat?.messages);
    const shown = messages.filter((message) => !hidden(unseen, message));
    if (messages.length && !shown.length) continue;
    const log = asArray(chat?.events);
    const shownLog = log.filter((entry) => !(entry?.kind === "message" && hidden(unseen, entry)));
    if (shown.length === messages.length && shownLog.length === log.length) {
      out.push(chat);
      continue;
    }
    out.push({ ...chat, messages: shown, ...(log.length ? { events: shownLog } : {}) });
  }
  return out;
};

// The agents' file as the player has been shown it: a copy stolen in an unseen
// event is not in it yet.
export const withoutUnseenIntercepts = (intercepts, unseen) => {
  if (!unseen?.size || !intercepts || typeof intercepts !== "object") return intercepts;
  let changed = false;
  const out = {};
  for (const [target, entry] of Object.entries(intercepts)) {
    const exchanges = asArray(entry?.exchanges);
    const shown = exchanges.filter((exchange) => !hidden(unseen, exchange));
    if (shown.length === exchanges.length) {
      out[target] = entry;
      continue;
    }
    changed = true;
    if (shown.length) out[target] = { ...entry, exchanges: shown };
  }
  return changed ? out : intercepts;
};

// Papers an unseen event created. The world as seen (gameState.js viewAsSeen)
// is built without them; this is for where only the finished file is at hand.
export const withoutUnseenReports = (reports, unseen) => (unseen?.size
  ? asArray(reports).filter((report) => !unseen.has(asText(report?.sourceEventId)))
  : reports);
