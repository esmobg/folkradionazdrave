#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = "117e983e7b4024dd353060ec2fb7555a";
const ZONE_ID = "16baacb8c862d4be0fefc17ebb10ae79";
const WORKER_NAME = "folkradio-stream-proxy";
const candidates = [
  "live.folkradionazdrave.com",
  "audio.folkradionazdrave.com",
  "cfstream.folkradionazdrave.com",
];

function token() {
  return readFileSync(join(homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"), "utf8").match(
    /oauth_token = "([^"]+)"/,
  )?.[1];
}

async function cf(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

for (const hostname of candidates) {
  const dns = await fetch(`https://dns.google/resolve?name=${hostname}&type=255`).then((r) => r.json());
  const attach = await cf(`/accounts/${ACCOUNT_ID}/workers/domains`, {
    method: "PUT",
    body: { hostname, service: WORKER_NAME, zone_id: ZONE_ID },
  });
  console.log(JSON.stringify({ hostname, dnsStatus: dns.Status, attach: attach.success ? attach.result : attach.errors }, null, 2));
}
