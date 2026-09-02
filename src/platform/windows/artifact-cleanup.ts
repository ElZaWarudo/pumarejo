import { execFile } from "node:child_process";
import { win32 } from "node:path";
import { promisify } from "node:util";
import { deflateRawSync } from "node:zlib";

import type {
  ArtifactCleanupSummary,
  WindowsArtifactDeletionRequest,
  WindowsArtifactInspection,
  WindowsArtifactNativeOperations,
} from "../../artifacts/maintenance.js";

const execFileAsync = promisify(execFile);
const FRAME_PREFIX = "PUMAREJO-ARTIFACT-CLEANUP/1 ";
const MAX_FRAME_BYTES = 64 * 1024;
const ERROR_CODES = new Set([
  "unsafe_symlink",
  "unsafe_junction",
  "unsafe_mount_point",
  "unsafe_reparse_point",
  "ownership_mismatch",
  "manifest_mismatch",
  "target_changed",
  "maintenance_privilege_unavailable",
  "native_cleanup_rejected",
]);

export interface WindowsArtifactNativeOptions {
  readonly platform?: NodeJS.Platform;
  readonly systemRoot?: string;
  readonly powershellPath?: string;
  readonly runner?: {
    run(
      command: string,
      args: readonly string[],
      timeoutMs: number,
    ): Promise<{ readonly stdout: string; readonly stderr: string }>;
  };
}

/**
 * The helper opens each directory without FILE_SHARE_DELETE and keeps every
 * ancestor handle open while resolving and deleting descendants. Every entry
 * is opened with FILE_FLAG_OPEN_REPARSE_POINT, validated by handle, and then
 * marked for deletion through that same handle. It never follows a reparse
 * point and never delegates recursive removal to a path-based shell command.
 */
