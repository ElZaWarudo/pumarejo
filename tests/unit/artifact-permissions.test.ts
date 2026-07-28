import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createArtifactPermissionEnforcer } from "../../src/artifacts/permissions.js";

const temporaryDirectories: string[] = [];
const WINDOWS_IDENTITY_MARKER = "Write-Output $sid.Value";

afterEach(async () => {
  for (const path of temporaryDirectories.splice(0)) {
    await rm(path, { recursive: true, force: true });
  }
});

describe("artifact permission enforcement", () => {
  it("uses the current Windows SID with a non-shell PowerShell invocation", async () => {
    const run = vi.fn<
      (
        command: string,
        args: readonly string[],
        options?: { readonly env?: NodeJS.ProcessEnv },
      ) => Promise<{ stdout: string; stderr: string }>
    >(async (_command, args) => ({
      stdout: args.some((argument) =>
        argument.includes(WINDOWS_IDENTITY_MARKER),
      )
        ? "S-1-5-21-1234\r\n"
        : "",
      stderr: "",
    }));
    const enforcer = createArtifactPermissionEnforcer({
      platform: "win32",
      runner: { run },
      systemRoot: "C:\\Windows",
    });

    await enforcer.ensureOwnerOnly("C:\\safe artifact", "directory");

    expect(run).toHaveBeenCalledTimes(3);
    const [command, args, options] = run.mock.calls[0]!;
    expect(command).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    expect(args.join("\n")).toContain("WindowsIdentity]::GetCurrent().User");
    expect(args.join("\n")).not.toContain("USERNAME");
    expect(options?.env).toMatchObject({
      PUMAREJO_ARTIFACT_PATH: "C:\\safe artifact",
      PUMAREJO_ARTIFACT_KIND: "directory",
    });
    expect(run.mock.calls[1]?.[0]).toMatch(/System32[\\/]icacls\.exe$/u);
    expect(run.mock.calls[1]?.[1]).toContain("*S-1-5-21-1234:(OI)(CI)F");
    expect(run.mock.calls[2]?.[0]).toBe(command);
  });

  it("establishes owner-only permissions on the current host", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pumarejo-mode-"));
    temporaryDirectories.push(directory);
    const file = join(directory, "artifact");
    await writeFile(file, "");
    if (process.platform !== "win32") {
      await chmod(directory, 0o777);
      await chmod(file, 0o666);
    }
    const enforcer = createArtifactPermissionEnforcer();

    await enforcer.ensureOwnerOnly(directory, "directory");
    await enforcer.ensureOwnerOnly(file, "file");

    if (process.platform !== "win32") {
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    }
  });

  it("maps command failures to the screenshot error contract", async () => {
    const enforcer = createArtifactPermissionEnforcer({
      platform: "win32",
      runner: {
        async run() {
          throw new Error("access denied");
        },
      },
    });

    await expect(
      enforcer.ensureOwnerOnly("C:\\denied", "file"),
    ).rejects.toMatchObject({ code: "SCREENSHOT_FAILED" });
  });
});
