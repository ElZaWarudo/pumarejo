import { execFile } from "node:child_process";
import { win32 } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FRAME_PREFIX = "PUMAREJO-MAINTENANCE-IDENTITY/1 ";
const SID = /^S-\d(?:-\d+)+$/u;

export interface WindowsMaintenanceIdentity {
  readonly sid: string;
  readonly pid: number;
  readonly elevatedAdministrator: boolean;
}

export interface WindowsMaintenanceIdentityOptions {
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

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Output ('PUMAREJO-MAINTENANCE-IDENTITY/1 ' + $identity.User.Value + '|' + $(if ($elevated) { '1' } else { '0' }))
`;

function encode(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
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

export async function readWindowsMaintenanceIdentity(
  options: WindowsMaintenanceIdentityOptions = {},
): Promise<WindowsMaintenanceIdentity> {
  if ((options.platform ?? process.platform) !== "win32") {
    throw new Error(
      "Windows maintenance identity is unavailable on this platform.",
    );
  }
  const powershell =
    options.powershellPath ??
    win32.join(
      options.systemRoot ?? process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
  if (!win32.isAbsolute(powershell)) {
    throw new Error("Windows PowerShell path must be absolute.");
  }
  const result = await (options.runner?.run ?? defaultRun)(powershell, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encode(SCRIPT),
  ]);
  const frames = result.stdout
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(FRAME_PREFIX));
  const payload = frames[0]?.slice(FRAME_PREFIX.length).trim();
  const [sid, elevated, ...extra] = payload?.split("|") ?? [];
  if (
    frames.length !== 1 ||
    sid === undefined ||
    !SID.test(sid) ||
    (elevated !== "0" && elevated !== "1") ||
    extra.length > 0
  ) {
    throw new Error(
      "Windows maintenance identity helper returned an invalid result.",
    );
  }
  return { sid, pid: process.pid, elevatedAdministrator: elevated === "1" };
}
