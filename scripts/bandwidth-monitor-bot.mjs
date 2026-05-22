#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MONITOR_DIR, loadCampaign, loadSnapshots } from "./bandwidth-monitor-utils.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const intervalMs = Number(process.env.MONITOR_INTERVAL_MS ?? 24 * 60 * 60 * 1000);

function runNodeScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(projectRoot, "scripts", scriptName)], {
      cwd: projectRoot,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exited with code ${code}`));
    });
  });
}

function campaignActive(campaign) {
  return new Date(campaign.endsAt).getTime() > Date.now();
}

async function tick(label) {
  console.log(`[bandwidth-bot] ${label}`);
  await runNodeScript("bandwidth-snapshot.mjs");
  await runNodeScript("bandwidth-report.mjs");
}

async function main() {
  let campaign = loadCampaign();
  if (!campaign) {
    await runNodeScript("bandwidth-snapshot.mjs");
    campaign = loadCampaign();
  }

  if (!campaign) {
    throw new Error("Failed to start monitoring campaign.");
  }

  console.log(`[bandwidth-bot] campaign=${campaign.id}`);
  console.log(`[bandwidth-bot] endsAt=${campaign.endsAt}`);
  console.log(`[bandwidth-bot] reportFile=${join(MONITOR_DIR, "latest-report.md")}`);
  console.log(`[bandwidth-bot] intervalMs=${intervalMs}`);

  if (loadSnapshots().length === 0) {
    await tick("initial snapshot");
  }

  while (campaignActive(campaign)) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (!campaignActive(campaign)) break;
    await tick("scheduled snapshot");
  }

  await tick("final snapshot");
  console.log(`[bandwidth-bot] campaign complete`);
  console.log(`[bandwidth-bot] open ${join(MONITOR_DIR, "latest-report.md")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
