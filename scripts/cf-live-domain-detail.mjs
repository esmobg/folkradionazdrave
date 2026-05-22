#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = "117e983e7b4024dd353060ec2fb7555a";
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
  const text = await response.text();
  return text ? JSON.parse(text) : { success: false };
}

const domains = await cf(`/accounts/${ACCOUNT_ID}/workers/domains`);
const records = await cf(`/zones/${ZONE_ID}/dns_records?per_page=100`);
const liveDomain = domains.result?.find((entry) => entry.hostname === "live.folkradionazdrave.com");

let liveDomainDetail = null;
if (liveDomain?.id) {
  liveDomainDetail = await cf(`/accounts/${ACCOUNT_ID}/workers/domains/${liveDomain.id}`);
}

console.log(
  JSON.stringify(
    {
      liveDomain,
      liveDomainDetail: liveDomainDetail?.result ?? liveDomainDetail?.errors,
      dnsRecords: records.result?.map((record) => ({
        id: record.id,
        name: record.name,
        type: record.type,
        content: record.content,
        proxied: record.proxied,
      })),
      recordsApiSuccess: records.success,
      recordsApiErrors: records.errors,
    },
    null,
    2,
  ),
);
