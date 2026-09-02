import { execFile } from "node:child_process";
import { win32 } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FRAME_PREFIX = "PUMAREJO-BOOT/1 ";
const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

export const WINDOWS_BOOT_IDENTIFIER_SCHEME =
  "windows-boot-sequence/v2" as const;
export const LEGACY_WINDOWS_BOOT_IDENTIFIER_SCHEME =
  "windows-boot-environment-guid/v1" as const;

export interface WindowsBootIdentifier {
  readonly scheme: typeof WINDOWS_BOOT_IDENTIFIER_SCHEME;
  readonly bootEnvironmentGuid: string;
  readonly bootId: number;
}

export interface LegacyWindowsBootIdentifier {
  readonly scheme: typeof LEGACY_WINDOWS_BOOT_IDENTIFIER_SCHEME;
  readonly value: string;
}

export interface WindowsBootIdentifierOptions {
  readonly platform?: NodeJS.Platform;
  readonly systemRoot?: string;
  readonly powershellPath?: string;
  readonly runner?: {
    run(
      command: string,
      args: readonly string[],
    ): Promise<{ readonly stdout: string; readonly stderr: string }>;
  };
}

const WINDOWS_BOOT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32;

public static class PumarejoBootEnvironment {
  [StructLayout(LayoutKind.Sequential)]
  private struct SYSTEM_BOOT_ENVIRONMENT_INFORMATION {
    public Guid BootIdentifier;
    public int FirmwareType;
    public ulong BootFlags;
  }

  [DllImport("ntdll.dll")]
  private static extern int NtQuerySystemInformation(
    int informationClass,
    ref SYSTEM_BOOT_ENVIRONMENT_INFORMATION information,
    int informationLength,
    out int returnLength
  );

  public static string ReadBootIdentifier() {
    var information = new SYSTEM_BOOT_ENVIRONMENT_INFORMATION();
    int returnLength;
    var status = NtQuerySystemInformation(
      90,
      ref information,
      Marshal.SizeOf(typeof(SYSTEM_BOOT_ENVIRONMENT_INFORMATION)),
      out returnLength
    );
    if (status != 0) {
      throw new Win32Exception(status);
    }
    using (var key = Registry.LocalMachine.OpenSubKey(
      @"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters",
      false
    )) {
      if (key == null) throw new InvalidOperationException("boot-sequence-unavailable");
      var value = key.GetValue("BootId", null, RegistryValueOptions.DoNotExpandEnvironmentNames);
      if (value == null) throw new InvalidOperationException("boot-sequence-unavailable");
      var bootId = Convert.ToUInt32(value);
      return information.BootIdentifier.ToString("D").ToLowerInvariant() + "|" + bootId.ToString();
    }
  }
}
"@
Write-Output ('PUMAREJO-BOOT/1 ' + [PumarejoBootEnvironment]::ReadBootIdentifier())
`;

function encodedPowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function powershellPath(options: WindowsBootIdentifierOptions): string {
  const candidate =
    options.powershellPath ??
    win32.join(
      options.systemRoot ?? process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
  if (!win32.isAbsolute(candidate)) {
    throw new Error("Windows PowerShell path must be absolute.");
  }
  return candidate;
}

async function defaultRun(command: string, args: readonly string[]) {
  const result = await execFileAsync(command, [...args], {
    encoding: "utf8",
    shell: false,
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 64 * 1024,
  });
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}

export function validateWindowsBootIdentifier(
  value: unknown,
): value is WindowsBootIdentifier {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).sort().join(",") ===
      "bootEnvironmentGuid,bootId,scheme" &&
    record.scheme === WINDOWS_BOOT_IDENTIFIER_SCHEME &&
    typeof record.bootEnvironmentGuid === "string" &&
    GUID.test(record.bootEnvironmentGuid) &&
    record.bootEnvironmentGuid !== "00000000-0000-0000-0000-000000000000" &&
    typeof record.bootId === "number" &&
    Number.isInteger(record.bootId) &&
    record.bootId >= 0 &&
    record.bootId <= 0xffff_ffff
  );
}

export function validateLegacyWindowsBootIdentifier(
  value: unknown,
): value is LegacyWindowsBootIdentifier {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).sort().join(",") === "scheme,value" &&
    record.scheme === LEGACY_WINDOWS_BOOT_IDENTIFIER_SCHEME &&
    typeof record.value === "string" &&
    GUID.test(record.value) &&
    record.value !== "00000000-0000-0000-0000-000000000000"
  );
}

export function sameWindowsBootIdentifier(
  left: WindowsBootIdentifier,
  right: WindowsBootIdentifier,
): boolean {
  return (
    left.scheme === right.scheme &&
    left.bootEnvironmentGuid === right.bootEnvironmentGuid &&
    left.bootId === right.bootId
  );
}

export async function readWindowsBootIdentifier(
  options: WindowsBootIdentifierOptions = {},
): Promise<WindowsBootIdentifier> {
  if ((options.platform ?? process.platform) !== "win32") {
    throw new Error("Windows boot identity is unavailable on this platform.");
  }
  const run = options.runner?.run ?? defaultRun;
  const result = await run(powershellPath(options), [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodedPowerShell(WINDOWS_BOOT_SCRIPT),
  ]);
  const frames = result.stdout
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(FRAME_PREFIX));
  if (frames.length !== 1) {
    throw new Error("Windows boot identity helper returned no unique result.");
  }
  const payload = frames[0]!.slice(FRAME_PREFIX.length).trim().toLowerCase();
  const [bootEnvironmentGuid, bootIdSource, ...extra] = payload.split("|");
  const identifier = {
    scheme: WINDOWS_BOOT_IDENTIFIER_SCHEME,
    bootEnvironmentGuid,
    bootId: Number(bootIdSource),
  };
  if (extra.length > 0 || !validateWindowsBootIdentifier(identifier)) {
    throw new Error("Windows boot identity helper returned an invalid result.");
  }
  return identifier;
}
