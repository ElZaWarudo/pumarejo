import { execFile } from "node:child_process";
import { win32 } from "node:path";
import { promisify } from "node:util";

import {
  createTrackedProcessAdapter,
  type NativeProcessOperations,
} from "../tracked-process.js";

const execFileAsync = promisify(execFile);

function systemCommand(...segments: readonly string[]): string {
  const systemRoot = process.env.SystemRoot;
  if (systemRoot === undefined) {
    throw new Error("SystemRoot missing");
  }
  return win32.join(systemRoot, "System32", ...segments);
}

async function inspectSystem(pid: number) {
  try {
    const script = [
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction Stop`,
      "[pscustomobject]@{ StartedAt = ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds(); CommandLine = [string]$p.CommandLine } | ConvertTo-Json -Compress",
    ].join("; ");
    const { stdout } = await execFileAsync(
      systemCommand("WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 10_000, windowsHide: true },
    );
    const value = JSON.parse(stdout) as {
      StartedAt?: unknown;
      CommandLine?: unknown;
    };
    return typeof value.StartedAt === "number" &&
      value.StartedAt > 0 &&
      typeof value.CommandLine === "string"
      ? { startedAt: value.StartedAt, commandLine: value.CommandLine }
      : undefined;
  } catch {
    return undefined;
  }
}

async function terminateTree(pid: number): Promise<void> {
  try {
    await execFileAsync(
      systemCommand("taskkill.exe"),
      ["/PID", String(pid), "/T", "/F"],
      { timeout: 10_000, windowsHide: true },
    );
  } catch (error) {
    if ((await inspectSystem(pid)) !== undefined) throw error;
  }
}

async function providerOwner(
  rootPid: number,
  providerPort: number,
): Promise<number | undefined> {
  try {
    const { stdout: listeners } = await execFileAsync(
      systemCommand("netstat.exe"),
      ["-ano", "-p", "tcp"],
      { timeout: 10_000, windowsHide: true },
    );
    const expected = `127.0.0.1:${providerPort}`;
    const owner = Number(
      listeners
        .split(/\r?\n/u)
        .map((line) => line.trim().split(/\s+/u))
        .find(
          (fields) =>
            fields[0]?.toUpperCase() === "TCP" &&
            fields[1] === expected &&
            fields[3]?.toUpperCase() === "LISTENING",
        )?.[4],
    );
    if (!Number.isInteger(owner) || owner <= 0) return undefined;

    const { stdout } = await execFileAsync(
      systemCommand("WindowsPowerShell", "v1.0", "powershell.exe"),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress",
      ],
      { timeout: 10_000, windowsHide: true },
    );
    const raw = JSON.parse(stdout) as
      | { ProcessId?: unknown; ParentProcessId?: unknown }
      | { ProcessId?: unknown; ParentProcessId?: unknown }[];
    const rows = Array.isArray(raw) ? raw : [raw];
    const parents = new Map(
      rows
        .filter(
          (row) =>
            typeof row.ProcessId === "number" &&
            typeof row.ParentProcessId === "number",
        )
        .map((row) => [row.ProcessId as number, row.ParentProcessId as number]),
    );
    let current = owner;
    const seen = new Set<number>();
    while (current > 0 && !seen.has(current)) {
      if (current === rootPid) return owner;
      seen.add(current);
      current = parents.get(current) ?? 0;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const operations: NativeProcessOperations = {
  inspectSystem,
  terminateTree,
  providerOwner,
};

export function createWindowsProcessAdapter() {
  return createTrackedProcessAdapter(operations);
}
