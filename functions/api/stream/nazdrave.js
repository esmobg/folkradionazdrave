const STREAM_URLS = [
  "http://78.83.177.106:8000/",
  "http://78.83.177.106:8000/;",
  "http://92.247.130.252:8066",
  "http://92.247.130.252:8066/",
];

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

function createStreamResponse(upstreamResponse) {
  const safeContentType = getSafeAudioContentType(upstreamResponse.headers.get("content-type"));

  if (!safeContentType) {
    return null;
  }

  const headers = new Headers();
  headers.set("content-type", safeContentType);
  headers.set("cache-control", "no-store");

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
}

export async function onRequestGet() {
  for (const streamUrl of STREAM_URLS) {
    try {
      const upstreamResponse = await openStream(streamUrl);

      if (!upstreamResponse.ok || !upstreamResponse.body) {
        continue;
      }

      const streamResponse = createStreamResponse(upstreamResponse);

      if (!streamResponse) {
        continue;
      }

      return streamResponse;
    } catch {
      continue;
    }
  }

  return Response.json({ error: "Unable to connect to radio stream." }, { status: 502 });
}
