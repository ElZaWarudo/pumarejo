import { spawn as spawnChild } from "node:child_process";
import { once } from "node:events";
import { kill } from "node:process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createTrackedProcessAdapter,
  type NativeProcessCustodyOperations,
} from "../../src/platform/tracked-process.js";

const NONCE = "a".repeat(64);

function request() {
  return {
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 60_000)"],
    cwd: resolve("."),
    env: { ...process.env, PUMAREJO_SESSION_NONCE: NONCE },
    shell: false as const,
  };
}

describe("tracked process custody", () => {
  it("attaches an internal ownership mechanism and terminates only after revalidation", async () => {
    let childPid = 0;
    let complete = true;
    const released: unknown[] = [];
    const custody: NativeProcessCustodyOperations = {
      async capability() {
        return {
          mechanism: "posix_process_group",
          state: "supported",
          code: "posix_process_group_available",
          killOnClose: false,
        };
      },
      async attach(pid) {
        childPid = pid;
        return {
          mechanism: "posix_process_group",
          groupId: pid,
          sessionId: pid,
        };
      },
      async inspect(pid) {
        return { groupId: pid, sessionId: pid, descendantsComplete: complete };
      },
      async terminate(pid) {
        process.kill(pid, "SIGTERM");
      },
      async release(handle) {
        released.push(handle);
      },
    };
    const operations = {
      inspectSystem: async () => ({
        status: "found" as const,
        identity: { startedAt: 1_000, commandLine: "owned" },
      }),
      terminateTree: async () => undefined,
      providerOwner: async () => ({ status: "not-found" as const }),
      custody,
    };
    const adapter = createTrackedProcessAdapter(operations, {
      inspectionTimeoutMs: 500,
      inspectionPollMs: 5,
    });
    const spawned = await adapter.spawn(request());
    const owned = adapter.custody;
    expect(owned).toBeDefined();
    const attached = await owned!.attach(spawned);
    await expect(owned!.inspect(spawned, attached)).resolves.toMatchObject({
      mechanism: "posix_process_group",
      descendantsComplete: true,
    });
    await expect(
      owned!.terminate(spawned, attached, { graceMs: 500, pollMs: 5 }),
    ).resolves.toMatchObject({
      state: "terminated",
      escalated: false,
    });
    await owned!.release(attached);
    expect(released).toHaveLength(1);
    expect(childPid).toBe(spawned.pid);
  });

  it("refuses escalation when group completeness is lost", async () => {
    let terminateCalls = 0;
    let complete = true;
    const custody: NativeProcessCustodyOperations = {
      async capability() {
        return {
          mechanism: "posix_process_group",
          state: "supported",
          code: "posix_process_group_available",
          killOnClose: false,
        };
      },
      async attach(pid) {
        return {
          mechanism: "posix_process_group",
          groupId: pid,
          sessionId: pid,
        };
      },
      async inspect(pid) {
        return { groupId: pid, sessionId: pid, descendantsComplete: complete };
      },
      async terminate() {
        terminateCalls += 1;
      },
      async release() {
        // no-op
      },
    };
    const adapter = createTrackedProcessAdapter({
      inspectSystem: async () => ({
        status: "found" as const,
        identity: { startedAt: 1_000, commandLine: "owned" },
      }),
      terminateTree: async () => undefined,
      providerOwner: async () => ({ status: "not-found" as const }),
      custody,
    });
    const spawned = await adapter.spawn(request());
    const attached = await adapter.custody!.attach(spawned);
    complete = false;
    await expect(
      adapter.custody!.terminate(spawned, attached),
    ).resolves.toEqual({
      state: "retryable",
      escalated: false,
    });
    expect(terminateCalls).toBe(0);
    kill(spawned.pid, "SIGKILL");
    await adapter.custody!.release(attached);
  });

  it("does not treat managed helper exit as target exit", async () => {
    let targetPid = 0;
    let helper: ReturnType<typeof spawnChild> | undefined;
    const custody: NativeProcessCustodyOperations = {
      async capability() {
        return {
          mechanism: "windows_job_object",
          state: "supported",
          code: "windows_job_object_available",
          killOnClose: true,
        };
      },
      async attach(pid) {
        return { mechanism: "windows_job_object", opaqueHandle: pid };
      },
      async inspect() {
        return { descendantsComplete: true };
      },
      async terminate() {
        throw new Error("target termination must not follow helper loss");
      },
      async waitForTermination() {
        return false;
      },
      async release() {},
    };
    const adapter = createTrackedProcessAdapter({
      async managedLaunch() {
        const target = spawnChild(
          process.execPath,
          ["-e", "setInterval(() => {}, 60_000)"],
          {
            stdio: "ignore",
          },
        );
        await new Promise<void>((resolve, reject) => {
          target.once("spawn", () => resolve());
          target.once("error", reject);
        });
        targetPid = target.pid!;
        helper = spawnChild(
          process.execPath,
          ["-e", "setTimeout(() => process.exit(0), 10)"],
          {
            stdio: "ignore",
          },
        );
        await new Promise<void>((resolve, reject) => {
          helper!.once("spawn", () => resolve());
          helper!.once("error", reject);
        });
        return {
          child: helper,
          pid: targetPid,
          identity: { startedAt: 1_000, commandLine: "managed target" },
          attachment: {
            mechanism: "windows_job_object",
            opaqueHandle: targetPid,
          },
        };
      },
      inspectSystem: async () => ({
        status: "found" as const,
        identity: { startedAt: 1_000, commandLine: "managed target" },
      }),
      terminateTree: async () => undefined,
      providerOwner: async () => ({ status: "not-found" as const }),
      custody,
    });
    try {
      const spawned = await adapter.spawn(request());
      if (helper !== undefined && helper.exitCode === null) {
        await once(helper, "exit", { signal: AbortSignal.timeout(5_000) });
      }
      await expect(adapter.inspect(spawned.pid)).resolves.toBeUndefined();
      await expect(
        adapter.custody!.terminate(spawned, spawned.custodyAttachment!),
      ).resolves.toEqual({
        state: "retryable",
        escalated: false,
      });
    } finally {
      if (targetPid > 0) {
        try {
          kill(targetPid, "SIGKILL");
        } catch {
          // Target may have exited while the helper was being observed.
        }
      }
      if (helper !== undefined && helper.exitCode === null) helper.kill();
    }
  });
});
