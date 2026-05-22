#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function readNetlifyToken() {
  const configPath = join(homedir(), "AppData", "Roaming", "netlify", "Config", "config.json");
  return Object.values(JSON.parse(readFileSync(configPath, "utf8")).users ?? {})[0]?.auth?.token;
}

const site = await fetch("https://api.netlify.com/api/v1/sites/08c0e2ef-126d-4f1f-a024-6bb17089f1e1", {
  headers: { Authorization: `Bearer ${readNetlifyToken()}` },
}).then((r) => r.json());

console.log(JSON.stringify({ domain_aliases: site.domain_aliases, custom_domain: site.custom_domain }, null, 2));
