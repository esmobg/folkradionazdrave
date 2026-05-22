import { chromium } from "playwright";

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://folkradionazdrave.com/", { waitUntil: "domcontentloaded" });

for (const streamUrl of [
  "https://folkradio-stream-proxy.ismail-ismailov.workers.dev/api/stream/nazdrave",
  "https://folkradionazdrave.com/api/stream/nazdrave",
]) {
  const result = await page.evaluate(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    const reader = response.body.getReader();
    const first = await reader.read();
    await reader.cancel();
    return {
      contentType: response.headers.get("content-type"),
      bytes: first.value ? Array.from(first.value.slice(0, 32)) : [],
    };
  }, streamUrl);

  console.log(streamUrl);
  console.log(result.contentType);
  console.log(toHex(result.bytes));
  console.log("");
}

await browser.close();
