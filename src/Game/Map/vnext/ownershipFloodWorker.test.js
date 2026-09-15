import test from "node:test";
import assert from "node:assert/strict";
import { buildOwnershipFloodFields } from "./ownershipTransitionWorker.js";

const squareGeometry = {
  type: "Polygon",
  coordinates: [[[0, 0], [10, 0], [10, 4], [0, 4], [0, 0]]],
};

const texturePixel = (field, x, y) => {
  const index = ((y * field.width) + x) * 4;
  return {
    arrival: field.textureData[index],
    detached: field.textureData[index + 1],
    alpha: field.textureData[index + 3],
  };
};

const firstMaskedPixelInColumn = (field, x) => {
  for (let y = 0; y < field.height; y += 1) {
    const pixel = texturePixel(field, x, y);
    if (pixel.alpha) return pixel;
  }
  return null;
};

test("frontier-distance flood reaches the recipient-facing side before the far side", () => {
  const [field] = buildOwnershipFloodFields({
    type: "Feature",
    id: "flood-east",
    properties: {
      id: "flood-east",
      fromOwner: "A",
      toOwner: "B",
      fromColor: "rgb(200, 0, 0)",
      toColor: "rgb(0, 100, 200)",
      sweepDx: 1,
      sweepDy: 0,
      frontierSegments: [[[0, 0], [0, 4]]],
    },
    geometry: squareGeometry,
  });
  assert.ok(field);
  const left = firstMaskedPixelInColumn(field, Math.max(0, Math.floor(field.width * 0.05)));
  const right = firstMaskedPixelInColumn(field, Math.min(field.width - 1, Math.floor(field.width * 0.95)));
  assert.ok(left && right);
  assert.ok(left.arrival < right.arrival, "shared-frontier cells must arrive before the far edge");
  assert.ok(field.durationMs >= 320 && field.durationMs <= 650);
  assert.ok(field.width <= 320 && field.height <= 320);
});

test("flood mask respects holes instead of propagating straight through excluded geography", () => {
  const [field] = buildOwnershipFloodFields({
    type: "Feature",
    id: "donut",
    properties: {
      id: "donut",
      fromOwner: "A",
      toOwner: "B",
      sweepDx: 1,
      sweepDy: 0,
      frontierSegments: [[[0, 0], [0, 10]]],
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
      ],
    },
  });
  assert.ok(field);
  const center = texturePixel(field, Math.floor(field.width / 2), Math.floor(field.height / 2));
  assert.equal(center.alpha, 0, "hole cells must not be painted by the flood texture");
});

test("detached multipolygon components share one bounded field and are marked for soft pop/fade", () => {
  const fields = buildOwnershipFloodFields({
    type: "Feature",
    id: "islands",
    properties: {
      id: "islands",
      fromOwner: "A",
      toOwner: "B",
      sweepDx: 1,
      sweepDy: 0,
      frontierSegments: [[[0, 0], [0, 3]]],
    },
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]]],
        [[[20, 0], [22, 0], [22, 2], [20, 2], [20, 0]]],
      ],
    },
  });
  assert.equal(fields.length, 1, "one transferred region must never explode into one GPU field per island");
  const [field] = fields;
  assert.ok(field.componentCount >= 2);
  assert.ok(field.textureData.some((value, index) => index % 4 === 1 && value === 255));
  assert.ok(field.width <= 224 && field.height <= 224);
});

test("hundreds of multipolygon pieces remain one bounded flood field", () => {
  const coordinates = [];
  for (let index = 0; index < 200; index += 1) {
    const x = (index % 20) * 0.25;
    const y = Math.floor(index / 20) * 0.25;
    coordinates.push([[[x, y], [x + 0.12, y], [x + 0.12, y + 0.12], [x, y + 0.12], [x, y]]]);
  }
  const fields = buildOwnershipFloodFields({
    type: "Feature",
    id: "archipelago",
    properties: {
      id: "archipelago",
      fromOwner: "A",
      toOwner: "B",
      sweepDx: 1,
      sweepDy: 0,
      frontierSegments: [[[0, 0], [0, 0.12]]],
    },
    geometry: { type: "MultiPolygon", coordinates },
  });
  assert.equal(fields.length, 1);
  assert.ok(fields[0].componentCount > 1);
  assert.ok(fields[0].width <= 224 && fields[0].height <= 224);
});


test("straight shared frontier still produces a coherent non-planar flood front", () => {
  const [field] = buildOwnershipFloodFields({
    type: "Feature",
    id: "straight-front-consistency",
    properties: {
      id: "straight-front-consistency",
      fromOwner: "A",
      toOwner: "B",
      sweepDx: 1,
      sweepDy: 0,
      frontierSegments: [[[0, 0], [0, 10]]],
    },
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [14, 0], [14, 10], [0, 10], [0, 0]]],
    },
  });
  assert.ok(field);

  const x = Math.max(1, Math.min(field.width - 2, Math.floor(field.width * 0.55)));
  const samples = [];
  for (const fraction of [0.18, 0.32, 0.50, 0.68, 0.82]) {
    const y = Math.max(0, Math.min(field.height - 1, Math.floor(field.height * fraction)));
    const pixel = texturePixel(field, x, y);
    if (pixel.alpha) samples.push(pixel.arrival);
  }
  assert.ok(samples.length >= 4);
  const spread = Math.max(...samples) - Math.min(...samples);
  assert.ok(spread >= 5, `straight frontier should still have visibly curved arrival contours (spread=${spread})`);

  // It must remain a directional frontier flood rather than noise: the near
  // side still arrives decisively before the far side.
  const near = firstMaskedPixelInColumn(field, Math.floor(field.width * 0.08));
  const far = firstMaskedPixelInColumn(field, Math.floor(field.width * 0.92));
  assert.ok(near && far);
  assert.ok(near.arrival + 80 < far.arrival);
});
