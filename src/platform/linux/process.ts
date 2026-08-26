import { execFile } from "node:child_process";
import { readFile, readlink } from "node:fs/promises";
import { promisify } from "node:util";

import {
  createTrackedProcessAdapter,
  type NativeProcessCustodyOperations,
  type NativeProcessOperations,
} from "../tracked-process.js";
import type {
  ProcessCustodyAttachment,
  ProcessCustodyCapability,
} from "../types.js";
import type { LoopbackFamily } from "../loopback.js";

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

async function inspectGroup(pid: number) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const groupId = Number(fields[2]);
    const sessionId = Number(fields[3]);
    if (
      !Number.isInteger(groupId) ||
      groupId <= 0 ||
      !Number.isInteger(sessionId) ||
      sessionId <= 0
    ) {
      return undefined;
    }
    // Detached launches are expected to make the root the group/session
    // leader. A different leader is retained as retryable residue.
    return {
      groupId,
      sessionId,
      descendantsComplete: groupId === pid && sessionId === pid,
    };
  } catch {
    return undefined;
  }
}

async function inspectNonce(pid: number): Promise<string | undefined> {
  try {
    const environment = await readFile(`/proc/${pid}/environ`, "utf8");
    const entry = environment
      .split("\u0000")
      .find((value) => value.startsWith("PUMAREJO_SESSION_NONCE="));
    const nonce = entry?.slice("PUMAREJO_SESSION_NONCE=".length);
    return nonce !== undefined && /^[a-f0-9]{64}$/u.test(nonce)
      ? nonce
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
  family: LoopbackFamily = "ipv4",
  signal?: AbortSignal,
) {
  try {
    signal?.throwIfAborted();
    const { stdout } = await execFileAsync(
      "/usr/bin/ss",
      ["-ltnp", `sport = :${providerPort}`],
      { timeout: 10_000, signal },
    );
    const loopbackListener = stdout.split(/\r?\n/u).find((line) => {
      const endpoint =
        family === "ipv6"
          ? new RegExp(`(?:\\[::1\\]|::1):${providerPort}(?:\\s|$)`, "u")
          : new RegExp(`127\\.0\\.0\\.1:${providerPort}(?:\\s|$)`, "u");
      return endpoint.test(line);
    });
    const match = /pid=(\d+)(?:,|\))/u.exec(loopbackListener ?? "");
    if (match?.[1] === undefined) return { status: "not-found" as const };
    const owner = Number(match[1]);
    let current = owner;
    const seen = new Set<number>();
    while (current > 0 && !seen.has(current)) {
      signal?.throwIfAborted();
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
  custody: {
    async capability(): Promise<ProcessCustodyCapability> {
      return {
        mechanism: "posix_process_group",
        state: "supported",
        code: "posix_process_group_available",
        killOnClose: false,
      };
    },
    async attach(pid: number): Promise<ProcessCustodyAttachment> {
      const group = await inspectGroup(pid);
      if (group === undefined || !group.descendantsComplete) {
        throw new Error("Owned POSIX process group could not be established.");
      }
      return {
        mechanism: "posix_process_group",
        groupId: group.groupId,
        sessionId: group.sessionId,
      };
    },
    async inspect(pid, attachment) {
      const group = await inspectGroup(pid);
      if (
        group === undefined ||
        (attachment.groupId !== undefined &&
          attachment.groupId !== group.groupId) ||
        (attachment.sessionId !== undefined &&
          attachment.sessionId !== group.sessionId)
      ) {
        return undefined;
      }
      return group;
    },
    inspectNonce,
    async terminate(pid, _attachment, signal) {
      try {
        process.kill(-pid, signal === "term" ? "SIGTERM" : "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    },
    async release() {
      // Process groups have no persistent handle in the parent process.
    },
  } satisfies NativeProcessCustodyOperations,
};

export function createLinuxProcessAdapter() {
  return createTrackedProcessAdapter(operations);
}
