#!/usr/bin/env node

import {
  DEFAULTS,
  appendSnapshot,
  collectMetrics,
  ensureMonitorDir,
  loadCampaign,
  loadSnapshots,
  saveCampaign,
} from "./bandwidth-monitor-utils.mjs";

const args = new Set(process.argv.slice(2));
const forceNew = args.has("--force-new");

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startCampaignIfNeeded() {
  ensureMonitorDir();
  const existing = loadCampaign();
  if (existing && !forceNew) return existing;

  const startedAt = new Date().toISOString();
  const campaign = {
    id: `stream-bandwidth-${startedAt.slice(0, 10)}`,
    label: "7-day stream migration bandwidth watch",
    startedAt,
    endsAt: addDays(new Date(), 7).toISOString(),
    durationDays: 7,
    goal: "Track Netlify bandwidth + Functions usage drop after Cloudflare Worker stream cutover",
    ...DEFAULTS,
  };

  saveCampaign(campaign);
  return campaign;
}

async function main() {
  const campaign = startCampaignIfNeeded();
  const previousSnapshots = loadSnapshots();
  const snapshot = await collectMetrics(campaign);
  snapshot.campaignId = campaign.id;
  snapshot.sequence = previousSnapshots.length + 1;
  appendSnapshot(snapshot);

  console.log(
    JSON.stringify(
      {
        ok: true,
        campaign,
        snapshot,
        snapshotCount: previousSnapshots.length + 1,
        nextStep: "Run: npm run monitor:bandwidth:report",
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
