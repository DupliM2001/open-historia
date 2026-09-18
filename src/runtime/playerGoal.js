/*! Open Historia — the player's standing goal © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run the tests: node --test src/runtime/playerGoal.test.js
//
// A standing goal is what the player's government is steering toward — "unify
// Italy by 1870", "keep out of the war and get rich" — set once in the Actions
// panel and kept until it is changed. Orders are what the player does this
// turn; the goal is the direction behind them.
//
// Who is told, and how (the reference treats a goal the same way: a guiding
// philosophy, not an action):
//   - the advisor, as the government's own aim: it weighs its advice by it and
//     says plainly when an order works against it;
//   - the time skip, as how the player's own ministers and officials conduct
//     the business the player's orders did not cover — never an order the
//     player did not give, never a thumb on the scale;
//   - the suggestions, as the direction they should serve.
// Never a foreign leader: a government's aims are its own secret.
//
// Kept in the world (`world.playerGoals`, keyed by the polity's name, so a
// rename carries it and a player who switches polity finds that polity's own),
// which rolls back with a turn like the orders do.
//
// Import-free: the rules on plain data, tested under bare node.

export const PLAYER_GOAL_MAX_CHARS = 600;

const asText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const fold = (value) => asText(value).toLowerCase();

export const normalizePlayerGoals = (value) => {
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [polity, entry] of Object.entries(value)) {
    const name = asText(polity);
    const text = asText(typeof entry === "string" ? entry : entry?.text).slice(0, PLAYER_GOAL_MAX_CHARS);
    if (!name || !text) continue;
    const round = Number(entry?.round);
    out[name] = {
      text,
      ...(Number.isFinite(round) && round > 0 ? { round } : {}),
      ...(asText(entry?.date) ? { date: asText(entry.date) } : {}),
    };
  }
  return out;
};

// The goal the player's polity is steering toward, or "".
export const playerGoalOf = (world, player) => {
  const goals = normalizePlayerGoals(world?.playerGoals);
  const key = Object.keys(goals).find((name) => fold(name) === fold(player));
  return key ? goals[key].text : "";
};

// The world with the player's goal set (or, with no text, cleared).
export const withPlayerGoal = (world, player, text, { round = 0, date = "" } = {}) => {
  const name = asText(player);
  if (!name) return world;
  const goals = normalizePlayerGoals(world?.playerGoals);
  const key = Object.keys(goals).find((existing) => fold(existing) === fold(name)) ?? name;
  const wording = asText(text).slice(0, PLAYER_GOAL_MAX_CHARS);
  const next = { ...goals };
  if (wording) next[key] = { text: wording, ...(round > 0 ? { round } : {}), ...(asText(date) ? { date: asText(date) } : {}) };
  else delete next[key];
  return { ...world, playerGoals: next };
};

// The advisor's directive: the government's aim, to advise toward.
export const describeGoalForAdvisor = (goal) => (asText(goal)
  ? "[Our Standing Goal]\n"
    + `The leader has set the government this standing goal: "${asText(goal)}". It is the direction behind every order. Weigh your advice by it, point out what brings it nearer, and say plainly — as a loyal adviser would — when an order works against it. Never pretend it is closer than it is.`
  : "");

// The time skip's directive: how the player's own government conducts what
// their orders did not address.
export const describeGoalForSimulation = (goal, player) => (asText(goal)
  ? "[The Player's Standing Goal]\n"
    + `${asText(player) || "The player"}'s government is steering toward: "${asText(goal)}". This is a guiding philosophy, not an order. Where the player's orders do not address a matter, the ministers and officials of the player's own government conduct routine business in its spirit. It never creates an action the player did not order, never decides anything in the player's name that the Player Agency rules reserve for them, and never makes success likelier: other powers do not know it, and the world answers what the player's government actually does.`
  : "");

// The suggestions' line: the direction they should serve.
export const describeGoalForSuggestions = (goal) => (asText(goal)
  ? `The player's standing goal is: "${asText(goal)}". Where they can, the suggestions should serve it — and one of them may say plainly what it would take.`
  : "");
