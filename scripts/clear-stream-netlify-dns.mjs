#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SITE_ID = "08c0e2ef-126d-4f1f-a024-6bb17089f1e1";
const DNS_ZONE_ID = "69c616ce688fed44c6759224";
const STREAM_HOST = "stream.folkradionazdrave.com";

function readNetlifyToken() {
  const configPath = join(homedir(), "AppData", "Roaming", "netlify", "Config", "config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  return Object.values(config.users ?? {})[0]?.auth?.token;
}

async function netlifyApi(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${readNetlifyToken()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || JSON.stringify(payload));
  }

  return payload;
}

async function main() {
  const site = await netlifyApi(`/sites/${SITE_ID}`);
  const aliases = (site.domain_aliases ?? []).filter((alias) => alias !== STREAM_HOST);

  if (aliases.length !== (site.domain_aliases ?? []).length) {
    await netlifyApi(`/sites/${SITE_ID}`, {
      method: "PATCH",
      body: { domain_aliases: aliases },
    });
  }

  const records = await netlifyApi(`/dns_zones/${DNS_ZONE_ID}/dns_records`);
  const streamRecords = records.filter((record) => record.hostname === STREAM_HOST);

  for (const record of streamRecords) {
    await netlifyApi(`/dns_zones/${DNS_ZONE_ID}/dns_records/${record.id}`, {
      method: "DELETE",
    });
    console.log(`deleted ${record.type} ${record.id}`);
  }

  console.log(JSON.stringify({ removedAlias: STREAM_HOST, deletedRecords: streamRecords.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
