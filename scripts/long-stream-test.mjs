import { chromium } from "playwright";

const BASE_URL = process.env.STREAM_TEST_URL || "https://folkradionazdrave.com/";
const TEST_MINUTES = Number.parseInt(process.env.STREAM_TEST_MINUTES || "10", 10);
const SAMPLE_INTERVAL_MS = 2000;
const STARTUP_GRACE_MS = 30000;

const labels = {
  bg: {
    play: "Пусни",
    pause: "Пауза",
    playing: "Плеърът свири.",
    loading: "Плеърът зарежда.",
  },
  en: {
    play: "Play",
    pause: "Pause",
    playing: "Player is playing.",
    loading: "Player is loading.",
  },
};

function resolveLocale(snapshot) {
  if (snapshot.play.includes("Пусни") || snapshot.playing.includes("Плеърът")) {
    return labels.bg;
  }

  return labels.en;
}

async function getUiSnapshot(page) {
  return page.evaluate(() => {
    const playButton = document.querySelector(".play-button");
    const statusLine = document.querySelector(".status-line");
    const activeStation = document.querySelector('.station-button[aria-checked="true"] .station-button-content > span');

    return {
      play: playButton?.textContent?.trim() || "",
      status: statusLine?.textContent?.trim() || "",
      station: activeStation?.textContent?.trim() || "",
    };
  });
}

async function ensureStation(page, stationNameFragment) {
  const stationButtons = page.locator(".station-button");
  const count = await stationButtons.count();

  for (let index = 0; index < count; index += 1) {
    const button = stationButtons.nth(index);
    const text = (await button.textContent())?.trim() || "";

    if (text.toLowerCase().includes(stationNameFragment.toLowerCase())) {
      await button.click();
      await page.waitForTimeout(500);
      return;
    }
  }

  throw new Error(`Station with fragment "${stationNameFragment}" not found.`);
}

async function ensurePlaying(page, locale) {
  const playButton = page.locator(".play-button");
  const buttonText = (await playButton.textContent())?.trim() || "";

  if (buttonText === locale.play) {
    await playButton.click();
  }

  await page.waitForFunction(
    (playingLabel) => {
      const statusLine = document.querySelector(".status-line");
      return statusLine?.textContent?.trim() === playingLabel;
    },
    locale.playing,
    { timeout: 45000 },
  );
}

async function runTenMinuteStationTest(page, stationNameFragment, locale) {
  await ensureStation(page, stationNameFragment);
  await ensurePlaying(page, locale);

  const startedAt = Date.now();
  const endAt = startedAt + TEST_MINUTES * 60 * 1000;
  let interruptionCount = 0;
  let loadingSamples = 0;
  let pausedSamples = 0;
  let errorSamples = 0;
  let lastStatus = locale.playing;

  while (Date.now() < endAt) {
    await page.waitForTimeout(SAMPLE_INTERVAL_MS);
    const snapshot = await getUiSnapshot(page);
    const elapsed = Date.now() - startedAt;
    const inStartupGrace = elapsed < STARTUP_GRACE_MS;

    if (snapshot.status === locale.loading) {
      loadingSamples += 1;
      if (!inStartupGrace && lastStatus === locale.playing) {
        interruptionCount += 1;
      }
    } else if (snapshot.status === locale.playing) {
      lastStatus = locale.playing;
    } else if (snapshot.status.includes("пауза") || snapshot.status.toLowerCase().includes("paused")) {
      pausedSamples += 1;
      if (!inStartupGrace && lastStatus === locale.playing) {
        interruptionCount += 1;
      }
    } else {
      errorSamples += 1;
      if (!inStartupGrace && lastStatus === locale.playing) {
        interruptionCount += 1;
      }
    }

    if (snapshot.status !== locale.playing) {
      lastStatus = snapshot.status;
    }
  }

  const finalSnapshot = await getUiSnapshot(page);

  return {
    station: finalSnapshot.station,
    testedForMinutes: TEST_MINUTES,
    interruptionCount,
    loadingSamples,
    pausedSamples,
    errorSamples,
    finalStatus: finalSnapshot.status,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    const snapshot = await getUiSnapshot(page);
    const locale = resolveLocale(snapshot);

    const nazdrave = await runTenMinuteStationTest(page, "наздраве", locale);
    const gold = await runTenMinuteStationTest(page, "gold", locale);

    const result = {
      checkedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      startupGraceMs: STARTUP_GRACE_MS,
      nazdrave,
      gold,
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
