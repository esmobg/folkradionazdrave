#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function readNetlifyToken() {
  const configPath = join(homedir(), "AppData", "Roaming", "netlify", "Config", "config.json");
  return Object.values(JSON.parse(readFileSync(configPath, "utf8")).users ?? {})[0]?.auth?.token;
}

const records = await fetch("https://api.netlify.com/api/v1/dns_zones/69c616ce688fed44c6759224/dns_records", {
  headers: { Authorization: `Bearer ${readNetlifyToken()}` },
}).then((r) => r.json());

console.log(JSON.stringify(records, null, 2));
