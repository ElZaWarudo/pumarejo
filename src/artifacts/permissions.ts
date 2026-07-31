import { execFile } from "node:child_process";
import { chmod, stat } from "node:fs/promises";
import { win32 } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ProtectedPathKind = "directory" | "file";

export interface ArtifactPermissionEnforcer {
  ensureOwnerOnly(path: string, kind: ProtectedPathKind): Promise<void>;
}

export interface PermissionCommandRunner {
  run(
    command: string,
    args: readonly string[],
    options?: { readonly env?: NodeJS.ProcessEnv },
  ): Promise<{ readonly stdout: string; readonly stderr: string }>;
}

const WINDOWS_IDENTITY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$path = [Environment]::GetEnvironmentVariable(
  'PUMAREJO_ARTIFACT_PATH',
  'Process'
)
if ([string]::IsNullOrEmpty($path)) { exit 40 }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = Get-Acl -LiteralPath $path
$owner = $acl.GetOwner([Security.Principal.SecurityIdentifier])
if ($owner.Value -ne $sid.Value) { exit 43 }
Write-Output $sid.Value
`;

const WINDOWS_VERIFY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$path = [Environment]::GetEnvironmentVariable(
  'PUMAREJO_ARTIFACT_PATH',
  'Process'
)
$sidValue = [Environment]::GetEnvironmentVariable(
  'PUMAREJO_ARTIFACT_SID',
  'Process'
)
if (
  [string]::IsNullOrEmpty($path) -or
  $sidValue -notmatch '^S-\d(?:-\d+)+$'
) { exit 40 }
$sid = New-Object Security.Principal.SecurityIdentifier($sidValue)
$verified = Get-Acl -LiteralPath $path
$owner = $verified.GetOwner([Security.Principal.SecurityIdentifier])
$rules = @($verified.Access)
if (
  $owner.Value -ne $sid.Value -or
  -not $verified.AreAccessRulesProtected -or
  $rules.Count -ne 1
) { exit 41 }
$ruleSid = $rules[0].IdentityReference.Translate(
  [Security.Principal.SecurityIdentifier]
)
if (
  $ruleSid.Value -ne $sid.Value -or
  $rules[0].AccessControlType -ne
    [Security.AccessControl.AccessControlType]::Allow -or
  (($rules[0].FileSystemRights -band
    [Security.AccessControl.FileSystemRights]::FullControl) -ne
    [Security.AccessControl.FileSystemRights]::FullControl)
) { exit 42 }
`;

export function createArtifactPermissionEnforcer(
  options: {
    readonly platform?: NodeJS.Platform;
    readonly runner?: PermissionCommandRunner;
    readonly systemRoot?: string;
  } = {},
): ArtifactPermissionEnforcer {
  const platform = options.platform ?? process.platform;
  const runner =
    options.runner ??
    ({
      async run(command, args, commandOptions) {
        return await execFileAsync(command, [...args], {
          encoding: "utf8",
          env: commandOptions?.env,
          shell: false,
          timeout: 15_000,
          windowsHide: true,
          maxBuffer: 64 * 1024,
        });
      },
    } satisfies PermissionCommandRunner);

  return {
    async ensureOwnerOnly(path, kind) {
      if (platform === "win32") {
        const systemRoot = options.systemRoot ?? process.env.SystemRoot;
        if (systemRoot === undefined) throw new Error("SystemRoot missing");
        const environment = {
          ...process.env,
          ComSpec:
            process.env.ComSpec ??
            win32.join(systemRoot, "System32", "cmd.exe"),
          PUMAREJO_ARTIFACT_PATH: path,
          PUMAREJO_ARTIFACT_KIND: kind,
        };
        const powerShell = win32.join(
          systemRoot,
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        );
        const identity = await runner.run(
          powerShell,
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            WINDOWS_IDENTITY_SCRIPT,
          ],
          { env: environment },
        );
        const sid = identity.stdout.trim();
        if (!/^S-\d(?:-\d+)+$/u.test(sid)) {
          throw new Error("Invalid current SID");
        }
        await runner.run(
          win32.join(systemRoot, "System32", "icacls.exe"),
          [
            path,
            "/inheritance:r",
            "/grant:r",
            `*${sid}:${kind === "directory" ? "(OI)(CI)F" : "F"}`,
          ],
          { env: environment },
        );
        await runner.run(
          powerShell,
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            WINDOWS_VERIFY_SCRIPT,
          ],
          {
            env: {
              ...environment,
              PUMAREJO_ARTIFACT_SID: sid,
            },
          },
        );
        return;
      }
      const expected = kind === "directory" ? 0o700 : 0o600;
      await chmod(path, expected);
      const metadata = await stat(path);
      if ((metadata.mode & 0o777) !== expected) {
        throw new Error("owner-only mode verification failed");
      }
    },
  };
}
