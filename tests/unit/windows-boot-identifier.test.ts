import { describe, expect, it, vi } from "vitest";

import {
  readWindowsBootIdentifier,
  validateWindowsBootIdentifier,
} from "../../src/platform/windows/boot-identifier.js";

const BOOT_GUID = "b6dc03ce-ea16-11f0-b0a8-96a4b3fa7898";

describe("Windows boot identifier", () => {
  it("reads the boot sequence and its environment scope through the fixed helper", async () => {
    const run = vi.fn(async () => ({
      stdout: `PUMAREJO-BOOT/1 ${BOOT_GUID}|52\r\n`,
      stderr: "",
    }));

    await expect(
      readWindowsBootIdentifier({
        platform: "win32",
        powershellPath:
          "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        runner: { run },
      }),
    ).resolves.toEqual({
      scheme: "windows-boot-sequence/v2",
      bootEnvironmentGuid: BOOT_GUID,
      bootId: 52,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed, empty, and non-Windows boot provenance", async () => {
    expect(
      validateWindowsBootIdentifier({
        scheme: "windows-boot-sequence/v2",
        bootEnvironmentGuid: "not-a-guid",
        bootId: 52,
      }),
    ).toBe(false);
    expect(
      validateWindowsBootIdentifier({
        scheme: "windows-boot-sequence/v2",
        bootEnvironmentGuid: "00000000-0000-0000-0000-000000000000",
        bootId: 52,
      }),
    ).toBe(false);
    await expect(
      readWindowsBootIdentifier({ platform: "linux" }),
    ).rejects.toThrow(/Windows boot identity is unavailable/i);
  });
});
