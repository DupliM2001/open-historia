import test from "node:test";
import assert from "node:assert/strict";
import { MAP_LAYER_ORDER, enforceMapLayerOrder } from "./mapLayerOrder.js";

const index = (id) => MAP_LAYER_ORDER.indexOf(id);

test("political fills and borders remain below cities markers and units", () => {
  for (const political of [
    "regions-fill",
    "custom-regions-fill-far",
    "custom-regions-fill",
    "ownership-transition-fill",
    "polity-boundaries-shadow",
    "polity-boundaries",
  ]) {
    assert.ok(index(political) >= 0, `${political} is missing from canonical order`);
    assert.ok(index(political) < index("cities-shapes"));
    assert.ok(index(political) < index("cities-labels"));
    assert.ok(index(political) < index("markers-shapes-strategic"));
    assert.ok(index(political) < index("units-fill"));
  }
});

test("sovereign polity boundaries remain above political fills", () => {
  assert.ok(index("polity-boundaries-shadow") > index("custom-regions-disputed-vnext"));
  assert.ok(index("polity-boundaries") > index("polity-boundaries-shadow"));
  assert.ok(index("polity-boundaries") > index("regions-fill"));
});

test("late political fills are deterministically moved underneath existing object layers", () => {
  let order = [
    "basemap",
    "polity-boundaries",
    "cities-shapes",
    "cities-labels",
    "units-fill",
    // Simulate a scenario fill mounting late and therefore being appended above objects.
    "custom-regions-fill",
  ];
  const layers = new Set(order);
  const map = {
    getLayer: (id) => layers.has(id) ? { id } : undefined,
    getLayersOrder: () => [...order],
    moveLayer: (id) => {
      order = order.filter((item) => item !== id);
      order.push(id);
    },
  };

  assert.equal(enforceMapLayerOrder(map), true);
  assert.deepEqual(order, [
    "basemap",
    "custom-regions-fill",
    "polity-boundaries",
    "cities-shapes",
    "cities-labels",
    "units-fill",
  ]);
  assert.equal(enforceMapLayerOrder(map), false);
});
