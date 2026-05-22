#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function readWranglerOAuthToken() {
  const configPath = join(homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml");
  const config = readFileSync(configPath, "utf8");
  const match = config.match(/oauth_token = "([^"]+)"/);
  if (!match) throw new Error("Missing wrangler OAuth token.");
  return match[1];
}

async function cloudflareApi(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${readWranglerOAuthToken()}` },
  });
  const text = await response.text();
  if (!text) return { success: false, errors: [{ message: "Empty response" }] };
  return JSON.parse(text);
}

const zones = await cloudflareApi("/zones?name=folkradionazdrave.com");
console.log(JSON.stringify(zones, null, 2));
