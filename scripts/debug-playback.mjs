import { chromium } from "playwright";

const pageUrl = process.env.PLAYWRIGHT_BASE_URL || "https://folkradionazdrave.com";
const station = process.env.DEBUG_STATION || "nazdrave";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.addInitScript(() => {
  window.__capturedAudios = [];
  window.__lastAudioError = null;
  const OriginalAudio = window.Audio;
  window.Audio = function (...args) {
    const audio = new OriginalAudio(...args);
    window.__capturedAudios.push(audio);
    audio.addEventListener("error", () => {
      window.__lastAudioError = {
        src: audio.currentSrc || audio.src,
        code: audio.error?.code ?? null,
        message: audio.error?.message ?? null,
      };
    });
    return audio;
  };
  window.Audio.prototype = OriginalAudio.prototype;
});

await page.goto(pageUrl, { waitUntil: "domcontentloaded" });

if (station === "gold") {
  await page.getByRole("radio", { name: /gold radio/i }).click();
}

await page.getByRole("button", { name: /пусни|play/i }).first().click();
await page.waitForTimeout(10000);

const result = await page.evaluate(() => ({
  lastAudioError: window.__lastAudioError ?? null,
  audios: (window.__capturedAudios ?? []).map((audio) => ({
    src: audio.currentSrc || audio.src,
    paused: audio.paused,
    readyState: audio.readyState,
    networkState: audio.networkState,
    error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
  })),
  statusText: document.querySelector(".player-status, #player-status, [class*='status-']")?.textContent?.trim() ?? null,
}));

console.log(JSON.stringify({ pageUrl, station, result }, null, 2));
await browser.close();
