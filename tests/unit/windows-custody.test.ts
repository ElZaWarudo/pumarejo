import { describe, expect, it, vi } from "vitest";

import {
  createWindowsProcessOperations,
  type WindowsJobObjectOperations,
} from "../../src/platform/windows/process.js";

describe("Windows custody capability selection", () => {
  it("prefers a proven Job Object seam and otherwise fails closed", async () => {
    const calls: string[] = [];
    const job: WindowsJobObjectOperations = {
      async probe() {
        calls.push("probe");
        return true;
      },
      async attach(pid) {
        calls.push(`attach:${pid}`);
        return { pid };
      },
      async inspect() {
        return { descendantsComplete: true };
      },
      async terminate(pid) {
        calls.push(`terminate:${pid}`);
      },
      async release() {
        calls.push("release");
      },
    };
    const operations = createWindowsProcessOperations({
      systemRoot: "C:\\Windows",
      runner: { run: vi.fn(async () => ({ stdout: "", stderr: "" })) },
      jobObject: job,
    });
    const capability = await operations.custody!.capability();
    expect(capability).toMatchObject({
      mechanism: "windows_job_object",
      state: "supported",
      killOnClose: true,
    });
    const attachment = await operations.custody!.attach(42);
    expect(attachment.mechanism).toBe("windows_job_object");
    await operations.custody!.terminate(42, attachment, "term");
    await operations.custody!.release(attachment);
    expect(calls).toEqual(["probe", "attach:42", "terminate:42", "release"]);

    const fallback = createWindowsProcessOperations({
      systemRoot: undefined,
      runner: { run: vi.fn(async () => ({ stdout: "", stderr: "" })) },
      jobObject: {
        async probe() {
          return false;
        },
        async attach() {
          throw new Error("unavailable");
        },
        async inspect() {
          return undefined;
        },
        async terminate() {
          throw new Error("unavailable");
        },
        async release() {},
      },
    });
    await expect(fallback.custody!.capability()).resolves.toMatchObject({
      mechanism: "windows_validated_tree",
      state: "unavailable",
      killOnClose: false,
    });
    await expect(fallback.custody!.attach(42)).rejects.toThrow(
      /refusing raw-PID attachment/i,
    );
  });
});
