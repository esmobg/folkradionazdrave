# Folk Radio Nazdrave

Live web player for **Folk Radio Nazdrave** and **Gold Radio** — pop-folk, folk, and Balkan music 24/7. Includes an accessibility widget, keyboard controls, and automated accessibility QA.

- **Live app:** https://folkradionazdrave.com
- **Repository:** https://github.com/esmobg/folkradionazdrave

## Tech stack

React 18 + Vite, Express (local/dev), **Cloudflare Pages** for the static site, **Cloudflare Worker** for audio streaming.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 (or the port shown in the terminal).

## Streaming architecture

- **Primary:** Cloudflare Worker at `https://live.folkradionazdrave.com/api/stream/{nazdrave|gold}`
- **Same-origin on Pages:** `public/_worker.js` can proxy `/api/stream/*` when relative URLs are used
- Production build vars: optional Worker URLs in Cloudflare Pages env (see `.env.production.example`). Default is same-origin `/api/stream/*` via Pages `_worker.js` or local Express — not Netlify Functions.

Deploy the stream worker with `npm run deploy:stream-worker`. Deploy the site with `npm run deploy:site`.

## Deploy (Cloudflare Pages)

```bash
npx wrangler login
npm run deploy:site
```

This builds to `dist/` and runs `wrangler pages deploy`. After the first deploy:

1. In Cloudflare Pages, attach custom domain `folkradionazdrave.com` (and `www` if needed)
2. Confirm apex/www resolve to Pages — not Netlify
3. Keep `live.folkradionazdrave.com` on the stream Worker
4. Once Pages is stable, disable or delete the Netlify site so bandwidth stops growing there

Optional: set `CF_PAGES_PROJECT` if the Pages project name differs from `folkradio-nazdrave`.
Optional: set `VITE_NAZDRAVE_STREAM_URL` / `VITE_GOLD_STREAM_URL` in Pages env to force the dedicated Worker (see `.env.production.example`).

## Accessibility

The app includes a built-in **accessibility widget** (contrast, text size, reduced motion) and keyboard-friendly player controls (play/pause, mute, volume, theme and station selection).

Run the accessibility gate locally (starts a preview server, then checks keyboard focus, language switching, mobile overflow, and player shortcuts):

```bash
npm run qa:a11y
```

Results are written to `reviews/accessibility-gate-results.json`. The check covers:

- Skip link receives first focus
- `html lang` switches between BG and EN
- Theme and station radios work with keyboard
- No horizontal overflow on mobile
- Keyboard play/mute/volume shortcuts
- Sticky player visibility on scroll

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run test:e2e` | Playwright smoke tests |
| `npm run qa:a11y` | Accessibility gate (keyboard, focus, mobile) |
| `npm run deploy:site` | Build + deploy static site to Cloudflare Pages |
| `npm run deploy:stream-worker` | Deploy Cloudflare stream proxy |
