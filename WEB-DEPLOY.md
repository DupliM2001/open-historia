# Deploying the playable game website (web mode)

This is the browser-playable Open Historia — the "play on a website" build. It's a
static app that keeps games client-side, sends AI keys straight to the player's
provider, and carries its own map files.

**Chosen setup:** the app and its map on **Cloudflare Pages**; community hub downloads
through the registry Worker (`VITE_OH_HUB_URL` in `.env.web`).

Prerequisites: a free Cloudflare account and Node 18+.

---

## 1. Build the game for the web

```bash
npm run build:web
```

This produces `dist-web/` (base path `/`, correct for Cloudflare Pages). The last step,
`scripts/stage-map-assets.mjs`, downloads the six map files pinned in
`scripts/map-assets.web.json` from the `map-data` release into `map-cache/`, checks each
against its sha256, and lays them under `dist-web/assets/`. Every one is under Pages'
25 MiB a file. The production site (`openhistoria.com`) is built with `npm run build:site`
instead, by `.github/workflows/deploy-site.yml`.

## 2. Deploy `dist-web/` to Cloudflare Pages

```bash
npx wrangler pages deploy dist-web --project-name open-historia
```

First run creates the project; it prints your URL (e.g. `https://open-historia.pages.dev`).
Add a custom domain in the Cloudflare Pages dashboard if you want.

## 3. Play

Open your Pages URL. Players pick their AI provider and paste their own key in Settings
(it goes **straight to the provider** — nothing to configure server-side). Games are saved
in the browser (Export/Import for backups).

---

## Notes

- **Updating the game:** rebuild and re-run `wrangler pages deploy`. Everyone gets the
  update on their next load — no per-player step.
- **Changing the map:** upload the new files to the `map-data` release and put their
  `bytes`/`sha256` in `scripts/map-assets.web.json`; the next build lays them in.
- **Local single-player is unaffected** by all of this — the downloadable app still runs
  its own server and never uses the web-mode code.
