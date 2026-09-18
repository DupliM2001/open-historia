/*! Open Historia — what a conversation missed since its last message © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run the tests: node --test src/Game/AI/conversationCatchUp.test.js
//
// The advisor's system prompt is rebuilt from the present on every message, so
// it always knows how the world stands. What it cannot tell is which of that is
// NEW since the conversation last spoke: its own earlier replies sit in the
// turns undated, written before a month of events it has no way to tell apart
// from the ones it already discussed. So it answers a question about the front
// as though nothing had happened since, or re-proposes a plan the Game Master
// has just made moot.
//
// A catch-up note is the difference, carried on the player's next message:
// that time passed and how far, the newest few events since (titles only — the
// record itself is already in the prompt), and what the Game Master changed by
// hand (runtime/gmChanges.js). It is written once, stored on that message, and
// sent with it from then on, so a reloaded conversation reads exactly as the
// live one did. Nothing happened, no note: the message goes as the player
// typed it.
//
// Import-free, with the date comparison handed in: game dates can be BC, and
// only gameDates.js knows how to order those.

export const CATCH_UP_EVENTS_NAMED = 5;
export const CATCH_UP_CHANGES_NAMED = 6;
export const CATCH_UP_MAX_CHARS = 1400;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const array = (value) => (Array.isArray(value) ? value : []);
const defaultCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The events on the record after `fromDate` and up to `toDate`, oldest first.
export const eventsBetween = (events, fromDate, toDate, { compareDates = defaultCompare } = {}) => {
  const from = clean(fromDate);
  const to = clean(toDate);
  if (!from || !to) return [];
  return array(events)
    .filter((event) => {
      const date = clean(event?.date);
      return date && compareDates(date, from) > 0 && compareDates(date, to) <= 0 && clean(event?.title);
    })
    .sort((a, b) => compareDates(clean(a.date), clean(b.date)));
};

// { text, label }: the note the model is given, and the few words the player is
// shown in its place. Both empty when there is nothing to catch up on.
export const buildCatchUpNote = ({
  previousDate = "",
  currentDate = "",
  events = [],
  gmChanges = [],
  compareDates = defaultCompare,
  formatDate = (value) => value,
} = {}) => {
  const from = clean(previousDate);
  const to = clean(currentDate);
  const moved = Boolean(from && to && compareDates(to, from) > 0);
  const since = moved ? eventsBetween(events, from, to, { compareDates }) : [];
  const changes = array(gmChanges).map((entry) => clean(entry?.summary)).filter(Boolean);
  if (!moved && !changes.length) return { text: "", label: "" };

  const lines = [moved
    ? `[Since your last reply: ${clean(formatDate(from))} → ${clean(formatDate(to))}]`
    : "[Since your last reply]"];
  if (moved) {
    const named = since.slice(-CATCH_UP_EVENTS_NAMED)
      .map((event) => `"${clean(event.title)}" (${clean(formatDate(clean(event.date)))})`);
    lines.push(since.length
      ? `Time has passed. ${since.length} event${since.length === 1 ? " is" : "s are"} on the record since then${since.length > named.length ? ", the newest" : ""}: ${named.join("; ")}. What was said above was said before ${since.length === 1 ? "it" : "them"}; the briefing is current.`
      : "Time has passed, though nothing on the record happened in between. The briefing is current.");
  }
  if (changes.length) {
    const named = changes.slice(-CATCH_UP_CHANGES_NAMED);
    const more = changes.length - named.length;
    lines.push(`The Game Master also changed the world by hand — acts of authority, already in the briefing: ${named.join(" ")}${more > 0 ? ` (and ${more} more)` : ""}`);
  }

  let text = lines.join("\n");
  if (text.length > CATCH_UP_MAX_CHARS) text = `${text.slice(0, CATCH_UP_MAX_CHARS - 1).trimEnd()}…`;
  const label = [
    moved ? `Since ${clean(formatDate(from))}` : "",
    moved ? `${since.length} event${since.length === 1 ? "" : "s"}` : "",
    changes.length ? `${changes.length} change${changes.length === 1 ? "" : "s"} by the Game Master` : "",
  ].filter(Boolean).join(" · ");
  return { text, label };
};

// What the model is sent for one of the player's messages: the note, if the
// message carries one, ahead of what the player typed.
export const withCatchUp = (message, catchUp) => {
  const note = String(catchUp ?? "").trim();
  return note ? `${note}\n\n${String(message ?? "")}` : String(message ?? "");
};
