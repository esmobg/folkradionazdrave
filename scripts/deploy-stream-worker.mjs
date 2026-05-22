#!/usr/bin/env node

console.log(`
Folk Radio stream setup
=======================

Current production stream host:
  https://folkradio-stream-proxy.ismail-ismailov.workers.dev/api/stream/{nazdrave|gold}

Cloudflare Worker custom domain (ready after zone activation):
  live.folkradionazdrave.com

Deploy worker:
  npm run deploy:stream-worker:run

Verify worker playback:
  node scripts/debug-stream-url.mjs

Verify site playback:
  node scripts/debug-playback.mjs

Cloudflare zone status:
  node scripts/cf-list-zones.mjs

Next step to enable live.folkradionazdrave.com:
  1. At your domain registrar, change nameservers to:
     emerson.ns.cloudflare.com
     mallory.ns.cloudflare.com
  2. In Cloudflare DNS, recreate apex/www records pointing to Netlify
  3. Wait for zone status "active"
  4. live.folkradionazdrave.com should serve the worker automatically

Note about stream.folkradionazdrave.com:
  Cloudflare still blocks this hostname (error 100117) because it previously had
  external DNS records. Use live.folkradionazdrave.com after zone activation, or
  keep workers.dev as the primary URL.
`);
