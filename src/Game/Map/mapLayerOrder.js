/*! Open Historia — canonical current-renderer map layer stacking © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Political Cartography Pipeline v2 separates political truth (region fills)
// from presentation (boundaries, labels, cities, objects, units). React mount
// order cannot enforce that separation by itself because several sources mount
// asynchronously after world/scenario data arrives. MapLibre appends a late
// layer at the top unless it is explicitly reordered, which lets a political
// fill paint over boundaries and object/symbol layers.
//
// This list is the single current-renderer authority for bottom -> top order.
// Basemap/style-owned layers are intentionally absent and remain underneath.
export const MAP_LAYER_ORDER = [
  // Political body / local geography.
  "countries-fill",
  "countries-outline",
  "custom-regions-fill-far",
  "regions-fill",
  "regions-disputed",
  "regions-outline",
  "custom-regions-fill",
  "ownership-transition-fill",
  "custom-regions-local-outline",
  "custom-regions-disputed-vnext",

  // Sovereign frontiers are presentation, but must remain above every
  // political fill and below every semantic object/label layer.
  "polity-boundaries-shadow",
  "polity-boundaries",

  // Draped standing-order lines belong above map cartography but below symbols.
  "units-heading",
  "units-station",

  // Political labels.
  "country-curved-labels",
  "country-line-labels-live-world",
  "country-line-labels-live-detail",
  "country-labels-live-managed",
  "country-labels-live-overlap",
  "country-labels",
  // PTR-0 replacement typography proof. It intentionally sits above the old
  // polity symbols while both systems coexist, and below cities/objects.
  "polity-text-renderer",

  // Physical/world objects must never be buried by political cartography.
  "cities-shapes",
  "cities-labels",
  "markers-shapes-strategic",
  "markers-labels-strategic",
  "markers-shapes-regional",
  "markers-labels-regional",
  "markers-shapes-local",
  "markers-labels-local",

  // Unit counters are interactive operational objects and remain topmost.
  "units-fill",
  "units-icons",
  "units-name",
];

export const enforceMapLayerOrder = (map) => {
  if (!map?.getLayersOrder || !map.getLayer || !map.moveLayer) return false;

  const present = MAP_LAYER_ORDER.filter((id) => map.getLayer(id));
  if (!present.length) return false;

  const current = map.getLayersOrder();
  if (current.slice(-present.length).join("\u0000") === present.join("\u0000")) {
    return false;
  }

  // Move known app layers to the top one-by-one in canonical bottom->top order.
  // This leaves every style-owned basemap layer underneath and converges after
  // the styledata event caused by moveLayer because the next call is a no-op.
  for (const id of present) map.moveLayer(id);
  return true;
};
