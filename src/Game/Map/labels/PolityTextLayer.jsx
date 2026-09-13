import { useEffect } from "react";
import { enforceMapLayerOrder } from "../mapLayerOrder.js";
import {
  createPolityTextCustomLayer,
  finalizePolityTextRenderRecord,
  measurePolityTextRenderRecord,
  POLITY_TEXT_RENDERER_LAYER_ID,
} from "./polityTextCustomLayer.js";
import { waitForFontStack } from "./polityTextRasterizer.js";

export const POLITY_TEXT_PTR0_STORAGE_KEY = "oh:polityTextRendererPtr0";
export const POLITY_TEXT_PTR1_STORAGE_KEY = "oh:polityTextRendererPtr1";
export const POLITY_TEXT_PTR1_DEBUG_STORAGE_KEY = "oh:polityTextRendererPtr1Debug";

const storageFlag = (key, queryKey) => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(queryKey) === "1") return true;
    return window.localStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
};

export const isPolityTextPtr0Enabled = () => storageFlag(POLITY_TEXT_PTR0_STORAGE_KEY, "ptr0PolityText");
export const isPolityTextPtr1Enabled = () => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("legacyPolityText") === "1") return false;
    const stored = window.localStorage?.getItem(POLITY_TEXT_PTR1_STORAGE_KEY);
    if (stored === "0") return false;
    // PTR-1.7 is the default flat-map polity renderer. The old explicit "1"
    // flag remains accepted for existing test profiles; "0" or the query
    // escape hatch above forces the legacy MapLibre labels instead.
    return true;
  } catch {
    return true;
  }
};
export const isPolityTextPtr1DebugEnabled = () => storageFlag(POLITY_TEXT_PTR1_DEBUG_STORAGE_KEY, "ptr1PolityTextDebug");

const firstSemanticLayer = (map) => [
  "cities-shapes",
  "cities-labels",
  "markers-shapes-strategic",
  "units-fill",
].find((id) => map.getLayer?.(id));

