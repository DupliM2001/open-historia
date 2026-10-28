# Web Build (openhistoria.com)

The web build is the browser-only edition of Open Historia served from openhistoria.com (the `/play/` site). It runs the **entire game client unchanged** with **zero server**: a `window.fetch` interceptor answers every same-origin `/api/*` call out of IndexedDB, the map files are part of the site (§8), and games stay in this browser: there are no accounts and no sync (§10). Everything in this page lives under `src/runtime/web/` and ships in the web build and in the Android app (`--mode android`, which sets `VITE_OH_WEB` too and adds `VITE_OH_NATIVE` — see [mobile.md](mobile.md)); it is dynamically imported behind `import.meta.env.VITE_OH_WEB` so it is dead-code-eliminated from the desktop download, which keeps its real same-origin Express server.

See also: [Server build](server.md) (the Express store this mirrors), [World state](world-state.md), [Assets & PMTiles](assets-and-data.md), [Scenario & game library](runtime-services.md), [Community hub](runtime-services.md).

---

## 1. How it boots and how it is gated

The whole web backend is behind one Vite mode flag. `.env.web` sets `VITE_OH_WEB=1`, and that file is loaded **only** by `vite build --mode web`. The normal `npm run build` never sees it, so `import.meta.env.VITE_OH_WEB` is `undefined` there and every `if (import.meta.env.VITE_OH_WEB)` branch — plus the dynamic imports it guards — is stripped by tree-shaking.

| Step | Location | What happens |
|---|---|---|
| Gate | `src/main.jsx:28` | `if (import.meta.env.VITE_OH_WEB)` dynamically `import("./runtime/web/index.js")`, calls `installWebBackend()`, then `mount()`s the React app. Non-web builds just `mount()`. |
| Entry | `src/runtime/web/index.js` | `installWebBackend()` — seed → install interceptor → drop a leftover sign-in → home page. |
| Content fetch | `src/runtime/assets.js` (`warmPmtilesArchive`) | Reads each pmtiles archive from the build's own `assets/` (`src/runtime/assetsBase.js`, §8), or a scenario's own archive. |
| Worker fetches | `src/runtime/assets.js` (`prepareWorkerFetchableUrl`) | Workers never see the `window.fetch` patch, so the scenario's regions GeoJSON reaches MapLibre's `custom-regions-source` and the cartography worker through a `blob:` copy (`Nations.jsx` via `useWorkerFetchableUrl`); the runtime URL stays the epoch/cache key. |

`installWebBackend()` (`src/runtime/web/index.js`) runs, in order:

1. `await ensureSeeded()` — write the default scenario into IndexedDB before any `/api` call (`libraryStore.js`).
2. `installWebApiRouter()` — monkey-patch `window.fetch` (`router.js`).
3. `forgetRetiredAccount()` — deletes what a sign-in from before accounts were removed left in `kv` (`retiredAccount.js`, §10). Not awaited.
4. If `shouldShowHome()` (not yet "entered" this tab session) → `showHomePage()`.

Build scripts (`package.json`):

| Script | Command |
|---|---|
| `build:web` | `node scripts/seed-web-defaults.mjs && vite build --mode web --outDir dist-web --emptyOutDir && node scripts/stage-map-assets.mjs dist-web` |
| `build:site` | same, but `--base /play/`, then `scripts/assemble-site.mjs` (the parchment landing site wraps `/play/`). |
| `dev:web` | lays any missing map file into `public/` (`stage-map-assets.mjs public --missing-only`), then `vite --mode web`. |

