/*! Open Historia — promotional dark National Geographic basemap adapter © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

// Esri's National Geographic cartography is available as a public
// World_Basemap_v2 vector style. We use the official style as the structural
// source, then darken its existing cartography instead of replacing it with a
// flat dark canvas. That preserves NatGeo's terrain/land-cover character while
// removing only the sovereign-country labels that would fight OpenHistoria's map.
export const NATGEO_VECTOR_STYLE_URL =
  "https://www.arcgis.com/sharing/rest/content/items/3d1a30626bbc46c582f148b9252676ce/resources/styles/root.json";

// National Geographic Dark must not collapse into Atlas Relief. Use Esri's
// label/reference-free World Physical Map as the photographic/printed-atlas
// foundation, then glaze the NatGeo vector ecosystems/physical cartography over
// it. ArcGIS publishes boundaries and places as a separate reference overlay for
// this basemap, so this source does not bake a fixed modern political partition
// underneath OpenHistoria's live borders.
export const NATGEO_PHYSICAL_TILE_TEMPLATE =
  "https://services.arcgisonline.com/ArcGIS/rest/services/" +
  "World_Physical_Map/MapServer/tile/{z}/{y}/{x}";

const DARK = Object.freeze({
  background: "#111416",
  waterText: "#91aab5",
  terrainText: "#baa98f",
  placeText: "#c6c0b5",
  regionText: "#d0cabd",
  streetText: "#b5b0a6",
  poiText: "#b9b39f",
  textHalo: "#0c0f12",
});

const text = (layer) => `${layer?.id ?? ""} ${layer?.["source-layer"] ?? ""}`.toLowerCase();
const has = (descriptor, words) => words.some((word) => descriptor.includes(word));

const WATER_WORDS = [
  "water", "marine", "ocean", "sea", "lake", "river", "stream", "bay", "gulf",
  "strait", "fjord", "canal", "reservoir", "wetland", "hydro",
];
const TERRAIN_LABEL_WORDS = [
  "mountain", "peak", "summit", "range", "ridge", "volcano", "canyon", "desert",
  "plateau", "valley", "glacier", "landform", "physical", "relief",
];
const ROAD_WORDS = [
  "road", "street", "highway", "motorway", "freeway", "transport", "route", "rail",
];
const REGION_LABEL_WORDS = [
  "province", "state", "oblast", "prefecture", "county", "district", "region", "admin1",
  "admin 1", "admin_1", "territory", "municipality", "governorate",
];
const COUNTRY_LABEL_SOURCE_LAYERS = new Set([
  "admin0 point",
]);

export const NATGEO_REFERENCE_TIER_METADATA_KEY = "openhistoria:natgeo-reference-tier";
const ADMIN_FILL_WORDS = [
  "admin0 ribbon", "admin1 ribbon", "ribbon", "boundary mask", "boundary fill",
];

export const classifyNatGeoDarkLabelLayer = (layer) => {
  if (layer?.type !== "symbol") return "none";
  const descriptor = text(layer);
  const sourceLayer = String(layer?.["source-layer"] ?? "").trim().toLowerCase();
  // Country names in Esri NatGeo are carried by the Admin0 point source layer.
  // Do NOT use an "admin0" substring test: capital-city layers legitimately
  // contain ids such as "City small scale/... admin0 capital" and must remain.
  if (COUNTRY_LABEL_SOURCE_LAYERS.has(sourceLayer)) return "suppress";
  if (has(descriptor, WATER_WORDS)) return "water";
  if (has(descriptor, TERRAIN_LABEL_WORDS)) return "terrain";
  if (has(descriptor, ROAD_WORDS)) return "street";
  if (has(descriptor, REGION_LABEL_WORDS)) return "region";
  if (descriptor.includes("poi")) return "poi";
  return "place";
};

const absolutize = (value, baseUrl) => {
  if (typeof value !== "string" || !value) return value;
  const placeholders = [];
  const protectedValue = value.replace(/\{[^}]+\}/g, (token) => {
    const marker = `__OH_MAP_TEMPLATE_${placeholders.length}__`;
    placeholders.push({ marker, token });
    return marker;
  });
  try {
    let resolved = new URL(protectedValue, baseUrl).toString();
    for (const { marker, token } of placeholders) resolved = resolved.replace(marker, token);
    return resolved;
  } catch {
    return value;
  }
};

const cleanLayer = (layer) => {
  const next = { ...layer };
  delete next.showProperties;
  if (next.layout) next.layout = { ...next.layout };
  if (next.paint) next.paint = { ...next.paint };
  return next;
};

const ARCGIS_VECTOR_TILE_SERVER_RE = /\/VectorTileServer\/?$/i;

// ArcGIS vector styles point their source `url` at an ArcGIS VectorTileServer
// metadata endpoint. MapLibre's vector-source `url` field, however, is defined
// as a TileJSON URL. Feeding the ArcGIS service metadata directly means the
// raster physical foundation can render while the entire NatGeo vector/reference
// half (roads, cities, admin labels, water labels, etc.) never receives tiles.
// Convert ArcGIS services to the explicit PBF tile template advertised by the
// service itself instead of relying on incompatible TileJSON semantics.
export const normalizeNatGeoVectorSource = (source) => {
  const next = { ...(source ?? {}) };
  if (next.type !== "vector" || typeof next.url !== "string") return next;
  const serviceUrl = next.url.replace(/\/+$/, "");
  if (!ARCGIS_VECTOR_TILE_SERVER_RE.test(serviceUrl)) return next;

  delete next.url;
  next.tiles = [`${serviceUrl}/tile/{z}/{y}/{x}.pbf`];
  next.minzoom = Number.isFinite(next.minzoom) ? next.minzoom : 0;
  // World_Basemap_v2 currently advertises maxLOD 16. MapLibre can overzoom the
  // last vector tile above this level, so there is no reason to request invalid
  // native z17+ service tiles.
  next.maxzoom = Number.isFinite(next.maxzoom) ? Math.min(next.maxzoom, 16) : 16;
  return next;
};

const tagNatGeoReferenceLayer = (layer, tier) => ({
  ...layer,
  metadata: {
    ...(layer?.metadata ?? {}),
    [NATGEO_REFERENCE_TIER_METADATA_KEY]: tier,
  },
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parseHex = (value) => {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const hasAlpha = hex.length === 8;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: hasAlpha ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
};

const parseRgb = (value) => {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!match) return null;
  return {
    r: clamp(Number(match[1]), 0, 255),
    g: clamp(Number(match[2]), 0, 255),
    b: clamp(Number(match[3]), 0, 255),
    a: match[4] == null ? 1 : clamp(Number(match[4]), 0, 1),
  };
};

const rgbToHsl = ({ r, g, b }) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
};

const hslToRgb = ({ h, s, l }) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hp < 1) [rp, gp, bp] = [c, x, 0];
  else if (hp < 2) [rp, gp, bp] = [x, c, 0];
  else if (hp < 3) [rp, gp, bp] = [0, c, x];
  else if (hp < 4) [rp, gp, bp] = [0, x, c];
  else if (hp < 5) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
};

const toHex = ({ r, g, b, a = 1 }) => {
  const hex = [r, g, b].map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0")).join("");
  if (a >= 0.999) return `#${hex}`;
  return `#${hex}${Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, "0")}`;
};

export const darkenNatGeoColor = (value, { water = false } = {}) => {
  const parsed = parseHex(value) ?? parseRgb(value);
  if (!parsed) return value;
  const hsl = rgbToHsl(parsed);
  const saturationScale = water ? 0.78 : 0.66;
  const saturationFloor = water ? 0.16 : 0.035;
  const saturationCap = water ? 0.48 : 0.42;
  const lightness = 0.085 + (Math.pow(clamp(hsl.l, 0, 1), 0.88) * 0.285);
  const transformed = hslToRgb({
    h: hsl.h,
    s: clamp(Math.max(saturationFloor, hsl.s * saturationScale), 0, saturationCap),
    l: clamp(lightness, 0.085, 0.37),
  });
  return toHex({ ...transformed, a: parsed.a });
};

const transformColorValue = (value, options) => {
  if (typeof value === "string") return darkenNatGeoColor(value, options);
  if (Array.isArray(value)) return value.map((entry) => transformColorValue(entry, options));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      transformColorValue(entry, options),
    ]));
  }
  return value;
};

const darkenPaintColors = (paint, { water = false } = {}) => {
  const next = { ...(paint ?? {}) };
  for (const [key, value] of Object.entries(next)) {
    if (key.includes("color")) next[key] = transformColorValue(value, { water });
  }
  return next;
};

const capOpacity = (paint, property, cap) => {
  if (!(property in paint)) {
    paint[property] = cap;
    return;
  }
  if (typeof paint[property] === "number") {
    paint[property] = Math.min(paint[property], cap);
    return;
  }
  if (Array.isArray(paint[property])) paint[property] = ["*", cap, paint[property]];
};

const darkFillLayer = (layer) => {
  const descriptor = text(layer);
  // Suppress decorative admin ribbons but keep normal physical/cartographic fills.
  if (has(descriptor, ADMIN_FILL_WORDS)) return null;
  const next = cleanLayer(layer);
  const water = has(descriptor, WATER_WORDS);
  const paint = darkenPaintColors(next.paint, { water });
  capOpacity(paint, "fill-opacity", water ? 0.28 : 0.36);
  next.paint = paint;
  return next;
};

const darkLineLayer = (layer) => {
  const descriptor = text(layer);
  const next = cleanLayer(layer);
  next.paint = darkenPaintColors(next.paint, { water: has(descriptor, WATER_WORDS) });
  // These lines must render ABOVE OH political fills or they disappear beneath
  // the semi-opaque country colours. The layer-order keeper promotes tagged
  // reference lines while keeping canonical OH sovereign borders above them.
  return tagNatGeoReferenceLayer(next, "line");
};

const darkSymbolLayer = (layer) => {
  const kind = classifyNatGeoDarkLabelLayer(layer);
  if (kind === "suppress" || kind === "none") return null;

  const next = cleanLayer(layer);
  const layout = { ...(next.layout ?? {}) };
  layout.visibility = "visible";
  next.layout = layout;

  const paint = { ...(next.paint ?? {}) };
  paint["text-halo-color"] = DARK.textHalo;
  paint["text-halo-width"] = kind === "street" ? 0.9 : 1.2;
  paint["text-halo-blur"] = 0.25;
  paint["text-color"] = kind === "water"
    ? DARK.waterText
    : kind === "terrain"
      ? DARK.terrainText
      : kind === "street"
        ? DARK.streetText
        : kind === "region"
          ? DARK.regionText
          : kind === "poi"
            ? DARK.poiText
            : DARK.placeText;
  next.paint = paint;

  // Keep original symbol visibility scale. The whole point is to preserve the
  // dense NatGeo reference feel from a distance, minus country names only.
  // Tag the surviving reference labels so the layer-order keeper can promote
  // them above political fills; otherwise they are technically present but
  // hidden under OH's colour wash, which was the live regression.
  return tagNatGeoReferenceLayer(next, "label");
};

const darkRasterLayer = (layer) => {
  const next = cleanLayer(layer);
  next.paint = {
    ...(next.paint ?? {}),
    "raster-saturation": -0.54,
    "raster-contrast": 0.34,
    "raster-brightness-min": 0,
    "raster-brightness-max": 0.38,
  };
  return next;
};

const transformLayer = (layer) => {
  if (!layer || typeof layer !== "object") return null;
  if (layer.type === "background") {
    return {
      ...cleanLayer(layer),
      paint: { "background-color": DARK.background },
    };
  }
  if (layer.type === "fill") return darkFillLayer(layer);
  if (layer.type === "line") return darkLineLayer(layer);
  if (layer.type === "symbol") return darkSymbolLayer(layer);
  if (layer.type === "circle" || layer.type === "heatmap" || layer.type === "fill-extrusion") return null;
  if (layer.type === "raster") return darkRasterLayer(layer);
  return cleanLayer(layer);
};

export const buildNatGeoDarkStyle = (sourceStyle, {
  terrainEnabled = false,
  terrainTileTemplate = "",
} = {}) => {
  if (!sourceStyle || typeof sourceStyle !== "object" || !Array.isArray(sourceStyle.layers)) {
    throw new Error("National Geographic vector style payload is invalid.");
  }

  const sources = {};
  for (const [id, source] of Object.entries(sourceStyle.sources ?? {})) {
    let next = { ...source };
    if (next.url) next.url = absolutize(next.url, NATGEO_VECTOR_STYLE_URL);
    if (Array.isArray(next.tiles)) next.tiles = next.tiles.map((url) => absolutize(url, NATGEO_VECTOR_STYLE_URL));
    next = normalizeNatGeoVectorSource(next);
    sources[id] = next;
  }
  sources["oh-natgeo-dark-physical"] = {
    type: "raster",
    tiles: [NATGEO_PHYSICAL_TILE_TEMPLATE],
    tileSize: 256,
    maxzoom: 8,
    attribution: "Physical map: Esri, U.S. National Park Service",
  };
  if (terrainEnabled && terrainTileTemplate) {
    sources["terrain-source"] = {
      type: "raster-dem",
      tiles: [terrainTileTemplate],
      encoding: "terrarium",
      maxzoom: 5,
      tileSize: 256,
    };
  }

  const transformed = sourceStyle.layers.map(transformLayer).filter(Boolean);
  const backgroundIndex = transformed.findIndex((layer) => layer.type === "background");
  transformed.splice(backgroundIndex >= 0 ? backgroundIndex + 1 : 0, 0, {
    id: "oh-natgeo-dark-physical",
    type: "raster",
    source: "oh-natgeo-dark-physical",
    paint: {
      "raster-resampling": "linear",
      "raster-fade-duration": 0,
      "raster-hue-rotate": -4,
      "raster-saturation": -0.18,
      "raster-contrast": 0.40,
      "raster-brightness-min": 0.01,
      "raster-brightness-max": 0.46,
      "raster-opacity": [
        "interpolate", ["linear"], ["zoom"],
        0, 0.92,
        3.5, 0.90,
        5.5, 0.84,
        7.5, 0.68,
        9.0, 0.34,
        10.5, 0.10,
        11.5, 0,
      ],
    },
  });

  return {
    ...sourceStyle,
    name: "OpenHistoria National Geographic Dark",
    sprite: sourceStyle.sprite ? absolutize(sourceStyle.sprite, NATGEO_VECTOR_STYLE_URL) : sourceStyle.sprite,
    glyphs: sourceStyle.glyphs ? absolutize(sourceStyle.glyphs, NATGEO_VECTOR_STYLE_URL) : sourceStyle.glyphs,
    sources,
    layers: transformed,
    sky: { "atmosphere-blend": 0 },
  };
};

let sourceStylePromise = null;
const loadNatGeoSourceStyle = async () => {
  if (!sourceStylePromise) {
    sourceStylePromise = fetch(NATGEO_VECTOR_STYLE_URL, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        sourceStylePromise = null;
        throw error;
      });
  }
  return sourceStylePromise;
};

export const loadNatGeoDarkStyle = async (options = {}) => (
  buildNatGeoDarkStyle(await loadNatGeoSourceStyle(), options)
);