export const WINDOWS_ARTIFACT_CLEANUP_HELPER = String.raw`
param([string] $Payload)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class PumarejoArtifactNative {
  private const uint FILE_READ_ATTRIBUTES = 0x00000080;
  private const uint READ_CONTROL = 0x00020000;
  private const uint DELETE = 0x00010000;
  private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
  private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
  private const uint FILE_ATTRIBUTE_REPARSE_POINT = 0x00000400;
  private const uint IO_REPARSE_TAG_MOUNT_POINT = 0xA0000003;
  private const uint IO_REPARSE_TAG_SYMLINK = 0xA000000C;
  private const uint OWNER_SECURITY_INFORMATION = 0x00000001;
  private const uint TOKEN_QUERY = 0x00000008;
  private const uint TOKEN_ADJUST_PRIVILEGES = 0x00000020;
  private const uint SE_PRIVILEGE_ENABLED = 0x00000002;
  private const int ERROR_NOT_ALL_ASSIGNED = 1300;
  private const uint FILE_DISPOSITION_FLAG_DELETE = 0x00000001;
  private const uint FILE_DISPOSITION_FLAG_POSIX_SEMANTICS = 0x00000002;
  private const uint FILE_DISPOSITION_FLAG_IGNORE_READONLY_ATTRIBUTE = 0x00000010;

  [StructLayout(LayoutKind.Sequential)]
  private struct FILE_ID_128 { public ulong LowPart; public ulong HighPart; }
  [StructLayout(LayoutKind.Sequential)]
  private struct FILE_ID_INFO { public ulong VolumeSerialNumber; public FILE_ID_128 FileId; }
  [StructLayout(LayoutKind.Sequential)]
  private struct FILE_ATTRIBUTE_TAG_INFO { public uint FileAttributes; public uint ReparseTag; }
  [StructLayout(LayoutKind.Sequential)]
  private struct BY_HANDLE_FILE_INFORMATION {
    public uint FileAttributes;
    public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
    public uint VolumeSerialNumber;
    public uint FileSizeHigh;
    public uint FileSizeLow;
    public uint NumberOfLinks;
    public uint FileIndexHigh;
    public uint FileIndexLow;
  }
  [StructLayout(LayoutKind.Sequential)]
  private struct FILE_DISPOSITION_INFO_EX { public uint Flags; }
  [StructLayout(LayoutKind.Sequential)]
  private struct FILE_DISPOSITION_INFO { [MarshalAs(UnmanagedType.Bool)] public bool DeleteFile; }
  [StructLayout(LayoutKind.Sequential)]
  private struct LUID { public uint LowPart; public int HighPart; }
  [StructLayout(LayoutKind.Sequential)]
  private struct TOKEN_PRIVILEGES { public uint PrivilegeCount; public LUID Luid; public uint Attributes; }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern SafeFileHandle CreateFileW(string path, uint access, FileShare share, IntPtr security, FileMode mode, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int infoClass, out FILE_ID_INFO info, uint size);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int infoClass, out FILE_ATTRIBUTE_TAG_INFO info, uint size);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out BY_HANDLE_FILE_INFORMATION info);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint length, uint flags);
  [DllImport("advapi32.dll", SetLastError = true)]
  private static extern uint GetSecurityInfo(SafeFileHandle handle, int objectType, uint securityInfo, out IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl, out IntPtr descriptor);
  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr pointer);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool SetFileInformationByHandle(SafeFileHandle handle, int infoClass, ref FILE_DISPOSITION_INFO_EX info, uint size);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool SetFileInformationByHandle(SafeFileHandle handle, int infoClass, ref FILE_DISPOSITION_INFO info, uint size);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool GetVolumeNameForVolumeMountPointW(string mountPoint, StringBuilder volumeName, uint length);
  [DllImport("kernel32.dll")]
  private static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr handle);
  [DllImport("advapi32.dll", SetLastError = true)]
  private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool LookupPrivilegeValueW(string systemName, string name, out LUID luid);
  [DllImport("advapi32.dll", SetLastError = true)]
  private static extern bool AdjustTokenPrivileges(IntPtr token, bool disableAll, ref TOKEN_PRIVILEGES state, uint length, IntPtr previous, IntPtr required);

  public sealed class Snapshot {
    public string CanonicalPath { get; set; }
    public string VolumeSerialNumber { get; set; }
    public string FileId { get; set; }
    public string OwnerSid { get; set; }
    public string CreationTimeFiletime { get; set; }
    public string LastWriteTimeFiletime { get; set; }
    public uint Attributes { get; set; }
    public uint ReparseTag { get; set; }
    public long Size { get; set; }
    public bool Directory { get; set; }
  }

  public sealed class Expected {
    public string CanonicalPath { get; set; }
    public string VolumeSerialNumber { get; set; }
    public string FileId { get; set; }
    public string OwnerSid { get; set; }
    public string CreationTimeFiletime { get; set; }
    public string LastWriteTimeFiletime { get; set; }
    public uint Attributes { get; set; }
    public uint ReparseTag { get; set; }
  }

  public sealed class Summary {
    public long Files { get; set; }
    public long Directories { get; set; }
    public long Bytes { get; set; }
  }

  private static SafeFileHandle OpenLocked(string path, bool deleteAccess) {
    uint access = FILE_READ_ATTRIBUTES | READ_CONTROL | (deleteAccess ? DELETE : 0);
    var handle = CreateFileW(path, access, FileShare.Read | FileShare.Write, IntPtr.Zero, FileMode.Open, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, IntPtr.Zero);
    if (handle == null || handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
    return handle;
  }

  private static bool EnablePrivilege(string name) {
    IntPtr token;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY | TOKEN_ADJUST_PRIVILEGES, out token))
      throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      LUID luid;
      if (!LookupPrivilegeValueW(null, name, out luid))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      var state = new TOKEN_PRIVILEGES {
        PrivilegeCount = 1,
        Luid = luid,
        Attributes = SE_PRIVILEGE_ENABLED,
      };
      if (!AdjustTokenPrivileges(token, false, ref state, 0, IntPtr.Zero, IntPtr.Zero))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      return Marshal.GetLastWin32Error() != ERROR_NOT_ALL_ASSIGNED;
    } finally {
      CloseHandle(token);
    }
  }

  private static void RequireMaintenancePrivileges(bool required) {
    if (!required) return;
    if (!EnablePrivilege("SeBackupPrivilege") || !EnablePrivilege("SeRestorePrivilege"))
      throw new InvalidOperationException("maintenance_privilege_unavailable");
  }

  private static string FinalPath(SafeFileHandle handle) {
    var builder = new StringBuilder(32768);
    uint count = GetFinalPathNameByHandleW(handle, builder, (uint)builder.Capacity, 0);
    if (count == 0 || count >= builder.Capacity) throw new Win32Exception(Marshal.GetLastWin32Error());
    string value = builder.ToString();
    if (value.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) return @"\\" + value.Substring(8);
    return value.StartsWith(@"\\?\", StringComparison.OrdinalIgnoreCase) ? value.Substring(4) : value;
  }

  private static string Owner(SafeFileHandle handle) {
    IntPtr owner, descriptor;
    uint result = GetSecurityInfo(handle, 1, OWNER_SECURITY_INFORMATION, out owner, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, out descriptor);
    if (result != 0) throw new Win32Exception((int)result);
    try { return new SecurityIdentifier(owner).Value; }
    finally { if (descriptor != IntPtr.Zero) LocalFree(descriptor); }
  }

  private static ulong FileTime(System.Runtime.InteropServices.ComTypes.FILETIME value) {
    return ((ulong)(uint)value.dwHighDateTime << 32) | (uint)value.dwLowDateTime;
  }

  private static string FileId(FILE_ID_128 value) {
    byte[] bytes = new byte[16];
    Array.Copy(BitConverter.GetBytes(value.LowPart), 0, bytes, 0, 8);
    Array.Copy(BitConverter.GetBytes(value.HighPart), 0, bytes, 8, 8);
    return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
  }

  private static Snapshot ReadSnapshot(SafeFileHandle handle) {
    FILE_ID_INFO identity;
    FILE_ATTRIBUTE_TAG_INFO tag;
    BY_HANDLE_FILE_INFORMATION info;
    if (!GetFileInformationByHandleEx(handle, 18, out identity, (uint)Marshal.SizeOf(typeof(FILE_ID_INFO)))) throw new Win32Exception(Marshal.GetLastWin32Error());
    if (!GetFileInformationByHandleEx(handle, 9, out tag, (uint)Marshal.SizeOf(typeof(FILE_ATTRIBUTE_TAG_INFO)))) throw new Win32Exception(Marshal.GetLastWin32Error());
    if (!GetFileInformationByHandle(handle, out info)) throw new Win32Exception(Marshal.GetLastWin32Error());
    return new Snapshot {
      CanonicalPath = FinalPath(handle),
      VolumeSerialNumber = identity.VolumeSerialNumber.ToString("x16", CultureInfo.InvariantCulture),
      FileId = FileId(identity.FileId),
      OwnerSid = Owner(handle),
      CreationTimeFiletime = FileTime(info.CreationTime).ToString(CultureInfo.InvariantCulture),
      LastWriteTimeFiletime = FileTime(info.LastWriteTime).ToString(CultureInfo.InvariantCulture),
      Attributes = tag.FileAttributes,
      ReparseTag = tag.ReparseTag,
      Size = ((long)info.FileSizeHigh << 32) | info.FileSizeLow,
      Directory = (tag.FileAttributes & (uint)FileAttributes.Directory) != 0,
    };
  }

  private static bool IsRemovableJunction(Snapshot snapshot, string path) {
    if (snapshot.ReparseTag == 0 && (snapshot.Attributes & FILE_ATTRIBUTE_REPARSE_POINT) == 0) return false;
    if (snapshot.ReparseTag == IO_REPARSE_TAG_SYMLINK) throw new InvalidOperationException("unsafe_symlink");
    if (snapshot.ReparseTag == IO_REPARSE_TAG_MOUNT_POINT) {
      var volume = new StringBuilder(64);
      string candidate = path.EndsWith("\\", StringComparison.Ordinal) ? path : path + "\\";
      if (GetVolumeNameForVolumeMountPointW(candidate, volume, (uint)volume.Capacity)) throw new InvalidOperationException("unsafe_mount_point");
      return true;
    }
    throw new InvalidOperationException("unsafe_reparse_point");
  }

  private static void RejectReparse(Snapshot snapshot, string path) {
    if (IsRemovableJunction(snapshot, path)) throw new InvalidOperationException("unsafe_junction");
  }

  private static bool SamePath(string left, string right) {
    return String.Equals(Path.GetFullPath(left).TrimEnd('\\'), Path.GetFullPath(right).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);
  }

  private static bool Contained(string root, string candidate) {
    string prefix = Path.GetFullPath(root).TrimEnd('\\') + "\\";
    string full = Path.GetFullPath(candidate);
    return full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
  }

  private static void ValidateExpected(Snapshot actual, Expected expected) {
    if (!SamePath(actual.CanonicalPath, expected.CanonicalPath) ||
        actual.VolumeSerialNumber != expected.VolumeSerialNumber ||
        actual.FileId != expected.FileId ||
        actual.CreationTimeFiletime != expected.CreationTimeFiletime ||
        actual.LastWriteTimeFiletime != expected.LastWriteTimeFiletime ||
        actual.Attributes != expected.Attributes || actual.ReparseTag != expected.ReparseTag)
      throw new InvalidOperationException("target_changed");
    if (actual.OwnerSid != expected.OwnerSid) throw new InvalidOperationException("ownership_mismatch");
    RejectReparse(actual, actual.CanonicalPath);
  }

  private static void ValidateDurableExpected(Snapshot actual, Expected expected) {
    if (!SamePath(actual.CanonicalPath, expected.CanonicalPath) ||
        actual.VolumeSerialNumber != expected.VolumeSerialNumber ||
        actual.FileId != expected.FileId ||
        actual.CreationTimeFiletime != expected.CreationTimeFiletime ||
        actual.Attributes != expected.Attributes || actual.ReparseTag != expected.ReparseTag)
      throw new InvalidOperationException("target_changed");
    if (actual.OwnerSid != expected.OwnerSid) throw new InvalidOperationException("ownership_mismatch");
    RejectReparse(actual, actual.CanonicalPath);
  }

  public static Snapshot Inspect(string path, bool maintenancePrivileges) {
    RequireMaintenancePrivileges(maintenancePrivileges);
    using (var handle = OpenLocked(path, false)) return ReadSnapshot(handle);
  }

  private static void ScanDirectory(string path, string root, string owner, Summary summary) {
    List<string> entries = new List<string>(Directory.EnumerateFileSystemEntries(path));
    foreach (string entry in entries) {
      using (var handle = OpenLocked(entry, false)) {
        Snapshot snapshot = ReadSnapshot(handle);
        bool junction = IsRemovableJunction(snapshot, entry);
        if (!Contained(root, snapshot.CanonicalPath)) throw new InvalidOperationException("target_changed");
        if (snapshot.OwnerSid != owner) throw new InvalidOperationException("ownership_mismatch");
        if (junction) {
          // A directory junction is counted and removed as an opaque leaf. The
          // helper never enumerates through it or opens its substitute target.
          summary.Directories++;
        } else if (snapshot.Directory) {
          summary.Directories++;
          ScanDirectory(entry, root, owner, summary);
        } else {
          summary.Files++;
          checked { summary.Bytes += snapshot.Size; }
        }
      }
    }
  }

  private static Summary ScanLocked(string path, SafeFileHandle rootHandle, Expected expected) {
    Snapshot root = ReadSnapshot(rootHandle);
    ValidateExpected(root, expected);
    var summary = new Summary { Directories = 1 };
    ScanDirectory(path, root.CanonicalPath, root.OwnerSid, summary);
    ValidateExpected(ReadSnapshot(rootHandle), expected);
    return summary;
  }

  public static Summary Preflight(string path, Expected expected, bool maintenancePrivileges) {
    RequireMaintenancePrivileges(maintenancePrivileges);
    using (var root = OpenLocked(path, false)) return ScanLocked(path, root, expected);
  }

  private static void MarkDelete(SafeFileHandle handle) {
    var extended = new FILE_DISPOSITION_INFO_EX {
      Flags = FILE_DISPOSITION_FLAG_DELETE | FILE_DISPOSITION_FLAG_POSIX_SEMANTICS | FILE_DISPOSITION_FLAG_IGNORE_READONLY_ATTRIBUTE
    };
    if (SetFileInformationByHandle(handle, 21, ref extended, (uint)Marshal.SizeOf(typeof(FILE_DISPOSITION_INFO_EX)))) return;
    int extendedError = Marshal.GetLastWin32Error();
    var basic = new FILE_DISPOSITION_INFO { DeleteFile = true };
    if (!SetFileInformationByHandle(handle, 4, ref basic, (uint)Marshal.SizeOf(typeof(FILE_DISPOSITION_INFO))))
      throw new Win32Exception(extendedError == 0 ? Marshal.GetLastWin32Error() : extendedError);
  }

  private static void DeleteChildren(string path, string root, string owner) {
    List<string> entries = new List<string>(Directory.EnumerateFileSystemEntries(path));
    foreach (string entry in entries) {
      using (var handle = OpenLocked(entry, true)) {
        Snapshot snapshot = ReadSnapshot(handle);
        bool junction = IsRemovableJunction(snapshot, entry);
        if (!Contained(root, snapshot.CanonicalPath)) throw new InvalidOperationException("target_changed");
        if (snapshot.OwnerSid != owner) throw new InvalidOperationException("ownership_mismatch");
        if (snapshot.Directory && !junction) DeleteChildren(entry, root, owner);
        MarkDelete(handle);
      }
    }
  }

  public static Summary DeleteTree(string path, Expected expected, bool maintenancePrivileges) {
    RequireMaintenancePrivileges(maintenancePrivileges);
    using (var root = OpenLocked(path, true)) {
      Summary summary = ScanLocked(path, root, expected);
      DeleteChildren(path, expected.CanonicalPath, expected.OwnerSid);
      // Deleting children legitimately updates the root's last-write time.
      // Revalidate only the durable object identity before marking this same
      // held handle for deletion.
      ValidateDurableExpected(ReadSnapshot(root), expected);
      MarkDelete(root);
      return summary;
    }
  }
}
"@

function Write-Frame([object] $value) {
  $json = $value | ConvertTo-Json -Compress -Depth 8
  Write-Output ('PUMAREJO-ARTIFACT-CLEANUP/1 ' + $json)
}
function Expected([object] $source) {
  $value = [PumarejoArtifactNative+Expected]::new()
  $value.CanonicalPath = [string]$source.canonicalPath
  $value.VolumeSerialNumber = [string]$source.filesystemIdentity.volumeSerialNumber
  $value.FileId = [string]$source.filesystemIdentity.fileId
  $value.OwnerSid = [string]$source.ownerSid
  $value.CreationTimeFiletime = [string]$source.creationTimeFiletime
  $value.LastWriteTimeFiletime = [string]$source.lastWriteTimeFiletime
  $value.Attributes = [uint32]$source.attributes
  $value.ReparseTag = [uint32]$source.reparseTag
  return $value
}
function Snapshot([object] $value) {
  return @{
    canonicalPath=$value.CanonicalPath
    filesystemIdentity=@{ volumeSerialNumber=$value.VolumeSerialNumber; fileId=$value.FileId }
    ownerSid=$value.OwnerSid
    creationTimeFiletime=$value.CreationTimeFiletime
    lastWriteTimeFiletime=$value.LastWriteTimeFiletime
    attributes=[uint32]$value.Attributes
    reparseTag=[uint32]$value.ReparseTag
  }
}
function Summary([object] $value) {
  return @{ files=[long]$value.Files; directories=[long]$value.Directories; bytes=[long]$value.Bytes }
}

$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
try {
  if ($payload.op -eq 'inspect') {
    Write-Frame @{ ok=$true; inspection=(Snapshot ([PumarejoArtifactNative]::Inspect([string]$payload.path, [bool]$payload.maintenancePrivileges))) }
  } elseif ($payload.op -eq 'preflight') {
    Write-Frame @{ ok=$true; summary=(Summary ([PumarejoArtifactNative]::Preflight([string]$payload.path, (Expected $payload.expected), [bool]$payload.maintenancePrivileges))) }
  } elseif ($payload.op -eq 'delete') {
    Write-Frame @{ ok=$true; summary=(Summary ([PumarejoArtifactNative]::DeleteTree([string]$payload.path, (Expected $payload.expected), [bool]$payload.maintenancePrivileges))) }
  } else {
    Write-Frame @{ ok=$false; code='native_cleanup_rejected' }
  }
} catch {
  $known = @('unsafe_symlink','unsafe_junction','unsafe_mount_point','unsafe_reparse_point','ownership_mismatch','target_changed','maintenance_privilege_unavailable')
  $code = $null
  $current = $_.Exception
  while ($null -ne $current) {
    foreach ($candidate in $known) {
      if ([string]$current.Message -match [regex]::Escape($candidate)) { $code = $candidate; break }
    }
    if ($null -ne $code) { break }
    if ($current -is [ComponentModel.Win32Exception]) {
      $code = 'win32_' + [string]$current.NativeErrorCode
      break
    }
    $current = $current.InnerException
  }
  if ($null -eq $code) { $code = 'native_cleanup_rejected' }
  Write-Frame @{ ok=$false; code=$code }
}
`;

