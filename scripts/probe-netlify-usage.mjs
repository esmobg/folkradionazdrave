#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SITE_ID = "08c0e2ef-126d-4f1f-a024-6bb17089f1e1";
const token = Object.values(JSON.parse(readFileSync(join(homedir(), "AppData/Roaming/netlify/Config/config.json"), "utf8")).users ?? {})[0]?.auth?.token;
const headers = { Authorization: `Bearer ${token}` };

const paths = [
  `/sites/${SITE_ID}/analytics`,
  `/sites/${SITE_ID}/metrics`,
  `/sites/${SITE_ID}/usage`,
  `/accounts/ismail-ismailov/usage`,
  `/accounts/ismail-ismailov/metrics`,
];

for (const path of paths) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, { headers });
  const text = await response.text();
  console.log(path, response.status, text.slice(0, 400));
}
