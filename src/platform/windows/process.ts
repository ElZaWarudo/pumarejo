import { execFile } from "node:child_process";
import { win32 } from "node:path";
import { promisify } from "node:util";

import {
  createTrackedProcessAdapter,
  type NativeManagedLaunch,
  type NativeProcessCustodyOperations,
  type NativeProcessOperations,
  type ProcessInspectionFailure,
  type ProviderOwnerResult,
  type SystemInspectionResult,
} from "../tracked-process.js";
import { createWindowsJobObjectOperations } from "./job-object.js";
import type {
  ProcessCustodyAttachment,
  ProcessCustodyCapability,
  SpawnRequest,
} from "../types.js";
import type { LoopbackFamily } from "../loopback.js";

const execFileAsync = promisify(execFile);

export interface WindowsProcessCommandRunner {
  run(
    command: string,
    args: readonly string[],
  ): Promise<{ readonly stdout: string; readonly stderr: string }>;
}

/** Injectable native seam. Node does not expose a durable Job Object handle;
 * callers may provide a host bridge and the adapter will prefer it. */
export interface WindowsJobObjectOperations {
  probe(): Promise<boolean>;
  managedLaunch?(request: SpawnRequest): Promise<NativeManagedLaunch>;
  attach(pid: number): Promise<unknown>;
  inspect?(
    pid: number,
    handle: unknown,
  ): Promise<{ readonly descendantsComplete: boolean } | undefined>;
  waitForTermination?(
    pid: number,
    handle: unknown,
    timeoutMs: number,
  ): Promise<boolean>;
  terminate(
    pid: number,
    handle: unknown,
    signal?: "term" | "kill",
  ): Promise<void>;
  release(handle: unknown): Promise<void>;
}

function nativeJobObjectSeam(
  systemRoot: string | undefined,
): WindowsJobObjectOperations {
  const backend = createWindowsJobObjectOperations({ systemRoot });
  const attachment = (opaqueHandle: unknown): ProcessCustodyAttachment => ({
    mechanism: "windows_job_object",
    opaqueHandle,
  });
  return {
    probe: async () => (await backend.capability()).state === "supported",
    managedLaunch: backend.managedLaunch,
    attach: async (pid) => (await backend.attach(pid)).opaqueHandle,
    inspect: async (pid, handle) =>
      await backend.inspect(pid, attachment(handle)),
    waitForTermination:
      backend.waitForTermination === undefined
        ? undefined
        : async (pid, handle, timeoutMs) =>
            await backend.waitForTermination!(
              pid,
              attachment(handle),
              timeoutMs,
            ),
    terminate: async (pid, handle, signal = "term") =>
      await backend.terminate(pid, attachment(handle), signal),
    release: async (handle) => await backend.release(attachment(handle)),
  };
}

function systemCommand(
  systemRoot: string,
  ...segments: readonly string[]
): string {
  return win32.join(systemRoot, "System32", ...segments);
}

function failureText(error: unknown): string {
  if (!(error instanceof Error)) return "";
  const commandError = error as Error & {
    readonly stdout?: unknown;
    readonly stderr?: unknown;
  };
  return [
    error.message,
    typeof commandError.stderr === "string" ? commandError.stderr : "",
    typeof commandError.stdout === "string" ? commandError.stdout : "",
  ].join("\n");
}

function commandFailure(error: unknown): ProcessInspectionFailure {
  const commandError = error as NodeJS.ErrnoException & {
    readonly killed?: boolean;
  };
  const text = failureText(error);
  if (
    /access\s+is\s+denied|accessdenied|acceso\s+denegado|unauthorizedaccessexception|0x80041003/iu.test(
      text,
    )
  ) {
    return { status: "access-denied", cause: error };
  }
  if (
    commandError.code === "ETIMEDOUT" ||
    commandError.killed === true ||
    /timed?\s*out|tiempo\s+de\s+espera/iu.test(text)
  ) {
    return { status: "timed-out", cause: error };
  }
  return { status: "unavailable", cause: error };
}

function invalidResponse(cause: unknown): ProcessInspectionFailure {
  return { status: "invalid-response", cause };
}

function parseInspection(stdout: string): SystemInspectionResult {
  try {
    const value = JSON.parse(stdout) as {
      Status?: unknown;
      StartedAt?: unknown;
      CommandLine?: unknown;
    };
    if (value.Status === "access-denied" || value.Status === "unavailable") {
      return {
        status: value.Status,
        cause: new Error("CIM returned a structured inspection failure."),
      };
    }
    if (value.Status === "not-found") return { status: "not-found" };
    if (
      value.Status === "found" &&
      typeof value.StartedAt === "number" &&
      value.StartedAt > 0 &&
      typeof value.CommandLine === "string"
    ) {
      return {
        status: "found",
        identity: {
          startedAt: value.StartedAt,
          commandLine: value.CommandLine,
        },
      };
    }
    return invalidResponse(
      new Error("CIM process response had an invalid shape."),
    );
  } catch (error) {
    return invalidResponse(error);
  }
}

