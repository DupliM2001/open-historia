/*! Open Historia — the war room's fortified lines and fleets on the map © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// What the war room builds and what it sails, marked on its map while it is
// open (warRoomMarks.js): the name of every fortified line, the one drawn and
// waiting to be ordered built, and the player's own fleets with the stations
// and courses they are told. The lines themselves are the map's own, the same
// in the war room as out of it, with their breaches and what is built of them
// (WarGeographyLayers.jsx). Read from the world as it stands; nothing is drawn
// while the war room is shut. The lines lie under the planned movements, and the marks
// on the fleets under the fleets' own counters (mapLayerOrder.js).

import React, { useEffect, useMemo } from "react";
import { Layer, Source, useMap } from "react-map-gl/maplibre";
import { fleetsOf } from "../../runtime/naval/fleetOps.js";
import { useRuntimeState } from "../../runtime/useRuntimeState.js";
import { normalizeFortifications } from "../../runtime/warGeography.js";
import { enforceMapLayerOrder } from "./mapLayerOrder.js";
import { fleetFeatures, lineFeatures } from "./warRoomMarks.js";
import { useWarRoom } from "./warRoomStore.js";

const NONE = Object.freeze([]);
const selectLines = (world) => (Array.isArray(world?.fortifications) ? world.fortifications : NONE);
const selectUnits = (world) => (Array.isArray(world?.units) ? world.units : NONE);
const selectOrders = (world) => (Array.isArray(world?.pendingUnitOrders) ? world.pendingUnitOrders : NONE);
const selectCountry = (game) => String(game?.country ?? "");
const selectDate = (game) => String(game?.gameDate || game?.startDate || "");

const IS = (what) => ["==", ["get", "what"], what];
// A line is as heavy as it is strong.
const LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 3, ["+", 1, ["*", 0.22, ["get", "level"]]], 8, ["+", 2, ["*", 0.5, ["get", "level"]]]];
const CASING_WIDTH = ["interpolate", ["linear"], ["zoom"], 3, ["+", 3, ["*", 0.22, ["get", "level"]]], 8, ["+", 4.5, ["*", 0.5, ["get", "level"]]]];
const RING_RADIUS = ["interpolate", ["linear"], ["zoom"], 2, ["case", ["get", "lit"], 13, 10], 6, ["case", ["get", "lit"], 18, 14], 12, ["case", ["get", "lit"], 24, 19]];

const WarRoomMarks = () => {
  const { current: mapRef } = useMap();
  const open = useWarRoom((state) => state.open);
  const draft = useWarRoom((state) => state.draft);
  const level = useWarRoom((state) => state.level);
  const picked = useWarRoom((state) => state.fleet);
  const lines = useRuntimeState("world", selectLines);
  const units = useRuntimeState("world", selectUnits);
  const orders = useRuntimeState("world", selectOrders);
  const country = useRuntimeState("game", selectCountry);
  const date = useRuntimeState("game", selectDate);
  const lineData = useMemo(
    () => lineFeatures({ lines: open ? normalizeFortifications(lines) : NONE, draft, level, player: country, date }),
    [open, lines, draft, level, country, date],
  );
  const fleetData = useMemo(
    () => fleetFeatures({ fleets: open ? fleetsOf({ units, pendingUnitOrders: orders }, country) : NONE, picked }),
    [open, units, orders, country, picked],
  );

  // The layers come and go with the war room; the map's own order is put back each time they come.
  useEffect(() => {
    if (!open) return;
    const map = mapRef?.getMap?.() ?? mapRef;
    try {
      enforceMapLayerOrder(map);
    } catch { /* the map is between styles */ }
  }, [open, mapRef, lineData, fleetData]);

  if (!open) return null;
  return (
    <>
      <Source id="warroom-lines-source" type="geojson" data={lineData}>
        <Layer
          id="warroom-lines-casing"
          type="line"
          filter={IS("draft")}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": "rgba(5, 8, 13, 0.8)", "line-width": CASING_WIDTH }}
        />
        <Layer
          id="warroom-lines-draft"
          type="line"
          filter={IS("draft")}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ["get", "colour"], "line-width": LINE_WIDTH, "line-dasharray": [0.3, 1.6] }}
        />
        {/* A line's own name, as its builder gave it: the player's words, and not translated. */}
        <Layer
          id="warroom-lines-label"
          type="symbol"
          filter={["all", ["!=", ["get", "label"], ""], ["!", IS("draft")]]}
          layout={{
            "symbol-placement": "line",
            "text-field": ["get", "label"],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 8, 13],
            "text-offset": [0, -1.1],
            "text-allow-overlap": false,
          }}
          paint={{ "text-color": ["get", "colour"], "text-halo-color": "rgba(5, 8, 13, 0.92)", "text-halo-width": 1.6 }}
        />
      </Source>
      <Source id="warroom-fleets-source" type="geojson" data={fleetData}>
        <Layer
          id="warroom-fleets-station"
          type="line"
          filter={IS("station")}
          paint={{ "line-color": ["get", "colour"], "line-width": ["case", ["get", "lit"], 2.4, 1.6], "line-opacity": ["case", ["get", "lit"], 0.95, 0.7], "line-dasharray": [2.2, 1.6] }}
        />
        <Layer
          id="warroom-fleets-course"
          type="line"
          filter={IS("course")}
          layout={{ "line-cap": "butt", "line-join": "round" }}
          paint={{ "line-color": ["get", "colour"], "line-width": ["case", ["get", "lit"], 3, 2], "line-opacity": ["case", ["get", "lit"], 1, 0.75], "line-dasharray": [2.4, 1.3] }}
        />
        <Layer
          id="warroom-fleets-head"
          type="fill"
          filter={IS("head")}
          paint={{ "fill-color": ["get", "colour"], "fill-opacity": ["case", ["get", "lit"], 1, 0.75], "fill-outline-color": "rgba(5, 8, 13, 0.9)" }}
        />
        <Layer
          id="warroom-fleets-ring"
          type="circle"
          filter={IS("fleet")}
          paint={{
            "circle-radius": RING_RADIUS,
            "circle-color": "rgba(0, 0, 0, 0)",
            "circle-stroke-color": ["get", "colour"],
            "circle-stroke-width": ["case", ["get", "lit"], 3, 1.8],
            "circle-pitch-alignment": "map",
          }}
        />
      </Source>
    </>
  );
};

export default WarRoomMarks;
