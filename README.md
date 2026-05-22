# Folk Radio Nazdrave

Live web player for **Folk Radio Nazdrave** and **Gold Radio** — pop-folk, folk, and Balkan music 24/7. Includes an accessibility widget, keyboard controls, and automated accessibility QA.

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
| `npm run deploy:stream-worker` | Deploy Cloudflare stream proxy |
