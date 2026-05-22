#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ZONE_ID = "16baacb8c862d4be0fefc17ebb10ae79";
const ACCOUNT_ID = "117e983e7b4024dd353060ec2fb7555a";
const STREAM_HOST = "stream.folkradionazdrave.com";
const WORKER_NAME = "folkradio-stream-proxy";

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

const createRecord = await cf(`/zones/${ZONE_ID}/dns_records`, {
  method: "POST",
  body: {
    type: "AAAA",
    name: "stream",
    content: "100::",
    proxied: true,
    ttl: 1,
  },
});

const attachAttempt = await cf(`/accounts/${ACCOUNT_ID}/workers/domains`, {
  method: "PUT",
  body: {
    hostname: STREAM_HOST,
    service: WORKER_NAME,
    zone_id: ZONE_ID,
  },
});

console.log(JSON.stringify({ createRecord, attachAttempt }, null, 2));
