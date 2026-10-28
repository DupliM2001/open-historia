/*! Open Historia — where a build's map files are © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Every build reads its map files from its own assets/ folder, under the same
// names: the desktop from public/assets (fetched at first launch,
// scripts/fetch-map-assets.mjs), the website and the Android app from the
// assets/ the build laid in (scripts/stage-map-assets.mjs). The website is
// served under /play/, so its folder is the build's base plus assets.
// `?.` because only a Vite build defines import.meta.env: some modules that
// read this are loaded as they are by tests.
export const ASSETS_BASE = import.meta.env?.VITE_OH_WEB
  ? `${String(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/assets`
  : "/assets";
