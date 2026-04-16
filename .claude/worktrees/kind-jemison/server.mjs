import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.argv.includes("--production");
const isDevelopment = !isProduction;
const port = Number(process.env.PORT || 4173);

const NAZDRAVE_STREAM_URL = "https://radionazdrave.replit.app/api/stream";
const NAZDRAVE_NOW_PLAYING_URL = "https://radionazdrave.replit.app/api/now-playing";
const GOLD_RADIO_STREAMS = ["http://92.247.130.252:8030", "http://78.83.177.106:8020"];
const curlCommand = process.platform === "win32" ? "curl.exe" : "curl";

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

  if (!res.getHeader("content-type")) {
    res.setHeader("content-type", "audio/mpeg");
  }

  res.setHeader("cache-control", "no-store");
}

async function openStream(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
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

      setStreamHeaders(response, res);
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
  await proxyLegacyIcyStream(GOLD_RADIO_STREAMS, res);
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

app.listen(port, () => {
  console.log(`Radio app running at http://127.0.0.1:${port}`);
});
