#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ZONE_ID = "16baacb8c862d4be0fefc17ebb10ae79";

function token() {
  return readFileSync(join(homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"), "utf8").match(
    /oauth_token = "([^"]+)"/,
  )?.[1];
}

async function cf(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  return response.json();
}

const records = await cf(`/zones/${ZONE_ID}/dns_records?per_page=100`);
const domains = await cf("/accounts/117e983e7b4024dd353060ec2fb7555a/workers/domains");

console.log(
  JSON.stringify(
    {
      dnsRecords: records.result?.map((record) => ({
        name: record.name,
        type: record.type,
        content: record.content,
        proxied: record.proxied,
      })),
      workerDomains: domains.result?.map((entry) => entry.hostname),
    },
    null,
    2,
  ),
);