function encodeScript(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function helperArgs(payload: Record<string, unknown>): string[] {
  const payloadScript = WINDOWS_ARTIFACT_CLEANUP_HELPER.replace(
    "param([string] $Payload)",
    `$Payload = '${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}'`,
  );
  const compressed = deflateRawSync(
    Buffer.from(payloadScript, "utf16le"),
  ).toString("base64");
  const bootstrap = [
    `$compressed = '${compressed}'`,
    "$bytes = [Convert]::FromBase64String($compressed)",
    "$stream = [IO.MemoryStream]::new($bytes)",
    "$deflate = [IO.Compression.DeflateStream]::new($stream, [IO.Compression.CompressionMode]::Decompress)",
    "$reader = [IO.StreamReader]::new($deflate, [Text.Encoding]::Unicode)",
    "$source = $reader.ReadToEnd()",
    "$reader.Dispose()",
    "& ([ScriptBlock]::Create($source))",
  ].join("; ");
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodeScript(bootstrap),
  ];
}

async function defaultRun(
  command: string,
  args: readonly string[],
  timeoutMs: number,
) {
  const result = await execFileAsync(command, [...args], {
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: MAX_FRAME_BYTES * 2,
  });
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}

function parseFrame(stdout: string): Record<string, unknown> {
  const lines = stdout
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(FRAME_PREFIX));
  if (
    lines.length !== 1 ||
    Buffer.byteLength(lines[0] ?? "", "utf8") > MAX_FRAME_BYTES
  ) {
    throw new Error("native_cleanup_rejected");
  }
  try {
    const value: unknown = JSON.parse(
      (lines[0] ?? "").slice(FRAME_PREFIX.length),
    );
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error();
    const frame = value as Record<string, unknown>;
    if (frame.ok !== true) {
      const code =
        typeof frame.code === "string" &&
        (ERROR_CODES.has(frame.code) || /^win32_\d+$/u.test(frame.code))
          ? frame.code
          : "native_cleanup_rejected";
      throw new Error(code);
    }
    return frame;
  } catch (error) {
    if (
      error instanceof Error &&
      (ERROR_CODES.has(error.message) || /^win32_\d+$/u.test(error.message))
    )
      throw error;
    throw new Error("native_cleanup_rejected");
  }
}

