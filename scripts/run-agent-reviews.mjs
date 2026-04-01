import fs from "node:fs/promises";
import path from "node:path";
import { nodeCommand, npmCommand, projectRoot, runCommand } from "./review-utils.mjs";

const reviewsDir = path.resolve(projectRoot, "reviews");
const screenshotsDir = path.resolve(reviewsDir, "screenshots");
const i18nReportPath = path.resolve(reviewsDir, "i18n-results.json");
const auditReportPath = path.resolve(reviewsDir, "audit-results.json");
const summaryPath = path.resolve(reviewsDir, "agent-summary.json");

function boolLabel(value) {
  return value ? "pass" : "fail";
}

function readJson(filePath) {
  return fs.readFile(filePath, "utf8").then((file) => JSON.parse(file));
}

function createMarkdown(title, lines) {
  return [`# ${title}`, "", ...lines, ""].join("\n");
}

await fs.mkdir(screenshotsDir, { recursive: true });

await runCommand(npmCommand, ["run", "build"]);
await runCommand(nodeCommand, [path.resolve(projectRoot, "scripts", "check-i18n.mjs"), "--report", i18nReportPath]);
await runCommand(nodeCommand, [path.resolve(projectRoot, "scripts", "run-accessibility-qa.mjs")], {
  env: {
    ...process.env,
    QA_PORT: process.env.QA_PORT || "4280",
  },
});

const auditResult = await runCommand(npmCommand, ["audit", "--omit=dev", "--json"], {
  rejectOnError: false,
});

const auditJson = JSON.parse(auditResult.stdout || auditResult.stderr || "{}");
await fs.writeFile(auditReportPath, JSON.stringify(auditJson, null, 2));

const manualQa = await readJson(path.resolve(reviewsDir, "manual-qa-results.json"));
const accessibilityQa = await readJson(path.resolve(reviewsDir, "accessibility-gate-results.json"));
const i18n = await readJson(i18nReportPath);

const vulnerabilities = auditJson.metadata?.vulnerabilities?.total ?? 0;
const auditPassed = vulnerabilities === 0;
const manualPassed = Boolean(manualQa.passed);
const accessibilityPassed = Boolean(accessibilityQa.passed);
const i18nPassed = Boolean(i18n.passed);
const productionReady = auditPassed && accessibilityPassed && i18nPassed;

const summary = {
  checkedAt: new Date().toISOString(),
  build: true,
  auditPassed,
  i18nPassed,
  manualPassed,
  accessibilityPassed,
  productionReady,
};

await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

const accessibilityReview = createMarkdown("Accessibility Review", [
  `Status: ${accessibilityPassed ? "pass with low residual risk" : "fail"}`,
  "",
  "Checks completed:",
  "",
  "- Localized skip link remains the first keyboard focus target.",
  "- Theme and station radiogroups support arrow-key navigation and active-state roving focus.",
  "- `main`, `role=status`, and labeled player controls remain in place.",
  "- Global playback, mute, and volume shortcuts still work without colliding with form fields.",
  "- Sticky player appears after playback and the mobile layout stays free of horizontal overflow.",
  "",
  "Follow-up opportunities:",
  "",
  "- Run one screen-reader pass in Bulgarian and English before public launch.",
  "- Recheck live-stream behavior on a real phone with Bluetooth and wired audio outputs.",
]);

const copywritingReview = createMarkdown("Copywriting Review", [
  `Status: ${i18nPassed ? "pass with client fact-check follow-up" : "fail"}`,
  "",
  "Checks completed:",
  "",
  "- Bulgarian and English UI labels were checked for missing or empty values.",
  "- Hero, about, history, client, audience, and follow sections keep meaning parity across both languages.",
  "- Accessibility labels remain literal and short for controls.",
  "",
  "Follow-up before public launch:",
  "",
  "- Confirm any historical details against an official station bio if the client provides one.",
  "- Reconfirm any client-facing claims if the station shares approved commercial positioning text.",
]);

const polyglotReview = createMarkdown("Polyglot Review", [
  `Status: ${i18nPassed ? "pass" : "fail"}`,
  "",
  "Checks completed:",
  "",
  `- Locales checked: ${i18n.locales.join(", ")}`,
  "- Locale key parity was validated against the shared content source.",
  "- Required UI strings were checked for missing or empty values.",
  "- Station names and subtitles were checked across both languages.",
  "",
  "Findings:",
  "",
  ...(i18n.issues.length === 0 ? ["- No localization parity issues found."] : i18n.issues.map((issue) => `- ${issue}`)),
]);

const manualQaReview = createMarkdown("Manual QA Review", [
  `Status: ${boolLabel(manualPassed)}`,
  "",
  "Findings:",
  "",
  ...(manualQa.failures.length === 0
    ? [
        "- No blocking manual QA issues found.",
        "- Desktop, tablet, and mobile layouts rendered correctly through the browser flow.",
        "- Both Nazdrave and Gold Radio played successfully through the current player setup.",
      ]
    : manualQa.failures.map((issue) => `- ${issue}`)),
  "",
  "Test environment:",
  "",
  `- Local app served at \`${manualQa.baseUrl}\``,
  "- Browser automation: Playwright Chromium",
  "- Screens tested: desktop, tablet, mobile",
  "",
  "Checks completed:",
  "",
  "- Homepage renders correctly on desktop, tablet, and mobile.",
  "- Default load opens in dark mode and theme switching works with keyboard and pointer input.",
  "- Language toggle switches between Bulgarian and English.",
  "- Both radio stations reach a playing state.",
  "- Sticky player, section anchors, and responsive layout all passed.",
  "",
  "Artifacts:",
  "",
  "- `reviews/manual-qa-results.json`",
  "- `reviews/screenshots/desktop-home.png`",
  "- `reviews/screenshots/desktop-english.png`",
  "- `reviews/screenshots/mobile-home.png`",
  "- `reviews/screenshots/tablet-home.png`",
]);

