import { MercatorCoordinate } from "maplibre-gl";
import {
  canonicalSingleArcFromPolyline,
  cumulativeArcLengths,
  extractCenteredSubpathByArcLength,
  resamplePolylineByArcLength,
  sampleCubicBezier,
  smoothPolylineChaikin,
  signedBendMetrics,
  singleArcFromAxis,
} from "./polityTextSpline.js";
import { rasterizePolityText } from "./polityTextRasterizer.js";
import {
  planMetricTextSupport,
  planTerritorialTextSupport,
  polityTextOpacityAtZoom,
} from "./polityTextLayout.js";
import { optimizeTerritorialArcPlacement } from "./polityTextPlacement.js";

export const POLITY_TEXT_RENDERER_LAYER_ID = "polity-text-renderer";
const RASTER_FONT_SIZE_PX = 128;

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "unknown shader error";
    gl.deleteShader(shader);
    throw new Error(`Polity text shader compilation failed: ${log}`);
  }
  return shader;
};

const createProgram = (gl, vertexSource, fragmentSource) => {
  const program = gl.createProgram();
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`Polity text shader linking failed: ${log}`);
  }
  return program;
};

const matrixFromRenderArgs = (args) => {
  if (args?.defaultProjectionData?.mainMatrix) return args.defaultProjectionData.mainMatrix;
  if (args?.modelViewProjectionMatrix) return args.modelViewProjectionMatrix;
  if (Array.isArray(args) || ArrayBuffer.isView(args)) return args;
  return null;
};

const mercatorPointsFromLngLat = (lngLatPoints) => lngLatPoints.map(([lng, lat]) => {
  const coordinate = MercatorCoordinate.fromLngLat({ lng, lat });
  return [coordinate.x, coordinate.y];
});

export const buildRibbonVertices = ({ points, aspectRatio }) => {
  const { cumulative, total } = cumulativeArcLengths(points);
  if (points.length < 2 || total <= 0 || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return new Float32Array();
  }

  // The support-window arc length is selected from the raster's natural width,
  // so one map-space scale factor drives both axes and the font cannot stretch.
  const ribbonHeight = total / aspectRatio;
  const halfHeight = ribbonHeight / 2;
  const vertices = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    let tx = next[0] - previous[0];
    let ty = next[1] - previous[1];
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    const nx = ty;
    const ny = -tx;
    const [x, y] = points[index];
    const u = cumulative[index] / total;

    vertices.push(x + nx * halfHeight, y + ny * halfHeight, u, 1);
    vertices.push(x - nx * halfHeight, y - ny * halfHeight, u, 0);
  }

  return new Float32Array(vertices);
};

const buildLineVertices = (points) => new Float32Array(points.flat());

const defaultPtr0Record = () => ({
  id: "ptr0-russia-proof",
  owner: "Russian Federation",
  text: "RUSSIAN FEDERATION",
  baseline: sampleCubicBezier({
    p0: [37, 52.0],
    p1: [55, 62.6],
    p2: [98, 63.0],
    p3: [120, 54.0],
    samples: 256,
  }),
  minZoom: 0,
  maxZoom: 24,
  priorityScale: 1,
  fontPxAtZoom4: 64,
  letterSpacingEm: 0.055,
});