function parseParents(
  stdout: string,
):
  | { readonly status: "found"; readonly parents: Map<number, number> }
  | ProcessInspectionFailure {
  try {
    const raw = JSON.parse(stdout) as unknown;
    const status =
      typeof raw === "object" && raw !== null && "Status" in raw
        ? raw.Status
        : undefined;
    if (!Array.isArray(raw) && status === "access-denied") {
      return {
        status: "access-denied",
        cause: new Error("CIM returned a structured ownership failure."),
      };
    }
    if (!Array.isArray(raw) && status === "unavailable") {
      return {
        status: "unavailable",
        cause: new Error("CIM returned a structured ownership failure."),
      };
    }
    const rows = (Array.isArray(raw) ? raw : [raw]) as {
      ProcessId?: unknown;
      ParentProcessId?: unknown;
    }[];
    if (
      rows.some(
        (row) =>
          typeof row.ProcessId !== "number" ||
          typeof row.ParentProcessId !== "number",
      )
    ) {
      return invalidResponse(
        new Error("CIM process tree response had an invalid shape."),
      );
    }
    return {
      status: "found",
      parents: new Map(
        rows.map((row) => [
          row.ProcessId as number,
          row.ParentProcessId as number,
        ]),
      ),
    };
  } catch (error) {
    return invalidResponse(error);
  }
}

