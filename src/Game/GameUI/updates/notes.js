/*! Open Historia — what each update brings, as the notice behind the vault door tells it © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// "because the vault door only appears after updates by default now, behind it
// there should be a notice pupup thing announcing the new update and what it
// adds (for minor updates it can be very bland, for major updates it must be
// beautiful, complex and decorated)"; "it should also be custom themed for
// each major update. make it easy to add a custom detailed update thing (and
// animated at times) so its not a hassel to add in the future"; "not every
// update will be in the war theme, there will be a very complex variety. make
// it so it also supports multiple update banners that you can click next
// arrows to see the others if multiple major things are done at once" (the
// owner, 2026-10-15).
//
// EVERY CHANGE PLAYERS WILL NOTICE SHIPS WITH ITS NOTICE HERE, written by
// whoever makes it, unprompted (AGENTS.md; the full guide, with examples:
// docs/update-notices.md).
//
// HOW TO ADD AN UPDATE'S NOTICE
//
//   1. Put an update at the TOP of NEW_UPDATES below (newest first), with an `id`
//      that is new and never reused. A device is shown each update once
//      (updateNotices.js); one that missed several is shown all it missed.
//   2. Give it one BANNER or several: several are paged with arrows (one for
//      each big thing the update does). A banner is the words of one page.
//   3. A MINOR update's banner: a title and a few `items`. It is shown as a
//      plain card (UpdateNotice.jsx MinorBanner); nothing else is needed.
//   4. A MAJOR update's banner: a title, a `lead`, `sections` of items. With no
//      `theme` it is shown in the decorated default (DefaultBanner), coloured
//      by its `palette`. With a `theme`, by that theme's own component: copy
//      themes/ThemeTemplate.jsx to themes/<Name>.jsx, name it in
//      themes/index.js with its chrome (how the arrows, markers, Skip and the
//      button between its pages look), and build it from the kit
//      (updateKit.jsx). A theme may
//      draw several kinds of page, told apart by the banner's `scene`. A theme
//      is loaded only when one of its banners is shown.
//   5. To look at it while making it, open the game with
//      ?updateNotice=<the update's id> (or ?updateNotice=latest): it is shown
//      at once, door or no door, and not remembered as seen.
//
// The words are the player's: plain, and what the update does for them. They
// go into the interface catalog with every other string (public/lang).
//
//   update   { id, kind: "major" | "minor", date: "YYYY-MM-DD", channel?: "alpha" | "beta", banners: [banner] }
//   banner   { title, subtitle?, lead?, theme?, scene?,
//              palette?: { accent, ink, soft, ground, card, buttonInk },
//              items?: [text],                          (a minor update's lines)
//              sections?: [{ heading, icon, items: [text] }],
//              button? }                                (on the last banner: closes)
// `icon` is one of updateKit.jsx ICONS.

import { PAST_UPDATES } from "./notesPast.js";

// The updates since the notice existed, newest first (new ones at the top); with the past (notesPast.js) they
// make UPDATES, newest first by date.
const NEW_UPDATES = [
  {
    id: "2026-10-games-and-groups",
    kind: "minor",
    date: "2026-10-17",
    banners: [
      {
        title: "Games, groups and the map editor",
        items: [
          "Archiving or deleting the game you have open takes you back to the menu, an archived game can be deleted from its card, emptying Recently deleted works everywhere, and a diplomacy message's copy button stays while you reach for it. In the Actions tab, the suggested actions and your own open one at a time. Your own Agent can be OpenCode as well.",
          "Create a faction is now part of Play as a group, and choosing a group's area shows the country picker's map.",
          "The map follows the story: a country that replaces another takes its land, an annexation you order reaches the map when the turn tells it, a war under an armistice can still be settled, and a war fought overseas opens a battlefield where your troops stand on the enemy's land.",
          "The map editor is laid out anew in the menus' style, with its sidebar on the right or the left, quicker tools, smooth zooming even on very detailed maps, pasted regions kept to the map's own detail, a Simplify button, and fewer notes in the way.",
          "The Community tab can show only the scenarios that begin between two dates, and publishing says when a scenario's file is too large for GitHub.",
          "Modern Day is played on the real world's provinces again, and campaigns begun on the hand-drawn map keep it as Modern Day (classic map); the Northern Forests climate zone is redrawn.",
        ],
      },
    ],
  },
  {
    id: "2026-10-country-picker-cards",
    kind: "minor",
    date: "2026-10-17",
    banners: [
      {
        title: "A bigger country picker",
        items: [
          "Choosing a country opens a larger picker: the map beside a list of the countries you can play.",
          "Each country in the list shows its flag where one is known, and its colour on the map.",
          "The map and the list use the scenario's own country colours.",
          "Scenario cards show their cover whole, with the name and description below it.",
          "Community cards line up, with their counts and buttons on one line at the bottom.",
        ],
      },
    ],
  },
  {
    // "make it so you can also deploy "armies" which are just groups of troops not arranged in a front", "a group
    // should also be run by a single general. using the deploy tool should give the option to do a front or swarm",
    // "troops should move independantly like they do in fronts", "JUST MAKE IT DEPLOY IN A GROUPED FORMATION TO
    // START. what happens after they are deployed is UP TO THE ENGINE AND THE PLAYERS ORDERS" (the owner, 2026-10-16).
    id: "2026-10-swarms",
    kind: "major",
    date: "2026-10-16",
    banners: [
      {
        theme: "swarms",
        title: "Swarms",
        subtitle: "Armies before there were fronts",
        lead: "Fronts have not always existed. Troops can now be deployed as a swarm: grouped together at one place under a general of their own, instead of strung along the border.",
        sections: [
          {
            heading: "A front or a swarm",
            icon: "flag",
            items: [
              "In the War Room the Deploy tool asks which: draw a line for a front, or click a place for a swarm.",
              "Your levies, drafts and reinforcements come in there grouped together, and join the swarm while it is near; once it has marched on, the next ones come in as a new swarm.",
            ],
          },
          {
            heading: "One general",
            icon: "people",
            items: [
              "Every swarm comes under a general of its own, who commands it as any general does: talk to him, light up his troops or pick them out.",
            ],
          },
          {
            heading: "Fought like any troops",
            icon: "swords",
            items: [
              "Once deployed, a swarm's troops are troops like any other: they move and fight one by one, as your orders and the battle decide.",
            ],
          },
          {
            heading: "Through the ages",
            icon: "book",
            items: [
              "In games set before 1900 a war's troops come as swarms; from 1900 on, along fronts.",
              "Scenario designers choose how their scenario's wars are fought, and how each side of a front it begins with is deployed.",
            ],
          },
          {
            heading: "The vault door",
            icon: "gear",
            items: [
              "The vault door now always opens the first game after an update. Its one setting, Every time the game opens, shows it at every start.",
              "The Economy tab opens again for every country: it no longer stops on a stat sheet error.",
            ],
          },
          {
            heading: "Military power",
            icon: "chess",
            items: [
              "Your military figures now change with what you do: training, new weapons, a bigger defence budget and a larger army raise them over the years, and losses and cuts lower them.",
            ],
          },
        ],
        button: "To the field",
      },
    ],
  },
  {
    // Beta's PR #884 (Briekdr), and alpha's last two, brought into the lab on 2026-10-15. A minor update
    // ("diplomatic map should be marked a minor update", the owner).
    id: "2026-10-diplomatic-map",
    kind: "minor",
    date: "2026-10-16",
    banners: [
      {
        title: "The Diplomatic Map",
        items: [
          "Switch the map between Political and Diplomatic at the bottom right, under the advisor's button, or in Settings, Map: every country, and the ground taken on a battlefield, takes the colour of where it stands with you.",
          "A legend beside the switch says what each colour means.",
          "Each time the game opens, the map starts on Political.",
          "Settings has a Sound page for the music, its volume and the sound effects.",
          "Dragging the map glides more smoothly, and the map no longer stays stuck on loading when a tile server stalls.",
          "Your AI key can be shown or hidden as you type it.",
          "In a shared game, a guest's institution business no longer takes the host's own threads with it.",
        ],
      },
    ],
  },
  {
    id: "2026-10-wars-and-fronts-2",
    kind: "major",
    date: "2026-10-16",
    banners: [
      {
        theme: "warsAndFronts2",
        scene: "front",
        title: "Wars and Fronts",
        subtitle: "Part Two",
        lead: "Wars are fought by troops who tire, dig in and run short, under skies that turn, against a commander who thinks days ahead.",
        sections: [
          {
            heading: "Troops of flesh and steel",
            icon: "swords",
            items: [
              "Troops tire as they march and fight, and recover at rest.",
              "Armies muster over weeks, along a curve the scenario sets.",
              "Each country fights with its own quality, technology, arms and mix of units.",
              "Every country is rated against every other: how well it fights, its army, navy and air force, what its forces have to spend, and its people. Its strength comes from these, never from how much land it holds.",
              "Scenario designers rate every country at once, twenty to a request, and the ratings ship with the scenario. A country left out is rated when the game first needs it.",
              "Ground on a battlefield changes hands only where troops take it.",
            ],
          },
          {
            heading: "Walls and supplies",
            icon: "wall",
            items: [
              "Fortified lines must be broken through, and take time to build.",
              "War resources pay for fortifications, and your economy refills them.",
              "Harsh winters wear down every army caught out in them.",
            ],
          },
          {
            heading: "In the air and at sea",
            icon: "plane",
            items: [
              "Every country at war flies its air arm over its battlefields, to support its troops, strike the enemy's, or stay grounded.",
              "You can see each side's aircraft circling over the battlefields.",
              "Command your fleets: patrol, blockade, escort or seek battle.",
            ],
          },
          {
            heading: "The War Room",
            icon: "flag",
            items: [
              "Fortify: draw a line to be built and choose how strong.",
              "Deploy: draw where your reinforcements come in.",
              "Fleets: give your ships their stations and orders.",
              "Supply: see which of your ground is stretched or cut off, and which of theirs is cut off.",
              "Rehearse the next week: see where the front would be with your orders as they stand.",
              "Weather ahead: the next two weeks of weather, to time an offensive by.",
            ],
          },
        ],
      },
      {
        theme: "warsAndFronts2",
        scene: "commander",
        title: "A Commander Worth Fearing",
        subtitle: "It thinks days ahead",
        lead: "The countries you fight no longer follow a script. They plan.",
        sections: [
          {
            heading: "It looks ahead",
            icon: "chess",
            items: [
              "Like a chess engine, it rehearses a dozen plans days ahead on a copy of the battle and chooses the best.",
              "It weighs ground, towns, capitals, its strength, its supply, and troops nearly cut off.",
            ],
          },
          {
            heading: "Trained to win",
            icon: "star",
            items: [
              "Trained in thousands of fair duels on random battlefields, it beats every simple habit, from always attacking to always digging in.",
              "A deep thrust into its land is answered with a counter-offensive.",
              "It thinks away from the page, so the map stays smooth while it does, and on a computer it thinks the next turn through while you read.",
              "On a computer with several cores it weighs its plans on all of them at once, so war turns go faster.",
            ],
          },
          {
            heading: "Scripted wars",
            icon: "flag",
            items: [
              "Scenario designers can script a war to be lost: that side is led by a plainer commander, and good play can still turn it.",
              "The difficulty sets who you face: a plainer commander on the easy levels, one that weighs how you are likely to answer on the hard ones.",
            ],
          },
          {
            heading: "Know your enemy",
            icon: "eye",
            items: [
              "An agent in one of their countries finds out what their staff plans, and your aircraft see where it sends its troops.",
              "When a war ends, an after-action report tells its turning points, and stays to be read again.",
            ],
          },
        ],
        button: "To the front",
      },
    ],
  },
  {
    // An update of its own, with its own look: "have the weather update have its own custom major update post rather
    // than being on the main wars and fronts post" (the owner, 2026-10-16).
    id: "2026-10-seasons-and-weather",
    kind: "major",
    date: "2026-10-16",
    banners: [
      {
        theme: "seasonsAndWeather",
        title: "Seasons and Weather",
        subtitle: "The ground fights back",
        lead: "The world has climates now. Every front lives through its seasons, and the weather decides as much as the generals do.",
        sections: [
          {
            heading: "Climate zones",
            icon: "map",
            items: [
              "Seasons and weather follow climate zones drawn across the world: the real world's on the built-in maps, or a scenario's own.",
              "Clear skies are the commonest weather of all.",
            ],
          },
          {
            heading: "Weather that fights",
            icon: "rain",
            items: [
              "Rain, storms, mud, snow, blizzards, frost, heat and fog slow armies, blunt attacks and wear troops down.",
              "The weather is drawn on the map in each zone's own shape, at every zoom; Settings has a switch for it.",
              "Your advisor knows the season and the weather.",
            ],
          },
          {
            heading: "Ice and ground",
            icon: "snow",
            items: [
              "Lakes and seas can freeze hard enough to cross, and thaw under those still on them.",
              "Rough ground slows an advance.",
            ],
          },
        ],
        button: "Into the weather",
      },
    ],
  },
  {
    // Released before there was a notice to tell of it: "even though its already been released, make a banner for
    // the music update with large floating musical notes that are interactive and music themed" (the owner).
    id: "2026-10-music",
    kind: "major",
    date: "2026-10-13",
    banners: [
      {
        theme: "music",
        title: "The Music",
        subtitle: "A score for every campaign",
        lead: "Open Historia has a soundtrack now, music by Scott Buckley that follows you from the menu to the battlefield.",
        sections: [
          {
            heading: "From the menu to the front",
            icon: "note",
            items: [
              "The menu plays Passage Of Time and Clear Skies, taking turns each visit.",
              "Opening a game swells into the piece's own dramatic build, timed to land as the map appears.",
              "The War Room and the battlefields play Legionnaire and Vanguard.",
            ],
          },
          {
            heading: "Music for scenarios",
            icon: "book",
            items: [
              "Scenario designers choose tracks for loading, for play, for war and for battle from the community hub's music.",
              "A track you already have is never downloaded twice.",
            ],
          },
          {
            heading: "Yours to control",
            icon: "gear",
            items: [
              "Settings show what is playing and who made it.",
              "Sound effects, the vault door's among them, can be turned off.",
            ],
          },
        ],
        button: "Play on",
      },
    ],
  },
];

// Newest first (an update of the same day keeps its place).
const newestFirst = (list) => Object.freeze(list
  .map((update, index) => ({ update, index }))
  .sort((a, b) => (a.update.date < b.update.date ? 1 : a.update.date > b.update.date ? -1 : a.index - b.index))
  .map(({ update }) => update));
// Every update, for the history.
export const UPDATES = newestFirst([...NEW_UPDATES, ...PAST_UPDATES]);
// The updates a device may be shown behind the door: those written as notices, never the history from before
// notices existed (notesPast.js). "make sure people ONLY see the update popup things for the updates that are
// actually being added (plus the music one), not for every update in the history" (the owner, 2026-10-16).
export const NOTICE_UPDATES = newestFirst(NEW_UPDATES);
