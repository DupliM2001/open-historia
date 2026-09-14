/*! Open Historia — current-renderer layer-order keeper © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { enforceMapLayerOrder } from "./mapLayerOrder.js";

// Exactly one component owns MapLibre layer reordering for the current renderer.
// `styledata` covers late addLayer calls, style reloads and projection changes.
const LayerOrder = () => {
  const { current: map } = useMap();

  useEffect(() => {
    const mapInstance = map?.getMap?.() ?? map;
    if (!mapInstance?.on) return undefined;

    const arrange = () => enforceMapLayerOrder(mapInstance);
    arrange();
    mapInstance.on("styledata", arrange);
    return () => mapInstance.off("styledata", arrange);
  }, [map]);

  return null;
};

export default LayerOrder;
