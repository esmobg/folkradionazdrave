import { execFileSync } from "node:child_process";

const siteId = "08c0e2ef-126d-4f1f-a024-6bb17089f1e1";

function runApi(method, data) {
  const payload = JSON.stringify(data);
  const output = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["netlify", "api", method, "--data", payload],
    {
      encoding: "utf8",
      cwd: process.cwd(),
    },
  );

  return JSON.parse(output);
}

try {
  const dns = runApi("getDNSForSite", { site_id: siteId });
  console.log(JSON.stringify(dns, null, 2));
} catch (error) {
  console.error(error.message);
  if (error.stdout) {
    console.error(error.stdout.toString());
  }
  process.exit(1);
}
