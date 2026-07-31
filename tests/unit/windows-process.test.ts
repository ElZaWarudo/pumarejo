import { describe, expect, it, vi } from "vitest";

import { createWindowsProcessOperations } from "../../src/platform/windows/process.js";

function commandError(stderr: string, code: string | number = 1): Error {
  return Object.assign(new Error("PowerShell command failed"), {
    code,
    stderr,
    stdout: "",
  });
}

describe("Windows process inspection", () => {
  it("returns a found child from valid CIM output", async () => {
    const operations = createWindowsProcessOperations({
      systemRoot: "C:\\Windows",
      runner: {
        run: vi.fn(async () => ({
          stdout:
            '{"Status":"found","StartedAt":1722330000000,"CommandLine":"npm run tauri"}',
          stderr: "",
        })),
      },
    });

    await expect(operations.inspectSystem(71)).resolves.toEqual({
      status: "found",
      identity: {
        startedAt: 1722330000000,
        commandLine: "npm run tauri",
      },
    });
  });

  it.each([
    [
      "access denied",
      commandError(
        "Get-CimInstance : Access is denied. UnauthorizedAccessException",
      ),
      "access-denied",
    ],
    [
      "CIM unavailable",
      commandError("Get-CimInstance is not recognized", "ENOENT"),
      "unavailable",
    ],
    [
      "timeout",
      Object.assign(new Error("timed out"), {
        code: "ETIMEDOUT",
        killed: true,
      }),
      "timed-out",
    ],
  ] as const)(
    "classifies %s without collapsing it to absence",
    async (_label, error, status) => {
      const operations = createWindowsProcessOperations({
        systemRoot: "C:\\Windows",
        runner: { run: async () => Promise.reject(error) },
      });

      const result = await operations.inspectSystem(71);
      expect(result).toMatchObject({ status, cause: error });
    },
  );

  it("distinguishes a missing PID from invalid JSON", async () => {
    const outputs = ['{"Status":"not-found"}', "not-json"];
    const operations = createWindowsProcessOperations({
      systemRoot: "C:\\Windows",
      runner: {
        run: async () => ({ stdout: outputs.shift()!, stderr: "" }),
      },
    });

    await expect(operations.inspectSystem(71)).resolves.toEqual({
      status: "not-found",
    });
    await expect(operations.inspectSystem(71)).resolves.toMatchObject({
      status: "invalid-response",
      cause: expect.any(Error),
    });
  });

  it("uses structured CIM failures without depending on localized text", async () => {
    const operations = createWindowsProcessOperations({
      systemRoot: "C:\\Windows",
      runner: {
        run: async () => ({
          stdout: '{"Status":"access-denied"}',
          stderr: "",
        }),
      },
    });

    await expect(operations.inspectSystem(71)).resolves.toMatchObject({
      status: "access-denied",
      cause: expect.any(Error),
    });
  });

  it("accepts only a listener proven to descend from the launched process", async () => {
    const outputs = [
      "TCP 127.0.0.1:49152 0.0.0.0:0 LISTENING 79",
      '[{"ProcessId":79,"ParentProcessId":75},{"ProcessId":75,"ParentProcessId":71}]',
      "TCP 127.0.0.1:49153 0.0.0.0:0 LISTENING 88",
      '[{"ProcessId":88,"ParentProcessId":4},{"ProcessId":71,"ParentProcessId":1}]',
    ];
    const operations = createWindowsProcessOperations({
      systemRoot: "C:\\Windows",
      runner: {
        run: async () => ({ stdout: outputs.shift()!, stderr: "" }),
      },
    });

    await expect(operations.providerOwner(71, 49152)).resolves.toEqual({
      status: "found",
      pid: 79,
    });
    await expect(operations.providerOwner(71, 49153)).resolves.toEqual({
      status: "not-found",
    });
  });
});
