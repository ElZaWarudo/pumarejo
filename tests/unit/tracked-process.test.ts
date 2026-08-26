import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createTrackedProcessAdapter,
  type NativeProcessOperations,
} from "../../src/platform/tracked-process.js";

const NONCE = "a".repeat(64);
const request = {
  command: process.execPath,
  args: ["-e", "setInterval(() => {}, 1000)"],
  cwd: resolve("."),
  env: { ...process.env, PUMAREJO_SESSION_NONCE: NONCE },
  shell: false as const,
};

describe("tracked native process adapter", () => {
  it("maps access denial to a process-inspection error and reports cleanup", async () => {
    const cause = new Error("Access is denied");
    const terminateTree = vi.fn(async (pid: number) => {
      process.kill(pid, "SIGKILL");
    });
    const adapter = createTrackedProcessAdapter({
      inspectSystem: async () => ({ status: "access-denied", cause }),
      terminateTree,
      providerOwner: async () => ({ status: "not-found" }),
    });

    await expect(adapter.spawn(request)).rejects.toMatchObject({
      code: "PROCESS_INSPECTION_DENIED",
      phase: "process-inspection",
      cause,
      diagnostic: {
        applicationStarted: true,
        cleanup: "terminated",
        webdriverSessionCreated: false,
      },
    });
  });

  it("maps a PID that never appears to PROCESS_NOT_FOUND", async () => {
    const terminateTree = vi.fn(async (pid: number) => {
      process.kill(pid, "SIGKILL");
    });
    const adapter = createTrackedProcessAdapter(
      {
        inspectSystem: async () => ({ status: "not-found" }),
        terminateTree,
        providerOwner: async () => ({ status: "not-found" }),
      },
      { inspectionTimeoutMs: 20, inspectionPollMs: 1 },
    );

    await expect(adapter.spawn(request)).rejects.toMatchObject({
      code: "PROCESS_NOT_FOUND",
      phase: "process-inspection",
      diagnostic: {
        applicationStarted: true,
        cleanup: "terminated",
        webdriverSessionCreated: false,
      },
    });
  });

  it("terminates a child acquired before system identity inspection fails", async () => {
    const terminateTree = vi.fn(async (pid: number) => {
      process.kill(pid, "SIGKILL");
    });
    const operations: NativeProcessOperations = {
      inspectSystem: async () => {
        throw new Error("inspection failed");
      },
      terminateTree,
      providerOwner: async () => ({ status: "not-found" }),
    };
    const adapter = createTrackedProcessAdapter(operations);

    await expect(adapter.spawn(request)).rejects.toThrow("inspection failed");
    expect(terminateTree).toHaveBeenCalledOnce();
  });

  it("revalidates the OS identity inside terminate and never kills a replacement", async () => {
    let observed = { startedAt: 1_000, commandLine: "owned" };
    const terminateTree = vi.fn(async () => undefined);
    const operations: NativeProcessOperations = {
      inspectSystem: async () => ({ status: "found", identity: observed }),
      terminateTree,
      providerOwner: async () => ({ status: "not-found" }),
    };
    const adapter = createTrackedProcessAdapter(operations);
    const spawned = await adapter.spawn(request);
    observed = { startedAt: 2_000, commandLine: "replacement" };

    await expect(adapter.terminateTree(spawned.pid)).resolves.toBeUndefined();
    expect(terminateTree).not.toHaveBeenCalled();
    process.kill(spawned.pid, "SIGKILL");
  });

  it("waits for the tracked exit event when native termination removes inspection first", async () => {
    let inspectionUnavailable = false;
    let terminateTimer: NodeJS.Timeout | undefined;
    const observed = { startedAt: 1_000, commandLine: "owned" };
    const nativeTerminate = vi.fn(async (pid: number) => {
      inspectionUnavailable = true;
      terminateTimer = setTimeout(() => {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // The child may already have exited while the event is pending.
        }
      }, 50);
    });
    const adapter = createTrackedProcessAdapter({
      inspectSystem: async () =>
        inspectionUnavailable
          ? { status: "not-found" }
          : { status: "found", identity: observed },
      terminateTree: async () => undefined,
      providerOwner: async () => ({ status: "not-found" }),
      custody: {
        capability: async () => ({
          mechanism: "windows_validated_tree",
          state: "supported",
          code: "windows_validated_tree_fallback",
          killOnClose: false,
        }),
        attach: async () => ({ mechanism: "windows_validated_tree" }),
        inspect: async () => ({ descendantsComplete: true }),
        terminate: nativeTerminate,
        release: async () => undefined,
      },
    });

    const spawned = await adapter.spawn(request);
    const attachment = await adapter.custody!.attach(spawned);
    try {
      await expect(
        adapter.custody!.terminate(spawned, attachment, {
          graceMs: 250,
          pollMs: 10,
        }),
      ).resolves.toMatchObject({ state: "terminated", escalated: false });
      expect(nativeTerminate).toHaveBeenCalledOnce();
    } finally {
      if (terminateTimer !== undefined) clearTimeout(terminateTimer);
      try {
        process.kill(spawned.pid, "SIGKILL");
      } catch {
        // The tracked child has already exited.
      }
      await adapter.custody!.release(attachment);
    }
  });

  it("keeps cleanup retryable when custody proof disappears before native termination", async () => {
    let custodyInspections = 0;
    const nativeTerminate = vi.fn(async () => undefined);
    const observed = { startedAt: 1_000, commandLine: "owned" };
    const adapter = createTrackedProcessAdapter({
      inspectSystem: async () => ({ status: "found", identity: observed }),
      terminateTree: async () => undefined,
      providerOwner: async () => ({ status: "not-found" }),
      custody: {
        capability: async () => ({
          mechanism: "windows_validated_tree",
          state: "supported",
          code: "windows_validated_tree_fallback",
          killOnClose: false,
        }),
        attach: async () => ({ mechanism: "windows_validated_tree" }),
        inspect: async () => {
          custodyInspections += 1;
          return custodyInspections === 1
            ? { descendantsComplete: true }
            : undefined;
        },
        terminate: nativeTerminate,
        release: async () => undefined,
      },
    });

    const spawned = await adapter.spawn(request);
    const attachment = await adapter.custody!.attach(spawned);
    try {
      await expect(
        adapter.custody!.terminate(spawned, attachment),
      ).resolves.toMatchObject({ state: "retryable", escalated: false });
      expect(nativeTerminate).not.toHaveBeenCalled();
    } finally {
      try {
        process.kill(spawned.pid, "SIGKILL");
      } catch {
        // The tracked child has already exited.
      }
      await adapter.custody!.release(attachment);
    }
  });

  it("keeps untracked custody retryable without native termination", async () => {
    const nativeTerminate = vi.fn(async () => undefined);
    const adapter = createTrackedProcessAdapter({
      inspectSystem: async () => ({ status: "not-found" }),
      terminateTree: async () => undefined,
      providerOwner: async () => ({ status: "not-found" }),
      custody: {
        capability: async () => ({
          mechanism: "windows_validated_tree",
          state: "supported",
          code: "windows_validated_tree_fallback",
          killOnClose: false,
        }),
        attach: async () => ({ mechanism: "windows_validated_tree" }),
        inspect: async () => undefined,
        terminate: nativeTerminate,
        release: async () => undefined,
      },
    });

    await expect(
      adapter.custody!.terminate(
        {
          pid: 999_999,
          startedAt: 1_000,
          commandHash: "a".repeat(64),
          systemHash: "b".repeat(64),
          sessionNonce: "c".repeat(64),
        },
        { mechanism: "windows_validated_tree" },
      ),
    ).resolves.toEqual({ state: "retryable", escalated: false });
    expect(nativeTerminate).not.toHaveBeenCalled();
  });

  it("fails readiness promptly when the managed target exits before the helper", async () => {
    const child = (await import("node:child_process")).spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { stdio: "ignore" },
    );
    const isTargetAlive = vi.fn(async () => false);
    const adapter = createTrackedProcessAdapter({
      managedLaunch: async () => ({
        child,
        pid: child.pid!,
        identity: { startedAt: 1_000, commandLine: "managed-target" },
        attachment: { mechanism: "windows_job_object" },
        isTargetAlive,
      }),
      inspectSystem: async () => ({
        status: "unavailable",
        cause: new Error("managed launch owns identity"),
      }),
      terminateTree: async () => undefined,
      providerOwner: async () => ({ status: "not-found" }),
    });

    try {
      const spawned = await adapter.spawn(request);
      await expect(spawned.waitUntilProviderReady(1)).rejects.toMatchObject({
        code: "APP_START_FAILED",
      });
      expect(isTargetAlive).toHaveBeenCalled();
    } finally {
      try {
        child.kill();
      } catch {
        /* already exited */
      }
    }
  });
});
