import { execFile } from "node:child_process";
import { readFile, readlink } from "node:fs/promises";
import { promisify } from "node:util";

import {
  createTrackedProcessAdapter,
  type NativeProcessOperations,
} from "../tracked-process.js";

const execFileAsync = promisify(execFile);

async function inspectSystem(pid: number) {
  try {
    const [stat, executable] = await Promise.all([
      readFile(`/proc/${pid}/stat`, "utf8"),
      readlink(`/proc/${pid}/exe`),
    ]);
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const startedAt = Number(fields[19]);
    return Number.isFinite(startedAt) && startedAt > 0
      ? {
          startedAt,
          commandLine: executable,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

async function terminateTree(pid: number): Promise<void> {
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

async function providerOwner(
  rootPid: number,
  providerPort: number,
): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/ss",
      ["-ltnp", `sport = :${providerPort}`],
      { timeout: 10_000 },
    );
    const ipv4LoopbackListener = stdout
      .split(/\r?\n/u)
      .find((line) => line.includes(`127.0.0.1:${providerPort}`));
    const match = /pid=(\d+)(?:,|\))/u.exec(ipv4LoopbackListener ?? "");
    if (match?.[1] === undefined) return undefined;
    const owner = Number(match[1]);
    let current = owner;
    const seen = new Set<number>();
    while (current > 0 && !seen.has(current)) {
      if (current === rootPid) return owner;
      seen.add(current);
      const stat = await readFile(`/proc/${current}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      current = Number(fields[1]);
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

export function createLinuxProcessAdapter() {
  return createTrackedProcessAdapter(operations);
}
