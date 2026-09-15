/*! Open Historia — PTR placement worker © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

import { optimizeTerritorialArcPlacement } from "./polityTextPlacement.js";

self.onmessage = ({ data }) => {
  const message = data ?? {};
  if (message.type !== "optimize") return;

  const startedAt = performance.now();
  try {
    const results = (Array.isArray(message.tasks) ? message.tasks : []).map((task) => ({
      key: String(task?.key ?? ""),
      result: task?.args ? optimizeTerritorialArcPlacement(task.args) : null,
    }));

    self.postMessage({
      type: "optimized",
      requestId: message.requestId ?? 0,
      results,
      elapsedMs: performance.now() - startedAt,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.requestId ?? 0,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: performance.now() - startedAt,
    });
  }
};
