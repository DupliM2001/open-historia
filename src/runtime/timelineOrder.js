// Open Historia — timeline ordering: pure mechanical canonicalization for
// model-emitted event arrays.

import { compareGameDates, isGameDate } from "./gameDates.js";

const normalizeString = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// Any game date, BC included (runtime/gameDates.js); ordered by the calendar,
// never by the text.
const isRealIsoDate = (value) => isGameDate(value);

export const sortTimelineEventsChronologically = (candidate) => {
  if (!candidate || typeof candidate !== "object") return false;
  const events = Array.isArray(candidate?.events) ? candidate.events : [];
  if (events.length < 2) return false;

  const rows = events.map((event, index) => ({
    event,
    index,
    date: normalizeString(event?.date),
  }));
  if (rows.some((row) => !isRealIsoDate(row.date))) return false;

  const sorted = [...rows].sort((a, b) =>
    compareGameDates(a.date, b.date) || a.index - b.index
  );
  const changed = sorted.some((row, index) => row.index !== index);
  if (!changed) return false;

  candidate.events = sorted.map((row) => row.event);
  return true;
};
