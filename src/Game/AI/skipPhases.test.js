/*! Open Historia — time skip phase tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/AI/skipPhases.test.js
//
// Runs without node_modules: skipPhases.js imports nothing.
//
// The invariants: the panel hears each phase as it starts, in the phase's own
// words; the log line adds up to the skip — every millisecond and every request
// inside some phase, a phase entered twice counted once.

import test from "node:test";
import assert from "node:assert/strict";

import { SKIP_PHASES, createSkipPhases, describeReviewJobs, formatSkipPhases, summarizeSkipPhases } from "./skipPhases.js";

const clock = () => {
  let at = 0;
  return { now: () => at, advance: (ms) => { at += ms; } };
};

test("each phase is heard as it starts, in its own words", () => {
  const heard = [];
  const phases = createSkipPhases({ onChange: (change) => heard.push(change) });
  phases.enter("reading");
  phases.enter("writing", { label: "Writing 1 month of events", detail: "part 1 of 2" });
  assert.deepEqual(heard, [
    { phase: "reading", label: SKIP_PHASES.reading, detail: "" },
    { phase: "writing", label: "Writing 1 month of events", detail: "part 1 of 2" },
  ]);
  assert.equal(phases.current, "writing");
});

test("the summary is every phase's time and requests, and they add up to the skip", () => {
  const time = clock();
  let used = 0;
  const phases = createSkipPhases({ now: time.now, requestsUsed: () => used });
  phases.enter("reading"); time.advance(1100);
  phases.enter("writing", { label: "Writing 1 month of events" }); used += 1; time.advance(9000);
  phases.enter("writing", { label: "Writing 1 month of events", detail: "part 2 of 2" }); used += 1; time.advance(8000);
  phases.enter("checking", { label: "Moving the armies and checking the record" }); used += 1; time.advance(6200);
  phases.enter("applying"); time.advance(1500);
  const summary = phases.finish();
  assert.deepEqual(summary.phases.map((line) => [line.phase, line.ms, line.requests]), [
    ["reading", 1100, 0],
    ["writing", 17000, 2],
    ["checking", 6200, 1],
    ["applying", 1500, 0],
  ]);
  assert.equal(summary.totalMs, 25800);
  assert.equal(summary.requests, 3);
  assert.equal(
    formatSkipPhases(summary),
    "25.8 s — reading the world 1.1 s · writing 1 month of events 17.0 s (2 requests) · moving the armies and checking the record 6.2 s (1 request) · writing it into the record 1.5 s",
  );
});

test("a phase with nothing to do stays in the summary but not in the line", () => {
  const summary = summarizeSkipPhases([
    { phase: "writing", label: "Writing 1 month of events", ms: 9000, requests: 1 },
    { phase: "board", ms: 0, requests: 0 },
    { phase: "applying", ms: 1200, requests: 0 },
  ]);
  assert.equal(summary.phases.length, 3);
  assert.equal(formatSkipPhases(summary), "10.2 s — writing 1 month of events 9.0 s (1 request) · writing it into the record 1.2 s");
});

test("finishing twice is one summary, and nothing is entered after it", () => {
  const time = clock();
  const phases = createSkipPhases({ now: time.now });
  phases.enter("reading"); time.advance(10);
  const first = phases.finish();
  phases.enter("writing"); time.advance(99);
  assert.equal(phases.finish(), first);
  assert.deepEqual(first.phases.map((line) => line.phase), ["reading"]);
});

test("a listener that throws never costs the skip", () => {
  const phases = createSkipPhases({ onChange: () => { throw new Error("the panel went away"); } });
  assert.doesNotThrow(() => phases.enter("reading"));
  assert.equal(phases.current, "reading");
});

test("the review is described by the jobs it carries", () => {
  assert.equal(describeReviewJobs(["units", "territory", "timeline"]), "Moving the armies, redrawing the fronts and checking the record");
  assert.equal(describeReviewJobs(["timeline", "agent_1", "agent_2"]), "Checking the record and hearing from 2 agents");
  assert.equal(describeReviewJobs(["agent_1"]), "Hearing from an agent");
  assert.equal(describeReviewJobs([]), SKIP_PHASES.checking);
});

test("a malformed entry is left out rather than breaking the line", () => {
  const summary = summarizeSkipPhases([{ phase: "", ms: 5 }, null, { phase: "writing", ms: "x", requests: -2 }]);
  assert.deepEqual(summary, { phases: [{ phase: "writing", label: SKIP_PHASES.writing, ms: 0, requests: 0 }], totalMs: 0, requests: 0 });
  assert.equal(formatSkipPhases({ phases: [] }), "");
});
