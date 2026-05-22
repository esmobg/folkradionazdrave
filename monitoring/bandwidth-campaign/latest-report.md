# Bandwidth monitoring report

Campaign: **7-day stream migration bandwidth watch**
Started: 2026-05-22T10:40:48.228Z
Ends: 2026-05-29T10:40:48.229Z
Snapshots: 1

## Latest totals

- Netlify account bandwidth: **56.26 GiB**
- Since baseline: **+0 B**
- Since previous snapshot: **n/a**
- Avg/day since baseline: **0 B**

- Netlify Functions credits: **6322.82**
- Since baseline: **+0.00 credits**
- Since previous snapshot: **n/a**

- Cloudflare Worker requests (last 24h): **81**
- Cloudflare Worker errors (last 24h): **1**

## Snapshot history

| # | Captured (UTC) | Netlify BW | Δ prev | Functions credits | Δ prev | CF req/24h |
|---:|---|---:|---:|---:|---:|---:|
| 1 | 2026-05-22 10:40:48.231 | 56.26 GiB | n/a | 6322.82 | n/a | 81 |

## Notes

- Netlify bandwidth is account-level (not site-only).
- Functions credits should flatten or rise slower if stream traffic stays on Cloudflare Worker.
- Cloudflare Worker request counts confirm stream listeners are hitting the Worker.
- Main site: https://folkradionazdrave.com
- Stream URL: https://folkradio-stream-proxy.ismail-ismailov.workers.dev/api/stream/nazdrave
