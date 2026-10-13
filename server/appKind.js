/*! Open Historia — which application this server is running inside © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// The page is an ordinary localhost page whether the desktop app opened it or
// somebody started the server from the zip, and the stable app, the beta and the
// multiplayer build all serve the same page. The visit counter
// (src/runtime/visitCount.js) counts each of them apart, so it asks.
//
// `versions`: process.versions. server.js is imported into the desktop app's
// main process (electron/main.cjs startServer), so `electron` is there exactly
// when this is the app. `env.OH_CHANNEL` is what electron/main.cjs set from
// electron/channel.cjs.

export const APP_CHANNELS = Object.freeze(["stable", "beta", "multiplayer"]);

// OH_VISIT_COUNT=0: no visit counter, neither Google Analytics nor Umami, on
// the game page or on the pages served beside it (the wiki, the privacy
// policy). Both go through one gate (public/consent.js), which loads nothing
// for an application that answers "uncounted". For a test server, and for
// anybody running the server who would rather not be counted.

export const appKindOf = (versions = {}, env = {}) => {
  if (String(env?.OH_VISIT_COUNT ?? "") === "0") return { app: "uncounted" };
  if (!versions?.electron) return { app: "local" };
  const channel = String(env?.OH_CHANNEL || "stable");
  return { app: "desktop", channel: APP_CHANNELS.includes(channel) ? channel : "stable" };
};
