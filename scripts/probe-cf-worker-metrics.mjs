#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = "117e983e7b4024dd353060ec2fb7555a";
const WORKER_NAME = "folkradio-stream-proxy";

function token() {
  return readFileSync(join(homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"), "utf8").match(
    /oauth_token = "([^"]+)"/,
  )?.[1];
}

const end = new Date();
const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

const query = `
query WorkersMetrics($accountTag: string!, $datetimeStart: Time!, $datetimeEnd: Time!, $scriptName: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 10000
        filter: {
          scriptName: $scriptName
          datetime_geq: $datetimeStart
          datetime_leq: $datetimeEnd
        }
      ) {
        sum { requests errors subrequests }
        dimensions { datetime scriptName status }
      }
    }
  }
}`;

const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token()}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query,
    variables: {
      accountTag: ACCOUNT_ID,
      datetimeStart: start.toISOString(),
      datetimeEnd: end.toISOString(),
      scriptName: WORKER_NAME,
    },
  }),
});

const payload = await response.json();
console.log(JSON.stringify(payload, null, 2));
