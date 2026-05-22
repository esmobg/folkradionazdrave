import { chromium } from "playwright";

const streamUrl = process.env.STREAM_URL || "https://folkradio-stream-proxy.ismail-ismailov.workers.dev/api/stream/nazdrave";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://folkradionazdrave.com/", { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async (url) => {
  const audio = new Audio();
  audio.preload = "auto";

  return await new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      resolve({
        event: "timeout",
        src: audio.currentSrc || audio.src,
        readyState: audio.readyState,
        networkState: audio.networkState,
        error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
      });
    }, 12000);

    audio.addEventListener("playing", () => {
      window.clearTimeout(timeoutId);
      resolve({ event: "playing", src: audio.currentSrc || audio.src, readyState: audio.readyState });
    });

    audio.addEventListener("error", () => {
      window.clearTimeout(timeoutId);
      resolve({
        event: "error",
        src: audio.currentSrc || audio.src,
        readyState: audio.readyState,
        networkState: audio.networkState,
        error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
      });
    });

    audio.src = url;
    void audio.play();
  });
}, streamUrl);

console.log(JSON.stringify({ streamUrl, result }, null, 2));
await browser.close();
