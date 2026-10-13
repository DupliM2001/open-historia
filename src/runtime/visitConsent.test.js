/*! Open Historia — the visit counters' answer, as the game reads it: tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/runtime/visitConsent.test.js
//
// The "Count my visits" switch (Settings → General → Privacy) and the Logging
// file's line both read the answer public/consent.js keeps. These check the
// reading against a stand-in, then against consent.js itself run in a page of
// its own, so the two files cannot drift apart unnoticed.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { VISIT_CONSENT_EVENT, describeVisitConsent, readVisitConsent, setVisitConsent } from "./visitConsent.js";

// window.ohConsent, as consent.js defines it.
const standIn = ({ choice = "", counted = true, signal = false } = {}) => {
  const state = { choice, set: [] };
  return {
    state,
    ohConsent: {
      get: () => state.choice,
      refusedBySignal: () => signal,
      counted: () => counted,
      set: (next) => { state.set.push(next); state.choice = next; },
      open() {},
      whenReady: (callback) => callback(),
    },
  };
};

test("where nothing is counted there is nothing to answer", () => {
  assert.equal(readVisitConsent(undefined), null, "no window");
  assert.equal(readVisitConsent({}), null, "no consent.js on the page: the Android app");
  assert.equal(readVisitConsent(standIn({ counted: false })), null, "a page consent.js does not count");
  assert.equal(readVisitConsent(standIn({ counted: false, choice: "yes" })), null, "whatever was once answered");
  // A consent.js that throws is one that counts nothing the game can vouch for.
  assert.equal(readVisitConsent({ ohConsent: { counted: () => { throw new Error("broken"); } } }), null);
});

test("the answer: yes, no, or nobody has said", () => {
  assert.deepEqual(readVisitConsent(standIn()), { choice: "", refusedBySignal: false });
  assert.deepEqual(readVisitConsent(standIn({ choice: "yes" })), { choice: "yes", refusedBySignal: false });
  assert.deepEqual(readVisitConsent(standIn({ choice: "no" })), { choice: "no", refusedBySignal: false });
  assert.deepEqual(readVisitConsent(standIn({ signal: true })), { choice: "", refusedBySignal: true });
  // Anything else is not an answer.
  assert.deepEqual(readVisitConsent(standIn({ choice: "maybe" })), { choice: "", refusedBySignal: false });
});

test("the switch hands consent.js a yes or a no, and nothing where there is none", () => {
  const page = standIn();
  setVisitConsent(true, page);
  setVisitConsent(false, page);
  assert.deepEqual(page.state.set, ["yes", "no"]);
  assert.doesNotThrow(() => setVisitConsent(true, {}));
  assert.doesNotThrow(() => setVisitConsent(true, undefined));
});

test("the Logging file's line: on only after a yes, and why it is off otherwise", () => {
  assert.equal(describeVisitConsent(null), "off (visits are not counted here)");
  assert.equal(describeVisitConsent({ choice: "yes", refusedBySignal: false }), "on");
  // A yes given by hand stands over the browser's signal.
  assert.equal(describeVisitConsent({ choice: "yes", refusedBySignal: true }), "on");
  assert.equal(describeVisitConsent({ choice: "no", refusedBySignal: false }), "off");
  assert.equal(describeVisitConsent({ choice: "", refusedBySignal: false }), "off (not answered)");
  assert.equal(describeVisitConsent({ choice: "", refusedBySignal: true }), "off (the browser asks not to be tracked)");
});

// ---- against public/consent.js itself -----------------------------------------

const gateSource = fs.readFileSync(new URL("../../public/consent.js", import.meta.url), "utf8");

// A page as consent.js needs one, and no more: the game added the file itself
// (data-tag names the application), so what the page is counted as is known at
// once. Returns the page's window and the events it was sent.
const pageWithGate = ({ tag = "desktop-main", hostname = "127.0.0.1", gpc = false } = {}) => {
  const element = (name) => ({
    name, attributes: {}, style: {}, children: [], parentNode: null,
    setAttribute(key, value) { this.attributes[key] = value; },
    getAttribute(key) { return Object.hasOwn(this.attributes, key) ? this.attributes[key] : null; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter((entry) => entry !== child); child.parentNode = null; },
    addEventListener() {},
  });
  const self = element("script");
  if (tag) self.attributes["data-tag"] = tag;
  const stored = new Map();
  const events = [];
  const document = {
    currentScript: self,
    readyState: "complete",
    head: element("head"),
    body: element("body"),
    cookie: "",
    createElement: element,
    querySelectorAll: () => [],
    addEventListener() {},
    dispatchEvent() {},
  };
  const window = {
    location: { hostname },
    localStorage: {
      getItem: (key) => (stored.has(key) ? stored.get(key) : null),
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: (key) => stored.delete(key),
    },
    dispatchEvent: (event) => events.push(event),
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const context = vm.createContext({ window, document, navigator: { globalPrivacyControl: gpc, doNotTrack: null }, CustomEvent, Date, JSON, Object, String, Boolean });
  try {
    vm.runInContext(gateSource, context);
  } catch (error) {
    assert.fail(`public/consent.js needs something this test's page lacks (${error.message}); extend pageWithGate`);
  }
  return { window, events, scripts: () => document.head.children.filter((node) => node.name === "script") };
};

test("consent.js still offers what the game reads", () => {
  const { window } = pageWithGate();
  for (const name of ["get", "refusedBySignal", "counted", "set", "open", "whenReady"]) {
    assert.equal(typeof window.ohConsent?.[name], "function", `window.ohConsent.${name}`);
  }
  let called = 0;
  window.ohConsent.whenReady(() => { called += 1; });
  assert.equal(called, 1, "whenReady calls back at once on a page already decided");
});

test("on a counted page the switch is off until a yes, and a yes can be taken back", () => {
  const page = pageWithGate();
  assert.deepEqual(readVisitConsent(page.window), { choice: "", refusedBySignal: false });
  assert.equal(page.scripts().length, 0, "nothing is loaded before an answer");

  setVisitConsent(true, page.window);
  assert.deepEqual(readVisitConsent(page.window), { choice: "yes", refusedBySignal: false });
  assert.equal(page.scripts().length, 2, "the yes is what loads the two counters");

  setVisitConsent(false, page.window);
  assert.deepEqual(readVisitConsent(page.window), { choice: "no", refusedBySignal: false });

  // Each change is announced under the name the switch listens for.
  assert.deepEqual(page.events.map((event) => [event.type, event.detail.choice]), [[VISIT_CONSENT_EVENT, "yes"], [VISIT_CONSENT_EVENT, "no"]]);
});

test("a browser that asks not to be tracked reads as off, with the note's reason", () => {
  const page = pageWithGate({ gpc: true });
  assert.deepEqual(readVisitConsent(page.window), { choice: "", refusedBySignal: true });
  assert.equal(describeVisitConsent(readVisitConsent(page.window)), "off (the browser asks not to be tracked)");
  // Saying yes by hand is a choice, and it stands.
  setVisitConsent(true, page.window);
  assert.equal(describeVisitConsent(readVisitConsent(page.window)), "on");
});

test("a page that is not counted has no switch", () => {
  // No application named and not the project's own address: somebody else's copy.
  const page = pageWithGate({ tag: "", hostname: "example.org" });
  assert.equal(page.window.ohConsent.counted(), false);
  assert.equal(readVisitConsent(page.window), null);
});

test("Settings shows the row only where there is an answer to give, and re-reads it", () => {
  const settings = fs.readFileSync(new URL("../Game/GameUI/settings.jsx", import.meta.url), "utf8");
  assert.match(settings, /const visits = useVisitConsent\(\);/);
  assert.match(settings, /\{visits && \(\s*<>\s*<Toggle label="Count my visits" enabled=\{counted\} onToggle=\{toggleVisits\} \/>/);
  assert.match(settings, /const counted = visits\?\.choice === "yes";/, "on only after a yes");
  assert.match(settings, /setVisitConsent\(!counted\);/);
  assert.match(settings, /const signalNote = Boolean\(visits\?\.refusedBySignal && visits\.choice === ""\);/);
  assert.match(settings, /\{signalNote && <div[^>]*>\{"Your browser asks sites not to track you, so this is off\."\}<\/div>\}/);
  // The policy link in the group is the one the Help tab opens.
  assert.match(settings, /<a\s+href=\{PRIVACY_HREF\}\s+target="_blank"\s+rel="noopener noreferrer"/);
  assert.match(settings, /<QuickAction title="Privacy" description="What the game keeps and sends" symbol="§" href=\{PRIVACY_HREF\} \/>/);

  const hook = fs.readFileSync(new URL("./visitConsent.js", import.meta.url), "utf8");
  assert.match(hook, /window\.addEventListener\(VISIT_CONSENT_EVENT, read\);/);
  assert.match(hook, /window\.ohConsent\?\.whenReady\(read\);/);
  assert.match(hook, /window\.removeEventListener\(VISIT_CONSENT_EVENT, read\);/);
});
