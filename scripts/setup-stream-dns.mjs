#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = "117e983e7b4024dd353060ec2fb7555a";
const SITE_ID = "08c0e2ef-126d-4f1f-a024-6bb17089f1e1";
const DNS_ZONE_ID = "69c616ce688fed44c6759224";
const ZONE_NAME = "folkradionazdrave.com";
const STREAM_HOST = "stream.folkradionazdrave.com";
const WORKER_NAME = "folkradio-stream-proxy";
const WORKERS_DEV_TARGET = "folkradio-stream-proxy.ismail-ismailov.workers.dev";

function readNetlifyToken() {
  const configPath = join(homedir(), "AppData", "Roaming", "netlify", "Config", "config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const token = Object.values(config.users ?? {})[0]?.auth?.token;

  if (!token) {
    throw new Error("Missing Netlify auth token. Run: npx netlify login");
  }

  return token;
}

function readCloudflareToken() {
  return process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || "";
}

async function netlifyApi(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${readNetlifyToken()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || JSON.stringify(payload));
  }

  return payload;
}

async function cloudflareApi(path, { method = "GET", body } = {}) {
  const token = readCloudflareToken();

  if (!token) {
    return null;
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();

  if (!payload.success) {
    const message = payload.errors?.map((error) => error.message).join("; ") || "Cloudflare API error";
    throw new Error(message);
  }

  return payload.result;
}

async function ensureStreamDomainAlias() {
  const site = await netlifyApi(`/sites/${SITE_ID}`);
  const aliases = Array.isArray(site.domain_aliases) ? [...site.domain_aliases] : [];

  if (!aliases.includes(STREAM_HOST)) {
    aliases.push(STREAM_HOST);
    await netlifyApi(`/sites/${SITE_ID}`, {
      method: "PATCH",
      body: { domain_aliases: aliases },
    });
  }
}

async function upsertNetlifyDnsRecord(target) {
  const records = await netlifyApi(`/dns_zones/${DNS_ZONE_ID}/dns_records`);
  const existing = records.find((record) => record.hostname === STREAM_HOST && record.type === "CNAME");
  const payload = {
    type: "CNAME",
    hostname: STREAM_HOST,
    value: target,
    ttl: 300,
  };

  if (existing) {
    return netlifyApi(`/dns_zones/${DNS_ZONE_ID}/dns_records/${existing.id}`, {
      method: "PUT",
      body: payload,
    });
  }

  return netlifyApi(`/dns_zones/${DNS_ZONE_ID}/dns_records`, {
    method: "POST",
    body: payload,
  });
}

async function ensureCloudflareZone() {
  const token = readCloudflareToken();

  if (!token) {
    return {
      skipped: true,
      reason: "Set CF_API_TOKEN with Zone:Edit and Account:Workers Scripts:Edit permissions.",
    };
  }

  const zones = await cloudflareApi(`/zones?name=${ZONE_NAME}`);
  if (zones.length > 0) {
    return zones[0];
  }

  return cloudflareApi("/zones", {
    method: "POST",
    body: {
      name: ZONE_NAME,
      account: { id: ACCOUNT_ID },
      jump_start: false,
      type: "full",
    },
  });
}

async function ensureWorkerCustomDomain(zoneId) {
  const existing = await cloudflareApi(`/accounts/${ACCOUNT_ID}/workers/domains`);
  const match = existing.find((entry) => entry.hostname === STREAM_HOST);

  if (match) {
    return match;
  }

  return cloudflareApi(`/accounts/${ACCOUNT_ID}/workers/domains`, {
    method: "PUT",
    body: {
      hostname: STREAM_HOST,
      service: WORKER_NAME,
      zone_id: zoneId,
    },
  });
}

async function verifyDns() {
  const response = await fetch(`https://dns.google/resolve?name=${STREAM_HOST}&type=CNAME`);
  return response.json();
}

async function verifyStreamHead() {
  const response = await fetch(`https://${STREAM_HOST}/api/stream/nazdrave`, {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });

  return {
    status: response.status,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type"),
  };
}

async function main() {
  await ensureStreamDomainAlias();

  const cloudflare = await ensureCloudflareZone();
  let dnsTarget = "folkradionazdrave.netlify.app";
  let workerDomain = null;

  if (cloudflare && !cloudflare.skipped) {
    workerDomain = await ensureWorkerCustomDomain(cloudflare.id);
    dnsTarget = WORKERS_DEV_TARGET;
  }

  const dnsRecord = await upsertNetlifyDnsRecord(dnsTarget);
  const dnsLookup = await verifyDns().catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));

  let streamCheck = null;
  try {
    streamCheck = await verifyStreamHead();
  } catch (error) {
    streamCheck = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  console.log(
    JSON.stringify(
      {
        streamHost: STREAM_HOST,
        dnsRecord,
        dnsLookup,
        cloudflare: cloudflare?.skipped ? cloudflare : { id: cloudflare.id, status: cloudflare.status },
        workerDomain,
        streamCheck,
        nextStep: cloudflare?.skipped
          ? "Add folkradionazdrave.com to Cloudflare, then rerun with CF_API_TOKEN and: npx wrangler deploy --domain stream.folkradionazdrave.com"
          : "Run: npx wrangler deploy --domain stream.folkradionazdrave.com",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
