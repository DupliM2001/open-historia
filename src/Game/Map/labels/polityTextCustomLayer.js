import { MercatorCoordinate } from "maplibre-gl";
import { cumulativeArcLengths, resamplePolylineByArcLength, sampleCubicBezier } from "./polityTextSpline.js";
import { rasterizePolityText } from "./polityTextRasterizer.js";

export const POLITY_TEXT_RENDERER_LAYER_ID = "polity-text-renderer";

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

export const buildRibbonVertices = ({ points, aspectRatio, metricScale = 1 }) => {
  const { cumulative, total } = cumulativeArcLengths(points);
  if (points.length < 2 || total <= 0 || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return new Float32Array();
  }

  // One map-space scale factor drives both axes. This preserves the browser-shaped
  // texture aspect ratio exactly: bending changes direction, never glyph proportions.
  const ribbonHeight = (total / aspectRatio) * metricScale;
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
    // Mercator y grows southward. This normal points to the visual top
    // (north side) for an eastward label so the canvas texture is not mirrored.
    const nx = ty;
    const ny = -tx;
    const [x, y] = points[index];
    const u = cumulative[index] / total;

    // Triangle strip: upper then lower edge. Canvas upload is flipped on Y,
    // so v=1 samples the visual top of the rasterized label.
    vertices.push(x + nx * halfHeight, y + ny * halfHeight, u, 1);
    vertices.push(x - nx * halfHeight, y - ny * halfHeight, u, 0);
  }

  return new Float32Array(vertices);
};

const buildLineVertices = (points) => new Float32Array(points.flat());

export const createPolityTextCustomLayer = ({
  id = POLITY_TEXT_RENDERER_LAYER_ID,
  text = "RUSSIAN FEDERATION",
  fontFamilies = ["Georgia", "Times New Roman", "serif"],
  fillStyle = "rgba(255, 52, 214, 1)",
  haloStyle = "rgba(0, 0, 0, 0.96)",
  letterSpacingEm = 0.055,
  fontSizePx = 128,
  haloWidthPx = 5,
  samples = 256,
  metricScale = 1,
  debugBaseline = true,
  controlPoints = {
    p0: [37, 52.0],
    p1: [55, 62.6],
    p2: [98, 63.0],
    p3: [120, 54.0],
  },
} = {}) => {
  // Oversample the analytic cubic first, then re-sample in Mercator arc length.
  // Equal map-distance samples keep ribbon normals and texture mapping uniform.
  const lngLatSamples = sampleCubicBezier({ ...controlPoints, samples: Math.max(512, samples * 2) });
  const mercatorDenseSamples = mercatorPointsFromLngLat(lngLatSamples);
  const mercatorSamples = resamplePolylineByArcLength(mercatorDenseSamples, samples);
  const raster = rasterizePolityText({
    text,
    fontFamilies,
    fontSizePx,
    letterSpacingEm,
    fillStyle,
    haloStyle,
    haloWidthPx,
  });
  const ribbonVertices = buildRibbonVertices({
    points: mercatorSamples,
    aspectRatio: raster.aspectRatio,
    metricScale,
  });
  const lineVertices = buildLineVertices(mercatorSamples);

  return {
    id,
    type: "custom",
    renderingMode: "2d",
    _map: null,
    _textureProgram: null,
    _lineProgram: null,
    _ribbonBuffer: null,
    _lineBuffer: null,
    _texture: null,
    _ribbonVertexCount: ribbonVertices.length / 4,
    _lineVertexCount: lineVertices.length / 2,
    _didLogFirstRender: false,
    _didWarnMissingMatrix: false,

    onAdd(map, gl) {
      this._map = map;
      console.info("[map] PTR-0 custom layer onAdd", {
        ribbonVertices: this._ribbonVertexCount,
        lineVertices: this._lineVertexCount,
        raster: { width: raster.width, height: raster.height, aspectRatio: raster.aspectRatio },
        metricScale,
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
        in vec2 v_uv;
        out vec4 fragColor;
        void main() {
          fragColor = texture(u_texture, v_uv);
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
          fragColor = vec4(1.0, 0.86, 0.0, 0.64);
        }
      `;

      this._textureProgram = createProgram(gl, textureVertexSource, textureFragmentSource);
      this._lineProgram = debugBaseline ? createProgram(gl, lineVertexSource, lineFragmentSource) : null;

      this._ribbonBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._ribbonBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, ribbonVertices, gl.STATIC_DRAW);

      if (debugBaseline) {
        this._lineBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, lineVertices, gl.STATIC_DRAW);
      }

      this._texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster.canvas);
      // Do not leak pixel-store state into MapLibre's own texture uploads.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },

    render(gl, args) {
      const matrix = matrixFromRenderArgs(args);
      if (!matrix) {
        if (!this._didWarnMissingMatrix) {
          this._didWarnMissingMatrix = true;
          console.warn("[map] PTR-0 render received no projection matrix", args);
        }
        return;
      }
      if (!this._textureProgram || !this._texture || !this._ribbonBuffer) return;
      if (!this._didLogFirstRender) {
        this._didLogFirstRender = true;
        console.info("[map] PTR-0 first WebGL render", {
          matrixLength: matrix.length,
          ribbonVertices: this._ribbonVertexCount,
        });
      }

      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);

      if (debugBaseline && this._lineProgram && this._lineBuffer) {
        gl.useProgram(this._lineProgram);
        const matrixLocation = gl.getUniformLocation(this._lineProgram, "u_matrix");
        const positionLocation = gl.getAttribLocation(this._lineProgram, "a_pos");
        gl.uniformMatrix4fv(matrixLocation, false, matrix);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._lineBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINE_STRIP, 0, this._lineVertexCount);
      }

      gl.useProgram(this._textureProgram);
      const matrixLocation = gl.getUniformLocation(this._textureProgram, "u_matrix");
      const textureLocation = gl.getUniformLocation(this._textureProgram, "u_texture");
      const positionLocation = gl.getAttribLocation(this._textureProgram, "a_pos");
      const uvLocation = gl.getAttribLocation(this._textureProgram, "a_uv");
      gl.uniformMatrix4fv(matrixLocation, false, matrix);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._texture);
      gl.uniform1i(textureLocation, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._ribbonBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(uvLocation);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, this._ribbonVertexCount);
    },

    onRemove(_map, gl) {
      if (this._ribbonBuffer) gl.deleteBuffer(this._ribbonBuffer);
      if (this._lineBuffer) gl.deleteBuffer(this._lineBuffer);
      if (this._texture) gl.deleteTexture(this._texture);
      if (this._textureProgram) gl.deleteProgram(this._textureProgram);
      if (this._lineProgram) gl.deleteProgram(this._lineProgram);
      this._map = null;
      this._textureProgram = null;
      this._lineProgram = null;
      this._ribbonBuffer = null;
      this._lineBuffer = null;
      this._texture = null;
    },
  };
};
