Who is at war with whom is not just a matter of what the events say. It is a matter of record:
four **ledgers** that the engine owns, validates and enforces.

The model does not write these directly. It emits compact updates, the engine checks them
against the rules, and folds the valid ones in once per turn. That is what stops the world
drifting into a state where two countries are simultaneously allied and at war.

## Wars

The war ledger is the **single authority on who is fighting whom**. Each war has a status:

| Status | |
|---|---|
| `active` | Being fought |
| `ceasefire` | Suspended, not settled |
| `ended` | Over |

Transitions are explicit and validated. A war can be **started**, **joined** on either side,
**left**, put into **ceasefire**, **resumed** from ceasefire, or **ended**. Illegal moves are
rejected outright — you cannot start a war that already exists, join a war that is not active,
resume one that is not in ceasefire, or end one that has already ended.

### Combat requires a war

This is the rule that makes the ledger worth having. **An event that narrates battlefield
combat must name an active canonical war and the countries fighting on each side.** Battles,
invasions, offensives, bombardments, active fronts and unit attacks all qualify. An offensive
that is plainly not military — diplomatic, economic, trade, legal, media, a charm or peace
offensive — does not, so a *"diplomatic offensive for sanctions relief"* is not mistaken for a
battle. A cyber offensive still counts as hostile.

An event describing a battle with no war behind it is rejected while the turn still has a retry
left, as is one pointing at a war that is in ceasefire or already over. On the final attempt the
turn is repaired rather than thrown away: a war record that still cannot be bound to an event is
dropped, along with the war bindings of its events, and the rest of the turn stands. The events
survive as narrative; only the canonical war change is lost, and it is written to the diagnostics
log.

The practical effect: fighting cannot quietly appear out of nowhere. Someone has to have started
a war, and the record says who and when — but a single unbindable record no longer costs you the
whole turn.

## Relations

One score per pair of countries, from **−100 to +100**, sorted into bands:

| Score | Band |
|---|---|
| 55 and above | **friendly** |
| 20 to 54 | **cordial** |
| −10 to 19 | **neutral** |
| −30 to −11 | **cautious** |
| −60 to −31 | **strained** |
| −89 to −61 | **hostile** |
| −90 and below | **rival** |

The band is always derived from the score rather than declared separately, which prevents the
world from claiming two countries are "cordial" while their score says otherwise.

A pair with no entry is **unknown**, which is not the same as neutral — it means these two
countries have no tracked relationship yet, not that they are indifferent to each other.

Relations move for concrete reasons rather than drifting. A ring of yours exposed publicly in
someone else's country sours that pair; so does breaking an agreement, and so does backing their
rival. The size of each move is the simulation's to decide — there is no fixed tariff per
offence. A score that contradicts a pair's declared status — "friendly" while at war — is
reconciled rather than left standing.

**The world is allowed to move against you.** Nothing spares the player: a foreign power may
start something with you, and when there is a fight both sides fight. What the simulation is
told not to do is **invent** a rivalry the record does not support — neighbours are not enemies
for sharing a border — and that applies to every pair of countries on the map, you included.

## Agreements

A register of what has actually been signed:

| Type | |
|---|---|
| `alliance` | Full alliance |
| `mutual_defense` | Defensive pact |
| `guarantee` | One-sided security guarantee |
| `non_aggression` | Non-aggression pact |
| `friendship_consultation` | Friendship and consultation treaty |
| `trade_economic` | Trade or economic agreement |
| `military_cooperation` | Military cooperation |
| `military_access` | Basing and transit rights |
| `neutrality` | Neutrality agreement |
| `peace_settlement` | The settlement ending a war |
| `other` | Anything else |

Each is `active`, `suspended`, `ended` or `expired`.

The register only holds what earlier turns recorded. If a turn tries to end, suspend or update an
agreement that was never recorded, the game re-aims it at the one recorded agreement with exactly
the same parties and type, if there is exactly one. Otherwise that single change is dropped, with
a note in the diagnostics log, and the rest of the turn stands. It would rather lose one change
than end the wrong treaty.

This is what turns "we agreed to an alliance in a conversation twelve turns ago" into something
the world still knows about and can be held to.

