import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright";
import { content } from "../src/content.js";
import { writeFileWithRetry } from "./review-utils.mjs";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const outputDir = path.resolve("reviews", "screenshots");
const reportPath = path.resolve("reviews", "manual-qa-results.json");
const bg = content.bg;
const MAX_PLAYBACK_STARTUP_MS = 6000;

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function takeScreenshotWithRetry(page, screenshotPath, options = {}) {
  const attempts = options.attempts ?? 4;
  const screenshotOptions = { ...options };
  delete screenshotOptions.attempts;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.screenshot({ path: screenshotPath, ...screenshotOptions });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRetriableFsError = /UNKNOWN: unknown error, open|EBUSY|EPERM|EACCES/i.test(message);

      if (!isRetriableFsError || attempt === attempts) {
        throw error;
      }

      await page.waitForTimeout(180 * attempt);
    }
  }
}

async function gotoWithRetry(page, url, options = {}) {
  const attempts = options.attempts ?? 3;
  const waitUntil = options.waitUntil ?? "domcontentloaded";
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 15000;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, {
        waitUntil,
        timeout: navigationTimeoutMs,
      });
      await page.waitForLoadState("networkidle", { timeout: 10000 });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRetriableNavigationError = /ERR_CONNECTION_REFUSED|ERR_FAILED|Navigation failed because browser has disconnected/i.test(
        message,
      );

      if (!isRetriableNavigationError || attempt === attempts) {
        throw error;
      }

      await page.waitForTimeout(600 * attempt);
    }
  }
}

async function waitForPlayerStatus(page, expectedStatus, timeoutMs = 12000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = (await page.locator(".status-line").textContent())?.trim();
    if (status === expectedStatus) {
      return status;
    }

    await page.waitForTimeout(500);
  }

  return (await page.locator(".status-line").textContent())?.trim() ?? "";
}

async function ensurePlayback(page, expectedStatus, timeoutMs = 12000) {
  const startedAt = Date.now();
  let status = await waitForPlayerStatus(page, expectedStatus, timeoutMs);
  let buttonText = (await page.locator(".play-button").textContent())?.trim() ?? "";

  if (status !== expectedStatus && buttonText !== bg.loadingLabel) {
    await page.locator(".play-button").click();
    status = await waitForPlayerStatus(page, expectedStatus, timeoutMs);
  }

  if (status !== expectedStatus && buttonText === bg.loadingLabel) {
    status = await waitForPlayerStatus(page, expectedStatus, timeoutMs);
  }

  buttonText = (await page.locator(".play-button").textContent())?.trim() ?? "";

  return {
    status,
    buttonText,
    startupMs: Date.now() - startedAt,
  };
}

async function observeStablePlayback(page, expectedStatus, durationMs = 8000, intervalMs = 500) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < durationMs) {
    const status = (await page.locator(".status-line").textContent())?.trim() ?? "";

    if (status !== expectedStatus) {
      return {
        stable: false,
        status,
        observedMs: Date.now() - startedAt,
      };
    }

    await page.waitForTimeout(intervalMs);
  }

  return {
    stable: true,
    status: expectedStatus,
    observedMs: durationMs,
  };
}

async function readVolumeState(page) {
  return page.evaluate(() => {
    const input = document.querySelector('input[type="range"]');
    const output = document.querySelector(".slider-wrap strong");

    return {
      value: input?.value ?? "",
      label: output?.textContent?.trim() ?? "",
    };
  });
}

async function readActiveStation(page) {
  return (await page.locator('.station-button[aria-checked="true"] .station-button-content > span').textContent())?.trim() ?? "";
}

async function setVolume(page, value) {
  await page.locator('.slider-wrap input[type="range"]').first().evaluate((input, nextValue) => {
    const prototype = window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(input, String(nextValue));
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  }, value);
}

async function dispatchShortcut(page, code) {
  await page.evaluate((nextCode) => {
    const keyboardConfig = {
      Space: { key: " ", code: "Space" },
      KeyM: { key: "m", code: "KeyM" },
      ArrowDown: { key: "ArrowDown", code: "ArrowDown" },
      ArrowUp: { key: "ArrowUp", code: "ArrowUp" },
    };

    const config = keyboardConfig[nextCode] ?? { key: nextCode, code: nextCode };
    const event = new KeyboardEvent("keydown", {
      key: config.key,
      code: config.code,
      bubbles: true,
      cancelable: true,
    });

    document.body.dispatchEvent(event);
  }, code);
}

