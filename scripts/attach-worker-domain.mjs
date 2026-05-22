#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = "117e983e7b4024dd353060ec2fb7555a";
const ZONE_ID = "16baacb8c862d4be0fefc17ebb10ae79";
const STREAM_HOST = "stream.folkradionazdrave.com";
const WORKER_NAME = "folkradio-stream-proxy";

function readWranglerOAuthToken() {
  const configPath = join(homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml");
  return readFileSync(configPath, "utf8").match(/oauth_token = "([^"]+)"/)?.[1];
}

async function cf(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${readWranglerOAuthToken()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

const allRecords = await cf(`/zones/${ZONE_ID}/dns_records?per_page=100`);
const attachAttempt = await cf(`/accounts/${ACCOUNT_ID}/workers/domains`, {
  method: "PUT",
  body: {
    hostname: STREAM_HOST,
    service: WORKER_NAME,
    zone_id: ZONE_ID,
    override_existing_dns_record: true,
  },
});

console.log(
  JSON.stringify(
    {
      zoneRecordCount: allRecords.result?.length ?? 0,
      zoneStreamRecords: allRecords.result?.filter((record) => record.name.includes("stream")) ?? [],
      attachAttempt,
    },
    null,
    2,
  ),
);
