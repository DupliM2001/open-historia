import { useEffect } from "react";
import { enforceMapLayerOrder } from "../mapLayerOrder.js";
import {
  createPolityTextCustomLayer,
  POLITY_TEXT_RENDERER_LAYER_ID,
} from "./polityTextCustomLayer.js";
import { waitForFontStack } from "./polityTextRasterizer.js";

export const POLITY_TEXT_PTR0_STORAGE_KEY = "oh:polityTextRendererPtr0";

export const isPolityTextPtr0Enabled = () => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ptr0PolityText") === "1") return true;
    return window.localStorage?.getItem(POLITY_TEXT_PTR0_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const firstSemanticLayer = (map) => [
  "cities-shapes",
  "cities-labels",
  "markers-shapes-strategic",
  "units-fill",
].find((id) => map.getLayer?.(id));

export default function PolityTextLayer({
  map,
  enabled,
  fontFamilies,
  textColor,
  haloColor,
}) {
  useEffect(() => {
    const mapInstance = map?.getMap ? map.getMap() : map;
    if (!enabled) return undefined;
    if (!mapInstance?.addLayer) {
      console.warn("[map] PTR-0 enabled but map instance is unavailable");
      return undefined;
    }

    console.info("[map] PTR-0 mount requested", {
      projection: mapInstance.getProjection?.()?.type ?? "unknown",
      fontFamilies,
    });

    let cancelled = false;
    let layer = null;
    let mounting = false;

    const removeLayer = () => {
      try {
        if (mapInstance.getLayer?.(POLITY_TEXT_RENDERER_LAYER_ID)) {
          mapInstance.removeLayer(POLITY_TEXT_RENDERER_LAYER_ID);
        }
      } catch {
        // Style replacement can remove the layer between the check and call.
      }
    };

    const ensureLayer = async () => {
      if (cancelled || mounting || mapInstance.getLayer?.(POLITY_TEXT_RENDERER_LAYER_ID)) return;
      if (mapInstance.isStyleLoaded && !mapInstance.isStyleLoaded()) return;
      mounting = true;
      try {
        await waitForFontStack({
          families: fontFamilies,
          sampleText: "RUSSIAN FEDERATION",
          sizePx: 128,
        });
        if (cancelled || mapInstance.getLayer?.(POLITY_TEXT_RENDERER_LAYER_ID)) return;

        layer = createPolityTextCustomLayer({
          fontFamilies,
          // PTR-0 is deliberately unmistakable next to the old white label.
          // The renderer already accepts scenario colors; production adoption
          // will pass textColor directly once the proof is accepted.
          fillStyle: "rgba(255, 48, 214, 0.98)",
          haloStyle: haloColor || "rgba(3, 4, 8, 0.98)",
          debugBaseline: true,
        });

        const beforeId = firstSemanticLayer(mapInstance);
        mapInstance.addLayer(layer, beforeId);
        enforceMapLayerOrder(mapInstance);
        mapInstance.triggerRepaint?.();
        globalThis.__OH_POLITY_TEXT_PTR0__ = {
          mounted: true,
          layerId: POLITY_TEXT_RENDERER_LAYER_ID,
          fontFamilies: [...fontFamilies],
          projection: mapInstance.getProjection?.()?.type ?? "unknown",
        };
        console.info("[map] PTR-0 polity text renderer mounted", {
          layerPresent: Boolean(mapInstance.getLayer?.(POLITY_TEXT_RENDERER_LAYER_ID)),
          fontFamilies,
          productionTextColor: textColor,
        });
      } catch (error) {
        console.error("[map] PTR-0 polity text renderer failed to mount:", error);
        removeLayer();
      } finally {
        mounting = false;
      }
    };

    ensureLayer();
    const onStyleData = () => { ensureLayer(); };
    mapInstance.on?.("styledata", onStyleData);

    return () => {
      cancelled = true;
      mapInstance.off?.("styledata", onStyleData);
      removeLayer();
      if (globalThis.__OH_POLITY_TEXT_PTR0__?.layerId === POLITY_TEXT_RENDERER_LAYER_ID) {
        delete globalThis.__OH_POLITY_TEXT_PTR0__;
      }
      layer = null;
    };
  }, [enabled, fontFamilies, haloColor, map, textColor]);

  return null;
}
