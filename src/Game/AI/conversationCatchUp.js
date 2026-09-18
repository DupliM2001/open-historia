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
//
// `replyProblems` is what went wrong with the advisor's own last reply — a chart
// that was not drawn, a block that half landed (GameUI/advisorBlocks.js
// describeReplyProblems). The panel already shows the player; this is the
// advisor's receipt, so it does not build on what never happened. The label
// leaves it out for that reason.
export const buildCatchUpNote = ({
  previousDate = "",
  currentDate = "",
  events = [],
  gmChanges = [],
  replyProblems = [],
  compareDates = defaultCompare,
  formatDate = (value) => value,
} = {}) => {
  const from = clean(previousDate);
  const to = clean(currentDate);
  const moved = Boolean(from && to && compareDates(to, from) > 0);
  const since = moved ? eventsBetween(events, from, to, { compareDates }) : [];
  const changes = array(gmChanges).map((entry) => clean(entry?.summary)).filter(Boolean);
  const problems = array(replyProblems).map(clean).filter(Boolean);
  if (!moved && !changes.length && !problems.length) return { text: "", label: "" };

  const lines = [moved
    ? `[Since your last reply: ${clean(formatDate(from))} → ${clean(formatDate(to))}]`
    : "[Since your last reply]"];
  if (problems.length) {
    lines.push(`What became of your last reply: ${problems.join("; ")}. Do not build on any of that as though it happened; if it still matters, send it again, corrected.`);
  }
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

// ---- A leader's catch-up (GameUI/chat.jsx) -----------------------------------
//
// A leader's thread has the advisor's blind spot: the world moves between two
// messages and the turns above say nothing of it, so a leader answers as though
// the border it complained of last month had not since moved. The note tells it
// what changed in public since the thread last spoke — the time, the newest
// events, the borders that moved, the polities renamed, founded or gone — and
// the votes cast in this conversation since its last turn. All of it is the
// public record or the thread itself: nothing a leader could not know.

export const CATCH_UP_BORDERS_NAMED = 6;

const regionLabel = (op) => clean(op?.regionName) || clean(op?.regionId);

// The borders those events moved, oldest first, in words.
export const bordersMovedIn = (events) => {
  const lines = [];
  for (const event of array(events)) {
    const impacts = event?.impacts ?? {};
    for (const transfer of array(impacts.regionTransfers)) {
      const to = clean(transfer?.toCode);
      const from = clean(transfer?.fromCode);
      if (to && regionLabel(transfer)) lines.push(`${regionLabel(transfer)} passed ${from ? `from ${from} ` : ""}to ${to}`);
    }
    for (const control of array(impacts.regionControlOps)) {
      const to = clean(control?.toCode);
      if (control?.op === "control" && to && regionLabel(control)) {
        lines.push(`${regionLabel(control)} came under ${to}'s control${clean(control?.fromCode) ? `, taken from ${clean(control.fromCode)}` : ""}`);
      }
    }
  }
  return lines;
};

// The polities those events renamed, founded or dissolved, in words.
export const politiesChangedIn = (events) => {
  const lines = [];
  for (const event of array(events)) {
    for (const change of array(event?.impacts?.polityChanges)) {
      const code = clean(change?.code);
      const name = clean(change?.name);
      if (change?.operation === "rename" && name && name !== code) lines.push(`${code} is now called ${name}`);
      else if (change?.operation === "create" && (name || code)) lines.push(`${name || code} came into being`);
      else if (change?.operation === "dissolve" && code) lines.push(`${code} ceased to exist`);
    }
  }
  return lines;
};

// { text, label }, like buildCatchUpNote. `votesSince` are sentences ("France
// voted "Accept" on "A ceasefire?"") the panel reads off the thread's log.
export const buildThreadCatchUp = ({
  previousDate = "",
  currentDate = "",
  events = [],
  votesSince = [],
  compareDates = defaultCompare,
  formatDate = (value) => value,
} = {}) => {
  const from = clean(previousDate);
  const to = clean(currentDate);
  const moved = Boolean(from && to && compareDates(to, from) > 0);
  const since = moved ? eventsBetween(events, from, to, { compareDates }) : [];
  const borders = bordersMovedIn(since);
  const polities = politiesChangedIn(since);
  const votes = array(votesSince).map(clean).filter(Boolean);
  if (!moved && !votes.length) return { text: "", label: "" };

  const lines = [moved
    ? `[Since this conversation last spoke: ${clean(formatDate(from))} → ${clean(formatDate(to))}]`
    : "[Since this conversation last spoke]"];
  if (moved) {
    const named = since.slice(-CATCH_UP_EVENTS_NAMED)
      .map((event) => `"${clean(event.title)}" (${clean(formatDate(clean(event.date)))})`);
    lines.push(since.length
      ? `Time has passed. ${since.length} event${since.length === 1 ? " is" : "s are"} on the public record since then${since.length > named.length ? ", the newest" : ""}: ${named.join("; ")}.`
      : "Time has passed, though nothing on the public record happened in between.");
  }
  if (borders.length) {
    const shown = borders.slice(-CATCH_UP_BORDERS_NAMED);
    lines.push(`Borders moved: ${shown.join("; ")}${borders.length > shown.length ? ` (and ${borders.length - shown.length} more)` : ""}.`);
  }
  if (polities.length) lines.push(`Among the polities: ${polities.join("; ")}.`);
  if (votes.length) lines.push(`Votes cast in this conversation since your last turn: ${votes.join("; ")}.`);
  lines.push("What was said above was said before this; speak from the world as it stands now.");

  let text = lines.join("\n");
  if (text.length > CATCH_UP_MAX_CHARS) text = `${text.slice(0, CATCH_UP_MAX_CHARS - 1).trimEnd()}…`;
  const label = [
    moved ? `Since ${clean(formatDate(from))}` : "",
    moved ? `${since.length} event${since.length === 1 ? "" : "s"}` : "",
    borders.length ? `${borders.length} border change${borders.length === 1 ? "" : "s"}` : "",
    votes.length ? `${votes.length} vote${votes.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");
  return { text, label };
};

// What the model is sent for one of the player's messages: the note, if the
// message carries one, ahead of what the player typed.
export const withCatchUp = (message, catchUp) => {
  const note = String(catchUp ?? "").trim();
  return note ? `${note}\n\n${String(message ?? "")}` : String(message ?? "");
};
