/*! Open Historia — the visit counters' answer, as the game reads it © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Google Analytics and Umami are loaded by public/consent.js and by nothing
// else, and only after a yes. That file keeps the answer and defines
// window.ohConsent on a page whose visits are counted at all: the website and
// the desktop app, never the Android app, which does not carry it. This is the
// game's side of it, for the two places that show the answer: the "Count my
// visits" switch (Settings → General → Privacy) and the Logging file's
// settings block (settingsLog.js).
//
// Nothing here loads a counter or keeps an answer: it reads what consent.js
// says and hands a change back to it.
import { useEffect, useState } from "react";

// consent.js fires this on `window`, with detail { choice }, when the answer
// changes: from the switch here, or from the question's own panel.
export const VISIT_CONSENT_EVENT = "oh:consent";

// The answer as it stands, or null where there is nothing to answer: no
// window.ohConsent (the Android app; a page whose consent.js was blocked, which
// therefore counts nothing), or a page consent.js does not count.
//   choice           "yes", "no", or "" while nobody has answered
//   refusedBySignal  the browser itself asks not to be tracked (Global Privacy
//                    Control, Do Not Track), which consent.js takes as a no
//                    until the player says otherwise
export const readVisitConsent = (host = globalThis.window) => {
  const consent = host?.ohConsent;
  if (!consent) return null;
  try {
    if (!consent.counted()) return null;
    const choice = consent.get();
    return {
      choice: choice === "yes" || choice === "no" ? choice : "",
      refusedBySignal: Boolean(consent.refusedBySignal()),
    };
  } catch {
    return null;
  }
};

// The switch: on is a yes, off is a no, the same two answers the question
// offers. consent.js loads or unloads the counters and announces the change.
export const setVisitConsent = (counted, host = globalThis.window) => {
  host?.ohConsent?.set(counted ? "yes" : "no");
};

// The Logging file's line. Nothing is counted without a yes, so every other
// state reads off, with why.
export const describeVisitConsent = (consent) => {
  if (!consent) return "off (visits are not counted here)";
  if (consent.choice === "yes") return "on";
  if (consent.choice === "no") return "off";
  return consent.refusedBySignal ? "off (the browser asks not to be tracked)" : "off (not answered)";
};

// The answer, followed live: it can change from the question's panel while
// Settings is open, and whether this page is counted may not be known yet when
// Settings opens (a page on this computer asks its server which application it
// is), which whenReady waits for.
export const useVisitConsent = () => {
  const [consent, setConsent] = useState(() => readVisitConsent());
  useEffect(() => {
    let live = true;
    const read = () => { if (live) setConsent(readVisitConsent()); };
    read();
    window.addEventListener(VISIT_CONSENT_EVENT, read);
    try {
      window.ohConsent?.whenReady(read);
    } catch {
      /* an older consent.js: the answer is read when it changes */
    }
    return () => {
      live = false;
      window.removeEventListener(VISIT_CONSENT_EVENT, read);
    };
  }, []);
  return consent;
};
