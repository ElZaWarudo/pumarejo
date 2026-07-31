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
          status: "found" as const,
          identity: { startedAt, commandLine: executable },
        }
      : {
          status: "invalid-response" as const,
          cause: new Error("Invalid /proc process start time."),
        };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { status: "not-found" as const }
      : { status: "unavailable" as const, cause: error };
  }
}

async function terminateTree(pid: number): Promise<void> {
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

async function providerOwner(rootPid: number, providerPort: number) {
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
    if (match?.[1] === undefined) return { status: "not-found" as const };
    const owner = Number(match[1]);
    let current = owner;
    const seen = new Set<number>();
    while (current > 0 && !seen.has(current)) {
      if (current === rootPid) return { status: "found" as const, pid: owner };
      seen.add(current);
      const stat = await readFile(`/proc/${current}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      current = Number(fields[1]);
    }
    return { status: "not-found" as const };
  } catch (error) {
    return { status: "unavailable" as const, cause: error };
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
