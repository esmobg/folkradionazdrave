import { spawn } from "node:child_process";

export const projectRoot = process.cwd();
export const isWindows = process.platform === "win32";
export const npmCommand = isWindows ? "npm.cmd" : "npm";
export const nodeCommand = process.execPath;

function quoteForCmd(arg) {
  if (!/[\s"]/u.test(arg)) {
    return arg;
  }

  return `"${arg.replace(/"/g, '\\"')}"`;
}

export async function runCommand(command, args, options = {}) {
  const {
    cwd = projectRoot,
    env = process.env,
    rejectOnError = true,
  } = options;

  return new Promise((resolve, reject) => {
    const child = isWindows && command.endsWith(".cmd")
      ? spawn(process.env.ComSpec || "cmd.exe", [
          "/d",
          "/s",
          "/c",
          `${quoteForCmd(command)} ${args.map(quoteForCmd).join(" ")}`.trim(),
        ], {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn(command, args, {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      const result = {
        code: code ?? 0,
        stdout,
        stderr,
      };

      if (rejectOnError && result.code !== 0) {
        const error = new Error(stderr || stdout || `Command failed: ${command} ${args.join(" ")}`);
        error.result = result;
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

export async function waitForUrl(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20000;
  const intervalMs = options.intervalMs ?? 500;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export function startPreviewServer(options = {}) {
  const cwd = options.cwd ?? projectRoot;
  const port = String(options.port ?? 4280);

  return spawn(nodeCommand, ["server.mjs", "--production"], {
    cwd,
    env: {
      ...process.env,
      PORT: port,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export async function stopProcess(child) {
  if (!child || child.killed || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let resolved = false;

    function finish() {
      if (resolved) {
        return;
      }

      resolved = true;
      child.removeListener("exit", finish);
      child.removeListener("close", finish);
      clearTimeout(forceKillTimeout);
      clearTimeout(resolveTimeout);
      resolve();
    }

    const forceKillTimeout = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) {
        finish();
        return;
      }

      if (isWindows) {
        const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });

        killer.once("exit", finish);
        killer.once("error", finish);
        return;
      }

      child.kill("SIGKILL");
    }, 1500);

    const resolveTimeout = setTimeout(finish, 4500);

    child.once("exit", finish);
    child.once("close", finish);

    try {
      child.kill();
    } catch {
      finish();
    }
  });
}
