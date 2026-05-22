#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function readNetlifyToken() {
  const configPath = join(homedir(), "AppData", "Roaming", "netlify", "Config", "config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  return Object.values(config.users ?? {})[0]?.auth?.token;
}

function readWranglerOAuthToken() {
  const configPath = join(homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml");
  const config = readFileSync(configPath, "utf8");
  return config.match(/oauth_token = "([^"]+)"/)?.[1];
}

async function main() {
  const netlifyToken = readNetlifyToken();
  const cfToken = readWranglerOAuthToken();
  const zoneId = "69c616ce688fed44c6759224";
  const cfZoneId = "16baacb8c862d4be0fefc17ebb10ae79";

  const netlifyRecords = await fetch(`https://api.netlify.com/api/v1/dns_zones/${zoneId}/dns_records`, {
    headers: { Authorization: `Bearer ${netlifyToken}` },
  }).then((r) => r.json());

  const cfRecords = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/dns_records?name=stream.folkradionazdrave.com`,
    { headers: { Authorization: `Bearer ${cfToken}` } },
  ).then((r) => r.json());

  const workerDomains = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/117e983e7b4024dd353060ec2fb7555a/workers/domains",
    { headers: { Authorization: `Bearer ${cfToken}` } },
  ).then((r) => r.json());

  console.log(
    JSON.stringify(
      {
        netlifyStreamRecords: netlifyRecords.filter((record) => record.hostname?.includes("stream")),
        cloudflareStreamRecords: cfRecords,
        workerDomains: workerDomains.result?.filter((entry) => entry.hostname?.includes("stream")),
      },
      null,
      2,
    ),
  );
}

main();
