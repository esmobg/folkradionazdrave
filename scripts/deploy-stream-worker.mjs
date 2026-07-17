#!/usr/bin/env node

console.log(`
Folk Radio stream setup
=======================

Current production stream host:
  https://live.folkradionazdrave.com/api/stream/{nazdrave|gold}

Fallback workers.dev URL:
  https://folkradio-stream-proxy.ismail-ismailov.workers.dev/api/stream/{nazdrave|gold}

Deploy worker:
  npm run deploy:stream-worker:run

Deploy static site (Cloudflare Pages):
  npm run deploy:site

Verify worker playback:
  node scripts/debug-stream-url.mjs

Verify site playback:
  node scripts/debug-playback.mjs

Cloudflare zone status:
  node scripts/cf-list-zones.mjs

DNS for the website (after Pages deploy):
  1. In Cloudflare Pages, attach custom domain folkradionazdrave.com (and www if needed)
  2. Apex/www should resolve to Cloudflare Pages — not Netlify
  3. Keep live.folkradionazdrave.com on the stream Worker

Note about stream.folkradionazdrave.com:
  Prefer live.folkradionazdrave.com. Some hostnames may still be blocked from prior DNS history.
`);
