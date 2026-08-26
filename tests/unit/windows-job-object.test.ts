import { describe, expect, it } from "vitest";

import {
  WINDOWS_JOB_HELPER,
  createWindowsJobObjectOperations,
  helperSourceHash,
} from "../../src/platform/windows/job-object.js";

describe("embedded Windows Job Object backend", () => {
  it("contains the suspended launch and kill-on-close barrier", () => {
    expect(WINDOWS_JOB_HELPER).toContain("CREATE_SUSPENDED");
    expect(WINDOWS_JOB_HELPER).toContain("CreateProcessW");
    expect(WINDOWS_JOB_HELPER).toContain("STARTUPINFOEX");
    expect(WINDOWS_JOB_HELPER).toContain("PROC_THREAD_ATTRIBUTE_HANDLE_LIST");
    expect(WINDOWS_JOB_HELPER).toContain("InitializeProcThreadAttributeList");
    expect(WINDOWS_JOB_HELPER).toContain("UpdateProcThreadAttribute");
    expect(WINDOWS_JOB_HELPER).toContain("SetInformationJobObject");
    expect(WINDOWS_JOB_HELPER).toContain("JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE");
    expect(WINDOWS_JOB_HELPER).toContain("AssignProcessToJobObject");
    expect(WINDOWS_JOB_HELPER).toContain("ResumeThread");
    expect(WINDOWS_JOB_HELPER).toContain("TerminateAndWait(pi.hProcess)");
    expect(WINDOWS_JOB_HELPER).toContain("Read-Frame");
    expect(WINDOWS_JOB_HELPER).toContain("TerminateJobObject");
    expect(helperSourceHash()).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("keeps attached-frame failure cleanup bounded and helper-owned", () => {
    expect(WINDOWS_JOB_HELPER).toContain("if ($null -eq $frame)");
    expect(WINDOWS_JOB_HELPER).toContain("TerminateJobObject($jobHandle, 1)");
  });

  it("isolates target stdio and uses the real controller pipe", () => {
    expect(WINDOWS_JOB_HELPER).toContain("STARTF_USESTDHANDLES");
    expect(WINDOWS_JOB_HELPER).toContain("PROC_THREAD_ATTRIBUTE_HANDLE_LIST");
    expect(WINDOWS_JOB_HELPER).toContain(
      "SetHandleInformation(targetInput, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)",
    );
    expect(WINDOWS_JOB_HELPER).toContain(
      "SetHandleInformation(targetOutput, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)",
    );
    expect(WINDOWS_JOB_HELPER).toContain(
      "SetHandleInformation(targetError, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)",
    );
    expect(WINDOWS_JOB_HELPER).toContain(
      "$ControllerInput = [Console]::OpenStandardInput()",
    );
    expect(WINDOWS_JOB_HELPER).toContain("processCreated");
    expect(WINDOWS_JOB_HELPER).toContain("TerminateAndWait(pi.hProcess)");
  });

  it("closes the target Job when the controller reaches EOF", () => {
    expect(WINDOWS_JOB_HELPER).toContain("function Read-Frame");
    expect(WINDOWS_JOB_HELPER).toContain("if ($null -eq $frame)");
    expect(WINDOWS_JOB_HELPER).toContain(
      "WaitForSingleObject($processHandle, 10000)",
    );
    expect(WINDOWS_JOB_HELPER).toContain("TerminateJobObject($jobHandle, 1)");
  });

  it("fails closed off Windows and never advertises a raw-PID fallback", async () => {
    const backend = createWindowsJobObjectOperations({
      powershellPath: "powershell.exe",
      runner: { run: async () => ({ stdout: "", stderr: "" }) },
    });
    if (process.platform !== "win32") {
      await expect(backend.probe()).resolves.toBe(false);
    }
    await expect(backend.capability()).resolves.toMatchObject(
      process.platform === "win32"
        ? { mechanism: "windows_job_object", state: "unavailable" }
        : { mechanism: "windows_job_object", killOnClose: false },
    );
    await expect(backend.attach(42)).rejects.toThrow(/cannot be reattached/i);
  });
});
