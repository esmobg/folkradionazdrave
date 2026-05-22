# Folk Radio Nazdrave

Live web player for **Folk Radio Nazdrave** and **Gold Radio** — pop-folk, folk, and Balkan music 24/7.

- **Live app:** https://folkradionazdrave.com
- **Repository:** https://github.com/esmobg/folkradionazdrave

## Tech stack

React 18 + Vite, Express dev server, Netlify hosting, Cloudflare Worker for audio streaming.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 (or the port shown in the terminal).

## Streaming architecture

- **Primary:** Cloudflare Worker at `https://folkradio-stream-proxy.ismail-ismailov.workers.dev/api/stream/{nazdrave|gold}`
- **Fallback:** Netlify Functions at `/api/stream/nazdrave` and `/api/stream/gold` on the production site

Production build variables are set in `netlify.toml`. Deploy the worker with `npm run deploy:stream-worker`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run test:e2e` | Playwright smoke tests |
| `npm run deploy:stream-worker` | Deploy Cloudflare stream proxy |
