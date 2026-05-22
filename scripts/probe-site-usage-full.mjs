#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const token = Object.values(JSON.parse(readFileSync(join(homedir(), "AppData/Roaming/netlify/Config/config.json"), "utf8")).users ?? {})[0]?.auth?.token;
const data = await fetch("https://api.netlify.com/api/v1/sites/08c0e2ef-126d-4f1f-a024-6bb17089f1e1/usage", {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());
console.log(JSON.stringify(data, null, 2));