export const measurePolityTextRenderRecord = ({
  record,
  fontFamilies,
  fillStyle,
  haloStyle,
  haloWidthPx = 5,
  samples = 128,
}) => {
  const baselineLngLat = Array.isArray(record?.baseline) ? record.baseline : [];
  const anchorLngLat = Array.isArray(record?.anchor) && record.anchor.length >= 2
    ? record.anchor
    : null;
  const hasTerritorialEnvelope = (
    anchorLngLat
    && Number(record?.ptrAxisSpanWorld) > 0
    && Number(record?.ptrCrossSpanWorld) > 0
  );
  if (baselineLngLat.length < 2 && !hasTerritorialEnvelope) return null;

  const raster = rasterizePolityText({
    text: record.text,
    fontFamilies,
    fontSizePx: RASTER_FONT_SIZE_PX,
    letterSpacingEm: record.letterSpacingEm,
    fillStyle,
    haloStyle,
    haloWidthPx,
  });

  const requestedFontPxAtZoom4 = Math.max(6, Number(record.fontPxAtZoom4) || 24);
  const rawMercator = baselineLngLat.length >= 2
    ? mercatorPointsFromLngLat(baselineLngLat)
    : [];
  const smoothMercator = rawMercator.length >= 2
    ? smoothPolylineChaikin(rawMercator, 4)
    : [];
  const denseMercator = smoothMercator.length >= 2
    ? resamplePolylineByArcLength(smoothMercator, Math.max(192, samples * 2))
    : [];
  const measuredBaselineLength = denseMercator.length >= 2
    ? cumulativeArcLengths(denseMercator).total
    : 0;
  const baselineLength = measuredBaselineLength > 0
    ? measuredBaselineLength
    : Number(record?.ptrAxisSpanWorld) || 0;
  if (!(baselineLength > 0)) return null;

  if (hasTerritorialEnvelope) {
    const metricPlan = planTerritorialTextSupport({
      rasterWidthPx: raster.width,
      rasterHeightPx: raster.height,
      rasterFontSizePx: raster.fontSizePx,
      axisSpanWorld: Number(record.ptrAxisSpanWorld),
      crossSpanWorld: Number(record.ptrCrossSpanWorld),
      targetSpanFraction: 0.93,
      maxHeightFraction: 0.42,
    });
    const anchorCoordinate = MercatorCoordinate.fromLngLat({
      lng: Number(anchorLngLat[0]),
      lat: Number(anchorLngLat[1]),
    });
    const sourceBend = denseMercator.length >= 2
      ? signedBendMetrics(denseMercator)
      : { sign: 1, bendRatio: 0 };
    const bendSign = sourceBend.sign || 1;
    const bendRatio = Math.min(
      0.085,
      Math.max(0.022, Number(sourceBend.bendRatio || 0) * 1.2),
    );
    const heightLimitedSupport = metricPlan.maxHeightWorld > 0
      ? metricPlan.maxHeightWorld * raster.aspectRatio
      : Number(record.ptrAxisSpanWorld) * 0.98;
    const placementTask = record.ptrCoverageGrid && record.placementMode !== "fast"
      ? {
          anchor: [anchorCoordinate.x, anchorCoordinate.y],
          preferredAngleDeg: Number(record.ptrPreferredAngle) || 0,
          axisSpanWorld: Number(record.ptrAxisSpanWorld),
          crossSpanWorld: Number(record.ptrCrossSpanWorld),
          desiredSupportLength: metricPlan.supportLength,
          maxSupportLength: Math.min(
            Number(record.ptrAxisSpanWorld) * 0.98,
            heightLimitedSupport,
          ),
          bendRatio,
          bendSign,
          aspectRatio: raster.aspectRatio,
          coverageGrid: record.ptrCoverageGrid,
          samples,
        }
      : null;
    const fallbackSupportPoints = singleArcFromAxis({
      center: [anchorCoordinate.x, anchorCoordinate.y],
      angleDeg: Number(record.ptrPreferredAngle) || 0,
      chordLength: metricPlan.supportLength,
      bendRatio,
      bendSign,
      samples,
    });

    return {
      record,
      raster,
      samples,
      hasTerritorialEnvelope: true,
      baselineLength,
      renderBaselineLength: Number(record.ptrAxisSpanWorld),
      requestedFontPxAtZoom4,
      metricPlan,
      placementTask,
      fallbackSupportPoints,
    };
  }

  const metricPlan = planMetricTextSupport({
    rasterWidthPx: raster.width,
    rasterFontSizePx: raster.fontSizePx,
    requestedFontPxAtZoom4,
    baselineLength,
    minSupportFraction: 0.86,
    maxSupportFraction: 0.97,
    maxUpscaleFactor: 3.5,
  });
  const rawSupportPoints = extractCenteredSubpathByArcLength(
    denseMercator,
    metricPlan.supportLength,
    { samples: Math.max(64, samples), centerFraction: 0.5 },
  );
  const supportPoints = canonicalSingleArcFromPolyline(rawSupportPoints, {
    samples,
    bendScale: 1.02,
    minBendRatio: 0.006,
    maxBendRatio: 0.072,
  });

  return {
    record,
    raster,
    samples,
    hasTerritorialEnvelope: false,
    baselineLength,
    renderBaselineLength: baselineLength,
    requestedFontPxAtZoom4,
    metricPlan,
    placementTask: null,
    fallbackSupportPoints: supportPoints,
  };
};

