const NAZDRAVE_STREAM_URLS = [
  "http://78.83.177.106:8000/",
  "http://78.83.177.106:8000/;",
  "http://92.247.130.252:8066",
  "http://92.247.130.252:8066/",
];

const GOLD_STREAM_URLS = ["http://78.83.177.106:8020", "http://92.247.130.252:8030"];
const SAFE_ICY_HEADERS = ["icy-name", "icy-description", "icy-genre", "icy-url", "icy-br"];

function getSafeAudioContentType(contentType) {
  if (!contentType) {
    return "audio/mpeg";
  }

  const normalized = contentType.split(";")[0].trim().toLowerCase();

  if (normalized.startsWith("audio/") || normalized === "application/octet-stream") {
    return normalized;
  }

  return null;
}

async function openStream(url) {
  return fetch(url, {
    headers: {
      "icy-metadata": "1",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
}

async function proxyStream(urls) {
  for (const streamUrl of urls) {
    try {
      const upstreamResponse = await openStream(streamUrl);

      if (!upstreamResponse.ok || !upstreamResponse.body) {
        continue;
      }

      const safeContentType = getSafeAudioContentType(upstreamResponse.headers.get("content-type"));

      if (!safeContentType) {
        continue;
      }

      const headers = new Headers();
      headers.set("content-type", safeContentType);
      headers.set("cache-control", "no-store");
      headers.set("access-control-allow-origin", "*");

      for (const header of SAFE_ICY_HEADERS) {
        const value = upstreamResponse.headers.get(header);
        if (value) {
          headers.set(header, value);
        }
      }

      return new Response(upstreamResponse.body, {
        status: 200,
        headers,
      });
    } catch {
      continue;
    }
  }

  return new Response(JSON.stringify({ error: "Unable to connect to radio stream." }), {
    status: 502,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/stream/")) {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
          "access-control-max-age": "86400",
        },
      });
    }

    if (url.pathname === "/api/stream/nazdrave") {
      return proxyStream(NAZDRAVE_STREAM_URLS);
    }

    if (url.pathname === "/api/stream/gold") {
      return proxyStream(GOLD_STREAM_URLS);
    }

    return env.ASSETS.fetch(request);
  },
};
