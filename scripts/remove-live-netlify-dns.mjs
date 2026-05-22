#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DNS_ZONE_ID = "69c616ce688fed44c6759224";
const LIVE_HOST = "live.folkradionazdrave.com";

function netlifyToken() {
  return Object.values(JSON.parse(readFileSync(join(homedir(), "AppData/Roaming/netlify/Config/config.json"), "utf8")).users ?? {})[0]
    ?.auth?.token;
}

async function netlify(path, { method = "GET" } = {}) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${netlifyToken()}` },
  });
  return response.json();
}

const records = await netlify(`/dns_zones/${DNS_ZONE_ID}/dns_records`);
const live = records.find((record) => record.hostname === LIVE_HOST);

if (!live) {
  console.log(JSON.stringify({ removed: false, reason: "no live record" }, null, 2));
  process.exit(0);
}

const result = await netlify(`/dns_zones/${DNS_ZONE_ID}/dns_records/${live.id}`, { method: "DELETE" });
console.log(JSON.stringify({ removed: true, result }, null, 2));
