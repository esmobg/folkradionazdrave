import { spawn } from "node:child_process";
import { PassThrough, Readable } from "node:stream";

const GOLD_RADIO_STREAMS = [
  "http://92.247.130.252:8030",
  "http://78.83.177.106:8020",
];
const CONNECT_TIMEOUT_SECONDS = "1.25";
const FIRST_CHUNK_TIMEOUT_MS = 1400;
const MAX_HEADER_BYTES = 16384;

function openGoldStream(url, requestSignal) {
  return new Promise((resolve, reject) => {
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
    let headerBuffer = Buffer.alloc(0);

    const firstChunkTimeout = setTimeout(() => {
      if (!started) {
        child.kill("SIGTERM");
      }
    }, FIRST_CHUNK_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(firstChunkTimeout);
      requestSignal?.removeEventListener("abort", handleAbort);
    }

    function handleAbort() {
      passthrough.destroy();
      child.kill("SIGTERM");
      cleanup();
    }

    function fail(error) {
      if (started) {
        return;
      }

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
          fail(new Error("Unable to parse Gold Radio stream headers."));
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
        fail(new Error(chunk.toString("utf8").trim() || "Unable to open Gold Radio stream."));
      }
    });
    child.once("close", (code) => {
      if (!started) {
        fail(new Error(`Gold Radio source closed before streaming (${code ?? "unknown"}).`));
        return;
      }

      passthrough.end();
      cleanup();
    });
    child.stdout.on("data", handleInitialChunk);
  });
}

export default async (request) => {
  let lastError = null;

  for (const url of GOLD_RADIO_STREAMS) {
    try {
      const { body } = await openGoldStream(url, request.signal);

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
      error: lastError?.message || "Unable to connect to Gold Radio stream.",
    },
    {
      status: 502,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
};
