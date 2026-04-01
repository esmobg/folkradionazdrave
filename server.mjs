import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hasProductionFlag = process.argv.includes("--production");

if (hasProductionFlag) {
  process.env.NODE_ENV = "production";
}

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = !isProduction;
const port = Number(process.env.PORT || 4173);

const NAZDRAVE_STREAM_URL = "https://radionazdrave.replit.app/api/stream";
const NAZDRAVE_NOW_PLAYING_URL = "https://radionazdrave.replit.app/api/now-playing";
const GOLD_RADIO_STREAMS = ["http://92.247.130.252:8030", "http://78.83.177.106:8020"];
const curlCommand = process.platform === "win32" ? "curl.exe" : "curl";
const MAX_GOLD_STREAM_CONNECTIONS = getPositiveIntegerEnvValue("MAX_GOLD_STREAM_CONNECTIONS", 25);

let activeGoldStreamConnections = 0;

const app = express();
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: isDevelopment
      ? false
      : {
          directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
          },
        },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: {
      policy: "no-referrer",
    },
  }),
);

app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  next();
});

function setStreamHeaders(proxyResponse, res, contentType) {
  const headersToForward = [
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

  res.setHeader("content-type", contentType);
  res.setHeader("cache-control", "no-store");
}

function getSafeAudioContentType(value) {
  if (!value) {
    return "audio/mpeg";
  }

  const normalizedValue = value.split(";")[0].trim().toLowerCase();

  if (normalizedValue.startsWith("audio/") || normalizedValue === "application/octet-stream") {
    return normalizedValue;
  }

  return null;
}

function getPositiveIntegerEnvValue(name, fallback) {
  const rawValue = process.env[name];
  const parsedValue = Number.parseInt(rawValue ?? "", 10);

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return fallback;
}

async function openStream(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
      headers: {
        "icy-metadata": "1",
      },
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function proxyJson(url, res) {
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      res.status(502).json({ error: "Upstream JSON source failed." });
      return;
    }

    const json = await response.text();
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.send(json);
  } catch {
    res.status(502).json({ error: "Unable to fetch upstream JSON source." });
  }
}

async function proxyStream(urls, res) {
  for (const url of urls) {
    try {
      const response = await openStream(url);

      if (!response.ok || !response.body) {
        continue;
      }

      const contentType = getSafeAudioContentType(response.headers.get("content-type"));

      if (!contentType) {
        await response.body.cancel();
        continue;
      }

      setStreamHeaders(response, res, contentType);
      const stream = Readable.fromWeb(response.body);

      res.on("close", () => {
        stream.destroy();
      });

      stream.on("error", () => {
        if (!res.headersSent) {
          res.status(502).json({ error: "Unable to connect to radio stream." });
        } else {
          res.end();
        }
      });

      stream.pipe(res);
      return;
    } catch {
      continue;
    }
  }

  res.status(502).json({ error: "Unable to connect to radio stream." });
}

function setLegacyStreamHeaders(res) {
  res.setHeader("content-type", "audio/mpeg");
  res.setHeader("cache-control", "no-store");
}

function reserveGoldStreamConnection(res) {
  if (activeGoldStreamConnections >= MAX_GOLD_STREAM_CONNECTIONS) {
    res.status(429).json({ error: "Gold Radio is temporarily at connection capacity." });
    return null;
  }

  activeGoldStreamConnections += 1;

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    activeGoldStreamConnections = Math.max(0, activeGoldStreamConnections - 1);
  };
}

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

      let settled = false;
      let streaming = false;
      const connectTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill();
          resolve(false);
        }
      }, 8000);

      function cleanup() {
        clearTimeout(connectTimer);
        child.stdout.removeAllListeners("data");
        child.stdout.removeAllListeners("error");
        child.stderr.removeAllListeners("data");
        child.removeAllListeners("error");
        child.removeAllListeners("exit");
      }

      function fail() {
        if (!settled) {
          settled = true;
          cleanup();
          child.kill();
          resolve(false);
        }
      }

      child.stdout.once("data", (chunk) => {
        if (settled) {
          return;
        }

        settled = true;
        streaming = true;
        clearTimeout(connectTimer);
        setLegacyStreamHeaders(res);
        res.write(chunk);
        child.stdout.pipe(res);
        resolve(true);
      });

      child.stdout.on("error", fail);
      child.stderr.on("data", () => {
        if (!streaming) {
          fail();
        }
      });
      child.on("error", fail);
      child.on("exit", () => {
        cleanup();

        if (!streaming) {
          if (!settled) {
            settled = true;
            resolve(false);
          }
          return;
        }

        if (!res.writableEnded) {
          res.end();
        }
      });

      res.on("close", () => {
        child.kill();
      });
    });

    if (connected) {
      return;
    }
  }

  res.status(502).json({ error: "Unable to connect to radio stream." });
}

app.get("/api/now-playing/nazdrave", async (_req, res) => {
  await proxyJson(NAZDRAVE_NOW_PLAYING_URL, res);
});

app.get("/api/stream/nazdrave", async (_req, res) => {
  await proxyStream([NAZDRAVE_STREAM_URL], res);
});

app.get("/api/stream/gold", async (_req, res) => {
  const releaseConnection = reserveGoldStreamConnection(res);

  if (!releaseConnection) {
    return;
  }

  try {
    await proxyLegacyIcyStream(GOLD_RADIO_STREAMS, res);
  } finally {
    releaseConnection();
  }
});

if (!isProduction) {
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
    },
    appType: "spa",
  });

  app.use(vite.middlewares);

  app.use(async (req, res, next) => {
    if (req.originalUrl.startsWith("/api/")) {
      next();
      return;
    }

    try {
      const indexPath = path.resolve(__dirname, "index.html");
      const template = await fs.readFile(indexPath, "utf8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
} else {
  const distPath = path.resolve(__dirname, "dist");
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.originalUrl.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((req, res, next) => {
  if (!req.originalUrl.startsWith("/api/")) {
    next();
    return;
  }

  res.status(404).json({ error: "Route not found." });
});

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    next(error);
    return;
  }

  if (req.originalUrl.startsWith("/api/")) {
    res.status(500).json({ error: "Internal server error." });
    return;
  }

  res.status(500).type("text/plain; charset=utf-8").send("Internal server error.");
});

app.listen(port, () => {
  console.log(`Radio app running at http://127.0.0.1:${port}`);
});