`scripts/seed-web-defaults.mjs` regenerates `src/runtime/web/generated/defaultScenario.js` (auto-generated; the default scenario's meta + colors + base64 cover) so the seed is baked into the bundle.

---

## 2. Configuration (`.env.web`)

The one URL is the **registry Worker** (`open-historia-registry.nichojkrol.workers.dev`), for community hub downloads. The map needs no URL: it is part of the build (§8).

| Var | Value / default | Purpose | Read in |
|---|---|---|---|
| `VITE_OH_WEB` | `1` | Master flag; gates all web-mode code + dynamic imports. | `main.jsx`, `assets.js`, `libraryBar.jsx`, `settings.jsx` |
| `VITE_OH_HUB_URL` | Worker root | Community-hub GitHub proxy (`/hub/*`), because GitHub attachments send no CORS. | `router.js:109` |

---

## 3. The fake backend: the `/api` fetch interceptor (`router.js`)

There is no Express server. `installWebApiRouter()` (`router.js:138`) replaces `window.fetch` once (`installed` guard). The wrapper:

- Resolves the request URL against `location.href`. **Only** same-origin requests whose path starts with `/api/` are intercepted; everything else (AI providers, GitHub API, ESRI tiles, static assets, node URLs) passes straight to the saved `originalFetch`.
- Builds a real `Request`, dispatches to `route(request, url)`, and returns a real `Response` — so all the existing client code (`src/runtime/library.js`, `src/runtime/assets.js`, `documentIO.js`, `basemapLibrary.js`) runs **unchanged**.
- On throw: `SyntaxError` (bad JSON body) → `400`, anything else → `500` (mirrors Express body-parser behavior).

> **Important boundary:** only `window.fetch` is patched. `<img src>`, `<link>`, XHR, `EventSource`, and PMTiles' own range reads that don't go through `fetch` all **bypass** the interceptor. This is exactly why cover images are embedded as `data:` URLs (see §6) rather than served as `/api/...` paths.

### `route()` dispatch

`route()` (`router.js:38`) splits the path into `["api", domain, ...segments]` and dispatches on `domain`. Each handler returns a `Response` or `null` (fall through).

| `domain` (+ path shape) | Handler | Store file |
|---|---|---|
| `runtime/pmtiles/<key>` | inline (scenario override → else proxy) | `libraryStore.getScenarioPmtilesOverride` |
| `runtime/json/<key>` | `handleRuntimeJson` | `libraryStore.js:1110` |
| `mapeditor/*` | `handleMapEditor` | `editorStore.js` |
| `basemaps/*` | `handleBasemaps` | `basemapStore.js` |
| `flags/*` | `handleFlags` | `flagStore.js` |
| `library` | `handleLibrary` | `libraryStore.js:1036` |
| `scenarios/*` | `handleScenarios` | `libraryStore.js:1042` |
| `games/*` | `handleGames` | `libraryStore.js:1076` |
| `ui-settings/*` | `handleUiSettings` | `settingsStore.js:82` |
| `lang/*` | `handleLang` | `settingsStore.js:44` |
| `hub/*` | inline proxy → Worker / node | (see below) |
| *(anything else)* | `errorResponse("Unknown web-mode endpoint", 404)` | `util.js` |

### Body handling (`readBody`, `router.js:20`)

- `GET`/`HEAD` → no body.
- **Asset uploads** (`isAssetUpload`: `scenarios`|`games` + an `assets` segment + `PUT`) are forced to **raw bytes** regardless of `Content-Type`, because colors/geojson arrive as `application/json` but must be stored **verbatim** (the server's `express.raw` does the same).
- Otherwise: `application/json` → `JSON.parse`; everything else → raw `Uint8Array`.

### The two branches that are *not* pure IndexedDB

- **`runtime/pmtiles/<key>`** (`router.js:51`): first ask `getScenarioPmtilesOverride(key, range)` (a scenario may carry its own pmtiles in IndexedDB); otherwise fetch `${ASSETS_BASE}/<key>.pmtiles` (the build's own copy, §8) with the incoming `Range`/method.
- **`hub/file`** (`router.js`): the one hub call there is, a download (`hub/file?url=…`, GET). It goes to `${VITE_OH_HUB_URL}/hub/file`, which fetches the GitHub file and adds CORS. What is asked for is a checked copy in the hub's releases, or a suggestion's `.zip` the hub has checked (`src/runtime/hubFiles.js` decides). Anything else under `hub/` answers 404: the import counter's routes are gone, and with them the session that was attached to its `POST`s. The hub's index (its list of posts, its checked files, the import counts) is read straight from `raw.githubusercontent.com` and a post's comments from `api.github.com`; both send CORS and are not intercepted.

---

## 4. IndexedDB layer (`idb.js`)

A dependency-free promise wrapper. Database `open-historia-web`, `DB_VERSION = 2`. Adding a store means bumping the version; `onupgradeneeded` creates only what is missing (additive — nobody's data is touched). An `onversionchange` handler closes this connection when another tab opens a newer version, so a second tab's upgrade isn't blocked.

| Store (`STORES`) | keyPath | Mirrors server on-disk store |
|---|---|---|
| `scenarios` | `id` | one record per scenario (meta + json + assets) |
| `games` | `id` | one record per game |
| `mapeditorDocs` | `id` | map-editor documents |
| `basemapMeta` | `id` | basemap metadata |
| `basemapPayload` | `id` | basemap binary payloads |
| `flags` | `id` | flag records |
| `kv` | `key` | small singletons (manifests, ui-settings, `seeded`) |

Helpers: `idbGet`, `idbGetAll`, `idbPut`, `idbDelete`, and kv-specific `kvGet(key, fallback)`, `kvPut`, `kvUpdate`. `runTx` resolves on transaction **commit** (via `oncomplete`), not merely on request success, so writes are durable before a caller reads back.

---

## 5. The library store (`libraryStore.js`) — the heart of the fake backend

A byte-faithful browser port of `server/libraryStore.js`. Backs `/api/library`, `/api/scenarios*`, `/api/games*`, `/api/runtime/json*`, `/api/runtime/pmtiles*`.

### Record shapes (all live in one IndexedDB record)

```
scenario:  { id, meta, json:{actions,advisor,chat,events,game,prompts,world},
             colors?, flags?, geojson:{regionsGeojson,citiesGeojson,backgroundData},
             pmtiles:{cities,countries,regions}, cover?:{contentType,bytes} }
game:      { id, meta, json:{…7…}, colors?, flags?, snapshots?, cover?:{contentType,bytes} }
```

Unlike the server (which splits a scenario across many files on disk), a web record holds `world`/`game`/`colors`/`geojson` together, so owner migration is **synchronous and in-place** — nothing to keep in step across files.

### Manifests (in `kv`)

| kv key | Shape | Meaning |
|---|---|---|
| `scenario-manifest` | `{ order[], selectedScenarioId }` | scenario order + which is selected |
| `game-manifest` | `{ activeGameId, order[] }` | game order + which is active |
| `seeded` | `boolean` | one-time seed flag |

### Catalog composition

- `getLibraryCatalog()` (`:245`) is what `/api/library` returns: `{ activeGame, activeGameId, activeScenarioId, countryNames, games, runtimeScenario, scenarios, selectedScenario, selectedScenarioId, token }`. `token` is a cache key combining the active game's + runtime scenario's `updatedAt`.
- `getScenarioCatalog()` / `getGameCatalog()` compose per-item summaries (spread `readScenarioMeta`/`readGameMeta`, `assetStatus`, `cacheToken = ${id}-${updatedAt}`, `coverImageUrl`, usage counts). Order comes from `resolveOrderedIds` (manifest order, then extras, default id unshifted first).
- A game summary also carries `country`, `currentDate`, `round`, `eventCount`, `pendingActions` (non-`resolved` actions), `scenarioName`, `scenarioAccentColor`, and both `coverImageUrl` (own → falls back to its scenario's) and `ownCoverImageUrl`.

### Runtime JSON read/write (what the running game hits every turn)

`readRuntimeJsonAsset(key)` (`:416`) resolves an asset by precedence: **active game record → active runtime scenario → fallback default**. Special cases:

- `SCENARIO_GEOJSON_ASSET_KEYS` (`regionsGeojson`/`citiesGeojson`/`backgroundData`) come from the scenario; a scenario without its own `regionsGeojson` **borrows Modern Day's** (migrated as *default's* record, since those owners live in default's owner-space).
- The default scenario's `regionsGeojson` (~12 MB) is **not** in the seed — `fetchDefaultRegionsGeojson()` (`:327`) pulls `${ASSETS_BASE}/default-regions.geojson` once per session (never pinning an empty/failed result, so a transient miss retries). Without it the political map renders blank.
- `colors` falls back to the immutable app palette (`generated/fallbackColors.js`), **not** the mutable default-scenario colors.

`writeRuntimeJsonAsset(key, value)` (`:481`) writes onto the active game (auto-creating one from the selected scenario if none exists), canonicalizing country refs on the way in: `world`→`canonicalizeWorldCountryRefs`, `game`→`canonicalizeGameCountry`, `colors`→`canonicalizeColorKeys`. `flags` are **not** canonicalized (a flag key is always the raw code the editor painted).

### Owner-schema migration (`ensureOwnerSchema`, `:357`)

Rewrites a record whose owners are GADM codes into one keyed by country **names**. It *imports* `server/ownerMigration.js` (pure ESM, so Vite bundles it) rather than re-implementing it — one resolver, no drift. Runs lazily on read, once per `kind:id` (`migratedRecords` set), and discards roll-back `snapshots` (they predate the rename and are blind-written back with no staleness marker).

### Export / import bundles

- `exportScenarioBundle(id, mode)` (`:858`) — `mode:"light"` drops pmtiles overrides; `"full"` embeds them base64. Geometry is embedded as JSON, not base64, matching the desktop store (see `docs/server.md`). Schema `open-historia-scenario-bundle/2`.
- `importScenarioBundle` / `updateScenarioFromBundle` accept any schema in `ACCEPTED_BUNDLE_SCHEMAS` (v1 + v2), and lay down each asset through one `applyScenarioBundleAsset`, as the desktop store does: geometry that travelled as JSON is stored, one that travelled as base64 is decoded, and only an asset the bundle does not embed is cleared (the hub Update once had its own copy without the JSON branch and deleted a map's regions, cities and basemap; `libraryStore.test.js` runs both). Note the **JSON-descriptor gotcha**: `colors`/`flags`/`tags` descriptors carry the **object itself** in `descriptor.data`, not base64 — passing them through `base64ToBytes` (as geojson/pmtiles do) made `atob` throw and broke import of every flag/tag-carrying preset (e.g. WWII).
- Hub provenance (`hubOrigin`, `hubPublished`, `hubReviews`) follows the desktop store's rules through the same `server/hubProvenance.js`. `hubOrigin` is stamped **last** by an import, with the checked copy in the hub's releases that was downloaded (`release`, kept through every write that keeps the link; a link without one is an old link, whose card asks for an Update). Any later edit keeps it and stamps `editedAt`, which stops hub updates from overwriting the player's work while keeping the original for **Suggest changes**. `hubOrigin: null` unlinks the scenario. A body carrying only provenance is bookkeeping (`writeScenarioMeta(record, updates, { touch: false })`: no `updatedAt`, no `editedAt`). See [server.md](server.md#hub-provenance-where-a-scenario-came-from-and-where-it-went).

### Seeding (`ensureSeeded`, `:1024`)

If the `seeded` kv flag is unset and no `default` scenario exists, write `defaultScenarioSeedRecord()` (built from `generated/defaultScenario.js`: meta, colors, base64 cover) and add it to the manifest. Idempotent.

---

## 6. Cover images — and why they differ from the server

`COVER_IMAGE_ASSET_KEY = "cover"`; a cover is stored on the record as `{ contentType, bytes:Uint8Array }`. The **displayed** cover in a catalog summary differs by build:

| | Server build | Web build |
|---|---|---|
| `coverImageUrl` value | a **fetchable path** via `buildScenarioAssetUrl(id,"cover",token)` → `/api/scenarios/:id/assets/cover?token=…` (`server/libraryStore.js:1173`) | a **base64 `data:` URL** via `coverDataUrl(record.cover)` (`libraryStore.js:60`, used at `:181`, `:222`, `:229`) |

**Why:** the library UI renders the cover in an `<img src>`. On the server that `src` is a normal HTTP URL the browser fetches directly. In the web build there is no server, and — critically — an `<img>` load does **not** pass through the patched `window.fetch`, so a `/api/scenarios/:id/assets/cover` `src` would hit the network and 404 to the SPA fallback instead of reaching the interceptor. Embedding the bytes as a `data:<contentType>;base64,…` URL makes the image render with **zero network round-trip**, straight from the IndexedDB record. (The interceptor *does* still serve a direct `GET /api/scenarios/:id/assets/cover` — `scenarioAssetResponse`, `:817` — for code paths that go through `fetch`, e.g. export; it's only the `<img>` display path that needs the data URL.)

Cover uploads/removals (`uploadScenarioAsset`/`uploadGameAsset`, `:783`/`:838`) validate the content-type against `SUPPORTED_IMAGE_CONTENT_TYPES` (avif/gif/jpeg/png/webp) and mirror the bytes + `coverImageContentType` meta.

---

## 7. Store models & country resolution (`models.js`)

A faithful mirror of the constants and pure helpers in `server/libraryStore.js`.

### Asset-key sets

| Set | Members |
|---|---|
| `STORAGE_JSON_ASSET_KEYS` | `actions, advisor, chat, events` |
| `CORE_JSON_ASSET_KEYS` | `game, prompts, world` |
| `OPTIONAL_JSON_ASSET_KEYS` | `colors, flags, tags` |
| `PMTILES_ASSET_KEYS` | `cities, countries, regions` |
| `SCENARIO_GEOJSON_ASSET_KEYS` | `regionsGeojson, citiesGeojson, backgroundData` |
| `UPLOADABLE_SCENARIO_ASSET_KEYS` | `cover` + optional + pmtiles + geojson |
| `UPLOADABLE_GAME_ASSET_KEYS` | `cover` only |

`SCENARIO_BUNDLE_SCHEMA = "open-historia-scenario-bundle/2"` — the **only** compatibility gate on a file strangers swap; the schema string moves with the owner rename so an old build can't silently mis-resolve a name-keyed bundle. `isScenarioBundleSchema` (mirrored from `server/libraryStore.js`) reads format 1 and 2 under any `<name>-scenario-bundle` name, so files written under the project's earlier name import unchanged.

### `resolveOwnerRef(value, world)` (`:87`)

Resolves an owner token to its canonical **name**. Precedence:

1. A `polityOverrides[value]` marked `verbatim` (a human-named polity whose text collides with a GADM code like "USA") → honored literally.
2. Any polity whose `name`/`aliases`/key matches (case-insensitive), skipping self-named entries so `{MNG:{name:"MNG"}}` doesn't pin `MNG` forever.
3. `COUNTRY_NAME_REGISTRY[value]` (legacy code or alias → name).
4. Otherwise the raw value.

`canonicalizeWorldCountryRefs` / `canonicalizeGameCountry` / `canonicalizeColorKeys` apply it across `regionOwnershipOverrides`, `ownerCodes`, `polityOverrides` (rekeyed by name, `.code` dropped), `units`, `countryTags`, `internationalReputation`, and color/game country fields. `readScenarioMeta`/`readGameMeta` apply defaults + normalize `coverImageContentType`, `hubOrigin`, `hubPublished`, `hubReviews`, `playCount`, `lastPlayedAt`.

---

## 8. Heavy content: the map files the build carries

The map is part of the site. Every build of the game reads its map data from its own `assets/` folder under the same stable names, and what differs is only how the files get there. The desktop app fetches them from the `map-data` GitHub Release at first launch (`scripts/fetch-map-assets.mjs`, list `scripts/map-assets.json`). The website carries six files, laid into the build when it is made. Nothing is fetched from a third party for the map at run time, so there is no node to connect to, no manifest and no signature to check.

### Where the files are read from (`assetsBase.js`)

`src/runtime/assetsBase.js` gives `ASSETS_BASE`: `${BASE_URL}assets` in a web build (`/play/assets` on openhistoria.com), `/assets` elsewhere.

| File under `ASSETS_BASE` | Read by |
|---|---|
| `<key>.pmtiles` (`regions`, `countries`, `cities`) | `router.js`, for `/api/runtime/pmtiles/<key>` |
| `default-regions.geojson` | `libraryStore.js` (`fetchDefaultRegionsGeojson`) |
| `regions-seed.geojson` | `src/Editor/regionImport.js` |
| `cities-seed.json` | `src/Editor/citiesImport.js`, `src/Game/AI/promptContext.js`, `src/Game/AI/worldCities.js` |

### The list and the stager

`scripts/map-assets.web.json` pins the six files. Each entry has `asset` (the name on the release), `path` (the stable name under the build), `bytes` and `sha256`.

| Release asset | Path in the build | Bytes |
|---|---|---|
| `regions-z8.pmtiles` | `assets/regions.pmtiles` | 21,106,005 |
| `countries-z8.pmtiles` | `assets/countries.pmtiles` | 12,580,027 |
| `cities.pmtiles` | `assets/cities.pmtiles` | 1,547,924 |
| `cities-seed.json` | `assets/cities-seed.json` | 7,857,627 |
| `regions-seed-clean.geojson` | `assets/regions-seed.geojson` | 13,077,300 |
| `default-regions-names-web-clean.geojson` | `assets/default-regions.geojson` | 13,128,553 |

About 69 MB in all. The archives are the z8 trims (the map mounts both at `maxzoom` 8): 35 MB instead of the 168 MB z10 ones the website used to stream. The two world files are the web-sized cut of the world, deep-cleaned; the stock world has its owners as country names.

`scripts/stage-map-assets.mjs` downloads and verifies the files into `map-cache/` and lays them into a build: `build:web` and `build:site` into `dist-web/assets/`, served at `/play/assets/` once the site is assembled. Before that, the Vite plugin `dropMapBinaries` (`vite.config.ts`) removes whatever map files `public/assets/` put into the output. Every file must stay under Cloudflare Pages' 25 MiB a file (`SITE_FILE_LIMIT_BYTES` in the stager), and the deploy workflow refuses a built site with a file over 24 MiB. The deploy workflow caches `map-cache/` by the list's hash.

### Why the site carries its own copy

A browser cannot read a GitHub release asset: neither the release download nor the API route sends an `Access-Control-Allow-Origin` header on the file, and the API route is limited to 60 requests an hour without a token. The host must answer byte-range requests for static files; Cloudflare Pages does.

### What it replaced

The website used to fetch the archives and the two world files at run time from the registry Worker's `/content` proxy (`VITE_OH_PMTILES_URL`), try community content nodes first (a signed node directory, `VITE_OH_DIRECTORY_URL`), and check the bytes against a signed manifest. None of it is in the game any more: `src/runtime/web/nodeConnect.js`, `contentTrust.js` and `trust.js`, `public/content-manifest.json` and `public/node-directory.json` with their signatures, the signing and node scripts (`scripts/build-content-manifest.mjs`, `sign-release.mjs`, `gen-signing-key.mjs`, `node-updater.mjs`, `populate-node.mjs`), `server/node.js`, `server/trust.js`, `trust/`, the `@noble/ed25519` dependency and the tests workflow's manifest-expiry step are removed. The node software ([Open-Historia/open-historia-node](https://github.com/Open-Historia/open-historia-node)) and the Worker's `/content` route live elsewhere and are no longer asked for anything.

Community hub downloads still go through the Worker (`VITE_OH_HUB_URL`, `/hub/file`, §3): community bundles are files on GitHub, and the same limit applies to them.

---

## 9. Home screen (`homePage.js`)

A full-screen parchment/Roman overlay injected over the already-mounted game on first entry per tab session (`sessionStorage["oh:entered"]`). Pure DOM (no React), scoped under `.oh-home`. It shows the wordmark, what the game is and the way in; there is nothing to connect to first, so Enter is available at once.

| Control | Behavior |
|---|---|
| **⚔ Enter Open Historia** | Shows the demo notice once per tab session, then `enter()` sets the `oh:entered` flag and removes the overlay. |
| Footer links | GitHub, Discord, Privacy (`/privacy/`, the site root's page). |

Its fonts are the bundle's (`src/assets/fonts/fonts.css`, the loading screen's Cinzel and EB Garamond): the screen loads no stylesheet from another host (`src/noGoogleFonts.test.js`).

The Android app never shows this page. Its boot screen (`nativeBoot.js`) says "Getting the world ready…" while the library is seeded, then "Everything is on this device", and comes down after `CONNECT_DEADLINE_MS` (8 s) at the latest.

---

## 10. Accounts and sync (removed)

The web build used to offer optional magic-link/Google accounts with encrypted sync of games and scenarios through the registry Worker. The saves were encrypted in the browser before upload (AES-256-GCM), but the sync was not end-to-end: each account's data key was sent to the Worker, which kept it wrapped under keys the project held (an admin master key for recovery, a Worker secret for handing it to the player's other devices), so the project could have recovered the key and read them. Both were removed: games live in this browser's IndexedDB and move between devices by game export/import. The client code (`account.js`, `sync.js`, `accountWidget.js`), the `VITE_OH_ACCOUNT_URL`/`VITE_OH_GOOGLE_CLIENT_ID` settings, the presence reports to the registry and the `oh:turn-complete` event that only the sync engine listened for are gone, and the game calls none of the Worker's `/account/*` or `/sync/*` routes. The one piece left is `retiredAccount.js`, which deletes a leftover session, email, data key and sync version table (`account:session`, `account:email`, `account:dek`, `sync:versions`) from `kv` at boot (§1), so a browser that signed in before the removal no longer holds an identity the player cannot see.

---

## 11. Secondary stores (brief)

The interceptor also answers these through the same `ctx` handler pattern (return `Response` or `null`):

| Domain | Handler | Notes |
|---|---|---|
| `mapeditor/*` | `handleMapEditor` (`editorStore.js`) | map-editor documents in the `mapeditorDocs` store |
| `basemaps/*` | `handleBasemaps` (`basemapStore.js`) | basemap meta + payload (two stores) |
| `flags/*` | `handleFlags` (`flagStore.js`) | flag records |
| `ui-settings/*` | `handleUiSettings` (`settingsStore.js:82`) | UI settings persisted in `kv` |
| `lang/*` | `handleLang` (`settingsStore.js`) | language packs: the static `/lang/*.json` Vite copies to the site, merged over the IndexedDB overlay of AI translations (shipped wins; see [Languages & Translation](i18n.md)) |

---

## 12. Key differences vs the server build

| Aspect | Server build | Web build |
|---|---|---|
| Backend | real Express server, same-origin | `window.fetch` interceptor (`router.js`), no server |
| Persistence | files on disk (`server/libraryStore.js` etc.) | one IndexedDB record per item (`idb.js`) |
| Record layout | scenario split across many files | `world`/`game`/`colors`/`geojson`/`cover` in **one** record |
| Owner migration | must keep files in step; async | synchronous, in-place; **imports** `server/ownerMigration.js` |
| Cover image URL | fetchable `/api/.../assets/cover?token=` | base64 `data:` URL (bypasses the fetch interceptor) — see §6 |
| PMTiles hosting | served by the server | the build's own `assets/` (§8); default `regions.geojson` fetched from there, not seeded |
| Default scenario | full data on disk | seeded from `generated/defaultScenario.js`; big geometry fetched on demand |
| Accounts / sync | n/a | none: saves stay in this browser and move by export/import (§10) |
| Community bundle download | direct | proxied via Worker `/hub/file` (CORS) |
| Code shipped | this whole tree stripped out | this whole tree, behind `VITE_OH_WEB` |

---

### File index

| File | Role |
|---|---|
| `src/runtime/web/index.js` | boot entry (`installWebBackend`) |
| `src/runtime/web/router.js` | `/api` fetch interceptor + dispatch |
| `src/runtime/web/idb.js` | IndexedDB primitives + `STORES` |
| `src/runtime/web/libraryStore.js` | scenarios/games/runtime store + handlers |
| `src/runtime/web/models.js` | constants, `resolveOwnerRef`, meta readers |
| `src/runtime/web/util.js` | response builders, base64, SHA-256, range serving |
| `src/runtime/web/retiredAccount.js` | deletes a leftover sign-in from `kv` at boot |
| `src/runtime/web/fakeIndexedDb.js` | in-memory IndexedDB for node tests of the stores (never bundled) |
| `src/runtime/web/homePage.js` | entry overlay |
| `src/runtime/assetsBase.js` | where the build's map files are (`ASSETS_BASE`) |
| `scripts/map-assets.web.json` / `scripts/stage-map-assets.mjs` | the website's map files, and the script that lays them into a build |
| `src/runtime/web/settingsStore.js` | ui-settings + language handlers |
| `src/runtime/web/basemapStore.js` / `flagStore.js` / `editorStore.js` | secondary store handlers |
| `.env.web` | web-mode build config |

## Saves under the site's http address

A browser keeps `http://openhistoria.com` and `https://openhistoria.com` as two sites with two libraries. Players who first came over http had their games stored under it; once every http visit was redirected to https they opened an empty library with their games untouched next door (reported 2026-10-10 as "saves reset after updating"). The game brings them across by itself, once per browser:

1. As it starts, the https game (`src/runtime/web/saveMove.js`) sends the browser to `http://<host>/save-move/`.
2. That page (`public/save-move/`, served as it is) reads the old library, packs it into one file and posts it as a form to `<game>/save-move/receive`.
3. The game's service worker (`public/sw.js`, registered for the game's folder) keeps the file in the `oh-save-move` cache and sends the browser back to the game, which merges it into the library and deletes the file.

Nothing is replaced or deleted: a game or scenario whose id is taken arrives as `<id>-moved`, the built-in scenario and identical downloads are not carried twice, settings are copied only where the https address has none, and the http library is left as it was. The trip is tried at most three times, six hours apart, and never again after an answer.

**The site's half is a Worker** (`tools/save-move-worker/`, deployed with `wrangler deploy` from that folder as `open-historia-save-move`; live since 2026-10-11). Its routes are `http://openhistoria.com/*`, `http://www.openhistoria.com/*` and `openhistoria.com/save-move*`:

- `http://openhistoria.com/save-move/*` is served as it is, fetched from the Pages deployment. It is the only place the old library can be read.
- every other plain-http request is sent to https, as before.
- `https://openhistoria.com/save-move/*` is sent (302) to the same address over http. A browser that upgrades http by itself falls back to http when the https address sends it there, and the game makes the trip only when it sees this redirect, so a site without the Worker is never left.

Removing the Worker (`wrangler delete`) switches the transfer off and nothing else: Pages answers plain http with its own redirect to https.
The game's start-up sweep of unknown caches (`src/runtime/assets.js`) leaves `oh-save-move` alone; without that the arriving file was deleted before it was read. `saveMove.test.js` covers the file format, the merge and the wiring; a two-port run in headless Chrome (two ports stand in for the two addresses, switched on by `localStorage["oh:save-move-test-from"]` on loopback only) carried two games and a setting across.
Checked on the live site in a throwaway Chrome profile (2026-10-11): a game placed under the http address came across on the next visit to the https game, with a setting, and a browser with nothing under http made one trip and was never sent again.