export const finalizePolityTextRenderRecord = ({
  plan,
  optimizedPlacement = null,
  placementResolved = false,
} = {}) => {
  if (!plan) return null;

  const {
    record,
    raster,
    metricPlan,
    baselineLength,
    renderBaselineLength,
    requestedFontPxAtZoom4,
    placementTask,
    fallbackSupportPoints,
  } = plan;

  // The production PTR path resolves territorial search in a dedicated worker.
  // Direct callers/tests still retain the synchronous fallback for compatibility,
  // but custom-layer construction no longer needs to perform expensive search.
  const optimized = placementTask
    ? (placementResolved ? optimizedPlacement : optimizeTerritorialArcPlacement(placementTask))
    : null;
  const supportPoints = optimized?.points ?? fallbackSupportPoints;
  const supportLength = cumulativeArcLengths(supportPoints).total;
  if (!(supportLength > 0)) return null;

  const effectiveFontPxAtZoom4 = metricPlan.effectiveFontPxAtZoom4
    * (supportLength / Math.max(metricPlan.supportLength, 1e-15));
  const placementDiagnostics = optimized ? {
    score: optimized.score,
    evaluated: optimized.evaluated,
    coarseEvaluated: optimized.coarseEvaluated,
    refinedSeeds: optimized.refinedSeeds,
    ownCoverage: optimized.ownCoverage,
    centerlineCoverage: optimized.centerlineCoverage,
    spanUsage: optimized.spanUsage,
    crossCentering: optimized.crossCentering,
    axisCentering: optimized.axisCentering,
    selectedAngle: optimized.angleDeg,
    preferredAngle: optimized.preferredAngleDeg,
    center: optimized.center,
  } : null;

  return {
    record,
    raster,
    supportPoints,
    ribbonVertices: buildRibbonVertices({ points: supportPoints, aspectRatio: raster.aspectRatio }),
    lineVertices: buildLineVertices(supportPoints),
    supportLength,
    baselineLength: renderBaselineLength,
    effectiveFontPxAtZoom4,
    requestedFontPxAtZoom4,
    supportFraction: renderBaselineLength > 0
      ? supportLength / renderBaselineLength
      : metricPlan.supportFraction,
    naturalSupportFraction: metricPlan.naturalSupportFraction ?? null,
    placementDiagnostics,
    texture: null,
    ribbonBuffer: null,
    lineBuffer: null,
    ribbonVertexCount: supportPoints.length * 2,
    lineVertexCount: supportPoints.length,
  };
};

export const preparePolityTextRenderRecord = (options) => {
  const plan = measurePolityTextRenderRecord(options);
  return finalizePolityTextRenderRecord({ plan });
};

