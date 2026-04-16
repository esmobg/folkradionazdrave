import fs from "node:fs/promises";
import path from "node:path";
import { nodeCommand, projectRoot, runCommand, writeFileWithRetry } from "./review-utils.mjs";

const reviewsDir = path.resolve(projectRoot, "reviews");
const runsDir = path.resolve(reviewsDir, "future-qa-runs");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.resolve(runsDir, stamp);

await fs.mkdir(runDir, { recursive: true });

await runCommand(nodeCommand, [path.resolve(projectRoot, "scripts", "run-agent-reviews.mjs")], {
  cwd: projectRoot,
});

await runCommand(nodeCommand, [path.resolve(projectRoot, "scripts", "run-accessibility-qa.mjs")], {
  cwd: projectRoot,
});

const artifacts = [
  "agent-summary.json",
  "manual-qa-results.json",
  "accessibility-gate-results.json",
  "production-readiness.md",
  "qa-review.md",
  "accessibility-review.md",
];

for (const fileName of artifacts) {
  const source = path.resolve(reviewsDir, fileName);
  const target = path.resolve(runDir, fileName);
  const content = await fs.readFile(source);
  await writeFileWithRetry(target, content, { ensureParentDir: false });
}

const runSummary = {
  checkedAt: new Date().toISOString(),
  runDir,
  artifacts,
};

await writeFileWithRetry(path.resolve(runDir, "run-summary.json"), JSON.stringify(runSummary, null, 2), {
  ensureParentDir: false,
});
console.log(JSON.stringify(runSummary, null, 2));
