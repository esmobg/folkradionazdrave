import {
  GOLD_STREAM_URLS,
  NAZDRAVE_STREAM_URLS,
  proxyStream,
} from "./lib/stream-proxy.mjs";

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
          "access-control-max-age": "86400",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/stream/nazdrave") {
      return proxyStream(NAZDRAVE_STREAM_URLS, request.signal);
    }

    if (url.pathname === "/api/stream/gold") {
      return proxyStream(GOLD_STREAM_URLS, request.signal);
    }

    return Response.json({ error: "Not found." }, { status: 404 });
  },
};
