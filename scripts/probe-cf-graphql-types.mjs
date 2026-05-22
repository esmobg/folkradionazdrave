#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function token() {
  return readFileSync(join(homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"), "utf8").match(
    /oauth_token = "([^"]+)"/,
  )?.[1];
}

const query = `
query {
  __type(name: "AccountWorkersInvocationsAdaptiveGroups") {
    fields { name type { name kind ofType { name kind ofType { name } } } }
  }
}`;

const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});

console.log(JSON.stringify(await response.json(), null, 2));
