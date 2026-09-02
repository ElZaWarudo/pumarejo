import { execFile } from "node:child_process";
import { win32 } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SID = /^S-\d(?:-\d+)+$/u;
const FRAME_PREFIX = "PUMAREJO-IDENTITY/1 ";

export interface WindowsActingIdentity {
  readonly sid: string;
  readonly pid: number;
}

export interface WindowsIdentityOptions {
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

const WINDOWS_IDENTITY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
Write-Output ('PUMAREJO-IDENTITY/1 ' + $sid)
`;

function encodedPowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function resolvePowerShell(options: WindowsIdentityOptions): string {
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

export async function readWindowsActingIdentity(
  options: WindowsIdentityOptions = {},
): Promise<WindowsActingIdentity> {
  if ((options.platform ?? process.platform) !== "win32") {
    throw new Error("Windows acting identity is unavailable on this platform.");
  }
  const run = options.runner?.run ?? defaultRun;
  const result = await run(resolvePowerShell(options), [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodedPowerShell(WINDOWS_IDENTITY_SCRIPT),
  ]);
  const frames = result.stdout
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(FRAME_PREFIX));
  const sid = frames[0]?.slice(FRAME_PREFIX.length).trim();
  if (frames.length !== 1 || sid === undefined || !SID.test(sid)) {
    throw new Error(
      "Windows acting identity helper returned an invalid result.",
    );
  }
  return { sid, pid: process.pid };
}
