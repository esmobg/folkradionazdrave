#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = "117e983e7b4024dd353060ec2fb7555a";
const ZONE_ID = "16baacb8c862d4be0fefc17ebb10ae79";
const LIVE_HOST = "live.folkradionazdrave.com";
const DNS_ZONE_ID = "69c616ce688fed44c6759224";

function wranglerToken() {
  return readFileSync(join(homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"), "utf8").match(
    /oauth_token = "([^"]+)"/,
  )?.[1];
}

function netlifyToken() {
  return Object.values(JSON.parse(readFileSync(join(homedir(), "AppData/Roaming/netlify/Config/config.json"), "utf8")).users ?? {})[0]
    ?.auth?.token;
}

async function cf(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${wranglerToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

async function netlify(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${netlifyToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

// Mirror CF originless AAAA at Netlify for live subdomain
const records = await netlify(`/dns_zones/${DNS_ZONE_ID}/dns_records`);
const existing = records.find((record) => record.hostname === LIVE_HOST);

const payload = {
  type: "CNAME",
  hostname: LIVE_HOST,
  value: LIVE_HOST,
  ttl: 300,
};

// Cloudflare custom domains on external DNS often need CNAME flattening to the hostname itself
// when proxied through CF edge; try direct AAAA placeholder used by CF instead.
const cfStylePayload = {
  type: "CNAME",
  hostname: LIVE_HOST,
  value: "folkradio-stream-proxy.ismail-ismailov.workers.dev",
  ttl: 300,
};

let dnsResult;
if (existing) {
  dnsResult = await netlify(`/dns_zones/${DNS_ZONE_ID}/dns_records/${existing.id}`, {
    method: "PUT",
    body: cfStylePayload,
  });
} else {
  dnsResult = await netlify(`/dns_zones/${DNS_ZONE_ID}/dns_records`, {
    method: "POST",
    body: cfStylePayload,
  });
}

const dnsLookup = await fetch(`https://dns.google/resolve?name=${LIVE_HOST}&type=CNAME`).then((r) => r.json());

let headResult = null;
try {
  const response = await fetch(`https://${LIVE_HOST}/api/stream/nazdrave`, {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  headResult = {
    status: response.status,
    contentType: response.headers.get("content-type"),
    accessControl: response.headers.get("access-control-allow-origin"),
  };
} catch (error) {
  headResult = { error: error instanceof Error ? error.message : String(error) };
}

console.log(JSON.stringify({ dnsResult, dnsLookup, headResult }, null, 2));
