The **Cheats** panel is the game master's toolbox: seventeen tools for reaching into the world
and changing it by hand — including direct control of forces, which lives here rather than in the
normal interface.

Calling it "cheats" undersells it. Most of these are how you keep a long campaign on the rails
when the simulation drifts, or how you author a world deliberately.

Open it from the game menu: **☰ → Tools → Cheats**.

<p class="beta-note"><b>On beta there are nineteen.</b> <b>Groups</b> and <b>Puppet States</b> join
the Countries &amp; Territory tools; both are described below.</p>

![The game menu's Tools tab](/wiki/img/game-menu-tools.jpg)
*Cheats, the events timeline and the AI debug console, one click from the game menu.*

![The cheats panel](/wiki/img/cheats-tools.jpg)
*The tools, grouped: GM & History, Countries & Territory, Military, Simulation and Map. The GM Console is the one to reach for first.*

## GM Console

The most useful tool on the list. Describe a change in plain English and the AI plans it as a
structured transaction — territory, countries, units, structures, wars, relations, agreements,
storylines — and **every operation is previewed** before anything happens. **Apply** commits
exactly that preview, with an audit record, and rolls back if the write fails. A change that
would not land is refused with the reason, rather than quietly doing nothing.

> *"Hungary leaves the alliance and signs a non-aggression pact with Serbia. Their relationship
> with Vienna sours."*

Pick a mode first:

| Mode | For |
|---|---|
| **Direct / OOC correction** | Exact edits with the smallest possible scope, such as setting a country's population, with no timeline event |
| **Exact Event** | One timeline event, written as you describe it, with everything it establishes |
| **World Intervention** | A coherent change of several events across territory, countries, wars, diplomacy, forces and statistics |

Apply makes no second AI request, checks the live world again just before it writes, and never
advances the date or the round.

It works because it goes through the same machinery events do, so whatever it does is a
legitimate world state rather than a hand-edited file.

Use it when something has gone wrong that no single tool fixes, or when you want to steer the
narrative rather than wait for the simulation to get there.

<p class="beta-note"><b>On beta the preview lists every kind of change</b> a transaction holds,
governments and parties, groups, institutions and puppet states among them, so nothing it would
do is left out of what you approve.</p>

## The next skip is told

Every change made with these tools — a country annexed, a border redrawn, figures set by hand, an
event written, the history document rewritten, a turn rolled back — is recorded as one line, and
the next time skip opens with them: *changes made outside the simulation since your last turn*.
They are canon, acts of authority rather than events, not to be undone or written up again. The
advisor's catch-up note carries them too. None of it costs a request.

## Simulation Reminders

Standing facts every AI in the game is told until you withdraw them — *"the Kerch bridge is
down"*. A short, dated list; every prompt that writes the world or speaks for a country ends with
it, the advisor and every leader included. Edit or withdraw one here; withdrawing one is itself a
change, so the next skip is told the fact no longer holds. Every AI sees every reminder, so a
secret does not belong here.

## Turn and campaign control

**Roll Back Turn** restores the world to the start of any earlier turn, discarding everything
after it. Broader than the **Undo** in the time panel, which only steps back one turn at a time.

**Play As Country** switches which country you play. You can hand yourself a different nation
mid-campaign, or follow a war from the other side.

## Territory

**Annex Country** — click a country on the map and all of its regions fold into a target.

**Annex Regions** — click regions one at a time to transfer them individually.

Both enter a click-capture mode: map clicks go to the tool instead of opening the usual popups,
and the panel gets out of the way until you are done.

**Region Inspector** shows any region's controller, sovereign and claimants, and how each came to
be — and lets you edit control and make legal transfers. See [territory](/wiki/territory/).

## Countries

**Country Editor** opens a country: its name and colour and, once it has a stat sheet, the sheet
itself — population, GDP, capital, currency, stability, inflation, unemployment, debt, budget
balance, the strategic indices with international reputation among them, and the GDP sector
split. Pick the country on the map, or from the list. Useful when the simulation has drifted a
country somewhere you do not want it, or when you want to write a country's character
deliberately. Tags are not edited here: the GM console changes them, and a scenario's starting
tags are set in the [map editor](/wiki/editor/).

<p class="beta-note"><b>On beta the Country Editor also holds the country's Political World</b>:
its government and political system, its strategic outlook (goals, fears, ambitions, pressures),
its parties and power blocs, and its political traits.</p>

**Add Country** creates a new one from nothing: a name and a colour. It holds no land until you
give it some with **Annex Country** or **Annex Regions**, and a name already in use is refused —
changing an existing country is the Country Editor's job.

Both work on any country, not just yours. See [countries and identity](/wiki/countries/).

<p class="beta-note"><b>Groups</b> (beta) lists the game's <a href="/wiki/territory/#groups">groups</a>
and how many regions each controls. <b>New group</b> takes a name, what it is — which the AI is
told — and a tint colour; <b>Edit the area on the map</b> then puts each region you click under
the group, or takes it out again. <b>Clear the whole area</b> and <b>Erase group</b> (click twice)
undo it. The tool is hidden while groups are switched off for the game.</p>

<p class="beta-note"><b>Puppet States</b> (beta) is the ledger of who answers to whom, by hand and
at no AI request: each <a href="/wiki/war/#puppets-and-overlords">puppet</a> with its overlord,
its kind (protectorate, puppet state or client state), whether it is covert or openly known, and
its loyalty. <b>New puppet state</b> picks the overlord, the puppet, the kind, whether it is
known and the loyalty; set loyalty below 35 and the panel warns that the puppet starts plotting
against its overlord. A live arrangement can be edited, made public if it is covert, released,
or annexed, which ends it and hands all of the puppet's land to its overlord; releasing and
annexing each want a second click. Ended arrangements are kept in a list below.</p>

## Map features

**Map Feature Editor** and **Add Map Feature** work on cities and structures — position, name,
population, kind, owner, status. Place cities, HQs, landmarks, ports and other features. The
editor keeps two lists, **World features** and **Scenario cities**.

**Clear Map Features** removes accumulated markers that have stopped mattering — long campaigns
build up a lot of them — and can delete a scenario's own cities, or switch the scenario back to
the standard world cities.

In a scenario with its own city list, a city you add joins that list with its population and
tier. The stock world cities cannot be changed in play, so in a scenario that uses them a new city
is added as a world feature instead, without a population or tier.

<p class="beta-note"><b>On beta</b>, setting the population of a city whose scenario gives it by
year makes your figure the city's population from then on. See
<a href="/wiki/cities/">cities and structures</a>.</p>

## Events and history

The **Event Editor** searches, creates, edits and deletes canonical events. An event you write
can quote people, carry metadata, and optionally draw an NPC reaction after a 12-second undo
window.

This is the tool for repairing history. If a turn produced an event that contradicts everything
before it, you can rewrite it rather than rolling back and re-rolling the whole turn. You can
also author events outright, which is how you run a scripted campaign.

Because events carry the world changes, editing one is editing history in both senses.

**Interactive Event** plays any event on the record out as a scene, the way a time skip offers one
now and then. See [interactive events](/wiki/events/#interactive-events).

**History Document** is the living account of the campaign the AI is shown in place of older
events. Read it, and edit it — anything you write there is what the next skip believes about the
past. The timeline itself keeps every event. See
[what the world remembers](/wiki/events/#what-the-world-remembers).

## Forces

**Force Manager** opens the Forces panel: deploy, inspect, edit and repair forces on the map —
type, strength and composition. See [military and combat](/wiki/military/).

It is filed here deliberately. In normal play you order a military outcome and the world carries
it out; placing divisions by hand is a game-master act.

<p class="beta-note"><b>On beta</b>, troops fighting on a battlefield are commanded in normal play
too, from the War Room, whose button appears while your troops are on one. The Force Manager is
still where the map's units are placed and edited by hand.</p>

## Difficulty

**Difficulty** changes the level after the fact. See [starting a game](/wiki/new-game/) for what
each level does.

<p class="beta-note"><b>On beta, difficulty decides how things tend to go for you.</b> On the easy
levels your orders usually succeed and luck breaks your way; on Medium the world is realistic; on
the hard levels your orders fall short and luck breaks against you. On battlefields it is also a
stated handicap: above Medium the armies fighting you fight harder, advance faster and are
reinforced more, and below it they are the ones held back. The change applies from the next AI
decision.</p>

## Should you use any of this?

Yes. A game of your own has no score and nobody to cheat against. The tools exist
because an AI-driven world sometimes produces something incoherent, and the alternative to
fixing it is abandoning the campaign.

The one habit worth keeping: **prefer the GM console over the direct editors** where both would
work. Describing what happened produces a world that hangs together, including the knock-on
consequences. Hand-editing a border produces a border that moved for no reason anyone in the
world can remember.

## Next

- [Events and history](/wiki/events/) — what you are editing.
- [Saves and rollback](/wiki/saves/) — the safer undo.
- [The map editor](/wiki/editor/) — for changing the world itself rather than a campaign.
