/*! Open Historia — political region display-mesh rollout policy © 2026 Open Historia contributors, AGPL-3.0-or-later (see LICENSE). */

// The topology-repair mesh is deliberately disabled until it can prove feature-
// complete, hit-test-safe parity with canonical scenario geometry. Live testing
// found that substituting it for the canonical region source can make provinces
// disappear even though their political state still exists. Canonical GeoJSON +
// stock PMTiles therefore remain the active renderer; keep the repair code as an
// isolated experiment rather than letting it own visible/clickable territory.
export const REGION_DISPLAY_MESH_ENABLED = false;
