# Security Best Practices Report

## Remediation Update

Follow-up remediation has been applied in `server.mjs` after this audit.

- FRN-001: mitigated with a global connection cap on `/api/stream/gold`
- FRN-002: mitigated by rejecting non-audio upstream content types and disabling redirects on upstream fetches
- FRN-003: mitigated by forcing `NODE_ENV=production` when `--production` is used and by adding explicit API 404 / error middleware
- FRN-004: still depends on a legacy upstream that currently only responds over plain HTTP with HTTP/0.9 semantics; removing that support would disable the Gold stream until the upstream changes

## Executive Summary

I reviewed this project as a JavaScript React + Express web app and combined static code review with runtime verification against the production build.

The app already does several important things well: it uses `helmet`, removes `X-Powered-By`, serves a production CSP, and `npm audit --omit=dev` reported no production dependency advisories.

The most important issue is a denial-of-service path on the public Gold stream endpoint: each client connection spawns a long-lived `curl` subprocess. I also found a trust-boundary issue in the Nazdrave stream proxy, a production-mode mismatch that can leave Express running with development-oriented defaults, and two low-severity items affecting transport integrity and build tooling.

## High Severity

### FRN-001: Public Gold stream requests can exhaust server processes

- Rule ID: EXPRESS-DOS-001 / EXPRESS-CMD-001
- Severity: High
- Location: `server.mjs:155-235`, `server.mjs:253-255`
- Evidence:

```js
async function proxyLegacyIcyStream(urls, res) {
  for (const url of urls) {
    const connected = await new Promise((resolve) => {
      const child = spawn(curlCommand, [
        "--http0.9",
        "--silent",
        "--show-error",
        "--connect-timeout",
        "8",
        url,
      ]);
```

```js
app.get("/api/stream/gold", async (_req, res) => {
  await proxyLegacyIcyStream(GOLD_RADIO_STREAMS, res);
});
```

- Impact: Every unauthenticated listener to `/api/stream/gold` gets a dedicated OS subprocess that stays alive for the duration of the stream. An attacker can open many concurrent connections and exhaust process slots, memory, file descriptors, or upstream bandwidth.
- Runtime evidence: live verification against the production build returned `200 OK` from `/api/stream/gold` and kept the stream open as expected.
- Fix: Replace the per-request subprocess model with a pooled or native streaming approach if possible. At minimum, add strong rate limiting / connection limiting in front of `/api/stream/gold` and reject excessive concurrent streams per IP.
- Mitigation: Apply reverse-proxy limits for concurrent connections, request rate, and idle timeouts before exposing this route publicly.
- False positive notes: If a CDN or reverse proxy already enforces strict per-IP stream limits, the practical risk is reduced, but those protections are not visible in this repository.

## Medium Severity

### FRN-002: Nazdrave stream proxy trusts upstream content type and body too broadly

- Rule ID: EXPRESS-SSRF-001 / EXPRESS-HEADERS-001
- Severity: Medium
- Location: `server.mjs:53-75`, `server.mjs:77-90`, `server.mjs:116-140`, `server.mjs:249-250`
- Evidence:

```js
function setStreamHeaders(proxyResponse, res) {
  const headersToForward = [
    "content-type",
    "icy-name",
    "icy-description",
    "icy-genre",
    "icy-url",
    "icy-br",
  ];

  for (const header of headersToForward) {
    const value = proxyResponse.headers.get(header);
    if (value) {
      res.setHeader(header, value);
    }
  }
}
```

```js
const response = await fetch(url, {
  signal: controller.signal,
  headers: {
    "icy-metadata": "1",
  },
});
```

```js
app.get("/api/stream/nazdrave", async (_req, res) => {
  await proxyStream([NAZDRAVE_STREAM_URL], res);
});
```

- Impact: The app serves third-party stream responses under its own origin and copies the upstream `Content-Type`. If the upstream service is compromised, misconfigured, or redirects to unexpected content, this server can re-serve that content from `/api/stream/nazdrave` as same-origin content.
- Runtime evidence: during testing the current upstream returned `audio/mpeg`, which is expected. The risk appears if that upstream behavior changes.
- Fix: Force a safe media type such as `audio/mpeg`, reject non-audio upstream responses, and disable or tightly validate redirects / final destination URLs.
- Mitigation: Validate the upstream `Content-Type` against an allowlist and fail closed if the response is not recognized as audio.
- False positive notes: If the upstream endpoint is fully controlled and monitored by the same operator, the likelihood is lower, but the trust boundary still exists in code.

### FRN-003: Production serving is not coupled to `NODE_ENV=production`

- Rule ID: EXPRESS-ERROR-001 / EXPRESS-FINGERPRINT-001
- Severity: Medium
- Location: `package.json:7-15`, `server.mjs:11-12`, `server.mjs:257-298`
- Evidence:

