#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = "117e983e7b4024dd353060ec2fb7555a";

function token() {
  return readFileSync(join(homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"), "utf8").match(
    /oauth_token = "([^"]+)"/,
  )?.[1];
}

async function cf(path, { method = "DELETE" } = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}` },
  });
  return response.json();
}

const list = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/domains`, {
  headers: { Authorization: `Bearer ${token()}` },
}).then((r) => r.json());

for (const entry of list.result ?? []) {
  if (entry.hostname === "audio.folkradionazdrave.com" || entry.hostname === "cfstream.folkradionazdrave.com") {
    const result = await cf(`/accounts/${ACCOUNT_ID}/workers/domains/${entry.id}`);
    console.log(entry.hostname, result.success ? "deleted" : result.errors);
  }
}