async function captureDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
  await gotoWithRetry(page, baseUrl);

  const initialHeading = await page.locator("h1").textContent();
  const initialLang = await page.locator("html").getAttribute("lang");
  const initialShellClass = await page.locator(".page-shell").getAttribute("class");
  const initialStatus = (await page.locator(".status-line").textContent())?.trim() ?? "";
  const socialLinks = await page.locator(".contact-actions a").evaluateAll((links) =>
    links.map((link) => ({
      text: link.textContent?.trim(),
      href: link.getAttribute("href"),
      rel: link.getAttribute("rel"),
    })),
  );

  await takeScreenshotWithRetry(page, path.join(outputDir, "desktop-home.png"), { fullPage: true });

  await page.keyboard.press("Tab");
  const skipLinkFocus = await page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim() ?? "",
    href: document.activeElement?.getAttribute?.("href") ?? "",
  }));
  await page.locator("body").click({ position: { x: 40, y: 40 } });

  const themeTrigger = page.locator(".theme-menu-trigger");
  const themeOptions = page.locator(".theme-menu-options .segment-button");

  await themeTrigger.click();
  await page.waitForTimeout(150);
  await themeOptions.filter({ hasText: bg.darkMode }).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const lightShellClass = await page.locator(".page-shell").getAttribute("class");
  const themeAfterArrow = (await page.locator('.theme-menu-options .segment-button[aria-checked="true"]').textContent())?.trim() ?? "";

  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  const darkShellClass = await page.locator(".page-shell").getAttribute("class");
  const themeAfterReset = (await page.locator('.theme-menu-options .segment-button[aria-checked="true"]').textContent())?.trim() ?? "";

  await themeOptions.filter({ hasText: bg.lightMode }).click();
  await page.waitForTimeout(200);
  const appearanceStorage = await page.evaluate(() => ({
    themeMode: window.localStorage.getItem("radio-theme-mode"),
  }));

  await themeTrigger.click();
  await page.waitForTimeout(150);
  await themeOptions.filter({ hasText: bg.darkMode }).click();
  await page.waitForTimeout(200);

  await page.locator(".language-toggle").click();
  await page.waitForTimeout(250);
  const englishHeading = await page.locator("h1").textContent();
  const englishLang = await page.locator("html").getAttribute("lang");
  await takeScreenshotWithRetry(page, path.join(outputDir, "desktop-english.png"), { fullPage: true });

  await page.locator(".language-toggle").click();
  await page.waitForTimeout(250);

  await page.locator('a[href="#about"]').first().click();
  await page.waitForTimeout(300);
  const aboutVisible = await page.locator("#about").isVisible();

  await page.locator(".station-button.active").focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  const stationAfterArrow = await readActiveStation(page);

  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);
  const stationAfterReset = await readActiveStation(page);

  await page.locator(".play-button").click();
  const { status: playerStatus, buttonText: playerButtonText, startupMs: playerStartupMs } = await ensurePlayback(
    page,
    bg.playing,
  );
  const nazdravePlaybackWindow = await observeStablePlayback(page, bg.playing);

  await page.locator(".icon-button").click();
  const mutePressed = (await page.locator(".icon-button").getAttribute("aria-pressed")) === "true";
  await page.locator(".icon-button").click();
  const muteReset = (await page.locator(".icon-button").getAttribute("aria-pressed")) === "false";

  await setVolume(page, 40);
  await page.waitForTimeout(120);
  const sliderAfterSet = await readVolumeState(page);
  await page.locator("body").click({ position: { x: 20, y: 20 } });

  await dispatchShortcut(page, "Space");
  const pausedStatus = await waitForPlayerStatus(page, bg.paused, 4000);
  await dispatchShortcut(page, "Space");
  const resumedStatus = await waitForPlayerStatus(page, bg.playing, 12000);

  await dispatchShortcut(page, "KeyM");
  const muteShortcutPressed = (await page.locator(".icon-button").getAttribute("aria-pressed")) === "true";
  await dispatchShortcut(page, "KeyM");
  const muteShortcutReset = (await page.locator(".icon-button").getAttribute("aria-pressed")) === "false";

  const volumeBeforeKeys = await readVolumeState(page);
  await page.locator("#player .slider-wrap input[type='range']").focus();
  await dispatchShortcut(page, "ArrowDown");
  const volumeAfterDown = await readVolumeState(page);
  await dispatchShortcut(page, "ArrowUp");
  const volumeAfterUp = await readVolumeState(page);

  const goldStartedAt = Date.now();
  await page.locator(".station-button", { hasText: "Gold Radio" }).first().click();
  const { status: goldStatus, buttonText: goldButtonText, startupMs: goldStartupMs } = await ensurePlayback(
    page,
    bg.playing,
    24000,
  );
  const goldStartupMsFromClick = Date.now() - goldStartedAt;
  const goldTitle = await page.locator("#player-title").textContent();
  const goldSubtitle = await page.locator(".player-subtitle").textContent();
  const goldNoteVisible = await page.locator(".station-note").isVisible();
  const goldPlaybackWindow = await observeStablePlayback(page, bg.playing);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await page.locator(".sticky-player.sticky-visible").waitFor({ state: "attached", timeout: 5000 }).catch(() => null);
  const stickyVisible = (await page.locator(".sticky-player").getAttribute("class"))?.includes("sticky-visible") ?? false;
  await takeScreenshotWithRetry(page, path.join(outputDir, "desktop-focus.png"), { fullPage: false });

  await page.close();

  return {
    initialHeading,
    initialLang,
    initialShellClass,
    initialStatus,
    lightShellClass,
    darkShellClass,
    themeAfterArrow,
    themeAfterReset,
    appearanceStorage,
    englishHeading,
    englishLang,
    socialLinks,
    skipLinkFocus,
    aboutVisible,
    stationAfterArrow,
    stationAfterReset,
    playerStatus,
    playerButtonText,
    playerStartupMs,
    nazdravePlaybackWindow,
    mutePressed,
    muteReset,
    sliderAfterSet,
    pausedStatus,
    resumedStatus,
    muteShortcutPressed,
    muteShortcutReset,
    volumeBeforeKeys,
    volumeAfterDown,
    volumeAfterUp,
    goldTitle,
    goldSubtitle,
    goldNoteVisible,
    goldStatus,
    goldButtonText,
    goldStartupMs: Math.max(goldStartupMs, goldStartupMsFromClick),
    goldPlaybackWindow,
    stickyVisible,
  };
}