export function createWindowsProcessOperations(
  options: {
    readonly runner?: WindowsProcessCommandRunner;
    readonly systemRoot?: string;
    readonly jobObject?: WindowsJobObjectOperations;
  } = {},
): NativeProcessOperations {
  const systemRoot = options.systemRoot ?? process.env.SystemRoot;
  const runner =
    options.runner ??
    ({
      async run(command, args) {
        return await execFileAsync(command, [...args], {
          encoding: "utf8",
          timeout: 10_000,
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
        });
      },
    } satisfies WindowsProcessCommandRunner);

  const unavailableRoot = (): ProcessInspectionFailure => ({
    status: "unavailable",
    cause: new Error("SystemRoot missing"),
  });

  const inspectSystem = async (
    pid: number,
  ): Promise<SystemInspectionResult> => {
    if (systemRoot === undefined) return unavailableRoot();
    const script = [
      "try {",
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction Stop`,
      'if ($null -eq $p) { [pscustomobject]@{ Status = "not-found" } | ConvertTo-Json -Compress; exit 0 }',
      '[pscustomobject]@{ Status = "found"; StartedAt = ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds(); CommandLine = [string]$p.CommandLine } | ConvertTo-Json -Compress',
      "} catch {",
      '$status = if ($_.Exception -is [System.UnauthorizedAccessException] -or $_.Exception.HResult -eq -2147217405) { "access-denied" } else { "unavailable" }',
      "[pscustomobject]@{ Status = $status } | ConvertTo-Json -Compress",
      "}",
    ].join("; ");
    try {
      const { stdout } = await runner.run(
        systemCommand(
          systemRoot,
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        ),
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      );
      return parseInspection(stdout);
    } catch (error) {
      return commandFailure(error);
    }
  };

  const jobObject: WindowsJobObjectOperations | undefined =
    options.jobObject ??
    (process.platform === "win32"
      ? nativeJobObjectSeam(systemRoot)
      : undefined);
  let jobAvailable: Promise<boolean> | undefined;
  const probeJob = async (): Promise<boolean> => {
    if (jobObject === undefined) return false;
    try {
      return await jobObject.probe();
    } catch {
      return false;
    }
  };
  const inspectTree = async (pid: number): Promise<boolean> => {
    if (systemRoot === undefined) return false;
    let stdout: string;
    try {
      ({ stdout } = await runner.run(
        systemCommand(
          systemRoot,
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        ),
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          'try { Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress } catch { [pscustomobject]@{ Status = "unavailable" } | ConvertTo-Json -Compress }',
        ],
      ));
    } catch {
      return false;
    }
    const parents = parseParents(stdout);
    return parents.status === "found" && parents.parents.has(pid);
  };
  const custody: NativeProcessCustodyOperations = {
    async capability(): Promise<ProcessCustodyCapability> {
      if (jobObject !== undefined) {
        jobAvailable ??= probeJob();
        if (await jobAvailable) {
          return {
            mechanism: "windows_job_object",
            state: "supported",
            code: "windows_job_object_available",
            killOnClose: true,
          };
        }
      }
      return {
        mechanism: "windows_validated_tree",
        state: "unavailable",
        code: "windows_job_object_unavailable",
        killOnClose: false,
      };
    },
    async attach(pid: number): Promise<ProcessCustodyAttachment> {
      if (jobObject !== undefined) {
        jobAvailable ??= probeJob();
        if (await jobAvailable) {
          return {
            mechanism: "windows_job_object",
            opaqueHandle: await jobObject.attach(pid),
          };
        }
      }
      throw new Error(
        `Windows Job custody is unavailable; refusing raw-PID attachment for ${pid}.`,
      );
    },
    async inspect(pid, attachment) {
      if (attachment.mechanism === "windows_job_object") {
        if (jobObject === undefined || attachment.opaqueHandle === undefined)
          return undefined;
        return (
          (await jobObject.inspect?.(pid, attachment.opaqueHandle)) ?? {
            descendantsComplete: true,
          }
        );
      }
      return undefined;
    },
    async terminate(pid, attachment) {
      if (
        attachment.mechanism === "windows_job_object" &&
        jobObject !== undefined &&
        attachment.opaqueHandle !== undefined
      ) {
        await jobObject.terminate(pid, attachment.opaqueHandle);
        return;
      }
      throw new Error(
        `Windows Job custody is unavailable; refusing raw-PID termination for ${pid}.`,
      );
    },
    async waitForTermination(pid, attachment, timeoutMs) {
      if (
        attachment.mechanism === "windows_job_object" &&
        jobObject !== undefined &&
        attachment.opaqueHandle !== undefined &&
        jobObject.waitForTermination !== undefined
      ) {
        return await jobObject.waitForTermination(
          pid,
          attachment.opaqueHandle,
          timeoutMs,
        );
      }
      return false;
    },
    async release(attachment) {
      if (
        attachment.mechanism === "windows_job_object" &&
        jobObject !== undefined &&
        attachment.opaqueHandle !== undefined
      ) {
        await jobObject.release(attachment.opaqueHandle);
      }
    },
  };

  return {
    inspectSystem,
    async terminateTree(pid) {
      if (systemRoot === undefined) throw unavailableRoot().cause;
      try {
        await runner.run(systemCommand(systemRoot, "taskkill.exe"), [
          "/PID",
          String(pid),
          "/T",
          "/F",
        ]);
      } catch (error) {
        const inspected = await inspectSystem(pid);
        if (inspected.status !== "not-found") throw error;
      }
    },

    async providerOwner(
      rootPid,
      providerPort,
      family: LoopbackFamily = "ipv4",
      signal?: AbortSignal,
    ): Promise<ProviderOwnerResult> {
      if (systemRoot === undefined) return unavailableRoot();
      signal?.throwIfAborted();
      let listeners: string;
      try {
        ({ stdout: listeners } = await runner.run(
          systemCommand(systemRoot, "netstat.exe"),
          ["-ano", "-p", "tcp"],
        ));
      } catch (error) {
        return commandFailure(error);
      }
      const expected =
        family === "ipv6"
          ? `[::1]:${providerPort}`
          : `127.0.0.1:${providerPort}`;
      const owner = Number(
        listeners
          .split(/\r?\n/u)
          .map((line) => line.trim().split(/\s+/u))
          .find(
            (fields) =>
              fields[0]?.toUpperCase() === "TCP" &&
              fields[1] === expected &&
              fields[3]?.toUpperCase() === "LISTENING",
          )?.[4],
      );
      if (!Number.isInteger(owner) || owner <= 0) {
        return { status: "not-found" };
      }

      signal?.throwIfAborted();
      let stdout: string;
      try {
        ({ stdout } = await runner.run(
          systemCommand(
            systemRoot,
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          ),
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            'try { Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress } catch { $status = if ($_.Exception -is [System.UnauthorizedAccessException] -or $_.Exception.HResult -eq -2147217405) { "access-denied" } else { "unavailable" }; [pscustomobject]@{ Status = $status } | ConvertTo-Json -Compress }',
          ],
        ));
      } catch (error) {
        return commandFailure(error);
      }
      const parents = parseParents(stdout);
      if (parents.status !== "found") return parents;
      let current = owner;
      const seen = new Set<number>();
      while (current > 0 && !seen.has(current)) {
        if (current === rootPid) return { status: "found", pid: owner };
        seen.add(current);
        current = parents.parents.get(current) ?? 0;
      }
      return { status: "not-found" };
    },
    custody,
    ...(jobObject?.managedLaunch === undefined
      ? {}
      : { managedLaunch: jobObject.managedLaunch }),
  };
}

export function createWindowsProcessAdapter() {
  return createTrackedProcessAdapter(createWindowsProcessOperations());
}