export default function PolityTextLayer({
  map,
  enabled,
  mode = "ptr0",
  records = [],
  fontFamilies,
  textColor,
  haloColor,
  debugBaseline = true,
  onStatusChange,
}) {
  useEffect(() => {
    const mapInstance = map?.getMap ? map.getMap() : map;
    if (!enabled) return undefined;

    const requestedProbe = {
      requested: true,
      mounted: false,
      mode,
      layerId: POLITY_TEXT_RENDERER_LAYER_ID,
      fontFamilies: [...(fontFamilies ?? [])],
      recordCount: records.length,
      owners: records.map((record) => record.owner),
      projection: mapInstance?.getProjection?.()?.type ?? "unknown",
    };
    const reportStatus = (patch = {}) => {
      Object.assign(requestedProbe, patch);
      globalThis.__OH_POLITY_TEXT_PTR__ = requestedProbe;
      onStatusChange?.({
        requested: Boolean(requestedProbe.requested),
        mounted: Boolean(requestedProbe.mounted),
        failed: Boolean(requestedProbe.failed),
        waitingForStyle: Boolean(requestedProbe.waitingForStyle),
        preparing: Boolean(requestedProbe.preparing),
        preparationMs: Number(requestedProbe.preparationMs) || 0,
        placementWorkerMs: Number(requestedProbe.placementWorkerMs) || 0,
        placementTaskCount: Number(requestedProbe.placementTaskCount) || 0,
        recordCount: Number(requestedProbe.recordCount) || 0,
        owners: Array.isArray(requestedProbe.owners) ? [...requestedProbe.owners] : [],
        lastMountError: requestedProbe.lastMountError ?? null,
      });
    };

    reportStatus();

    console.info(`[map] ${mode.toUpperCase()} mount requested`, requestedProbe);

    if (!mapInstance?.addLayer) {
      console.warn(`[map] ${mode.toUpperCase()} enabled but map instance is unavailable`);
      reportStatus({ failed: true, lastMountError: "map-unavailable" });
      return () => {
        if (globalThis.__OH_POLITY_TEXT_PTR__ === requestedProbe) delete globalThis.__OH_POLITY_TEXT_PTR__;
      };
    }

    if (mode === "ptr1" && !records.length) {
      console.warn("[map] PTR1 requested but canonical worker records are not ready yet");
      reportStatus({ waitingForStyle: true, failed: false });
      return () => {
        if (globalThis.__OH_POLITY_TEXT_PTR__ === requestedProbe) delete globalThis.__OH_POLITY_TEXT_PTR__;
      };
    }

    let cancelled = false;
    let mounting = false;
    let retryTimer = null;
    let mountAttempts = 0;
    let placementWorker = null;
    let preparedEntriesPromise = null;

    const preparePtr1Entries = () => {
      if (mode !== "ptr1") return Promise.resolve(null);
      if (preparedEntriesPromise) return preparedEntriesPromise;

      preparedEntriesPromise = (async () => {
        const startedAt = performance.now();
        reportStatus({ preparing: true, failed: false });

        const sampleText = records.map((record) => record.text).join(" ").slice(0, 900);
        await waitForFontStack({ families: fontFamilies, sampleText, sizePx: 128 });
        if (cancelled) return [];

        // Browser shaping/rasterization remains on the UI thread because it must
        // use the exact scenario-resolved font. The expensive territorial search
        // is pure geometry and is moved to a dedicated worker below.
        const plans = [];
        for (let index = 0; index < records.length; index += 1) {
          const plan = measurePolityTextRenderRecord({
            record: records[index],
            fontFamilies,
            fillStyle: textColor || "rgba(250, 249, 244, 0.995)",
            haloStyle: haloColor || "rgba(3, 4, 8, 0.98)",
            haloWidthPx: 5,
            samples: 128,
          });
          if (plan) plans.push(plan);
          // Raster shaping must use the browser-resolved font, but it need not
          // monopolize one frame. Yield in small batches so the existing loading
          // screen keeps animating even on scenarios with hundreds of polities.
          if ((index + 1) % 12 === 0 && index + 1 < records.length) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (cancelled) return [];
          }
        }
        const tasks = plans.flatMap((plan, index) => (plan.placementTask ? [{
          key: String(index),
          args: plan.placementTask,
        }] : []));
        const placements = new Map();
        let placementWorkerMs = 0;

        if (tasks.length && typeof Worker !== "undefined") {
          try {
            const requestId = Date.now();
            const response = await new Promise((resolve, reject) => {
              const worker = new Worker(new URL("./polityTextPlacementWorker.js", import.meta.url), { type: "module" });
              placementWorker = worker;
              const timeout = setTimeout(() => {
                worker.terminate();
                if (placementWorker === worker) placementWorker = null;
                reject(new Error("PTR placement worker timed out"));
              }, 30000);
              const finish = (callback) => {
                clearTimeout(timeout);
                worker.terminate();
                if (placementWorker === worker) placementWorker = null;
                callback();
              };
              worker.onmessage = ({ data }) => {
                if (data?.requestId !== requestId) return;
                if (data?.type === "error") {
                  finish(() => reject(new Error(data.error || "PTR placement worker failed")));
                  return;
                }
                if (data?.type !== "optimized") return;
                finish(() => resolve(data));
              };
              worker.onerror = (error) => {
                finish(() => reject(error instanceof Error ? error : new Error("PTR placement worker failed")));
              };
              worker.postMessage({ type: "optimize", requestId, tasks });
            });
            placementWorkerMs = Number(response?.elapsedMs) || 0;
            for (const item of response?.results ?? []) {
              placements.set(String(item?.key ?? ""), item?.result ?? null);
            }
          } catch (error) {
            console.warn("[map] PTR placement worker unavailable; using fast envelope fallback:", error);
          }
        } else if (tasks.length) {
          console.warn("[map] Web Workers unavailable; PTR uses fast envelope fallback instead of blocking the UI thread.");
        }

        if (cancelled) return [];
        const entries = plans
          .map((plan, index) => finalizePolityTextRenderRecord({
            plan,
            optimizedPlacement: placements.get(String(index)) ?? null,
            // Even if the worker failed, never fall back to the expensive
            // synchronous optimizer here. The deterministic single-arc envelope
            // is the safe degraded path.
            placementResolved: true,
          }))
          .filter(Boolean);
        const preparationMs = performance.now() - startedAt;
        globalThis.__OH_MAP_SOURCE_PERF__ = {
          ...(globalThis.__OH_MAP_SOURCE_PERF__ ?? {}),
          ptrPreparationMs: Math.round(preparationMs * 10) / 10,
          ptrPlacementWorkerMs: Math.round(placementWorkerMs * 10) / 10,
          ptrPlacementTaskCount: tasks.length,
          ptrPreparedLabelCount: entries.length,
        };
        reportStatus({
          preparing: false,
          preparationMs,
          placementWorkerMs,
          placementTaskCount: tasks.length,
        });
        return entries;
      })();

      return preparedEntriesPromise;
    };

    const clearRetry = () => {
      if (retryTimer != null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const removeLayer = () => {
      try {
        if (mapInstance.getLayer?.(POLITY_TEXT_RENDERER_LAYER_ID)) {
          mapInstance.removeLayer(POLITY_TEXT_RENDERER_LAYER_ID);
        }
      } catch {
        // Style replacement can remove the layer between the check and call.
      }
    };

    const scheduleRetry = (delayMs = 120) => {
      if (cancelled || retryTimer != null || mapInstance.getLayer?.(POLITY_TEXT_RENDERER_LAYER_ID)) return;
      requestedProbe.waitingForStyle = true;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        ensureLayer();
      }, delayMs);
    };

    const ensureLayer = async () => {
      if (cancelled || mounting || mapInstance.getLayer?.(POLITY_TEXT_RENDERER_LAYER_ID)) return;

      // Do not gate mounting on isStyleLoaded(). MapLibre can temporarily report
      // false while sources/style data are settling even though addLayer() is
      // already valid. PTR-1 previously returned here and could then wait
      // forever if no later styledata event happened. Try the real operation;
      // transient style-readiness failures are retried below.
      const style = mapInstance.getStyle?.();
      if (!style) {
        scheduleRetry();
        return;
      }

      mounting = true;
      mountAttempts += 1;
      requestedProbe.mountAttempts = mountAttempts;
      requestedProbe.waitingForStyle = false;
      requestedProbe.lastMountError = null;
      reportStatus({ waitingForStyle: false, failed: false, lastMountError: null });
      try {
        let preparedEntries = null;
        if (mode === "ptr1") {
          preparedEntries = await preparePtr1Entries();
        } else {
          await waitForFontStack({
            families: fontFamilies,
            sampleText: "RUSSIAN FEDERATION",
            sizePx: 128,
          });
        }
        if (cancelled || mapInstance.getLayer?.(POLITY_TEXT_RENDERER_LAYER_ID)) return;

        const layer = createPolityTextCustomLayer({
          records: mode === "ptr1" ? records : null,
          preparedEntries,
          fontFamilies,
          // PTR-1.7 is authoritative rather than an A/B overlay. Shape the
          // exact scenario/player colour; debug baselines can still be enabled
          // independently when placement needs inspection.
          fillStyle: mode === "ptr1"
            ? (textColor || "rgba(250, 249, 244, 0.995)")
            : "rgba(255, 48, 214, 0.98)",
          haloStyle: haloColor || "rgba(3, 4, 8, 0.98)",
          debugBaseline,
        });

        const preparedOwners = mode === "ptr1"
          ? (Array.isArray(layer?._entries)
            ? layer._entries.map((entry) => entry?.record?.owner).filter(Boolean)
            : records.map((record) => record.owner).filter(Boolean))
          : ["Russian Federation"];

        const beforeId = firstSemanticLayer(mapInstance);
        mapInstance.addLayer(layer, beforeId);
        clearRetry();
        enforceMapLayerOrder(mapInstance);
        mapInstance.triggerRepaint?.();
        reportStatus({
          mounted: true,
          failed: false,
          waitingForStyle: false,
          lastMountError: null,
          recordCount: preparedOwners.length,
          owners: preparedOwners,
          projection: mapInstance.getProjection?.()?.type ?? "unknown",
        });
        // Keep the old PTR-0 probe name for existing debugging habits.
        globalThis.__OH_POLITY_TEXT_PTR0__ = requestedProbe;
        console.info(`[map] ${mode.toUpperCase()} polity text renderer mounted`, {
          layerPresent: Boolean(mapInstance.getLayer?.(POLITY_TEXT_RENDERER_LAYER_ID)),
          recordCount: preparedOwners.length,
          productionTextColor: textColor,
        });
      } catch (error) {
        removeLayer();
        const message = String(error?.message ?? error ?? "unknown mount error");
        requestedProbe.lastMountError = message;
        requestedProbe.mounted = false;
        reportStatus({ mounted: false, lastMountError: message });

        // addLayer() is the authority for readiness. Retry the common transient
        // style-loading failure; surface any real renderer/shader failure loudly.
        if (/style|load|source/i.test(message)) {
          console.warn(`[map] ${mode.toUpperCase()} waiting for map style before mounting`, {
            attempt: mountAttempts,
            message,
          });
          scheduleRetry();
        } else {
          reportStatus({ failed: true, mounted: false, waitingForStyle: false, lastMountError: message });
          console.error(`[map] ${mode.toUpperCase()} polity text renderer failed to mount:`, error);
        }
      } finally {
        mounting = false;
      }
    };

    ensureLayer();
    const onMapReady = () => { ensureLayer(); };
    mapInstance.on?.("styledata", onMapReady);
    mapInstance.on?.("load", onMapReady);
    mapInstance.on?.("idle", onMapReady);

    return () => {
      cancelled = true;
      placementWorker?.terminate?.();
      placementWorker = null;
      clearRetry();
      mapInstance.off?.("styledata", onMapReady);
      mapInstance.off?.("load", onMapReady);
      mapInstance.off?.("idle", onMapReady);
      removeLayer();
      onStatusChange?.({
        requested: false,
        mounted: false,
        failed: false,
        waitingForStyle: false,
        preparing: false,
        preparationMs: 0,
        placementWorkerMs: 0,
        placementTaskCount: 0,
        recordCount: 0,
        owners: [],
        lastMountError: null,
      });
      if (globalThis.__OH_POLITY_TEXT_PTR__?.layerId === POLITY_TEXT_RENDERER_LAYER_ID) {
        delete globalThis.__OH_POLITY_TEXT_PTR__;
      }
      if (globalThis.__OH_POLITY_TEXT_PTR0__?.layerId === POLITY_TEXT_RENDERER_LAYER_ID) {
        delete globalThis.__OH_POLITY_TEXT_PTR0__;
      }
    };
  }, [debugBaseline, enabled, fontFamilies, haloColor, map, mode, onStatusChange, records, textColor]);

  return null;
}
