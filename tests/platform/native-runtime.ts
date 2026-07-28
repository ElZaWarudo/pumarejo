import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import type {
  OwnedLaunchDependencies,
  SpawnRequest,
  SpawnedFixture,
} from "./owned-launch.js";
import { defaultProxyStarter } from "./owned-launch.js";
import { commandHash, type ProcessIdentity } from "./process-lease.js";

const execFileAsync = promisify(execFile);
const children = new Map<
  number,
  { child: ChildProcess; identity: ProcessIdentity }
>();

export async function findFreeLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("port reservation failed");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForPort(
  child: ChildProcess,
  port: number,
  output: () => string,
): Promise<void> {
  const configuredTimeout = Number(
    process.env.TAURI_AGENT_PROVIDER_READY_TIMEOUT_MS ?? "60000",
  );
  if (
    !Number.isInteger(configuredTimeout) ||
    configuredTimeout < 1_000 ||
    configuredTimeout > 600_000
  ) {
    throw new Error("provider readiness timeout must be 1000..600000 ms");
  }
  const deadline = Date.now() + configuredTimeout;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `fixture exited before provider readiness (${child.exitCode}): ${output()}`,
      );
    }
    const connected = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.setTimeout(250);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      const failed = () => {
        socket.destroy();
        resolve(false);
      };
      socket.once("error", failed);
      socket.once("timeout", failed);
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("fixture provider readiness timed out");
}

async function spawnFixture(request: SpawnRequest): Promise<SpawnedFixture> {
  let executable = request.command;
  let executableArgs = request.args;
  if (request.command === "pnpm" && request.args[0] === "tauri") {
    const requireFromFixture = createRequire(join(request.cwd, "package.json"));
    executable = process.execPath;
    executableArgs = [
      requireFromFixture.resolve("@tauri-apps/cli/tauri.js"),
      ...request.args.slice(1),
    ];
  }
  const child = spawn(executable, executableArgs, {
    cwd: request.cwd,
    env: request.env,
    shell: false,
    stdio: "pipe",
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  if (!child.pid) throw new Error("fixture process returned no PID");
  let output = "";
  const append = (chunk: Buffer) => {
    output = `${output}${chunk.toString("utf8")}`.slice(-8_000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  const identity = {
    pid: child.pid,
    startedAt: Date.now(),
    commandHash: commandHash(request.command, request.args),
  };
  children.set(child.pid, { child, identity });
  child.once("exit", () => children.delete(identity.pid));
  return {
    ...identity,
    waitUntilReady: (port) => waitForPort(child, port, () => output.trim()),
  };
}

async function inspect(pid: number): Promise<ProcessIdentity | undefined> {
  const owned = children.get(pid);
  return owned?.child.exitCode === null ? owned.identity : undefined;
}

async function terminate(pid: number): Promise<void> {
  const owned = children.get(pid);
  if (!owned) throw new Error("refusing to terminate an untracked process");
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"]);
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (owned.child.exitCode === null) throw error;
    }
  } else {
    process.kill(-pid, "SIGTERM");
  }
  await new Promise<void>((resolve, reject) => {
    if (owned.child.exitCode !== null) return resolve();
    const timeout = setTimeout(
      () => reject(new Error("fixture termination timed out")),
      10_000,
    );
    owned.child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function windowsProviderOwner(
  rootPid: number,
  port: number,
): Promise<number | undefined> {
  const script = [
    `$item = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1`,
    "if (-not $item) { exit 1 }",
    "$owner = [int]$item.OwningProcess",
    "$current = $owner",
    "$seen = @{}",
    `while ($current -gt 0 -and -not $seen.ContainsKey($current)) { if ($current -eq ${rootPid}) { Write-Output $owner; exit 0 }; $seen[$current] = $true; $p = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue; if (-not $p) { break }; $current = [int]$p.ParentProcessId }`,
    "exit 1",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);
    const owner = Number(stdout.trim());
    return Number.isInteger(owner) && owner > 0 ? owner : undefined;
  } catch {
    return undefined;
  }
}

async function linuxProviderOwner(
  rootPid: number,
  port: number,
): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync("ss", ["-ltnp", `sport = :${port}`]);
    const match = /pid=(\d+)(?:,|\))/.exec(stdout);
    if (!match) return undefined;
    const owner = Number(match[1]);
    let current = owner;
    const seen = new Set<number>();
    const { readFile } = await import("node:fs/promises");
    while (current > 0 && !seen.has(current)) {
      if (current === rootPid) return owner;
      seen.add(current);
      const stat = await readFile(`/proc/${current}/stat`, "utf8");
      const afterName = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      current = Number(afterName[1]);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function portReleased(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    const released = () => {
      socket.destroy();
      resolve(true);
    };
    socket.once("error", released);
    socket.once("timeout", released);
  });
}

export const nativeLaunchDependencies: OwnedLaunchDependencies = {
  spawn: spawnFixture,
  inspect,
  terminate,
  providerOwner:
    process.platform === "win32" ? windowsProviderOwner : linuxProviderOwner,
  startProxy: defaultProxyStarter,
  portReleased,
};