function validInspection(value: unknown): value is WindowsArtifactInspection {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const item = value as Record<string, unknown>;
  const identity = item.filesystemIdentity as
    | Record<string, unknown>
    | undefined;
  return (
    Object.keys(item).sort().join(",") ===
      "attributes,canonicalPath,creationTimeFiletime,filesystemIdentity,lastWriteTimeFiletime,ownerSid,reparseTag" &&
    typeof item.canonicalPath === "string" &&
    identity !== undefined &&
    Object.keys(identity).sort().join(",") === "fileId,volumeSerialNumber" &&
    typeof identity.volumeSerialNumber === "string" &&
    /^[a-f0-9]{16}$/u.test(identity.volumeSerialNumber) &&
    typeof identity.fileId === "string" &&
    /^[a-f0-9]{32}$/u.test(identity.fileId) &&
    typeof item.ownerSid === "string" &&
    /^S-\d(?:-\d+)+$/u.test(item.ownerSid) &&
    typeof item.creationTimeFiletime === "string" &&
    /^\d{1,20}$/u.test(item.creationTimeFiletime) &&
    typeof item.lastWriteTimeFiletime === "string" &&
    /^\d{1,20}$/u.test(item.lastWriteTimeFiletime) &&
    typeof item.attributes === "number" &&
    Number.isInteger(item.attributes) &&
    typeof item.reparseTag === "number" &&
    Number.isInteger(item.reparseTag)
  );
}