export const createPolityTextCustomLayer = ({
  id = POLITY_TEXT_RENDERER_LAYER_ID,
  records = null,
  preparedEntries = null,
  fontFamilies = ["Georgia", "Times New Roman", "serif"],
  fillStyle = "rgba(255, 52, 214, 1)",
  haloStyle = "rgba(0, 0, 0, 0.96)",
  haloWidthPx = 5,
  samples = 128,
  debugBaseline = true,
} = {}) => {
  const sourceRecords = Array.isArray(records) && records.length ? records : [defaultPtr0Record()];
  const prepared = Array.isArray(preparedEntries)
    ? preparedEntries.filter(Boolean)
    : sourceRecords
      .map((record) => preparePolityTextRenderRecord({
        record,
        fontFamilies,
        fillStyle,
        haloStyle,
        haloWidthPx,
        samples,
      }))
      .filter(Boolean);

  return {
    id,
    type: "custom",
    renderingMode: "2d",
    _map: null,
    _textureProgram: null,
    _lineProgram: null,
    _entries: prepared,
    _didLogFirstRender: false,
    _didWarnMissingMatrix: false,

    onAdd(map, gl) {
      this._map = map;
      console.info("[map] PTR custom layer onAdd", {
        labels: prepared.map((entry) => ({
          owner: entry.record.owner,
          text: entry.record.text,
          requestedFontPxAtZoom4: Number(entry.requestedFontPxAtZoom4.toFixed(2)),
          effectiveFontPxAtZoom4: Number(entry.effectiveFontPxAtZoom4.toFixed(2)),
          supportShare: Number((entry.supportLength / entry.baselineLength).toFixed(3)),
          plannedSupportShare: Number((entry.supportFraction ?? 0).toFixed(3)),
          naturalSupportShare: Number((entry.naturalSupportFraction ?? 0).toFixed(3)),
          placement: entry.placementDiagnostics ? {
            ownCoverage: Number(entry.placementDiagnostics.ownCoverage.toFixed(3)),
            centerlineCoverage: Number(entry.placementDiagnostics.centerlineCoverage.toFixed(3)),
            spanUsage: Number(entry.placementDiagnostics.spanUsage.toFixed(3)),
            crossCentering: Number(entry.placementDiagnostics.crossCentering.toFixed(3)),
            selectedAngle: Number(entry.placementDiagnostics.selectedAngle.toFixed(1)),
            preferredAngle: Number(entry.placementDiagnostics.preferredAngle.toFixed(1)),
            candidates: entry.placementDiagnostics.evaluated,
          } : null,
        })),
      });

      const textureVertexSource = `#version 300 es
        precision highp float;
        uniform mat4 u_matrix;
        in vec2 a_pos;
        in vec2 a_uv;
        out vec2 v_uv;
        void main() {
          gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
          v_uv = a_uv;
        }
      `;
      const textureFragmentSource = `#version 300 es
        precision mediump float;
        uniform sampler2D u_texture;
        uniform float u_opacity;
        in vec2 v_uv;
        out vec4 fragColor;
        void main() {
          vec4 texel = texture(u_texture, v_uv);
          fragColor = vec4(texel.rgb, texel.a * u_opacity);
        }
      `;
      const lineVertexSource = `#version 300 es
        precision highp float;
        uniform mat4 u_matrix;
        in vec2 a_pos;
        void main() {
          gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
        }
      `;
      const lineFragmentSource = `#version 300 es
        precision mediump float;
        out vec4 fragColor;
        void main() {
          fragColor = vec4(1.0, 0.86, 0.0, 0.58);
        }
      `;

      this._textureProgram = createProgram(gl, textureVertexSource, textureFragmentSource);
      this._lineProgram = debugBaseline ? createProgram(gl, lineVertexSource, lineFragmentSource) : null;

      for (const entry of this._entries) {
        entry.ribbonBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, entry.ribbonBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, entry.ribbonVertices, gl.STATIC_DRAW);

        if (debugBaseline) {
          entry.lineBuffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, entry.lineBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, entry.lineVertices, gl.STATIC_DRAW);
        }

        entry.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, entry.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, entry.raster.canvas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
      }

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },

    render(gl, args) {
      const matrix = matrixFromRenderArgs(args);
      if (!matrix) {
        if (!this._didWarnMissingMatrix) {
          this._didWarnMissingMatrix = true;
          console.warn("[map] PTR render received no projection matrix", args);
        }
        return;
      }
      if (!this._textureProgram) return;

      const zoom = Number(this._map?.getZoom?.() ?? 0);
      const visible = this._entries.filter((entry) => (
        polityTextOpacityAtZoom({
          zoom,
          minZoom: entry.record.minZoom,
          maxZoom: entry.record.maxZoom,
          fadeInZoomSpan: entry.record.fadeInZoomSpan,
          fadeOutStartZoom: entry.record.fadeOutStartZoom,
        }) > 0.002
      ));
      if (!visible.length) return;

      if (!this._didLogFirstRender) {
        this._didLogFirstRender = true;
        console.info("[map] PTR first WebGL render", {
          zoom,
          visibleOwners: visible.map((entry) => entry.record.owner),
        });
      }

      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);

      if (debugBaseline && this._lineProgram) {
        gl.useProgram(this._lineProgram);
        const matrixLocation = gl.getUniformLocation(this._lineProgram, "u_matrix");
        const positionLocation = gl.getAttribLocation(this._lineProgram, "a_pos");
        gl.uniformMatrix4fv(matrixLocation, false, matrix);
        gl.enableVertexAttribArray(positionLocation);
        for (const entry of visible) {
          if (!entry.lineBuffer) continue;
          gl.bindBuffer(gl.ARRAY_BUFFER, entry.lineBuffer);
          gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.LINE_STRIP, 0, entry.lineVertexCount);
        }
      }

      gl.useProgram(this._textureProgram);
      const matrixLocation = gl.getUniformLocation(this._textureProgram, "u_matrix");
      const textureLocation = gl.getUniformLocation(this._textureProgram, "u_texture");
      const opacityLocation = gl.getUniformLocation(this._textureProgram, "u_opacity");
      const positionLocation = gl.getAttribLocation(this._textureProgram, "a_pos");
      const uvLocation = gl.getAttribLocation(this._textureProgram, "a_uv");
      gl.uniformMatrix4fv(matrixLocation, false, matrix);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(textureLocation, 0);
      gl.enableVertexAttribArray(positionLocation);
      gl.enableVertexAttribArray(uvLocation);

      // Lower-priority labels draw first; stronger polities remain legible on top
      // during this A/B stage. PTR-3 will replace this with deterministic collisions.
      const drawOrder = [...visible].sort((left, right) => (
        Number(left.record.priorityScale ?? 0) - Number(right.record.priorityScale ?? 0)
      ));
      for (const entry of drawOrder) {
        if (!entry.texture || !entry.ribbonBuffer) continue;
        const opacity = polityTextOpacityAtZoom({
          zoom,
          minZoom: entry.record.minZoom,
          maxZoom: entry.record.maxZoom,
          fadeInZoomSpan: entry.record.fadeInZoomSpan,
          fadeOutStartZoom: entry.record.fadeOutStartZoom,
        });
        if (opacity <= 0.002) continue;
        gl.uniform1f(opacityLocation, opacity);
        gl.bindTexture(gl.TEXTURE_2D, entry.texture);
        gl.bindBuffer(gl.ARRAY_BUFFER, entry.ribbonBuffer);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, entry.ribbonVertexCount);
      }
    },

    onRemove(_map, gl) {
      for (const entry of this._entries) {
        if (entry.ribbonBuffer) gl.deleteBuffer(entry.ribbonBuffer);
        if (entry.lineBuffer) gl.deleteBuffer(entry.lineBuffer);
        if (entry.texture) gl.deleteTexture(entry.texture);
        entry.ribbonBuffer = null;
        entry.lineBuffer = null;
        entry.texture = null;
      }
      if (this._textureProgram) gl.deleteProgram(this._textureProgram);
      if (this._lineProgram) gl.deleteProgram(this._lineProgram);
      this._map = null;
      this._textureProgram = null;
      this._lineProgram = null;
    },
  };
};