async function captureMobile(browser) {
  const page = await browser.newPage({
    ...devices["iPhone 13"],
  });
  await gotoWithRetry(page, baseUrl);
  await takeScreenshotWithRetry(page, path.join(outputDir, "mobile-home.png"), { fullPage: true });

  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  await page.locator('a[href="#follow"]').click();
  await page.waitForTimeout(300);
  const followVisible = await page.locator("#follow").isVisible();

  await page.close();

  return {
    ...metrics,
    followVisible,
  };
}

async function captureTablet(browser) {
  const page = await browser.newPage({
    viewport: { width: 820, height: 1180 },
  });
  await gotoWithRetry(page, baseUrl);
  await takeScreenshotWithRetry(page, path.join(outputDir, "tablet-home.png"), { fullPage: true });

  const headingVisible = await page.locator("h1").isVisible();
  const playerVisible = await page.locator("#player").isVisible();

  await page.close();

  return {
    headingVisible,
    playerVisible,
  };
}

async function main() {
  await ensureDir(outputDir);
  const browser = await chromium.launch({ headless: true });

  try {
    const desktop = await captureDesktop(browser);
    const mobile = await captureMobile(browser);
    const tablet = await captureTablet(browser);

    const report = {
      baseUrl,
      checkedAt: new Date().toISOString(),
      desktop,
      mobile,
      tablet,
    };

    const failures = [];

    if (!desktop.initialShellClass?.includes("mode-dark")) {
      failures.push("Default theme mode is not dark.");
    }

    if (desktop.initialStatus !== bg.paused) {
      failures.push("Initial player status is not paused before playback starts.");
    }

    if (!desktop.lightShellClass?.includes("mode-light")) {
      failures.push("Theme keyboard navigation did not switch to light mode.");
    }

    if (!desktop.darkShellClass?.includes("mode-dark")) {
      failures.push("Theme keyboard navigation did not return to dark mode.");
    }

    if (desktop.themeAfterArrow !== bg.lightMode || desktop.themeAfterReset !== bg.darkMode) {
      failures.push("Theme radiogroup did not maintain the expected active option labels.");
    }

    if (desktop.appearanceStorage.themeMode !== "light") {
      failures.push("Theme preference did not persist to localStorage during the check.");
    }

    if (desktop.initialLang !== "bg" || desktop.englishLang !== "en") {
      failures.push("Language switching did not update the document language.");
    }

    if (desktop.skipLinkFocus.href !== "#main-content") {
      failures.push("Skip link was not the first keyboard focus target.");
    }

    if (!desktop.aboutVisible) {
      failures.push("Anchor navigation to the about section did not work.");
    }

    if (desktop.stationAfterArrow !== "Gold Radio" || desktop.stationAfterReset !== "Фолк Радио Наздраве") {
      failures.push("Station radiogroup keyboard navigation did not move between stations correctly.");
    }

    if (desktop.playerStatus !== bg.playing) {
      failures.push("Nazdrave player did not reach the playing state.");
    }

    if ((desktop.playerStartupMs ?? Number.POSITIVE_INFINITY) > MAX_PLAYBACK_STARTUP_MS) {
      failures.push(`Nazdrave player startup exceeded ${MAX_PLAYBACK_STARTUP_MS}ms.`);
    }

    if (!desktop.nazdravePlaybackWindow?.stable) {
      failures.push("Nazdrave playback did not stay stable for the expected observation window.");
    }

    if (!desktop.mutePressed || !desktop.muteReset) {
      failures.push("Mute button toggle did not update its pressed state correctly.");
    }

    if (desktop.sliderAfterSet.value !== "40" || desktop.sliderAfterSet.label !== "40%") {
      failures.push("Volume slider did not update to the selected value.");
    }

    if (desktop.pausedStatus !== bg.paused || desktop.resumedStatus !== bg.playing) {
      failures.push("Space shortcut did not pause and resume playback correctly.");
    }

    if (!desktop.muteShortcutPressed || !desktop.muteShortcutReset) {
      failures.push("M shortcut did not toggle mute correctly.");
    }

    if (desktop.volumeAfterDown.value === desktop.volumeBeforeKeys.value) {
      failures.push("Arrow Down shortcut did not change the volume.");
    }

    if (desktop.volumeAfterUp.value !== desktop.volumeBeforeKeys.value) {
      failures.push("Arrow Up shortcut did not restore the previous volume.");
    }

    if (!desktop.goldNoteVisible || desktop.goldStatus !== bg.playing) {
      failures.push("Gold Radio did not expose its backup note and playing state.");
    }

    if ((desktop.goldStartupMs ?? Number.POSITIVE_INFINITY) > MAX_PLAYBACK_STARTUP_MS) {
      failures.push(`Gold Radio startup exceeded ${MAX_PLAYBACK_STARTUP_MS}ms.`);
    }

    if (!desktop.goldPlaybackWindow?.stable) {
      failures.push("Gold Radio playback did not stay stable for the expected observation window.");
    }

    if (!desktop.stickyVisible) {
      failures.push("Sticky player did not appear after playback while scrolled.");
    }

    if (desktop.socialLinks.some((link) => link.rel !== "noreferrer noopener")) {
      failures.push("One or more external social links are missing the expected rel attributes.");
    }

    if (mobile.hasHorizontalOverflow) {
      failures.push("Mobile layout has horizontal overflow.");
    }

    if (!mobile.followVisible || !tablet.headingVisible || !tablet.playerVisible) {
      failures.push("One or more responsive layouts did not render the expected content.");
    }

    report.failures = failures;
    report.passed = failures.length === 0;

    await writeFileWithRetry(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
