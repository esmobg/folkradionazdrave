#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CF_ZONE_ID = "16baacb8c862d4be0fefc17ebb10ae79";

function readWranglerOAuthToken() {
  const configPath = join(homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml");
  return readFileSync(configPath, "utf8").match(/oauth_token = "([^"]+)"/)?.[1];
}

async function cf(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${readWranglerOAuthToken()}` },
  });
  return response.json();
}

const allRecords = await cf(`/zones/${CF_ZONE_ID}/dns_records?per_page=100`);
const streamRecords = allRecords.result?.filter((record) => record.name.includes("stream")) ?? [];
const dns = await fetch("https://dns.google/resolve?name=stream.folkradionazdrave.com&type=1").then((r) => r.json());
const cname = await fetch("https://dns.google/resolve?name=stream.folkradionazdrave.com&type=5").then((r) => r.json());

console.log(JSON.stringify({ streamRecords, dns, cname }, null, 2));