```json
"scripts": {
  "dev": "node server.mjs",
  "build": "vite build",
  "preview": "node server.mjs --production"
}
```

```js
const isProduction = process.argv.includes("--production");
const isDevelopment = !isProduction;
```

The server ends without custom terminal `404` or error middleware, and the local runtime environment used for testing had `NODE_ENV` unset.

- Impact: The app can serve production assets while Express and any middleware that rely on `NODE_ENV` still behave as if they are in development mode. That increases the chance of stack traces or framework-default responses leaking internal details when an unexpected exception happens.
- Runtime evidence: local production-preview tests ran with `NODE_ENV` unset, and missing API routes returned the default Express HTML error page.
- Fix: Start production with `NODE_ENV=production` and add explicit 404 / error handlers that return generic responses.
- Mitigation: Ensure deployment configuration sets `NODE_ENV=production` even if the `--production` flag remains.
- False positive notes: If your real deployment platform always sets `NODE_ENV=production`, the risk is lower in production, but the checked-in `preview` path still does not enforce it.

## Low Severity

### FRN-004: Gold fallback accepts insecure legacy upstream transport

- Rule ID: EXPRESS-DOS-001
- Severity: Low
- Location: `server.mjs:17-18`, `server.mjs:158-164`
- Evidence:

```js
const GOLD_RADIO_STREAMS = ["http://92.247.130.252:8030", "http://78.83.177.106:8020"];
```

```js
const child = spawn(curlCommand, [
  "--http0.9",
  "--silent",
  "--show-error",
  "--connect-timeout",
  "8",
  url,
]);
```

- Impact: The Gold fallback path relies on plain HTTP upstreams and explicitly accepts HTTP/0.9 responses. That weakens integrity and makes on-path tampering or malformed legacy responses easier to accept and re-serve to listeners.
- Fix: Prefer HTTPS upstreams, remove `--http0.9` if the source can support modern HTTP, and fail closed on unexpected response formats.
- Mitigation: If upstreams cannot be changed, isolate and monitor this path more aggressively than the primary stream.
- False positive notes: This is mainly an integrity concern; I did not find direct code execution from the current implementation.

### FRN-005: Build tooling currently resolves a vulnerable `picomatch` version

- Rule ID: EXPRESS-DEPS-001 / REACT-SUPPLY-001
- Severity: Low
- Location: `package.json:23-26`
- Evidence:

```json
"devDependencies": {
  "@vitejs/plugin-react": "^5.0.4",
  "playwright": "^1.58.2",
  "vite": "^7.1.10"
}
```

`npm audit --json` reported a high-severity advisory on `picomatch@4.0.3` (GHSA-c2c7-rcm5-vvqj), pulled in through `vite@7.3.1`.

- Impact: This is a build/CI supply-chain issue rather than a shipped runtime issue. It can affect developer or CI environments that process attacker-controlled glob patterns.
- Fix: Update the Vite dependency chain once a patched resolution is available in your lockfile.
- Mitigation: Keep build tooling updated and prefer `npm ci` in CI, which you already do in GitHub Actions.
- False positive notes: `npm audit --omit=dev` reported zero production advisories, so this does not currently affect the deployed runtime bundle.

## Checks Performed

- Reviewed `server.mjs`, `package.json`, `index.html`, `src/App.jsx`, `src/content.js`, `src/main.jsx`, `src/styles.css`, GitHub workflow config, and review scripts.
- Ran `npm.cmd audit --omit=dev --json`: no production dependency advisories.
- Ran `npm.cmd audit --json`: one dev-tooling advisory (`picomatch` via Vite).
- Ran `npm.cmd run build`: production build succeeded.
- Started the production server locally and verified:
  - `/` returned security headers including CSP, `nosniff`, referrer policy, permissions policy, and no `X-Powered-By`
  - `/api/now-playing/nazdrave` returned `200 OK` with JSON
  - `/api/stream/nazdrave` returned `200 OK` with `audio/mpeg`
  - `/api/stream/gold` returned `200 OK` and maintained a long-lived stream

## Clean Areas

- I did not find client-side DOM XSS sinks such as `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, or unsafe `postMessage` handling in the shipped app code.
- I did not find hard-coded secrets in the application source reviewed here.
- External links that open new tabs use `rel="noreferrer noopener"`.
- CI already uses `npm ci`, which is good supply-chain hygiene.

## Recommended Next Steps

1. Add connection/rate limiting for `/api/stream/gold` as the first remediation.
2. Harden upstream response validation for proxied audio routes.
3. Tie production boot to `NODE_ENV=production` and add explicit 404/error middleware.
4. Plan a build-tooling refresh to pick up the `picomatch` fix when available through Vite.
