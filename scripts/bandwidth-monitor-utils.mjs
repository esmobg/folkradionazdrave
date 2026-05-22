import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const MONITOR_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "monitoring", "bandwidth-campaign");
export const CAMPAIGN_FILE = join(MONITOR_DIR, "campaign.json");
export const SNAPSHOTS_FILE = join(MONITOR_DIR, "snapshots.jsonl");

export const DEFAULTS = {
  siteId: "08c0e2ef-126d-4f1f-a024-6bb17089f1e1",
  accountSlug: "ismail-ismailov",
  accountId: "695d226550fcd4116302f8b0",
  cloudflareAccountId: "117e983e7b4024dd353060ec2fb7555a",
  workerName: "folkradio-stream-proxy",
  siteUrl: "https://folkradionazdrave.com",
  streamUrl: "https://folkradio-stream-proxy.ismail-ismailov.workers.dev/api/stream/nazdrave",
};

export function readNetlifyToken() {
  const configPath = join(homedir(), "AppData", "Roaming", "netlify", "Config", "config.json");
  const token = Object.values(JSON.parse(readFileSync(configPath, "utf8")).users ?? {})[0]?.auth?.token;
  if (!token) throw new Error("Missing Netlify token. Run: npx netlify login");
  return token;
}

export function readWranglerOAuthToken() {
  const configPath = join(homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml");
  const match = readFileSync(configPath, "utf8").match(/oauth_token = "([^"]+)"/);
  if (!match) throw new Error("Missing wrangler OAuth token. Run: npx wrangler login");
  return match[1];
}

export function ensureMonitorDir() {
  mkdirSync(MONITOR_DIR, { recursive: true });
}

export function loadCampaign() {
  ensureMonitorDir();
  if (!existsSync(CAMPAIGN_FILE)) return null;
  return JSON.parse(readFileSync(CAMPAIGN_FILE, "utf8"));
}

export function saveCampaign(campaign) {
  ensureMonitorDir();
  writeFileSync(CAMPAIGN_FILE, `${JSON.stringify(campaign, null, 2)}\n`, "utf8");
}

export function loadSnapshots() {
  ensureMonitorDir();
  if (!existsSync(SNAPSHOTS_FILE)) return [];
  return readFileSync(SNAPSHOTS_FILE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendSnapshot(snapshot) {
  ensureMonitorDir();
  appendFileSync(SNAPSHOTS_FILE, `${JSON.stringify(snapshot)}\n`, "utf8");
}

export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return "n/a";
  const gib = Number(bytes) / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(2)} GiB`;
  const mib = Number(bytes) / 1024 ** 2;
  if (mib >= 1) return `${mib.toFixed(2)} MiB`;
  return `${Number(bytes).toLocaleString()} B`;
}

export function formatDelta(current, previous) {
  if (current == null || previous == null) return "n/a";
  const delta = Number(current) - Number(previous);
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${formatBytes(delta)}`;
}

async function netlifyApi(path, token) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `Netlify API ${response.status} for ${path}`);
  }
  return payload;
}

async function cloudflareGraphql(query, variables, token) {
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }
  return payload.data;
}

export async function collectMetrics(config = DEFAULTS) {
  const netlifyToken = readNetlifyToken();
  const cfToken = readWranglerOAuthToken();
  const capturedAt = new Date().toISOString();

  const [bandwidth, siteUsage] = await Promise.all([
    netlifyApi(`/accounts/${config.accountSlug}/bandwidth`, netlifyToken),
    netlifyApi(`/sites/${config.siteId}/usage`, netlifyToken),
  ]);

  const functionsUsage = siteUsage.find((entry) => entry.type === "functions");
  const functionsCreditsUsed = Number(functionsUsage?.capabilities?.credit_usage?.credits_used ?? 0);
  const functionsUsageUsed = Number(functionsUsage?.capabilities?.credit_usage?.usage_used ?? 0);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const workerQuery = `
    query WorkerRequests($accountTag: string!, $datetimeStart: Time!, $datetimeEnd: Time!, $scriptName: string!) {
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
          }
        }
      }
    }`;

  const workerData = await cloudflareGraphql(
    workerQuery,
    {
      accountTag: config.cloudflareAccountId,
      datetimeStart: since,
      datetimeEnd: capturedAt,
      scriptName: config.workerName,
    },
    cfToken,
  );

  const workerRows = workerData.viewer.accounts[0]?.workersInvocationsAdaptive ?? [];
  const workerLast24h = workerRows.reduce(
    (totals, row) => ({
      requests: totals.requests + Number(row.sum?.requests ?? 0),
      errors: totals.errors + Number(row.sum?.errors ?? 0),
      subrequests: totals.subrequests + Number(row.sum?.subrequests ?? 0),
    }),
    { requests: 0, errors: 0, subrequests: 0 },
  );

  return {
    capturedAt,
    netlify: {
      accountBandwidthBytes: Number(bandwidth.used ?? 0),
      accountBandwidthIncludedBytes: bandwidth.included == null ? null : Number(bandwidth.included),
      accountBandwidthLastUpdatedAt: bandwidth.last_updated_at ?? null,
      billingPeriodStart: bandwidth.period_start_date ?? null,
      billingPeriodEnd: bandwidth.period_end_date ?? null,
      functionsCreditsUsed,
      functionsUsageUsed,
      functionsPeriodStart: functionsUsage?.period_start_date ?? null,
      functionsPeriodEnd: functionsUsage?.period_end_date ?? null,
    },
    cloudflareWorker: {
      scriptName: config.workerName,
      last24h: workerLast24h,
    },
    notes: {
      netlifyBandwidthScope: "account_total",
      streamHost: config.streamUrl,
      mainSite: config.siteUrl,
    },
  };
}
