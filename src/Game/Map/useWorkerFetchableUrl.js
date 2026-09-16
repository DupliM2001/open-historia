/*! Open Historia — worker-fetchable runtime URLs © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
import { useEffect, useSyncExternalStore } from "react";
import {
  peekWorkerFetchableUrl,
  prepareWorkerFetchableUrl,
  subscribeWorkerFetchableUrls,
} from "../../runtime/assets.js";

// The URL a Web Worker can fetch a runtime asset from. On the desktop that is
// the runtime URL itself. On the website the runtime URLs exist only inside the
// page (the /api router is a window.fetch patch a worker never sees), so the
// bytes are re-served through a blob: URL that assets.js stages once per URL;
// "" while that copy is being staged. The runtime URL remains the identity the
// caller keys epochs, caches and readiness by — only the fetch moves.
export const useWorkerFetchableUrl = (url) => {
  // Read from the staging store on every render and on every change to it, so
  // a copy that lands between a render and its effects is never missed.
  const staged = useSyncExternalStore(subscribeWorkerFetchableUrls, () => peekWorkerFetchableUrl(url));

  useEffect(() => {
    if (staged != null) return;
    prepareWorkerFetchableUrl(url).catch((error) => {
      // The store now answers with the runtime URL for this asset: the worker's
      // own failure handling degrades the map the way an unreachable server
      // would, with the cause logged here rather than lost in the worker.
      console.warn(`Could not stage ${url} for the map workers; using the runtime URL directly.`, error);
    });
  }, [staged, url]);

  return staged ?? "";
};
