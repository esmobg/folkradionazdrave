#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function netlifyToken() {
  return Object.values(JSON.parse(readFileSync(join(homedir(), "AppData/Roaming/netlify/Config/config.json"), "utf8")).users ?? {})[0]
    ?.auth?.token;
}

const token = netlifyToken();
const headers = { Authorization: `Bearer ${token}` };

const accounts = await fetch("https://api.netlify.com/api/v1/accounts", { headers }).then((r) => r.json());
const account = accounts[0];
const slug = account?.slug;

const bandwidth = slug
  ? await fetch(`https://api.netlify.com/api/v1/accounts/${slug}/bandwidth`, { headers }).then((r) => r.json())
  : null;

const site = await fetch("https://api.netlify.com/api/v1/sites/08c0e2ef-126d-4f1f-a024-6bb17089f1e1", { headers }).then((r) => r.json());

console.log(JSON.stringify({ account: { slug, name: account?.name }, bandwidth, site: { name: site.name, url: site.url } }, null, 2));
