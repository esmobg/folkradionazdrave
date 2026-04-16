import fs from "node:fs/promises";
import path from "node:path";
import {
  nodeCommand,
  npmCommand,
  projectRoot,
  runCommand,
  startPreviewServer,
  stopProcess,
  waitForUrl,
} from "./review-utils.mjs";

const skipBuild = process.argv.includes("--skip-build");
const port = Number(process.env.QA_PORT || 4280);
const baseUrl = process.env.QA_BASE_URL || `http://127.0.0.1:${port}`;

async function ensureBuild() {
  const distIndex = path.resolve(projectRoot, "dist", "index.html");

  if (skipBuild) {
    return;
  }

  try {
    await fs.access(distIndex);
  } catch {
    // Build below regardless; access check only confirms whether dist already exists.
  }

  await runCommand(npmCommand, ["run", "build"]);
}

let server;

try {
  await ensureBuild();
  server = startPreviewServer({ cwd: projectRoot, port });

  await waitForUrl(baseUrl, { timeoutMs: 30000 });
  await runCommand(nodeCommand, [path.resolve(projectRoot, "scripts", "manual-qa.mjs")], {
    cwd: projectRoot,
    env: {
      ...process.env,
      QA_BASE_URL: baseUrl,
    },
  });
} finally {
  await stopProcess(server);
}
