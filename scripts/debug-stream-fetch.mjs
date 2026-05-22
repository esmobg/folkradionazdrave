import { chromium } from "playwright";

const streamUrl =
  process.env.STREAM_URL ||
  "https://folkradio-stream-proxy.ismail-ismailov.workers.dev/api/stream/nazdrave";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://folkradionazdrave.com/", { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async (url) => {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const reader = response.body?.getReader();

    if (!reader) {
      return { ok: response.ok, status: response.status, error: "missing-body" };
    }

    const first = await reader.read();
    await reader.cancel();

    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      firstChunkSize: first.value?.length ?? 0,
      done: first.done,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}, streamUrl);

console.log(JSON.stringify({ streamUrl, result }, null, 2));
await browser.close();
