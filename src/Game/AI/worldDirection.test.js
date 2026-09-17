/*! Open Historia — world direction: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/AI/worldDirection.test.js
//
// Runs without node_modules: worldDirection.js imports nothing.
//
// These are an author's settings, so the promise is to the author: the number
// they set is the number the engine uses. And to the player: none of it may
// cost a request — a skip that falls short is kept and the model is told, never
// asked again.

import test from "node:test";
import assert from "node:assert/strict";

import {
    PRIORITY_RULES_HEADING,
    WORLD_SHARE_MIN_EVENTS,
    buildWorldDirectionDirective,
    eventConcernsPlayer,
    scaleEventRange,
    worldShareShortfall,
} from "./worldDirection.js";

test("pace scales what a period is asked for, and 100 changes nothing", () => {
    assert.deepEqual(scaleEventRange([5, 7], 100), [5, 7]);
    assert.deepEqual(scaleEventRange([5, 7], 50), [3, 4]);
    assert.deepEqual(scaleEventRange([5, 7], 200), [10, 14]);
    assert.deepEqual(scaleEventRange([10, 13], 40), [4, 5]);
    assert.deepEqual(scaleEventRange([29, 37], 250), [73, 93]);
});

test("a period never asks for nothing, and its upper end never falls below its lower", () => {
    assert.deepEqual(scaleEventRange([1, 2], 40), [1, 1]);
    assert.deepEqual(scaleEventRange([2, 2], 40), [2, 2], "a fixed count is not a pace");
    // An afternoon is one event however crowded the author likes their months.
    assert.deepEqual(scaleEventRange([1, 1], 250), [1, 1]);
});

test("a pace that is not a number is the built-in pace", () => {
    for (const pace of [undefined, null, "fast", Number.NaN]) assert.deepEqual(scaleEventRange([5, 7], pace), [5, 7]);
    assert.deepEqual(scaleEventRange(null, 150), [1, 1]);
});

const PLAYER = ["Russian Federation", "Russia"];
const event = (title, description = "", extra = {}) => ({ title, description, ...extra });

test("an event is the player's when the simulator says so, or when its own words name the player", () => {
    assert.equal(eventConcernsPlayer(event("Moscow raises tariffs", "", { playerRelated: true }), PLAYER), true);
    assert.equal(eventConcernsPlayer(event("Poland protests to the Russian Federation"), PLAYER), true);
    assert.equal(eventConcernsPlayer(event("Warsaw recalls its envoy", "The note is addressed to RUSSIA."), PLAYER), true);
    assert.equal(eventConcernsPlayer(event("Brazil devalues the real", "Coffee exporters cheer."), PLAYER), false);
});

test("the player's name is matched as whole words, never inside another", () => {
    assert.equal(eventConcernsPlayer(event("Prussian reforms begin", "Belorussian exiles take note."), ["Russia"]), false);
    assert.equal(eventConcernsPlayer(event("Romania mobilises"), ["Oman"]), false);
    assert.equal(eventConcernsPlayer(event("Talks open in Oman"), ["Oman"]), true);
    // A name too short to mean anything is not searched for at all.
    assert.equal(eventConcernsPlayer(event("Ob river floods"), ["Ob"]), false);
});

test("the floor is met when enough of the period belongs to the rest of the world", () => {
    const events = [
        event("Russian forces enter Kharkiv", "", { playerRelated: true }),
        event("Brazil devalues the real"),
        event("Japan launches a carrier"),
    ];
    assert.equal(worldShareShortfall(events, 35, { playerNames: PLAYER }), null);
    assert.equal(worldShareShortfall(events, 66, { playerNames: PLAYER }), null, "2 of 3 is 66%");
});

test("a shortfall says the count, the floor, and what to do about it", () => {
    const events = [
        event("Russian forces enter Kharkiv", "", { playerRelated: true }),
        event("NATO condemns Russia"),
        event("The Russian Federation recalls its envoy"),
        event("Brazil devalues the real"),
        event("Sanctions on Russia widen"),
    ];
    const shortfall = worldShareShortfall(events, 40, { playerNames: PLAYER });
    assert.deepEqual([shortfall.world, shortfall.total, shortfall.needed], [1, 5, 2]);
    assert.match(shortfall.text, /^1 of your 5 events was about the world beyond Russian Federation; this scenario asks for at least 2 \(40%\)\./);
    assert.match(shortfall.text, /give them events of their own/);
});

test("the floor does not apply to a handful of events, or when it is switched off", () => {
    const playerOnly = Array.from({ length: WORLD_SHARE_MIN_EVENTS - 1 }, () => event("x", "", { playerRelated: true }));
    assert.equal(worldShareShortfall(playerOnly, 50, { playerNames: PLAYER }), null);
    const many = Array.from({ length: 6 }, () => event("x", "", { playerRelated: true }));
    assert.equal(worldShareShortfall(many, 0, { playerNames: PLAYER }), null);
    assert.equal(worldShareShortfall(many, undefined, { playerNames: PLAYER }), null);
    assert.equal(worldShareShortfall(null, 50), null);
    assert.equal(worldShareShortfall(many, 50, { playerNames: PLAYER }).needed, 3);
});

test("the simulator is told the floor as a number, that the engine counts it, and how an event counts", () => {
    const directive = buildWorldDirectionDirective({ eventPace: 100, worldShare: 35, priorityRules: "" }, { playerPolity: "Russian Federation" });
    assert.match(directive, /^\[The World's Share — counted by the engine\]/);
    assert.match(directive, /At least 35% of this period's events/);
    assert.match(directive, /names Russian Federation, or that you mark playerRelated/);
    assert.doesNotMatch(directive, /PRIORITY RULES/);
});

test("priority rules come last, word for word, and say what they outrank", () => {
    const rules = "No power may field nuclear weapons before 1945.\nThe Ottoman Empire cannot collapse before 1918.";
    const directive = buildWorldDirectionDirective({ worldShare: 35, priorityRules: rules }, { playerPolity: "France" });
    assert.ok(directive.endsWith(rules));
    assert.ok(directive.indexOf("[The World's Share") < directive.indexOf(PRIORITY_RULES_HEADING));
    assert.match(directive, /outrank everything else you have been told/);
    assert.match(directive, /anything a field description of the output function suggests/);
});

test("nothing set, or world direction off, adds nothing to the prompt", () => {
    assert.equal(buildWorldDirectionDirective(null), "");
    assert.equal(buildWorldDirectionDirective({ eventPace: 150, worldShare: 0, priorityRules: "  " }), "");
    // Pace alone is not said: it is already in the numbers the skip asks for.
    assert.equal(buildWorldDirectionDirective({ eventPace: 40, worldShare: 0, priorityRules: "" }), "");
});
