import { formatBytes, formatDelta } from "./bandwidth-monitor-utils.mjs";

function dailyAverage(totalDeltaBytes, days) {
  if (!days || days <= 0) return null;
  return totalDeltaBytes / days;
}

export function buildReportData({ campaign, snapshots }) {
  const baseline = snapshots[0];
  const latest = snapshots[snapshots.length - 1];
  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const elapsedDays = Math.max(
    1,
    (new Date(latest.capturedAt).getTime() - new Date(baseline.capturedAt).getTime()) / (24 * 60 * 60 * 1000),
  );

  const netlifyDeltaTotal = latest.netlify.accountBandwidthBytes - baseline.netlify.accountBandwidthBytes;
  const functionsDeltaTotal = latest.netlify.functionsCreditsUsed - baseline.netlify.functionsCreditsUsed;
  const functionsDeltaDay = previous
    ? latest.netlify.functionsCreditsUsed - previous.netlify.functionsCreditsUsed
    : null;

  return {
    campaign,
    snapshots,
    baseline,
    latest,
    previous,
    elapsedDays,
    netlifyDeltaTotal,
    functionsDeltaTotal,
    functionsDeltaDay,
  };
}

export function buildMarkdownReport({ campaign, snapshots }) {
  const data = buildReportData({ campaign, snapshots });
  const { baseline, latest, previous, elapsedDays, netlifyDeltaTotal, functionsDeltaTotal, functionsDeltaDay } =
    data;

  const lines = [
    "# Bandwidth monitoring report",
    "",
    `Campaign: **${campaign.label}**`,
    `Started: ${campaign.startedAt}`,
    `Ends: ${campaign.endsAt}`,
    `Snapshots: ${snapshots.length}`,
    "",
    "## Latest totals",
    "",
    `- Netlify account bandwidth: **${formatBytes(latest.netlify.accountBandwidthBytes)}**`,
    `- Since baseline: **${formatDelta(latest.netlify.accountBandwidthBytes, baseline.netlify.accountBandwidthBytes)}**`,
    `- Since previous snapshot: **${formatDelta(latest.netlify.accountBandwidthBytes, previous?.netlify.accountBandwidthBytes)}**`,
    `- Avg/day since baseline: **${formatBytes(dailyAverage(netlifyDeltaTotal, elapsedDays))}**`,
    "",
    `- Netlify Functions credits: **${latest.netlify.functionsCreditsUsed.toFixed(2)}**`,
    `- Since baseline: **${functionsDeltaTotal >= 0 ? "+" : ""}${functionsDeltaTotal.toFixed(2)} credits**`,
    `- Since previous snapshot: **${functionsDeltaDay == null ? "n/a" : `${functionsDeltaDay >= 0 ? "+" : ""}${functionsDeltaDay.toFixed(2)} credits`}**`,
    "",
    `- Cloudflare Worker requests (last 24h): **${latest.cloudflareWorker.last24h.requests}**`,
    `- Cloudflare Worker errors (last 24h): **${latest.cloudflareWorker.last24h.errors}**`,
    "",
    "## Snapshot history",
    "",
    "| # | Captured (UTC) | Netlify BW | Δ prev | Functions credits | Δ prev | CF req/24h |",
    "|---:|---|---:|---:|---:|---:|---:|",
  ];

  snapshots.forEach((entry, index) => {
    const prev = index > 0 ? snapshots[index - 1] : null;
    lines.push(
      `| ${entry.sequence} | ${entry.capturedAt.replace("T", " ").replace("Z", "")} | ${formatBytes(entry.netlify.accountBandwidthBytes)} | ${formatDelta(entry.netlify.accountBandwidthBytes, prev?.netlify.accountBandwidthBytes)} | ${entry.netlify.functionsCreditsUsed.toFixed(2)} | ${prev ? `${(entry.netlify.functionsCreditsUsed - prev.netlify.functionsCreditsUsed).toFixed(2)}` : "n/a"} | ${entry.cloudflareWorker.last24h.requests} |`,
    );
  });

  lines.push(
    "",
    "## Notes",
    "",
    "- Netlify bandwidth is account-level (not site-only).",
    "- Functions credits should flatten or rise slower if stream traffic stays on Cloudflare Worker.",
    "- Cloudflare Worker request counts confirm stream listeners are hitting the Worker.",
    `- Main site: ${campaign.siteUrl}`,
    `- Stream URL: ${campaign.streamUrl}`,
    "",
  );

  if (snapshots.length >= 2 && functionsDeltaTotal < 0) {
    lines.push(`Functions credits dropped ${Math.abs(functionsDeltaTotal).toFixed(2)} since baseline.`);
  }

  return lines.join("\n");
}

export function buildHtmlReport({ campaign, snapshots }) {
  const data = buildReportData({ campaign, snapshots });
  const { baseline, latest, previous, elapsedDays, netlifyDeltaTotal, functionsDeltaTotal } = data;

  const rows = snapshots
    .map((entry, index) => {
      const prev = index > 0 ? snapshots[index - 1] : null;
      return `<tr>
        <td>${entry.sequence}</td>
        <td>${entry.capturedAt.replace("T", " ").replace("Z", "")}</td>
        <td>${formatBytes(entry.netlify.accountBandwidthBytes)}</td>
        <td>${formatDelta(entry.netlify.accountBandwidthBytes, prev?.netlify.accountBandwidthBytes)}</td>
        <td>${entry.netlify.functionsCreditsUsed.toFixed(2)}</td>
        <td>${prev ? (entry.netlify.functionsCreditsUsed - prev.netlify.functionsCreditsUsed).toFixed(2) : "n/a"}</td>
        <td>${entry.cloudflareWorker.last24h.requests}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="bg">
  <body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111;">
    <h1>Bandwidth report — ${campaign.label}</h1>
    <p><strong>Site:</strong> ${campaign.siteUrl}<br>
    <strong>Stream:</strong> ${campaign.streamUrl}<br>
    <strong>Period:</strong> ${campaign.startedAt} → ${campaign.endsAt}<br>
    <strong>Snapshots:</strong> ${snapshots.length}</p>
    <h2>Summary</h2>
    <ul>
      <li>Netlify bandwidth: <strong>${formatBytes(latest.netlify.accountBandwidthBytes)}</strong></li>
      <li>Since baseline: <strong>${formatDelta(latest.netlify.accountBandwidthBytes, baseline.netlify.accountBandwidthBytes)}</strong></li>
      <li>Avg/day since baseline: <strong>${formatBytes(dailyAverage(netlifyDeltaTotal, elapsedDays))}</strong></li>
      <li>Functions credits: <strong>${latest.netlify.functionsCreditsUsed.toFixed(2)}</strong></li>
      <li>Functions delta since baseline: <strong>${functionsDeltaTotal >= 0 ? "+" : ""}${functionsDeltaTotal.toFixed(2)}</strong></li>
      <li>Cloudflare Worker requests (24h): <strong>${latest.cloudflareWorker.last24h.requests}</strong></li>
      <li>Cloudflare Worker errors (24h): <strong>${latest.cloudflareWorker.last24h.errors}</strong></li>
    </ul>
    <h2>History</h2>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr>
          <th>#</th><th>Captured (UTC)</th><th>Netlify BW</th><th>Δ prev</th>
          <th>Functions</th><th>Δ prev</th><th>CF req/24h</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:24px;color:#555;">Generated automatically by folk-radio bandwidth monitor bot.</p>
  </body>
</html>`;
}
