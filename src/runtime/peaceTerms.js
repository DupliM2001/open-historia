/*! Open Historia — peace: offers, terms and reparations © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// "A peace offer the player accepts or declines, with war weariness." "Also
// have war weariness, wars that end with terms and reparations."
//
// A war used to end when the story said so, and that was all an ending was.
// Now a war can end ON TERMS, and the game works them out; no model is asked.
//
// TERMS are two things:
//
//   the ground      "as held": each side keeps what it holds as the peace is
//                   made (what was taken is ceded); or "restored": every
//                   region goes back to whose it lawfully was (a white peace)
//   reparations     one side pays the other a share of its economy a year,
//                   for so many years (world.reparations); or nobody pays
//
// WHO OFFERS WHAT is read from how the war stands for the country offering
// (standingOf): the share of its own ground the enemy holds, the share of the
// enemy's it holds, and how weary each is (runtime/warWeariness.js).
//
//   it is losing     it offers to cede what it has lost and to pay: the worse
//                    it stands, the more and the longer
//   about even       a white peace: the old borders, nobody pays
//   it is winning    and weary all the same: it keeps what it holds, and
//                    asks nothing more
//
// AN OFFER (world.peaceOffers) is made by a country nobody plays to a country
// a person plays, once it is weary enough or is losing its own ground; the
// person accepts or declines. Declined, it is not made again for
// PEACE_COOLDOWN_ROUNDS. A person may also propose terms of their own, and a
// country nobody plays answers at once by how it stands (wouldAccept). Two
// countries nobody plays make peace between themselves the same way when one
// of them is spent.
//
// REPARATIONS are paid turn by turn out of the payer's economy: on the
// backend of its sheet (runtime/statsBackend.js) the payer's public debt
// rises by what it paid and the receiver's falls, so what each has to spend
// on its forces follows (runtime/militaryFunding.js).
//
// Pure, and loads in plain Node.

export const TERRITORY_AS_HELD = "as held";
export const TERRITORY_RESTORED = "restored";
export const PEACE_TERRITORIES = Object.freeze([TERRITORY_AS_HELD, TERRITORY_RESTORED]);
export const OFFER_STATUSES = Object.freeze(["open", "accepted", "declined", "lapsed"]);

// When a country nobody plays offers peace: it is this weary, or the enemy
// holds this share of its own ground and it holds none of theirs to speak of.
export const PEACE_OFFER_WEARINESS = 60;
export const PEACE_OFFER_GROUND_LOST = 0.25;
// Two countries nobody plays settle between themselves only when one is nearly spent (or is losing its ground).
export const PEACE_SETTLE_WEARINESS = 80;
// What a fresh country expects to better its standing by if it fights on, and
// a spent one to worsen it by: at half-weary it expects the war to end as it stands.
export const PEACE_HOPE = 0.2;
// How long a declined offer keeps its maker from offering again, in turns, and how long an open one stands.
export const PEACE_COOLDOWN_ROUNDS = 3;
export const PEACE_OFFER_STANDS_ROUNDS = 4;
// How far apart two sides' standings must be for one to be "losing".
export const STANDING_EVEN = 0.08;
// Reparations: the share of its GDP a year a beaten country pays at the worst, the least worth writing down, and for how long.
export const REPARATIONS_SHARE_MOST = 0.04;
export const REPARATIONS_SHARE_LEAST = 0.005;
export const REPARATIONS_YEARS_LEAST = 3;
export const REPARATIONS_YEARS_MOST = 12;
export const OFFERS_KEPT_MOST = 24;
export const REPARATIONS_KEPT_MOST = 24;

const clean = (value, most = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, most).trim();
const fold = (value) => clean(value).toLowerCase();
const list = (value) => (Array.isArray(value) ? value : []);
const within = (value, least, most) => Math.min(most, Math.max(least, value));
const figure = (value) => {
  const read = Number(value);
  return Number.isFinite(read) ? read : 0;
};
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

// ---- terms ----------------------------------------------------------------------------------

// Reparations as they are kept in terms: { payer, receiver, share, years } or null.
const normalizePayment = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const payer = clean(raw.payer);
  const receiver = clean(raw.receiver);
  const share = figure(raw.share);
  const years = Math.round(figure(raw.years));
  if (!payer || !receiver || fold(payer) === fold(receiver) || !(share >= REPARATIONS_SHARE_LEAST / 2) || !(years >= 1)) return null;
  return { payer, receiver, share: round(within(share, 0, 0.2), 4), years: Math.min(30, years) };
};

export const normalizeTerms = (raw) => ({
  territory: PEACE_TERRITORIES.includes(raw?.territory) ? raw.territory : TERRITORY_RESTORED,
  reparations: normalizePayment(raw?.reparations),
});

// How a war stands for one country against the other side, from -1 (it has
// lost everything and taken nothing) to 1 (the reverse).
//   lost     the share of its own ground the other side holds
//   taken    the share of the other side's ground it holds
export const standingOf = ({ lost = 0, taken = 0 } = {}) => within(figure(taken), 0, 1) - within(figure(lost), 0, 1);

// The terms a country would offer, by how the war stands for it.
//   offerer, receiver   who offers, and to whom
//   standing            standingOf for the offerer
//   weariness           the offerer's, 0 to 100
export const termsOffered = ({ offerer = "", receiver = "", standing = 0, weariness = 0 } = {}) => {
  const stands = within(figure(standing), -1, 1);
  if (stands > -STANDING_EVEN && stands < STANDING_EVEN) return normalizeTerms({ territory: TERRITORY_RESTORED });
  // Winning, and weary all the same: it keeps what it holds and asks nothing more.
  if (stands >= STANDING_EVEN) return normalizeTerms({ territory: TERRITORY_AS_HELD });
  // Losing: it cedes what it has lost, and pays; the worse it stands and the wearier it is, the more and the longer.
  const plight = within(-stands * 0.7 + (within(figure(weariness), 0, 100) / 100) * 0.3, 0, 1);
  const share = REPARATIONS_SHARE_MOST * plight;
  const years = Math.round(REPARATIONS_YEARS_LEAST + (REPARATIONS_YEARS_MOST - REPARATIONS_YEARS_LEAST) * plight);
  return normalizeTerms({
    territory: TERRITORY_AS_HELD,
    reparations: share >= REPARATIONS_SHARE_LEAST ? { payer: offerer, receiver, share, years } : null,
  });
};

// How good terms are for one country, from -1 to 1: what it keeps or gives up
// of the ground as the war stands for it, and what it is paid or pays.
//   standing   standingOf for that country
export const termsWorth = (terms, country, standing = 0) => {
  const read = normalizeTerms(terms);
  const ground = read.territory === TERRITORY_AS_HELD ? within(figure(standing), -1, 1) : 0;
  const payment = read.reparations;
  const paid = !payment ? 0 : (payment.share * payment.years) / (REPARATIONS_SHARE_MOST * REPARATIONS_YEARS_MOST);
  const money = !payment ? 0 : fold(payment.receiver) === fold(country) ? paid : fold(payment.payer) === fold(country) ? -paid : 0;
  return within(ground + 0.5 * money, -1, 1);
};

// Whether a country nobody plays takes the terms put to it: it does when they
// are no worse for it than what it expects of fighting on. A fresh country
// expects to better its standing (PEACE_HOPE), so it will not sign away ground
// it has lost, nor stop at what it has taken unless it is paid to; a
// half-weary one expects the war to end as it stands; a spent one expects
// worse, and takes worse.
//   standing    standingOf for the country answering
//   weariness   its own, 0 to 100
export const wouldAccept = ({ terms, country = "", standing = 0, weariness = 0 } = {}) => {
  const worth = termsWorth(terms, country, standing);
  const weary = within(figure(weariness), 0, 100) / 100;
  const hopes = within(figure(standing), -1, 1) + PEACE_HOPE * (1 - 2 * weary);
  return worth >= hopes - 1e-9;
};

// Terms in a line, for the story and for whoever reads the game.
export const describeTerms = (terms) => {
  const read = normalizeTerms(terms);
  const ground = read.territory === TERRITORY_AS_HELD ? "each side keeps the ground it holds" : "every region goes back to whose it was before the war";
  const payment = read.reparations;
  if (!payment) return `${ground}; nobody pays reparations`;
  return `${ground}; ${payment.payer} pays ${payment.receiver} reparations of ${round(payment.share * 100, 1)}% of its economy a year for ${payment.years} ${payment.years === 1 ? "year" : "years"}`;
};

// ---- offers ---------------------------------------------------------------------------------

// world.peaceOffers: { id, warId, from, to, terms, date, round, status, answeredRound? }
export const normalizePeaceOffer = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = clean(raw.id, 80);
  const warId = clean(raw.warId);
  const from = clean(raw.from);
  const to = clean(raw.to);
  if (!id || !warId || !from || !to || fold(from) === fold(to)) return null;
  const status = OFFER_STATUSES.includes(raw.status) ? raw.status : "open";
  const answered = Math.round(figure(raw.answeredRound));
  return {
    id,
    warId,
    from,
    to,
    terms: normalizeTerms(raw.terms),
    date: clean(raw.date, 40),
    round: Math.max(0, Math.round(figure(raw.round))),
    status,
    ...(status !== "open" && answered > 0 ? { answeredRound: answered } : {}),
  };
};

export const normalizePeaceOffers = (value) => {
  const kept = new Map();
  for (const raw of list(value)) {
    const offer = normalizePeaceOffer(raw);
    if (offer) kept.set(offer.id, offer);
  }
  return [...kept.values()].slice(-OFFERS_KEPT_MOST);
};

// The offers that wait for an answer from one country ("" for anybody's).
export const openOffersFor = (offers, country = "") => normalizePeaceOffers(offers).filter((offer) => offer.status === "open" && (!fold(country) || fold(offer.to) === fold(country)));

const sidesOf = (war) => [list(war?.sideA).map((name) => clean(name)).filter(Boolean), list(war?.sideB).map((name) => clean(name)).filter(Boolean)];
const active = (war) => fold(war?.status || "active") === "active";
const settleable = (war) => ["active", "ceasefire"].includes(fold(war?.status || "active"));

// The offers a turn brings: for every active war with a played country on one
// side and none on the other, the first country of the other side offers
// peace when it is weary enough or is losing its own ground, unless an offer
// of its own already stands or one was declined too lately. Offers whose war
// is over, or that have stood too long, lapse.
//   offers       world.peaceOffers as the turn ends
//   wars         the war ledger as the turn ends
//   players      the countries people play
//   wearinessOf  (name) => 0 to 100
//   groundOf     (warId, name) => { lost, taken } for that country in that war
//   round, date  the turn it now is
// Returns the list to keep.
export const withTurnPeaceOffers = (offers, { wars = [], players = [], wearinessOf = null, groundOf = null, round = 0, date = "" } = {}) => {
  const played = new Set(list(players).map(fold).filter(Boolean));
  const now = Math.max(0, Math.round(figure(round)));
  const warsById = new Map(list(wars).map((war) => [clean(war?.id), war]));
  const kept = normalizePeaceOffers(offers).map((offer) => {
    if (offer.status !== "open") return offer;
    const war = warsById.get(offer.warId);
    const stale = !war || !settleable(war) || now - offer.round >= PEACE_OFFER_STANDS_ROUNDS;
    return stale ? { ...offer, status: "lapsed", answeredRound: now } : offer;
  });
  const next = [...kept];
  for (const war of list(wars)) {
    const warId = clean(war?.id);
    if (!warId || !settleable(war)) continue;
    const sides = sidesOf(war);
    const has = sides.map((members) => members.some((member) => played.has(fold(member))));
    // (A war with people on both sides is theirs to end between themselves; one with none is settled below.)
    if (has[0] === has[1]) continue;
    const theirs = has[0] ? 1 : 0;
    const from = sides[theirs][0];
    const to = sides[1 - theirs].find((member) => played.has(fold(member)));
    if (!from || !to) continue;
    const mine = next.filter((offer) => offer.warId === warId && fold(offer.from) === fold(from));
    if (mine.some((offer) => offer.status === "open")) continue;
    if (mine.some((offer) => offer.status === "declined" && now - (offer.answeredRound ?? offer.round) < PEACE_COOLDOWN_ROUNDS)) continue;
    const weariness = typeof wearinessOf === "function" ? figure(wearinessOf(from)) : 0;
    const ground = typeof groundOf === "function" ? groundOf(warId, from) ?? {} : {};
    const standing = standingOf(ground);
    const losing = figure(ground.lost) >= PEACE_OFFER_GROUND_LOST && standing <= -STANDING_EVEN;
    if (!(weariness >= PEACE_OFFER_WEARINESS) && !losing) continue;
    next.push({ id: `peace:${warId}:${fold(from)}:${now}`, warId, from, to, terms: termsOffered({ offerer: from, receiver: to, standing, weariness }), date: clean(date, 40), round: now, status: "open" });
  }
  return normalizePeaceOffers(next);
};

// The wars two sides nobody plays end between themselves this turn: a side
// whose first country is nearly spent (PEACE_SETTLE_WEARINESS), or is losing
// its own ground, offers, and the other takes what wouldAccept says it would.
// Returns [{ warId, from, to, terms }].
export const settledBetweenOthers = ({ wars = [], players = [], wearinessOf = null, groundOf = null } = {}) => {
  const played = new Set(list(players).map(fold).filter(Boolean));
  const settled = [];
  for (const war of list(wars)) {
    const warId = clean(war?.id);
    if (!warId || !active(war)) continue;
    const sides = sidesOf(war);
    if (sides[0].length === 0 || sides[1].length === 0) continue;
    if (sides.some((members) => members.some((member) => played.has(fold(member))))) continue;
    for (const side of [0, 1]) {
      const from = sides[side][0];
      const to = sides[1 - side][0];
      const weariness = typeof wearinessOf === "function" ? figure(wearinessOf(from)) : 0;
      const ground = typeof groundOf === "function" ? groundOf(warId, from) ?? {} : {};
      const standing = standingOf(ground);
      const losing = figure(ground.lost) >= PEACE_OFFER_GROUND_LOST && standing <= -STANDING_EVEN;
      if (!(weariness >= PEACE_SETTLE_WEARINESS) && !losing) continue;
      const terms = termsOffered({ offerer: from, receiver: to, standing, weariness });
      const theirGround = typeof groundOf === "function" ? groundOf(warId, to) ?? {} : {};
      if (!wouldAccept({ terms, country: to, standing: standingOf(theirGround), weariness: typeof wearinessOf === "function" ? figure(wearinessOf(to)) : 0 })) continue;
      settled.push({ warId, from, to, terms });
      break;
    }
  }
  return settled;
};

// ---- reparations ----------------------------------------------------------------------------

// world.reparations: { id, warId, payer, receiver, share, since, days, paidDays }
//   share      of the payer's GDP, a year
//   days       how many days they run in all
//   paidDays   how many of those have been paid
export const normalizeReparation = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = clean(raw.id, 80);
  const payer = clean(raw.payer);
  const receiver = clean(raw.receiver);
  const share = figure(raw.share);
  const days = Math.round(figure(raw.days));
  if (!id || !payer || !receiver || fold(payer) === fold(receiver) || !(share > 0) || !(days > 0)) return null;
  const paidDays = within(Math.round(figure(raw.paidDays)), 0, days);
  return { id, warId: clean(raw.warId), payer, receiver, share: round(within(share, 0, 0.2), 4), since: clean(raw.since, 40), days, paidDays };
};

export const normalizeReparations = (value) => {
  const kept = new Map();
  for (const raw of list(value)) {
    const entry = normalizeReparation(raw);
    if (entry && entry.paidDays < entry.days) kept.set(entry.id, entry);
  }
  return [...kept.values()].slice(-REPARATIONS_KEPT_MOST);
};

// The reparations a peace begins: [] for terms with none.
export const reparationsOf = (terms, { warId = "", date = "" } = {}) => {
  const payment = normalizeTerms(terms).reparations;
  if (!payment) return [];
  return [{ id: `reparations:${clean(warId)}:${fold(payment.payer)}:${clean(date, 40)}`, warId: clean(warId), payer: payment.payer, receiver: payment.receiver, share: payment.share, since: clean(date, 40), days: payment.years * 365, paidDays: 0 }];
};

// What a period's reparations come to.
//   reparations   world.reparations as the period begins
//   days          how long the period was
//   gdpOf         (name) => its GDP, 0 where its economy is not known
// Returns { reparations, payments }: the list to keep, and what was paid:
// [{ payer, receiver, amount, share }], `share` being the part of the payer's
// GDP that left it (so many points of it are owed more, or owed less).
export const reparationsDue = (reparations, { days = 0, gdpOf = null } = {}) => {
  const span = Math.max(0, Math.round(figure(days)));
  const kept = [];
  const payments = [];
  for (const entry of normalizeReparations(reparations)) {
    const paying = Math.min(span, entry.days - entry.paidDays);
    if (paying > 0) {
      const gdp = typeof gdpOf === "function" ? figure(gdpOf(entry.payer)) : 0;
      const share = (entry.share * paying) / 365;
      // (A payer with no economy on its sheet pays in the story only: the days still count.)
      if (gdp > 0) payments.push({ payer: entry.payer, receiver: entry.receiver, amount: gdp * share, share });
    }
    const next = { ...entry, paidDays: entry.paidDays + paying };
    if (next.paidDays < next.days) kept.push(next);
  }
  return { reparations: kept, payments };
};

// Reparations in a line: who pays whom how much, and for how much longer.
export const describeReparation = (entry) => {
  const read = normalizeReparation(entry);
  if (!read) return "";
  const left = Math.max(0, read.days - read.paidDays);
  const years = left / 365;
  const span = years >= 1 ? `${round(years, 1)} more ${round(years, 1) === 1 ? "year" : "years"}` : `${Math.max(1, Math.round(left / 30))} more ${Math.round(left / 30) <= 1 ? "month" : "months"}`;
  return `${read.payer} pays ${read.receiver} ${round(read.share * 100, 1)}% of its economy a year in reparations, for ${span}`;
};

// ---- treaties -------------------------------------------------------------------------------

// world.peaceTreaties: the last peaces made on terms, for the story to tell and the game to show.
//   { id, warId, title, date, round, from, to, sides: [[names], [names]], terms, by }
//   by   how it came about: "offer" (a person took one), "proposal" (a person's
//        own terms were taken), "settled" (two countries nobody plays)
export const TREATIES_KEPT_MOST = 12;
export const TREATY_WAYS = Object.freeze(["offer", "proposal", "settled"]);
export const normalizePeaceTreaties = (value) => {
  const kept = new Map();
  for (const raw of list(value)) {
    const id = clean(raw?.id, 120);
    const warId = clean(raw?.warId);
    if (!id || !warId) continue;
    kept.set(id, {
      id,
      warId,
      title: clean(raw.title),
      date: clean(raw.date, 40),
      round: Math.max(0, Math.round(figure(raw.round))),
      from: clean(raw.from),
      to: clean(raw.to),
      sides: [0, 1].map((side) => list(raw.sides?.[side]).map((name) => clean(name)).filter(Boolean).slice(0, 12)),
      terms: normalizeTerms(raw.terms),
      by: TREATY_WAYS.includes(raw.by) ? raw.by : "offer",
    });
  }
  return [...kept.values()].slice(-TREATIES_KEPT_MOST);
};
