import { spawn } from "node:child_process";
import { PassThrough, Readable } from "node:stream";

const NAZDRAVE_RADIO_STREAMS = [
  "http://78.83.177.106:8000/",
  "http://78.83.177.106:8000/;",
  "http://92.247.130.252:8066",
  "http://92.247.130.252:8066/",
];
const NAZDRAVE_STREAM_SOURCE_MAP = Object.freeze({
  "8000": NAZDRAVE_RADIO_STREAMS[0],
  "8000-slash": NAZDRAVE_RADIO_STREAMS[1],
  "8066": NAZDRAVE_RADIO_STREAMS[2],
  "8066-slash": NAZDRAVE_RADIO_STREAMS[3],
});
const CONNECT_TIMEOUT_SECONDS = "1.25";
const FIRST_CHUNK_TIMEOUT_MS = 1400;
const MAX_HEADER_BYTES = 16384;
const MIN_STABLE_STREAM_MS = 15000;
const nazdraveStreamHealth = new Map();

function getDefaultStreamHealth() {
  return {
    successCount: 0,
    failureCount: 0,
    shortDropCount: 0,
    lastConnectedAt: 0,
    lastFailedAt: 0,
    lastFirstByteMs: Number.POSITIVE_INFINITY,
  };
}

function getStreamHealth(url) {
  return nazdraveStreamHealth.get(url) ?? getDefaultStreamHealth();
}

function recordStreamSuccess(url, firstByteMs) {
  const current = getStreamHealth(url);
  nazdraveStreamHealth.set(url, {
    ...current,
    successCount: current.successCount + 1,
    lastConnectedAt: Date.now(),
    lastFirstByteMs: Number.isFinite(firstByteMs) ? firstByteMs : current.lastFirstByteMs,
  });
}

function recordStreamFailure(url, options = {}) {
  const current = getStreamHealth(url);
  nazdraveStreamHealth.set(url, {
    ...current,
    failureCount: current.failureCount + 1,
    shortDropCount: current.shortDropCount + (options.shortDrop ? 1 : 0),
    lastFailedAt: Date.now(),
  });
}

function rankStreamUrls(urls) {
  const positions = new Map(urls.map((url, index) => [url, index]));

  return [...urls].sort((leftUrl, rightUrl) => {
    const left = getStreamHealth(leftUrl);
    const right = getStreamHealth(rightUrl);

    if (left.shortDropCount !== right.shortDropCount) {
      return left.shortDropCount - right.shortDropCount;
    }

    if (left.failureCount !== right.failureCount) {
      return left.failureCount - right.failureCount;
    }

    const leftKnown = left.successCount > 0 ? 0 : 1;
    const rightKnown = right.successCount > 0 ? 0 : 1;

    if (leftKnown !== rightKnown) {
      return leftKnown - rightKnown;
    }

    if (left.lastFirstByteMs !== right.lastFirstByteMs) {
      return left.lastFirstByteMs - right.lastFirstByteMs;
    }

    if (left.lastConnectedAt !== right.lastConnectedAt) {
      return right.lastConnectedAt - left.lastConnectedAt;
    }

    return positions.get(leftUrl) - positions.get(rightUrl);
  });
}

function openNazdraveStream(url, requestSignal) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn("curl", [
      "--http0.9",
      "--silent",
      "--show-error",
      "--no-buffer",
      "--connect-timeout",
      CONNECT_TIMEOUT_SECONDS,
      url,
    ]);
    const passthrough = new PassThrough();
    let started = false;
    let requestAborted = false;
    let failureRecorded = false;
    let headerBuffer = Buffer.alloc(0);
    let firstByteMs = Number.POSITIVE_INFINITY;

    function recordFailureOnce(options = {}) {
      if (failureRecorded) {
        return;
      }

      failureRecorded = true;
      recordStreamFailure(url, options);
    }

    const firstChunkTimeout = setTimeout(() => {
      if (!started) {
        recordFailureOnce();
        child.kill("SIGTERM");
      }
    }, FIRST_CHUNK_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(firstChunkTimeout);
      requestSignal?.removeEventListener("abort", handleAbort);
    }

    function handleAbort() {
      requestAborted = true;
      passthrough.destroy();
      child.kill("SIGTERM");
      cleanup();
    }

    function fail(error) {
      if (started) {
        return;
      }

      recordFailureOnce();
      cleanup();
      passthrough.destroy();
      child.kill("SIGTERM");
      reject(error);
    }

    function beginStreaming(bodyChunk) {
      if (started) {
        return;
      }

      started = true;
      firstByteMs = Date.now() - startedAt;
      recordStreamSuccess(url, firstByteMs);
      child.stdout.off("data", handleInitialChunk);

      if (bodyChunk.length > 0) {
        passthrough.write(bodyChunk);
      }

      child.stdout.pipe(passthrough);
      passthrough.once("close", () => {
        child.kill("SIGTERM");
        cleanup();
      });

      resolve({
        body: Readable.toWeb(passthrough),
      });
    }

    function handleInitialChunk(chunk) {
      if (started) {
        return;
      }

      headerBuffer = Buffer.concat([headerBuffer, chunk]);
      const prefix = headerBuffer.subarray(0, 5).toString("latin1");
      const looksLikeHeader = prefix.startsWith("ICY ") || prefix.startsWith("HTTP/");

      if (!looksLikeHeader) {
        beginStreaming(headerBuffer);
        headerBuffer = Buffer.alloc(0);
        return;
      }

      const text = headerBuffer.toString("latin1");
      let headerEnd = text.indexOf("\r\n\r\n");
      let separatorLength = 4;

      if (headerEnd === -1) {
        headerEnd = text.indexOf("\n\n");
        separatorLength = 2;
      }

      if (headerEnd === -1) {
        if (headerBuffer.length >= MAX_HEADER_BYTES) {
          fail(new Error("Unable to parse Nazdrave stream headers."));
        }
        return;
      }

      beginStreaming(headerBuffer.subarray(headerEnd + separatorLength));
      headerBuffer = Buffer.alloc(0);
    }

    requestSignal?.addEventListener("abort", handleAbort, { once: true });

    child.once("error", fail);
    child.stderr.once("data", (chunk) => {
      if (!started) {
        fail(new Error(chunk.toString("utf8").trim() || "Unable to open Nazdrave stream."));
      }
    });
    child.once("close", (code) => {
      if (!started) {
        fail(new Error(`Nazdrave source closed before streaming (${code ?? "unknown"}).`));
        return;
      }

      if (!requestAborted && Date.now() - startedAt < MIN_STABLE_STREAM_MS) {
        recordStreamFailure(url, { shortDrop: true });
      }

      passthrough.end();
      cleanup();
    });
    child.stdout.on("data", handleInitialChunk);
  });
}

export default async (request) => {
  let lastError = null;
  const requestedSource = new URL(request.url).searchParams.get("source");
  const selectedUrls = requestedSource && NAZDRAVE_STREAM_SOURCE_MAP[requestedSource]
    ? [NAZDRAVE_STREAM_SOURCE_MAP[requestedSource]]
    : rankStreamUrls(NAZDRAVE_RADIO_STREAMS);

  for (const url of selectedUrls) {
    try {
      const { body } = await openNazdraveStream(url, request.signal);

      return new Response(body, {
        headers: {
          "cache-control": "no-store",
          "content-type": "audio/mpeg",
        },
      });
    } catch (error) {
      lastError = error;
    }
  }

  return Response.json(
    {
      error: lastError?.message || "Unable to connect to Nazdrave stream.",
    },
    {
      status: 502,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
};