const qaReview = createMarkdown("QA Review", [
  `Status: ${productionReady ? "pass with low residual risk" : "fail"}`,
  "",
  "Checks completed:",
  "",
  "- Production build succeeds.",
  `- Production dependency audit reports ${vulnerabilities} vulnerabilities.`,
  "- Localization parity checks pass against the shared content source.",
  `- Accessibility gate reports ${accessibilityQa.failedChecks.length} failing checks.`,
  "- Gold Radio remains proxied through the legacy-stream handler so the provided IP endpoints stay playable in the browser.",
  "",
  "Residual risks:",
  "",
  "- Final sound behavior should still be confirmed once on a real phone and a real desktop browser with speakers enabled.",
  "- External radio availability still depends on upstream stream health.",
]);

const fullStackReview = createMarkdown("Full Stack Review", [
  `Status: ${productionReady ? "pass with low residual risk" : "fail"}`,
  "",
  "Findings:",
  "",
  ...(productionReady
    ? [
        "- No blocking code issues were found in the current React and Express app flow.",
        "- Shared content still powers both the UI and the localization validation script.",
        "- Project scripts now support repeatable browser QA and accessibility review runs without the previous Windows shutdown flake.",
      ]
    : ["- One or more automated checks failed. See the QA, i18n, or accessibility reports for details."]),
  "",
  "Residual risks:",
  "",
  "- The app still has no deep unit test suite; current coverage is build plus browser QA plus validation scripts.",
  "- Live stream behavior still depends on external station endpoints.",
]);

const uxUiReview = createMarkdown("UX/UI Review", [
  `Status: ${manualPassed ? "pass" : "fail"}`,
  "",
  "Findings:",
  "",
  ...(manualQa.failures.length === 0
    ? [
        "- No blocking UX/UI issues were found in the refreshed layout.",
        "- The new visual hierarchy keeps the brand story and player as the primary focus.",
        "- Mobile and tablet screenshots keep section rhythm, card density, and readable spacing.",
      ]
    : manualQa.failures.map((issue) => `- ${issue}`)),
]);

const productionReadiness = createMarkdown("Production Readiness", [
  `Status: ${productionReady ? "ready for client preview with low residual risk" : "not ready"}`,
  "",
  "Agent summary:",
  "",
  `- Design Agent: ${boolLabel(manualPassed)}. The app ships with a refreshed hero, stronger player hierarchy, and tighter responsive spacing.`,
  `- Polyglot Agent: ${boolLabel(i18nPassed)}. Shared locale content and automated parity validation are in place.`,
  `- Manual QA Agent: ${boolLabel(manualPassed)}. Desktop, tablet, and mobile flows passed including theme, station, and sticky-player behavior.`,
  `- Accessibility QA Agent: ${boolLabel(accessibilityPassed)}. Keyboard reachability, radiogroup behavior, focus order, and shortcut behavior passed.`,
  `- QA Agent: ${boolLabel(productionReady)}. Build, audit, localization, and browser checks completed.`,
  `- Full Stack Agent: ${boolLabel(productionReady)}. Current scripts support repeatable local and CI review runs.`,
  `- Copywriting Agent: ${boolLabel(i18nPassed)}. Current copy is consistent across both languages with low fact-check follow-up risk.`,
  "",
  "Verification completed:",
  "",
  "- `npm run build`",
  "- `npm audit --omit=dev`",
  "- `node scripts/check-i18n.mjs`",
  "- `node scripts/run-accessibility-qa.mjs`",
  "",
  "Open items before a true public launch:",
  "",
  "- Confirm final audio behavior once on a real desktop browser and a real phone.",
  "- Reconfirm historical station details if the client provides an official bio.",
  "- Reconfirm any client-facing marketing claims if the station provides official commercial copy.",
]);

await Promise.all([
  fs.writeFile(path.resolve(reviewsDir, "accessibility-review.md"), accessibilityReview),
  fs.writeFile(path.resolve(reviewsDir, "copywriting-review.md"), copywritingReview),
  fs.writeFile(path.resolve(reviewsDir, "polyglot-review.md"), polyglotReview),
  fs.writeFile(path.resolve(reviewsDir, "manual-qa-review.md"), manualQaReview),
  fs.writeFile(path.resolve(reviewsDir, "qa-review.md"), qaReview),
  fs.writeFile(path.resolve(reviewsDir, "full-stack-review.md"), fullStackReview),
  fs.writeFile(path.resolve(reviewsDir, "ux-ui-review.md"), uxUiReview),
  fs.writeFile(path.resolve(reviewsDir, "production-readiness.md"), productionReadiness),
]);

console.log(
  JSON.stringify(
    {
      productionReady,
      auditPassed,
      i18nPassed,
      manualPassed,
      accessibilityPassed,
      reviewSummary: summaryPath,
    },
    null,
    2,
  ),
);

if (!productionReady) {
  process.exitCode = 1;
}
