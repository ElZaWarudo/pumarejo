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
  env: { ...process.env, TAURI_AGENT_SESSION_NONCE: NONCE },
  shell: false as const,
};

describe("tracked native process adapter", () => {
  it("terminates a child acquired before system identity inspection fails", async () => {
    const terminateTree = vi.fn(async (pid: number) => {
      process.kill(pid, "SIGKILL");
    });
    const operations: NativeProcessOperations = {
      inspectSystem: async () => {
        throw new Error("inspection failed");
      },
      terminateTree,
      providerOwner: async () => undefined,
    };
    const adapter = createTrackedProcessAdapter(operations);

    await expect(adapter.spawn(request)).rejects.toThrow("inspection failed");
    expect(terminateTree).toHaveBeenCalledOnce();
  });

  it("revalidates the OS identity inside terminate and never kills a replacement", async () => {
    let observed = { startedAt: 1_000, commandLine: "owned" };
    const terminateTree = vi.fn(async () => undefined);
    const operations: NativeProcessOperations = {
      inspectSystem: async () => observed,
      terminateTree,
      providerOwner: async () => undefined,
    };
    const adapter = createTrackedProcessAdapter(operations);
    const spawned = await adapter.spawn(request);
    observed = { startedAt: 2_000, commandLine: "replacement" };

    await expect(adapter.terminateTree(spawned.pid)).resolves.toBeUndefined();
    expect(terminateTree).not.toHaveBeenCalled();
    process.kill(spawned.pid, "SIGKILL");
  });
});