function validSummary(value: unknown): value is ArtifactCleanupSummary {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const item = value as Record<string, unknown>;
  return (
    Object.keys(item).sort().join(",") === "bytes,directories,files" &&
    [item.files, item.directories, item.bytes].every(
      (entry) =>
        typeof entry === "number" && Number.isSafeInteger(entry) && entry >= 0,
    )
  );
}

function expectedPayload(expected: WindowsArtifactInspection) {
  return {
    canonicalPath: expected.canonicalPath,
    filesystemIdentity: expected.filesystemIdentity,
    ownerSid: expected.ownerSid,
    creationTimeFiletime: expected.creationTimeFiletime,
    lastWriteTimeFiletime: expected.lastWriteTimeFiletime,
    attributes: expected.attributes,
    reparseTag: expected.reparseTag,
  };
}

export function createWindowsArtifactNativeOperations(
  options: WindowsArtifactNativeOptions = {},
): WindowsArtifactNativeOperations {
  const platform = options.platform ?? process.platform;
  const powershell =
    options.powershellPath ??
    win32.join(
      options.systemRoot ?? process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
  const run = options.runner?.run ?? defaultRun;
  const invoke = async (
    payload: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> => {
    if (platform !== "win32" || !win32.isAbsolute(powershell)) {
      throw new Error("native_cleanup_rejected");
    }
    const result = await run(powershell, helperArgs(payload), timeoutMs);
    return parseFrame(result.stdout);
  };
  return {
    inspect: async (path, maintenancePrivileges = false) => {
      if (!win32.isAbsolute(path)) throw new Error("native_cleanup_rejected");
      const frame = await invoke(
        { op: "inspect", path, maintenancePrivileges },
        30_000,
      );
      if (!validInspection(frame.inspection))
        throw new Error("native_cleanup_rejected");
      return frame.inspection;
    },
    preflight: async (request) => {
      const frame = await invoke(
        {
          op: "preflight",
          path: request.targetPath,
          expected: expectedPayload(request.expected),
          maintenancePrivileges: request.maintenancePrivileges === true,
        },
        30 * 60_000,
      );
      if (!validSummary(frame.summary))
        throw new Error("native_cleanup_rejected");
      return frame.summary;
    },
    delete: async (request: WindowsArtifactDeletionRequest) => {
      const frame = await invoke(
        {
          op: "delete",
          path: request.targetPath,
          expected: expectedPayload(request.expected),
          maintenancePrivileges: request.maintenancePrivileges === true,
        },
        60 * 60_000,
      );
      if (!validSummary(frame.summary))
        throw new Error("native_cleanup_rejected");
      return frame.summary;
    },
  };
}
