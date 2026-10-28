/*! Open Historia — war and peace on screen: an offer of peace, a call to arms, terms of one's own © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// "A peace offer the player accepts or declines, with war weariness." "Also
// have war weariness, wars that end with terms and reparations." "Alliances
// that pull members into wars, with broken treaties costing reputation."
//
// What the game itself decides of these is in AI/warAndPeace.js. This is what
// a player sees and answers:
//
//   WarAndPeaceCards   over the map, while something waits for the player: an
//                      offer of peace (Accept / Decline) and a call to arms
//                      from an ally that was attacked (Honour the alliance /
//                      Break the treaty). They stay until they are answered,
//                      and can be folded away to a small button.
//   PeaceControls      under each of the player's wars in the Stats pane's
//                      Diplomacy tab: how weary each side is, and Propose
//                      peace, which puts terms of the player's own to the
//                      other side. A country nobody plays answers at once.
//   ReparationsNote    in the same tab: who is paying whom, and for how long.
//
// An answer is the player's own country's and nobody else's. On a page that
// is playing a shared game it goes to the host as a request.

import React, { useState } from "react";
import { openCallsFor, TREATY_BROKEN_REPUTATION } from "../../runtime/alliances.js";
import { useIsMobile } from "../../runtime/useIsMobile.js";
import { TERRITORY_AS_HELD, TERRITORY_RESTORED, normalizeReparations, openOffersFor } from "../../runtime/peaceTerms.js";
import { useRuntimeState } from "../../runtime/useRuntimeState.js";
import { wearinessOf, wearinessWord } from "../../runtime/warWeariness.js";
import { inSharedGame, requestFromHost } from "../../multiplayer/client/sharedGameBridge.js";
import { answerDiplomacy } from "../AI/gameplayLazy.js";
import { TURN_RUNNING_NOTE, isSimulationBusy } from "../AI/simulationStatus.js";

const NONE = Object.freeze([]);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const fold = (value) => clean(value).toLowerCase();
const selectCountry = (game) => clean(game?.country);
const selectOffers = (world) => (Array.isArray(world?.peaceOffers) ? world.peaceOffers : NONE);
const selectCalls = (world) => (Array.isArray(world?.callsToArms) ? world.callsToArms : NONE);

// Why nothing was done, in the player's words.
const refusalText = (error) => {
  if (error === "not-open") return "This is no longer open.";
  if (error === "not-yours") return "This is not yours to answer.";
  if (error === "played") return "That side is led by another player: make peace with them in a chat.";
  if (error === "no-war") return "That war is over.";
  if (error === "not-in-war") return "You are not in that war.";
  return clean(error) || "That could not be done.";
};

// Sends one answer: to the host of a shared game, else to the game itself.
// Resolves { ok, error, accepted, to }.
const send = async (op, ref, terms = null) => {
  if (isSimulationBusy()) return { ok: false, error: TURN_RUNNING_NOTE, accepted: false, to: "" };
  try {
    if (inSharedGame()) {
      const answer = await requestFromHost("peace", { op, ref, terms: terms ?? {} });
      return { ok: answer.ok === true, error: answer.ok ? "" : clean(answer.error), accepted: answer.ok === true && op !== "decline" && op !== "refuse", to: "" };
    }
    return await answerDiplomacy({ op, ref, terms });
  } catch (error) {
    return { ok: false, error: clean(error?.message) || "That could not be done.", accepted: false, to: "" };
  }
};

// Terms in the player's words: the ground, then the money.
const TermsText = ({ terms }) => {
  const payment = terms?.reparations ?? null;
  const share = payment ? Math.round(payment.share * 1000) / 10 : 0;
  return (
    <>
      <div>{terms?.territory === TERRITORY_AS_HELD ? "Each side keeps the ground it holds." : "Every region goes back to whose it was before the war."}</div>
      <div>{payment ? `${payment.payer} pays ${payment.receiver} reparations: ${share}% of its economy a year for ${payment.years} years.` : "Nobody pays reparations."}</div>
    </>
  );
};

const cardStyle = {
  backgroundColor: "rgba(16,21,24,0.97)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
  color: "#e7e9ea",
  fontFamily: "sans-serif",
  fontSize: "0.76rem",
  lineHeight: 1.45,
  padding: "0.7rem 0.8rem",
};
const titleStyle = { color: "rgba(255,255,255,0.55)", fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" };
const buttonStyle = (primary) => ({
  backgroundColor: primary ? "#2bc1f3" : "rgba(255,255,255,0.06)",
  border: `1px solid ${primary ? "#2bc1f3" : "rgba(255,255,255,0.18)"}`,
  borderRadius: "8px",
  color: primary ? "#04141a" : "#e7e9ea",
  cursor: "pointer",
  flex: 1,
  fontSize: "0.72rem",
  fontWeight: 800,
  minHeight: "2.3rem",
  padding: "0.35rem 0.6rem",
});

// One thing waiting for the player, with its two answers.
const DecisionCard = ({ title, children, yes, no, onYes, onNo }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async (run) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const answer = await run();
    setBusy(false);
    if (!answer.ok) setError(refusalText(answer.error));
  };
  return (
    <div style={cardStyle} role="group">
      <div style={titleStyle}>{title}</div>
      <div style={{ marginTop: "0.3rem" }}>{children}</div>
      {error ? <div role="alert" style={{ color: "#fca5a5", marginTop: "0.4rem" }}>{error}</div> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
        <button type="button" className="oh-tap" disabled={busy} onClick={() => act(onYes)} style={buttonStyle(true)}>{yes}</button>
        <button type="button" className="oh-tap" disabled={busy} onClick={() => act(onNo)} style={buttonStyle(false)}>{no}</button>
      </div>
    </div>
  );
};

export const WarAndPeaceCards = () => {
  const country = useRuntimeState("game", selectCountry);
  const offers = useRuntimeState("world", selectOffers);
  const calls = useRuntimeState("world", selectCalls);
  const isMobile = useIsMobile();
  const [folded, setFolded] = useState(false);
  const mine = country ? openOffersFor(offers, country) : NONE;
  const called = country ? openCallsFor(calls, country) : NONE;
  const waiting = mine.length + called.length;
  if (waiting === 0) return null;
  const place = isMobile
    ? { left: "0.5rem", right: "0.5rem", top: "4.75rem" }
    : { right: "1rem", top: "4.5rem", width: "min(22rem, calc(100vw - 2rem))" };
  if (folded) {
    return (
      <button type="button" className="oh-tap" onClick={() => setFolded(false)} style={{ ...cardStyle, cursor: "pointer", fontWeight: 800, position: "fixed", zIndex: 9000, ...place, width: "auto", left: "auto" }}>
        {`Waiting for your answer: ${waiting}`}
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "calc(100vh - 9rem)", overflowY: "auto", position: "fixed", zIndex: 9000, ...place }}>
      <button type="button" className="oh-tap" onClick={() => setFolded(true)} style={{ alignSelf: "flex-end", background: "rgba(16,21,24,0.9)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "999px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "0.66rem", fontWeight: 700, padding: "0.2rem 0.6rem" }}>Fold away</button>
      {called.map((call) => (
        <DecisionCard
          key={call.id}
          title="Call to arms"
          yes="Honour the alliance"
          no="Break the treaty"
          onYes={() => send("honour", call.id)}
          onNo={() => send("refuse", call.id)}
        >
          <div>{`${call.defender} has been attacked by ${call.attackers.join(", ") || "an enemy"} and calls on you to defend it.`}</div>
          {call.via.title ? <div style={{ color: "rgba(255,255,255,0.6)" }}>{`You are bound by ${call.via.title}.`}</div> : null}
          <div style={{ color: "rgba(255,255,255,0.6)", marginTop: "0.25rem" }}>{`Honouring it puts you at war. Breaking the treaty costs ${TREATY_BROKEN_REPUTATION} of your reputation, and ends it. Left unanswered, it counts as broken.`}</div>
        </DecisionCard>
      ))}
      {mine.map((offer) => (
        <DecisionCard
          key={offer.id}
          title="Peace offered"
          yes="Accept"
          no="Decline"
          onYes={() => send("accept", offer.id)}
          onNo={() => send("decline", offer.id)}
        >
          <div>{`${offer.from} offers you peace.`}</div>
          <div style={{ color: "rgba(255,255,255,0.8)", marginTop: "0.25rem" }}><TermsText terms={offer.terms} /></div>
        </DecisionCard>
      ))}
    </div>
  );
};

// ---- in the Stats pane --------------------------------------------------------------------

const REPARATION_CHOICES = Object.freeze([
  { key: "none", label: "Nobody pays" },
  { key: "they-light", label: "They pay 1% a year for 5 years" },
  { key: "they-heavy", label: "They pay 3% a year for 10 years" },
  { key: "we-light", label: "We pay 1% a year for 5 years" },
  { key: "we-heavy", label: "We pay 3% a year for 10 years" },
]);
const paymentOf = (key, mine, theirs) => {
  if (key === "none") return null;
  const heavy = key.endsWith("heavy");
  const [payer, receiver] = key.startsWith("they") ? [theirs, mine] : [mine, theirs];
  return { payer, receiver, share: heavy ? 0.03 : 0.01, years: heavy ? 10 : 5 };
};

const smallButton = { background: "none", border: "none", color: "#2bc1f3", cursor: "pointer", display: "block", font: "inherit", fontSize: "0.61rem", fontWeight: 700, marginTop: "0.22rem", padding: 0, textAlign: "left" };
const fieldStyle = { backgroundColor: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "6px", color: "#e7e9ea", fontSize: "0.66rem", padding: "0.3rem 0.4rem", width: "100%" };

// Under one of a country's wars: how weary each side's first country is, and,
// where the war is the player's own and is being fought, terms of their own.
//   war      the war as the pane lists it ({ id, status, sideA, sideB })
//   world    the world
//   viewer   the player's country
const WearyWord = ({ value }) => {
  const word = wearinessWord(value);
  return word === "exhausted" ? <>exhausted</>
    : word === "war-weary" ? <>war-weary</>
      : word === "strained" ? <>strained</>
        : word === "uneasy" ? <>uneasy</>
          : null;
};

export const PeaceControls = ({ war, world, viewer }) => {
  const [open, setOpen] = useState(false);
  const [territory, setTerritory] = useState(TERRITORY_RESTORED);
  const [money, setMoney] = useState("none");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const sides = [Array.isArray(war?.sideA) ? war.sideA : NONE, Array.isArray(war?.sideB) ? war.sideB : NONE];
  const mine = sides.findIndex((members) => members.some((member) => fold(member) === fold(viewer)));
  const leads = [clean(sides[0][0]), clean(sides[1][0])].filter(Boolean);
  const theirs = mine >= 0 ? clean(sides[1 - mine][0]) : "";
  const own = mine >= 0 ? clean(sides[mine].find((member) => fold(member) === fold(viewer))) : "";
  const weary = (mine >= 0 ? [own, theirs].filter(Boolean) : leads)
    .map((name) => ({ name, value: Math.round(wearinessOf(world?.warWeariness, name)) }))
    .filter((entry) => entry.value > 0);
  const fought = ["active", "ceasefire"].includes(fold(war?.status || "active"));
  const propose = async () => {
    if (busy) return;
    setBusy(true);
    setSaid("");
    const answer = await send("propose", war.id, { territory, reparations: paymentOf(money, clean(viewer), theirs) });
    setBusy(false);
    if (answer.error) setSaid(refusalText(answer.error));
    else if (!answer.accepted) setSaid("They refuse these terms.");
    else setOpen(false);
  };
  return (
    <div style={{ marginTop: "0.25rem" }}>
      {weary.length > 0 ? (
        <div style={{ color: "rgba(255,255,255,0.58)", fontSize: "0.61rem" }}>
          <span>War weariness: </span>
          {weary.map((entry, at) => (
            <React.Fragment key={entry.name}>
              {at > 0 ? " · " : null}
              <span data-no-translate>{`${entry.name} ${entry.value}`}</span>
              {wearinessWord(entry.value) ? <> (<WearyWord value={entry.value} />)</> : null}
            </React.Fragment>
          ))}
        </div>
      ) : null}
      {mine >= 0 && fought && theirs ? (
        <button type="button" className="oh-tap-row" aria-expanded={open} onClick={() => setOpen((was) => !was)} style={smallButton}>Propose peace</button>
      ) : null}
      {open && mine >= 0 && fought ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.35rem" }}>
          <select aria-label="The ground" value={territory} onChange={(event) => setTerritory(event.target.value)} style={fieldStyle}>
            <option value={TERRITORY_RESTORED}>The old borders: every region goes back</option>
            <option value={TERRITORY_AS_HELD}>Each side keeps the ground it holds</option>
          </select>
          <select aria-label="Reparations" value={money} onChange={(event) => setMoney(event.target.value)} style={fieldStyle}>
            {REPARATION_CHOICES.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
          </select>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.6rem", lineHeight: 1.4 }}>They answer at once, by how the war stands for them and how weary they are. A fresh enemy that is not losing will refuse.</div>
          {said ? <div role="status" style={{ color: "#fca5a5", fontSize: "0.64rem" }}>{said}</div> : null}
          <button type="button" className="oh-tap" disabled={busy} onClick={propose} style={{ ...buttonStyle(true), flex: "none", minHeight: "2rem" }}>Put these terms</button>
        </div>
      ) : null}
    </div>
  );
};

// Who is paying a country reparations, and whom it pays.
export const ReparationsNote = ({ world, target }) => {
  const key = fold(target);
  const rows = normalizeReparations(world?.reparations).filter((entry) => fold(entry.payer) === key || fold(entry.receiver) === key);
  if (rows.length === 0) return null;
  return (
    <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.66rem", lineHeight: 1.45, marginTop: "0.55rem" }}>
      <div style={{ fontWeight: 800 }}>Reparations</div>
      {rows.map((entry) => {
        const years = Math.max(0, entry.days - entry.paidDays) / 365;
        return <div key={entry.id}>{`${entry.payer} pays ${entry.receiver} ${Math.round(entry.share * 1000) / 10}% of its economy a year, for ${Math.round(years * 10) / 10} more years.`}</div>;
      })}
    </div>
  );
};

export default WarAndPeaceCards;
