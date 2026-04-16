import fs from "node:fs/promises";
import path from "node:path";
import { content } from "../src/content.js";
import { nodeCommand, projectRoot, runCommand, writeFileWithRetry } from "./review-utils.mjs";

const reviewsDir = path.resolve(projectRoot, "reviews");
const reportPath = path.resolve(reviewsDir, "accessibility-gate-results.json");
const bg = content.bg;

await runCommand(nodeCommand, [path.resolve(projectRoot, "scripts", "run-manual-qa.mjs")], {
  cwd: projectRoot,
});

const manualQaRaw = await fs.readFile(path.resolve(reviewsDir, "manual-qa-results.json"), "utf8");
const manualQa = JSON.parse(manualQaRaw);

const checks = {
  skipLinkFirstFocus: manualQa.desktop?.skipLinkFocus?.href === "#main-content",
  htmlLangSwitches: manualQa.desktop?.initialLang === "bg" && manualQa.desktop?.englishLang === "en",
  themeRadioKeyboard: manualQa.desktop?.themeAfterArrow === bg.lightMode && manualQa.desktop?.themeAfterReset === bg.darkMode,
  stationRadioKeyboard:
    manualQa.desktop?.stationAfterArrow === "Gold Radio" && manualQa.desktop?.stationAfterReset === "Фолк Радио Наздраве",
  noMobileOverflow: manualQa.mobile?.hasHorizontalOverflow === false,
  keyboardPlaybackToggle: manualQa.desktop?.pausedStatus === bg.paused && manualQa.desktop?.resumedStatus === bg.playing,
  keyboardMuteToggle: Boolean(manualQa.desktop?.muteShortcutPressed) && Boolean(manualQa.desktop?.muteShortcutReset),
  keyboardVolumeChange:
    manualQa.desktop?.volumeAfterDown?.value !== manualQa.desktop?.volumeBeforeKeys?.value
    && manualQa.desktop?.volumeAfterUp?.value === manualQa.desktop?.volumeBeforeKeys?.value,
  stickyPlayerAppears: manualQa.desktop?.stickyVisible === true,
};

const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

const result = {
  checkedAt: new Date().toISOString(),
  baseUrl: manualQa.baseUrl,
  passed: failedChecks.length === 0,
  checks,
  failedChecks,
};

await writeFileWithRetry(reportPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

if (!result.passed) {
  process.exitCode = 1;
}
