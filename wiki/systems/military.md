Armies in Open Historia are formations on the map with a type, a strength, a posture and an
owner. You do not move them by hand. You state what you want, the turn decides what happens, and
the engine carries the movement out over however many turns it takes.

## The way to use your army

Write it as an order. *"Reinforce the eastern border with two armoured divisions"*,
*"Launch an offensive toward Kharkiv"*, *"Withdraw the fleet to home ports"*. The time skip
resolves it, and after the skip the game moves units to match what the events say — armies
advance, retreat and take losses where the events say they did. (With **Save AI requests** on,
that is part of the one after-skip check; it can be turned off in Settings → AI.)

The model owns movement; you own intent. A place an order or event names — "toward Kyiv", "the
Suwałki gap" — is read as an objective and found on the actual map, and new units and structures
are placed by name and kept off one another.

Clicking a unit on the map gives you an **intelligence card** — what the formation is, whose it
is, roughly how strong, what it is made of, and what it appears to be doing. It is a briefing,
not a command panel.

Hands-on control does exist — the **Force Manager**, under **Military** in the
[cheats panel](/wiki/cheats/) — for deploying, inspecting, editing and repairing forces directly.
That placement is deliberate: editing your order of battle by hand is a game-master tool, not the
normal loop.

## Unit types

| Type | Glyph |
|---|---|
| Infantry | 🛡 |
| Armor | ⚙ |
| Air | ✈ |
| Naval | ⚓ |
| Artillery | 💥 |
| Garrison | 🏰 |

A scenario can restrict which types exist — there is no air force in 1200 AD — so the deploy
options you see depend on the world you are playing.

## Strength and composition

Strength is a **percentage of the formation's established strength**, 0–100: 78 means about three
quarters of what that formation should have. A new unit starts at 100. A separate
**composition** says what it actually is — *"1 aircraft carrier, 2 frigates"*.

| Strength | Colour |
|---|---|
| Above 60 | Green |
| 26 – 60 | Amber |
| 25 or below | Red |

Strength only changes where the events narrate casualties or reinforcement. A unit that reaches
zero is destroyed and removed. Saves from before the percentage scale are converted on load —
anything over 100 is divided by ten.

## Posture

What a formation is **doing**, as distinct from whether it is alive. Posture is what makes the map
readable at a glance: *massing* on a border and *on exercise* on the same border are the same
counter and a completely different message.

| Posture | |
|---|---|
| **Holding position** | In place. |
| **Massing** | Concentrating. |
| **Patrolling** | Working a station around a point. |
| **In transit** | On its way somewhere. |
| **On exercise** | Training, not threatening. |
| **Blockading** | Closing a sea or a port. |
| **Withdrawing** | Pulling back. |
| **Assaulting** | Attacking; arriving under this posture puts the unit in contact with the enemy. |

## Standing orders

A move that is further than the unit could cover in the time skipped becomes a **standing
order**, and the engine advances it every turn at the unit's pace until it arrives — within about
60 km of its destination. A patrol works its station, drifting to a new point each turn (the
same point every time you replay that turn, never at random). The map draws a heading line to a
destination and a ring around a patrol station, and counters glide between positions.

Sustained travel runs at a post-1945 baseline, scaled by era:

| Type | km/day |
|---|---|
| Garrison | 0 — it does not travel |
| Artillery | 35 |
| Infantry | 40 |
| Armor | 90 |
| Naval | 600 |
| Air | 2000 |

| Period | Factor |
|---|---|
| Before 1500 | ×0.35 |
| 1500 – 1849 | ×0.5 |
| 1850 – 1944 | ×0.75 |
| 1945 onward | ×1.0 |

So infantry in 1200 AD cover about 14 km a day. A march across a continent is a campaign, not a
turn.

A single order is also held to a **movement leash** — how far one order may relocate a unit before
it has to become a multi-turn campaign instead of a teleport:

| Type | km |
|---|---|
| Garrison | 200 |
| Infantry | 800 |
| Artillery | 800 |
| Armor | 1000 |
| Air | 3000 |
| Naval | 4000 |

multiplied by ×0.5 before 1500, ×0.7 to 1849, ×1.0 to 1944 and ×1.15 after.

## Other countries' forces

AI countries' formations respond to the military events a turn wrote: the engine reuses an
existing formation before raising a new one, holds each type to its era's leash, and only changes
strength where the events say so. The map holds at most **12** formations per AI country and
**80** in total; your own forces count against neither. With **Background AI** on, forces may
also reposition between turns.

Combat itself is narrated by the time skip and bound to the [war ledger](/wiki/war/): a battle
needs an active war with named sides, so fighting cannot quietly appear out of nowhere.

<p class="beta-note"><b>On beta, what the events raise reaches the map.</b> A ship commissioned or
a squadron formed in an event becomes a unit; a deployment or garrison the skip resolves joins
the order of battle; a unit's move is listed once, not twice; and a renamed country's counters
carry its flag.</p>

## Structures do not move borders

Bases, ports, airfields and other built markers have an owner — whoever *runs* the facility —
which is not the same as who owns the ground beneath it. Building a base in an ally's country
does not annex it. See [cities and structures](/wiki/cities/).

## Next

- [Territory](/wiki/territory/) — what winning actually transfers.
- [Giving orders](/wiki/orders/) — phrasing military instructions.
- [Cheats](/wiki/cheats/) — where the Force Manager lives.