## Storylines

The fourth ledger, and the least visible: persistent world processes running underneath the
events. A storyline is a thing that is *developing* — a rivalry sharpening, an economy
unravelling, a succession crisis building.

Each carries a status (`active`, `dormant`, `resolved`), a **pressure** and **momentum** value
from 0 to 100, and a date at which it is next due attention. Every live war gets a mirrored
storyline. At most **96** are kept.

Storylines are why a campaign has continuity between turns that nothing in the event log
explains: something has been building for six turns and is now due.

**They are not allowed to stall.** An active war, or any storyline at pressure **55** or above,
that goes **45 days** of game time without a visible milestone has to move: link a real event,
change status, or shift pressure by at least 4 points or momentum by at least 6. If a time skip
leaves one stuck, the game makes a short repair call for it once the skip is done, with up to
**ten minutes** in total per skip. A repair that fails or runs out of time leaves the storyline
where it was and overdue for the next turn. It never costs you the turn itself.

## What this changes to play

- **Wars have a beginning.** You cannot drift into one; someone declared it, and the ledger
  says so.
- **Ceasefire is a real state.** It is not peace, and resuming from it is a distinct act.
- **Relations are legible.** You can see the number rather than inferring the mood.
- **Treaties persist properly.** An alliance signed in turn three still constrains people in
  turn thirty.
- **Old saves are migrated.** A campaign started before the ledgers existed has them seeded from
  its existing treaty events and conversations on the next jump.

## Puppets and overlords

<p class="beta-note"><b>Beta channel only.</b></p>

On beta a fifth ledger records who **directs** whom. A **puppet** is a country whose will is
directed by an **overlord** while it stays a separate country: it keeps its own territory, its own
sovereignty and its own colour. One puppet has one overlord; an overlord may hold many; and there
are no chains — making a country that holds puppets into a puppet hands its puppets to the new
overlord, permanently.

| Kind | What the overlord holds |
|---|---|
| **Protectorate** | Its foreign policy and defence; it governs itself at home. |
| **Puppet state** | Its government. It keeps the flag and the name; the decisions are the overlord's. |
| **Client state** | Its lead: it depends on the overlord's backing but makes most of its own decisions. |

An arrangement is either **open** — a published protectorate, a satellite every government knows
about — or **covert**. A covert puppet knows it is one and behaves accordingly with whoever in the
room has not found out. Other governments learn of a covert arrangement through an **active agent**
inside either party, and go on believing what they last learned until fresh reporting corrects
them. The country panel and the map card show what *you* know: the kind, one sentence on what it
means from your side, and chips for mood, since when, and open or covert.

**Loyalty** is how far a puppet accepts direction, 0–100. It is always hidden — even for an open
arrangement — and shown to the overlord only as a band: **Loyal** (75+), **Content**, **Restless**
or **Seething** (below 25). A puppet whose loyalty falls below 35 is given a hidden storyline
toward revolt; whether anything comes of it is the simulation's call, and a rising can be
suppressed as well as won — at a cost in standing. Annexing a puppet costs the overlord standing
too: 8 points of international reputation (out of 100) for a covert arrangement, 16 for one
the world could see.

**Demands.** In the one-on-one thread between an overlord and its puppet, a message can be a
**demand**. It appears as a card hanging off the message that made it. The puppet can
**Accept**, **Refuse**, or offer an **alternative** in its own words, which the overlord either
accepts or answers by demanding again. Only a refusal costs loyalty, charged once per turn; a
refusal can still be thought better of ("Accept after all"), and what has been agreed is final.
When you are the overlord, a toggle in the composer makes your message a demand. The cards are
choices, so answering one costs no request.

The [GM console](/wiki/cheats/) can make, reclassify or release a puppet directly. A scenario can
switch the whole system off with its **Puppet states** feature, and then nothing mentions
subordination at all.

## Next

- [Diplomacy](/wiki/diplomacy/) — the conversations these ledgers record the results of.
- [Military and combat](/wiki/military/) — the fighting a war authorises.
- [Territory](/wiki/territory/) — what a war moves.
