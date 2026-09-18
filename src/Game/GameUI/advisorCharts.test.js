/*! Open Historia — advisor chart checks and reply receipts tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/GameUI/advisorCharts.test.js
//
// Runs in a BARE CHECKOUT: advisorBlocks.js is import-free on purpose.
//
// The invariants: a chart the panel cannot draw is never handed to Chart.js
// (it used to throw mid-render), and whatever went wrong with a reply's blocks
// becomes sentences the advisor is told before the next question.

import test from "node:test";
import assert from "node:assert/strict";

import { CHART_TYPES, describeReplyProblems, validateChartConfig } from "./advisorBlocks.js";

const good = {
  type: "Bar",
  data: { labels: ["2013", "2014", 2015], datasets: [{ label: "GDP growth", data: [1.8, "0.4%", " -6.6 "] }] },
  options: { unit: "percent" },
};

test("a good chart passes, tidied: the type lower-cased, the numbers numbers", () => {
  const { config, problem } = validateChartConfig(good);
  assert.equal(problem, "");
  assert.equal(config.type, "bar");
  assert.deepEqual(config.data.labels, ["2013", "2014", "2015"]);
  assert.deepEqual(config.data.datasets[0].data, [1.8, 0.4, -6.6]);
  assert.deepEqual(config.options, { unit: "percent" });
});

test("a chart without data is refused rather than thrown at Chart.js", () => {
  assert.match(validateChartConfig({ type: "bar" }).problem, /no data\.labels/);
  assert.match(validateChartConfig({ type: "bar", data: { labels: ["a"] } }).problem, /none of the chart's data\.datasets had a number/);
  assert.match(validateChartConfig({ type: "bar", data: { labels: ["a"], datasets: [{ data: ["n/a", null] }] } }).problem, /had a number/);
  assert.match(validateChartConfig([1, 2]).problem, /not a Chart\.js config object/);
  assert.equal(validateChartConfig(null).config, null);
});

test("a type the panel cannot lay out is refused, and the refusal names the ones it can", () => {
  const { config, problem } = validateChartConfig({ ...good, type: "parliament" });
  assert.equal(config, null);
  assert.match(problem, /"parliament" is not a chart type the panel can draw; use one of bar, line, pie, doughnut/);
  assert.deepEqual([...CHART_TYPES], ["bar", "line", "pie", "doughnut"]);
});

test("an empty series is dropped, a gap in one is kept", () => {
  const { config } = validateChartConfig({
    type: "line",
    data: { labels: ["a", "b", "c"], datasets: [{ label: "empty", data: [] }, { label: "gappy", data: [1, "?", 3] }] },
  });
  assert.deepEqual(config.data.datasets.map((dataset) => dataset.label), ["gappy"]);
  assert.deepEqual(config.data.datasets[0].data, [1, null, 3]);
});

test("what went wrong with a reply, in sentences the advisor can act on", () => {
  assert.deepEqual(describeReplyProblems({ role: "advisor", text: "Fine." }), []);
  const problems = describeReplyProblems({
    chartProblem: "\"parliament\" is not a chart type the panel can draw; use one of bar, line, pie, doughnut",
    actionsProblems: ["the removal of action-9 matched no queued action, so nothing was removed"],
    projectsProblem: "partial",
    projectsDetail: "2 entries were malformed and skipped.",
  });
  assert.deepEqual(problems, [
    "your chart was not drawn: \"parliament\" is not a chart type the panel can draw; use one of bar, line, pie, doughnut",
    "in your actions block, the removal of action-9 matched no queued action, so nothing was removed",
    "in your projects block, 2 entries were malformed and skipped.",
  ]);
  assert.match(describeReplyProblems({ projectsProblem: "truncated-empty" })[0], /nothing on the board changed/);
  assert.match(describeReplyProblems({ projectsProblem: "unusable", projectsDetail: "every entry referred to a project that is not on the board" })[0], /could not be used: every entry referred/);
});
