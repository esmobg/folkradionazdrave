#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectName = process.env.CF_PAGES_PROJECT || "folkradio-nazdrave";

console.log(`
Folk Radio site deploy (Cloudflare Pages)
=========================================

Build: npm run build
Publish: dist/
Project: ${projectName}
Stream: same-origin /api/stream/* via public/_worker.js
        (or live.folkradionazdrave.com Worker if VITE_* is set)

Auth: npx wrangler login
   or set CLOUDFLARE_API_TOKEN
`);

const whoami = spawnSync("npx", ["wrangler", "whoami"], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: true,
});

if (whoami.status !== 0) {
  console.error("\nNot logged in to Cloudflare. Run: npx wrangler login\n");
  process.exit(whoami.status ?? 1);
}

const build = spawnSync("npm", ["run", "build"], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: true,
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const deploy = spawnSync(
  "npx",
  ["wrangler", "pages", "deploy", "dist", `--project-name=${projectName}`],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
  },
);

if (deploy.status === 0) {
  console.log(`
Deploy finished.

Next (DNS cutover):
  1. Cloudflare Dashboard → Pages → ${projectName} → Custom domains
  2. Add folkradionazdrave.com (and www if needed)
  3. Confirm apex/www no longer point at Netlify
  4. After a stable day, disable or delete the Netlify site to stop bandwidth use
`);
}

process.exit(deploy.status ?? 1);
