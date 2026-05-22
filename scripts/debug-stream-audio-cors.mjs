import { chromium } from "playwright";

const streamUrl =
  process.env.STREAM_URL ||
  "https://folkradio-stream-proxy.ismail-ismailov.workers.dev/api/stream/nazdrave";
const pageUrl = process.env.PAGE_URL || "https://folkradionazdrave.com/";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(pageUrl, { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async ({ url, withCrossOrigin }) => {
  const audio = new Audio();

  if (withCrossOrigin) {
    audio.crossOrigin = "anonymous";
  }

  audio.preload = "auto";

  const events = [];

  for (const name of ["loadstart", "progress", "loadedmetadata", "canplay", "canplaythrough", "playing", "error", "stalled", "waiting"]) {
    audio.addEventListener(name, () => {
      events.push({
        name,
        readyState: audio.readyState,
        networkState: audio.networkState,
      });
    });
  }

  return await new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      resolve({
        outcome: "timeout",
        withCrossOrigin,
        events,
        src: audio.currentSrc || audio.src,
        readyState: audio.readyState,
        networkState: audio.networkState,
        error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
      });
    }, 15000);

    audio.addEventListener("playing", () => {
      window.clearTimeout(timeoutId);
      resolve({
        outcome: "playing",
        withCrossOrigin,
        events,
        src: audio.currentSrc || audio.src,
        readyState: audio.readyState,
        networkState: audio.networkState,
      });
    });

    audio.addEventListener("error", () => {
      window.clearTimeout(timeoutId);
      resolve({
        outcome: "error",
        withCrossOrigin,
        events,
        src: audio.currentSrc || audio.src,
        readyState: audio.readyState,
        networkState: audio.networkState,
        error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
      });
    });

    audio.src = url;
    void audio.play().catch(() => {});
  });
}, { url: streamUrl, withCrossOrigin: process.env.WITH_CORS !== "0" });

console.log(JSON.stringify({ streamUrl, pageUrl, result }, null, 2));
await browser.close();
