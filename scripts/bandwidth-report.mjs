#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MONITOR_DIR,
  formatBytes,
  formatDelta,
  loadCampaign,
  loadSnapshots,
} from "./bandwidth-monitor-utils.mjs";
import { buildMarkdownReport } from "./bandwidth-report-lib.mjs";

function main() {
  const campaign = loadCampaign();
  const snapshots = loadSnapshots();

  if (!campaign) {
    console.error("No campaign found. Run: npm run monitor:bandwidth:snapshot");
    process.exit(1);
  }

  if (snapshots.length === 0) {
    console.error("No snapshots yet. Run: npm run monitor:bandwidth:snapshot");
    process.exit(1);
  }

  const report = buildMarkdownReport({ campaign, snapshots });
  const reportPath = join(MONITOR_DIR, "latest-report.md");
  writeFileSync(reportPath, report, "utf8");

  console.log(report);
  console.log(`\nSaved: ${reportPath}`);
}

main();
