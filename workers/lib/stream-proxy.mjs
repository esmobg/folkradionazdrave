import { connect } from "cloudflare:sockets";

const MAX_HEADER_BYTES = 16384;
const CONNECT_TIMEOUT_MS = 8000;

function decodeLatin1(bytes) {
  let text = "";

  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }

  return text;
}

function concatBytes(left, right) {
  if (left.length === 0) {
    return right;
  }

  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

function parseStreamUrl(streamUrl) {
  const parsed = new URL(streamUrl);

  return {
    hostname: parsed.hostname,
    port: Number(parsed.port),
    path: `${parsed.pathname}${parsed.search}` || "/",
  };
}

function buildResponseHeaders() {
  const headers = new Headers();
  headers.set("content-type", "audio/mpeg");
  headers.set("cache-control", "no-store");
  headers.set("access-control-allow-origin", "*");
  return headers;
}

function createStreamResponse(bodyStream) {
  return new Response(bodyStream, {
    status: 200,
    headers: buildResponseHeaders(),
  });
}

async function readWithTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Stream connect timeout.")), timeoutMs);
    }),
  ]);
}

async function openIcyStream(streamUrl, requestSignal) {
  const { hostname, port, path } = parseStreamUrl(streamUrl);
  const socket = connect({ hostname, port });
  await socket.opened;
  const writer = socket.writable.getWriter();

  await writer.write(
    new TextEncoder().encode(
      `GET ${path} HTTP/1.1\r\n` +
        `Host: ${hostname}:${port}\r\n` +
        `User-Agent: FolkRadioStreamProxy/1.0\r\n` +
        `Accept: */*\r\n` +
        `Connection: close\r\n\r\n`,
    ),
  );
  writer.releaseLock();

  const reader = socket.readable.getReader();
  let headerBuffer = new Uint8Array(0);

  const abortHandler = () => {
    void reader.cancel();
  };

  requestSignal?.addEventListener("abort", abortHandler, { once: true });

  try {
    while (true) {
      const { value, done } = await readWithTimeout(reader.read(), CONNECT_TIMEOUT_MS);

      if (done || !value) {
        throw new Error("Stream closed before audio data.");
      }

      headerBuffer = concatBytes(headerBuffer, value);
      const prefix = decodeLatin1(headerBuffer.slice(0, Math.min(5, headerBuffer.length)));
      const looksLikeHeader = prefix.startsWith("ICY ") || prefix.startsWith("HTTP/");

      if (!looksLikeHeader) {
        return createStreamResponse(
          createRelayStream(reader, headerBuffer, requestSignal, abortHandler),
        );
      }

      const headerText = decodeLatin1(headerBuffer);
      let headerEnd = headerText.indexOf("\r\n\r\n");
      let separatorLength = 4;

      if (headerEnd === -1) {
        headerEnd = headerText.indexOf("\n\n");
        separatorLength = 2;
      }

      if (headerEnd === -1) {
        if (headerBuffer.length >= MAX_HEADER_BYTES) {
          throw new Error("Unable to parse stream headers.");
        }

        continue;
      }

      const bodyPrefix = headerBuffer.slice(headerEnd + separatorLength);

      return createStreamResponse(
        createRelayStream(reader, bodyPrefix, requestSignal, abortHandler),
      );
    }
  } catch (error) {
    requestSignal?.removeEventListener("abort", abortHandler);
    void reader.cancel();
    throw error;
  }
}

function createRelayStream(reader, initialChunk, requestSignal, abortHandler) {
  return new ReadableStream({
    start(controller) {
      if (initialChunk.length > 0) {
        controller.enqueue(initialChunk);
      }

      void (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();

            if (done) {
              controller.close();
              break;
            }

            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        } finally {
          requestSignal?.removeEventListener("abort", abortHandler);
        }
      })();
    },
    cancel() {
      requestSignal?.removeEventListener("abort", abortHandler);
      void reader.cancel();
    },
  });
}

export async function proxyStream(streamUrls, requestSignal) {
  for (const streamUrl of streamUrls) {
    try {
      return await openIcyStream(streamUrl, requestSignal);
    } catch {
      continue;
    }
  }

  return Response.json(
    { error: "Unable to connect to radio stream." },
    {
      status: 502,
      headers: {
        "access-control-allow-origin": "*",
      },
    },
  );
}

export const NAZDRAVE_STREAM_URLS = [
  "http://78.83.177.106:8000/",
  "http://78.83.177.106:8000/;",
  "http://92.247.130.252:8066",
  "http://92.247.130.252:8066/",
];

export const GOLD_STREAM_URLS = ["http://78.83.177.106:8020", "http://92.247.130.252:8030"];
