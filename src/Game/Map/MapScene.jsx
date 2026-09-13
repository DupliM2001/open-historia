/*! Open Historia — map scene composition © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
import React, { Suspense, lazy } from "react";
import { useMap } from "react-map-gl/maplibre";
import Nations from "./Nations";
import Cities from "./Cities";
import MarkersLayer from "./MarkersLayer.jsx";
import Units from "./Units";
import GlobeEffects from "./GlobeEffects.jsx";
import RegionPopup from "../Selection/Regions";
import CountryInfoPanel from "../Selection/CountryPanel.jsx";
import UnitPopup from "../Selection/Units";
import FeaturePopup from "../Selection/Features.jsx";
import { MAP_SETTING_KEYS, useMapSetting } from "../../runtime/mapSettings.js";

// The legacy renderer is some 2,400 lines that ship off by default, so it is
// its own chunk, fetched only when the setting is on — the shape the editor and
// the debug console already take (App.jsx, GameUI/main.jsx). Both lazies name
// the same module so Rollup emits one chunk for the pair.
const LegacyScene = lazy(() => import("./legacy/index.jsx"));
const LegacyLayerOrder = lazy(() => import("./legacy/index.jsx").then((module) => ({ default: module.LegacyLayerOrder })));

// Temporary PCPv2 rendered-layer probe. This lives INSIDE the react-map-gl
// context so useMap() hands us the actual active MapLibre instance, avoiding
// outer-ref/remount timing ambiguity while we diagnose the persistent wedges.
const MapFillProbe = () => {
  const { current: map } = useMap();

  React.useEffect(() => {
    if (!map || typeof window === "undefined") return undefined;

    const politicalFillLayers = () => (map.getStyle?.()?.layers ?? [])
      .filter((layer) => (
        layer?.type === "fill"
        && /(polit|polity|region|countr|disput)/i.test(String(layer?.id ?? ""))
      ));
    const savedOpacity = new Map();

    const describeLayers = () => politicalFillLayers().map((layer) => ({
      id: layer.id,
      source: layer.source ?? "",
      sourceLayer: layer["source-layer"] ?? "",
      visibility: map.getLayoutProperty?.(layer.id, "visibility") ?? "visible",
      fillOpacity: map.getPaintProperty?.(layer.id, "fill-opacity"),
      fillColor: map.getPaintProperty?.(layer.id, "fill-color"),
      fillPattern: map.getPaintProperty?.(layer.id, "fill-pattern"),
    }));

    const restore = () => {
      for (const [layerId, opacity] of savedOpacity) {
        if (!map.getLayer?.(layerId)) continue;
        map.setPaintProperty?.(layerId, "fill-opacity", opacity);
      }
      savedOpacity.clear();
      map.triggerRepaint?.();
      return describeLayers();
    };

    const isolate = (layerIds) => {
      restore();
      const keep = new Set(
        (Array.isArray(layerIds) ? layerIds : [layerIds])
          .map((entry) => String(entry ?? ""))
          .filter(Boolean),
      );
      for (const layer of politicalFillLayers()) {
        const opacity = map.getPaintProperty?.(layer.id, "fill-opacity");
        savedOpacity.set(layer.id, opacity);
        if (!keep.has(layer.id)) map.setPaintProperty?.(layer.id, "fill-opacity", 0);
      }
      map.triggerRepaint?.();
      console.info("[OH MAP FILL PROBE] isolated", [...keep]);
      return describeLayers();
    };

    const inspect = (pointOrLngLat) => {
      let point = pointOrLngLat;
      if (Array.isArray(pointOrLngLat) && pointOrLngLat.length >= 2) {
        point = map.project?.({ lng: Number(pointOrLngLat[0]), lat: Number(pointOrLngLat[1]) });
      } else if (pointOrLngLat?.lng != null && pointOrLngLat?.lat != null) {
        point = map.project?.(pointOrLngLat);
      }
      if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) {
        throw new Error("inspect() expects a MapLibre screen point or [lng, lat]");
      }
      const layerIds = politicalFillLayers().map((layer) => layer.id);
      const features = layerIds.length
        ? map.queryRenderedFeatures?.(point, { layers: layerIds }) ?? []
        : [];
      const rows = features.map((feature) => ({
        layer: feature?.layer?.id ?? "",
        source: feature?.source ?? feature?.layer?.source ?? "",
        sourceLayer: feature?.sourceLayer ?? feature?.layer?.["source-layer"] ?? "",
        id: feature?.id ?? feature?.properties?.id ?? feature?.properties?.GID_1 ?? "",
        owner: feature?.properties?._liveOwner
          ?? feature?.properties?.owner
          ?? feature?.properties?.GID_0
          ?? "",
        name: feature?.properties?.name ?? feature?.properties?.NAME_1 ?? "",
        geometryType: feature?.geometry?.type ?? "",
      }));
      console.table(rows);
      console.info("[OH MAP FILL PROBE] point", point, "features", features);
      return { point, rows, features };
    };

    const pick = () => {
      console.info("[OH MAP FILL PROBE] click the center of a visible wedge");
      map.once?.("click", (event) => {
        const result = inspect(event.point);
        console.info(
          "[OH MAP FILL PROBE] clicked",
          [event.lngLat?.lng, event.lngLat?.lat],
          result.rows,
        );
      });
    };

    const probe = { map, layers: describeLayers, inspect, pick, isolate, restore };
    window.__OH_MAP__ = map;
    window.__OH_MAP_FILL_PROBE__ = probe;
    console.info(
      "[OH MAP FILL PROBE] ready (MapScene/useMap). Use window.__OH_MAP_FILL_PROBE__.layers(), .pick(), .isolate(id), .restore().",
    );

    return () => {
      restore();
      if (window.__OH_MAP__ === map) delete window.__OH_MAP__;
      if (window.__OH_MAP_FILL_PROBE__ === probe) delete window.__OH_MAP_FILL_PROBE__;
    };
  }, [map]);

  return null;
};

// The camera/basemap shell lives in World.jsx. Everything that is projected
// into that world lives here, in deliberate paint/placement order. Keeping the
// scene graph behind one boundary keeps layer changes decoupled from
// projection, terrain, or GPU lifecycle.
//
// It is also the single place the renderer choice is made. The legacy map is a
// copy of the components under src/Game/Map/legacy/ (see legacy/README for the
// few deliberate edits it carries); with the setting off the current renderer's
// files render exactly as they do without this feature at all. Switching is a
// remount, not a restyle: World.jsx keys the map instance on the renderer, and
// Settings announces the redraw so the game loading screen covers it.
const MapScene = ({ isGlobe = false }) => {
  const legacy = useMapSetting(MAP_SETTING_KEYS.legacyMapRenderer);
  return (
    <>
      <MapFillProbe />
      {legacy ? (
        <Suspense fallback={null}>
          <LegacyScene isGlobe={isGlobe} />
        </Suspense>
      ) : (
        <>
          <Nations isGlobe={isGlobe} />
          <Cities />
          <MarkersLayer />
        </>
      )}
      {/* Units is deliberately NOT swapped. The beta unit system postdates the
          fork and both branches descend from it, so there is no older version
          to go back to and no reason to want one — it is not part of what the
          renderer draws. */}
      <Units />
      {/* The legacy map ordered its layers itself, after mount. */}
      {legacy && (
        <Suspense fallback={null}>
          <LegacyLayerOrder />
        </Suspense>
      )}
      <GlobeEffects active={isGlobe} />
      <RegionPopup />
      <CountryInfoPanel />
      <UnitPopup />
      <FeaturePopup />
    </>
  );
};

export default MapScene;
