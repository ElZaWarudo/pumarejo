import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { win32 } from "node:path";
import { deflateRawSync } from "node:zlib";
import { promisify } from "node:util";

import type {
  NativeProcessCustodyOperations,
  NativeProcessOperations,
  SystemIdentity,
} from "../tracked-process.js";
import type { ProcessCustodyAttachment, SpawnRequest } from "../types.js";

const execFileAsync = promisify(execFile);

/** The helper is deliberately embedded in the package. It is encoded before
 * being passed to powershell.exe, so no command line or project path is
 * interpreted by a shell. */
export const WINDOWS_JOB_HELPER = String.raw`
param([string] $Payload)
$ErrorActionPreference = 'Stop'
$MaxFrameBytes = 65536
Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

public static class PumarejoJobNative {
  public const uint CREATE_SUSPENDED = 0x00000004;
  public const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
  public const uint CREATE_NO_WINDOW = 0x08000000;
  public const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
  public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
  public const uint STARTF_USESTDHANDLES = 0x00000100;
  public const uint HANDLE_FLAG_INHERIT = 0x00000001;
  public const uint PROC_THREAD_ATTRIBUTE_HANDLE_LIST = 0x00020002;

  [StructLayout(LayoutKind.Sequential)]
  public struct SECURITY_ATTRIBUTES { public int Length; public IntPtr SecurityDescriptor; public int InheritHandle; }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct STARTUPINFO {
    public uint cb; public string lpReserved; public string lpDesktop;
    public string lpTitle; public uint dwX; public uint dwY;
    public uint dwXSize; public uint dwYSize; public uint dwXCountChars;
    public uint dwYCountChars; public uint dwFillAttribute; public uint dwFlags;
    public short wShowWindow; public short cbReserved2; public IntPtr lpReserved2;
    public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION { public IntPtr hProcess; public IntPtr hThread; public uint dwProcessId; public uint dwThreadId; }
  [StructLayout(LayoutKind.Sequential)]
  public struct IO_COUNTERS { public ulong ReadOperationCount; public ulong WriteOperationCount; public ulong OtherOperationCount; public ulong ReadTransferCount; public ulong WriteTransferCount; public ulong OtherTransferCount; }
  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_BASIC_LIMIT_INFORMATION { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION { public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CreateProcessW(string app, string commandLine, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CreatePipe(out IntPtr readPipe, out IntPtr writePipe, ref SECURITY_ATTRIBUTES attrs, uint size);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool InitializeProcThreadAttributeList(IntPtr attributeList, uint attributeCount, uint flags, ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool UpdateProcThreadAttribute(IntPtr attributeList, uint flags, IntPtr attribute, IntPtr value, UIntPtr size, IntPtr previous, IntPtr returnSize);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern void DeleteProcThreadAttributeList(IntPtr attributeList);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateJobObjectW(IntPtr attrs, string name);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, uint length);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetExitCodeProcess(IntPtr process, out uint code);

  public static long FileTimeToUnixMilliseconds(long value) {
    return (value - 116444736000000000L) / 10000L;
  }

  private static void EnsurePipe(out IntPtr readPipe, out IntPtr writePipe, out SECURITY_ATTRIBUTES attrs) {
    attrs = new SECURITY_ATTRIBUTES(); attrs.Length = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); attrs.InheritHandle = 1;
    if (!CreatePipe(out readPipe, out writePipe, ref attrs, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
  }

  private static void CloseIfOpen(IntPtr handle) {
    if (handle != IntPtr.Zero) CloseHandle(handle);
  }

  private static void TerminateAndWait(IntPtr process) {
    if (process == IntPtr.Zero) return;
    TerminateProcess(process, 1);
    WaitForSingleObject(process, 10000);
  }

  private static void CloseStartupAttributeList(IntPtr attributeList, IntPtr handleBuffer) {
    if (attributeList != IntPtr.Zero) DeleteProcThreadAttributeList(attributeList);
    if (handleBuffer != IntPtr.Zero) Marshal.FreeHGlobal(handleBuffer);
    if (attributeList != IntPtr.Zero) Marshal.FreeHGlobal(attributeList);
  }

  public static object Launch(string commandLine, string cwd) {
    var si = new STARTUPINFOEX();
    si.StartupInfo.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFOEX));
    var flags = CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT;
    IntPtr targetInput = IntPtr.Zero, helperInput = IntPtr.Zero;
    IntPtr helperOutput = IntPtr.Zero, targetOutput = IntPtr.Zero;
    IntPtr helperError = IntPtr.Zero, targetError = IntPtr.Zero;
    IntPtr attributeList = IntPtr.Zero, handleBuffer = IntPtr.Zero;
    SECURITY_ATTRIBUTES attrs;
    PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
    var processCreated = false;
    try {
      EnsurePipe(out targetInput, out helperInput, out attrs);
      EnsurePipe(out helperOutput, out targetOutput, out attrs);
      EnsurePipe(out helperError, out targetError, out attrs);
      // The target gets only the three intended stdio handles. The helper's
      // controller handles are explicitly non-inheritable as defense in depth;
      // the attribute allow-list below is the authoritative boundary.
      if (!SetHandleInformation(helperInput, HANDLE_FLAG_INHERIT, 0) ||
          !SetHandleInformation(helperOutput, HANDLE_FLAG_INHERIT, 0) ||
          !SetHandleInformation(helperError, HANDLE_FLAG_INHERIT, 0) ||
          !SetHandleInformation(targetInput, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) ||
          !SetHandleInformation(targetOutput, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) ||
          !SetHandleInformation(targetError, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
      si.StartupInfo.hStdInput = targetInput;
      si.StartupInfo.hStdOutput = targetOutput;
      si.StartupInfo.hStdError = targetError;

      IntPtr attributeSize = IntPtr.Zero;
      InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeSize);
      if (attributeSize == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
      attributeList = Marshal.AllocHGlobal(attributeSize);
      if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeSize))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      handleBuffer = Marshal.AllocHGlobal(IntPtr.Size * 3);
      Marshal.WriteIntPtr(handleBuffer, 0 * IntPtr.Size, targetInput);
      Marshal.WriteIntPtr(handleBuffer, 1 * IntPtr.Size, targetOutput);
      Marshal.WriteIntPtr(handleBuffer, 2 * IntPtr.Size, targetError);
      if (!UpdateProcThreadAttribute(
          attributeList,
          0,
          new IntPtr(PROC_THREAD_ATTRIBUTE_HANDLE_LIST),
          handleBuffer,
          (UIntPtr)(IntPtr.Size * 3),
          IntPtr.Zero,
          IntPtr.Zero))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      si.lpAttributeList = attributeList;

      if (!CreateProcessW(null, commandLine, IntPtr.Zero, IntPtr.Zero, true, flags, IntPtr.Zero, cwd, ref si, out pi))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      processCreated = true;
    } catch {
      if (processCreated) TerminateAndWait(pi.hProcess);
      CloseIfOpen(targetInput); CloseIfOpen(helperInput); CloseIfOpen(helperOutput); CloseIfOpen(targetOutput); CloseIfOpen(helperError); CloseIfOpen(targetError); throw;
    } finally {
      CloseStartupAttributeList(attributeList, handleBuffer);
    }
    // The parent/helper retains only the read ends for target output. Closing
    // the input writer makes the target's non-control stdin an immediate EOF.
    CloseIfOpen(targetInput); CloseIfOpen(helperInput); CloseIfOpen(targetOutput); CloseIfOpen(targetError);
    var job = CreateJobObjectW(IntPtr.Zero, null);
    if (job == IntPtr.Zero) {
      var error = new Win32Exception(Marshal.GetLastWin32Error());
      TerminateAndWait(pi.hProcess);
      CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
      CloseIfOpen(helperOutput); CloseIfOpen(helperError);
      throw error;
    }
    try {
      var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION(); limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION)))) throw new Win32Exception(Marshal.GetLastWin32Error());
      if (!AssignProcessToJobObject(job, pi.hProcess)) throw new Win32Exception(Marshal.GetLastWin32Error());
      long creationTime, exitTime, kernelTime, userTime;
      if (!GetProcessTimes(pi.hProcess, out creationTime, out exitTime, out kernelTime, out userTime)) throw new Win32Exception(Marshal.GetLastWin32Error());
      if (ResumeThread(pi.hThread) == 0xffffffff) throw new Win32Exception(Marshal.GetLastWin32Error());
      CloseHandle(pi.hThread);
      return new object[] { (int)pi.dwProcessId, FileTimeToUnixMilliseconds(creationTime), job, pi.hProcess, helperOutput, helperError };
    } catch {
      // Terminate through the held process handle as well as the Job. This
      // covers failures before assignment, where closing an empty Job cannot
      // dispose the still-suspended target.
      TerminateJobObject(job, 1);
      TerminateAndWait(pi.hProcess);
      CloseHandle(job); CloseHandle(pi.hThread); CloseHandle(pi.hProcess); CloseIfOpen(helperOutput); CloseIfOpen(helperError); throw;
    }
  }

  private static readonly object FrameLock = new object();

  public static void WriteFrame(string json) {
    lock (FrameLock) {
      Console.Out.WriteLine("PUMAREJO-JOB/1 " + json);
      Console.Out.Flush();
    }
  }

  private static void Pump(IntPtr handle, string stream) {
    try {
      using (var file = new FileStream(new SafeFileHandle(handle, true), FileAccess.Read, 8192, false)) {
        var buffer = new byte[8192];
        int count;
        while ((count = file.Read(buffer, 0, buffer.Length)) > 0) {
          var data = Convert.ToBase64String(buffer, 0, count);
          WriteFrame("{\"op\":\"output\",\"stream\":\"" + stream + "\",\"data\":\"" + data + "\"}");
        }
      }
    } catch { /* Target output is diagnostic only; custody remains authoritative. */ }
  }

  public static void StartOutputPumps(IntPtr stdout, IntPtr stderr) {
    Task.Run(() => Pump(stdout, "stdout"));
    Task.Run(() => Pump(stderr, "stderr"));
  }
}
"@

 $ControllerInput = [Console]::OpenStandardInput()
function Read-Frame {
  $builder = New-Object System.Text.StringBuilder
  while ($true) {
    $char = $ControllerInput.ReadByte()
    if ($char -lt 0) { return $null }
    if ($char -eq 10) { break }
    if ($char -ne 13) {
      [void]$builder.Append([char]$char)
      if ($builder.Length -gt $MaxFrameBytes) { throw 'frame-too-large' }
    }
  }
  return $builder.ToString()
}
function Write-Frame([object] $Value) {
  $json = $Value | ConvertTo-Json -Compress -Depth 5
  if ([Text.Encoding]::UTF8.GetByteCount($json) -gt $MaxFrameBytes) { throw 'frame-too-large' }
  [PumarejoJobNative]::WriteFrame($json)
}

$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
$native = $null
$processHandle = [IntPtr]::Zero
$jobHandle = [IntPtr]::Zero
try {
  if ($payload.op -eq 'probe') {
    $test = [PumarejoJobNative]::CreateJobObjectW([IntPtr]::Zero, $null)
    if ($test -eq [IntPtr]::Zero) { throw 'job-unavailable' }
    $limits = New-Object PumarejoJobNative+JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    $limits.BasicLimitInformation.LimitFlags = [PumarejoJobNative]::JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    $ok = [PumarejoJobNative]::SetInformationJobObject($test, 9, [ref]$limits, [uint32][Runtime.InteropServices.Marshal]::SizeOf($limits))
    [PumarejoJobNative]::CloseHandle($test) | Out-Null
    if (!$ok) { throw 'job-configure-failed' }
    Write-Frame @{ op='ready'; supported=$true; killOnClose=$true }
    exit 0
  }
  $native = [PumarejoJobNative]::Launch([string]$payload.commandLine, [string]$payload.cwd)
  $processId = [int]$native[0]; $startedAt = [long]$native[1]
  $jobHandle = [IntPtr]$native[2]; $processHandle = [IntPtr]$native[3]
  [PumarejoJobNative]::StartOutputPumps([IntPtr]$native[4], [IntPtr]$native[5])
  Write-Frame @{ op='attached'; pid=$processId; startedAt=$startedAt; killOnClose=$true }
  while ($true) {
    $frame = Read-Frame
    if ($null -eq $frame) { [PumarejoJobNative]::TerminateJobObject($jobHandle, 1) | Out-Null; break }
    try { $command = $frame | ConvertFrom-Json } catch { Write-Frame @{ op='error'; code='malformed-frame' }; continue }
    if ($command.op -eq 'inspect') {
      $exitCode = [uint32]0
      $alive = [PumarejoJobNative]::GetExitCodeProcess($processHandle, [ref]$exitCode) -and $exitCode -eq 259
      Write-Frame @{ op='inspect'; pid=$processId; startedAt=$startedAt; descendantsComplete=$alive }
      continue
    }
    if ($command.op -eq 'term') {
      if (![PumarejoJobNative]::TerminateJobObject($jobHandle, 0)) { throw 'job-terminate-failed' }
      $wait = [PumarejoJobNative]::WaitForSingleObject($processHandle, 10000)
      if ($wait -ne 0) { throw 'target-termination-timeout' }
      Write-Frame @{ op='terminated'; escalated=$false }; continue
    }
    if ($command.op -eq 'kill') {
      if (![PumarejoJobNative]::TerminateJobObject($jobHandle, 1)) { throw 'job-terminate-failed' }
      $wait = [PumarejoJobNative]::WaitForSingleObject($processHandle, 10000)
      if ($wait -ne 0) { throw 'target-termination-timeout' }
      Write-Frame @{ op='terminated'; escalated=$true }; continue
    }
    if ($command.op -eq 'close') { Write-Frame @{ op='closed' }; [PumarejoJobNative]::CloseHandle($jobHandle) | Out-Null; $jobHandle=[IntPtr]::Zero; break }
    Write-Frame @{ op='error'; code='unknown-command' }
  }
} catch {
  try { Write-Frame @{ op='error'; code='native-unavailable' } } catch { }
} finally {
  if ($jobHandle -ne [IntPtr]::Zero) { [PumarejoJobNative]::CloseHandle($jobHandle) | Out-Null }
  if ($processHandle -ne [IntPtr]::Zero) { [PumarejoJobNative]::CloseHandle($processHandle) | Out-Null }
}
`;

const FRAME_PREFIX = "PUMAREJO-JOB/1 ";
const MAX_FRAME_BYTES = 65_536;
const MAX_PENDING_FRAMES = 32;

export interface WindowsManagedLaunch {
  readonly child: ChildProcess;
  readonly pid: number;
  readonly identity: SystemIdentity;
  readonly attachment: ProcessCustodyAttachment;
  readonly isTargetAlive: () => Promise<boolean>;
}

export interface WindowsJobObjectOptions {
  readonly systemRoot?: string;
  readonly powershellPath?: string;
  readonly runner?: {
    run(
      command: string,
      args: readonly string[],
    ): Promise<{ readonly stdout: string; readonly stderr: string }>;
  };
}

export interface WindowsJobObjectBackend
  extends NativeProcessCustodyOperations {
  probe(): Promise<boolean>;
  managedLaunch(request: SpawnRequest): Promise<WindowsManagedLaunch>;
}

interface JobHandle {
  readonly child: ChildProcess;
  pid: number;
  startedAt: number;
  closed: boolean;
  readonly pending: PendingFrame[];
  readonly outputQueue: Array<{
    readonly stream: "stdout" | "stderr";
    readonly data: string;
  }>;
  outputBytes: number;
  output?: (stream: "stdout" | "stderr", data: string) => void;
}

interface PendingFrame {
  readonly expected: string;
  readonly resolve: (value: Record<string, unknown>) => void;
  readonly reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

function encodeScript(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function encodePayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function helperPath(options: WindowsJobObjectOptions): string {
  if (options.powershellPath !== undefined) return options.powershellPath;
  const root = options.systemRoot ?? process.env.SystemRoot ?? "C:\\Windows";
  return win32.join(
    root,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

function helperArgs(payload: Record<string, unknown>): string[] {
  // powershell.exe does not accept script parameters after -EncodedCommand;
  // bind the already-base64 payload inside the encoded script instead. This
  // remains literal data, never shell syntax or an interpolated command.
  const payloadScript = WINDOWS_JOB_HELPER.replace(
    "param([string] $Payload)",
    `$Payload = '${encodePayload(payload)}'`,
  );
  // Windows has a finite command-line limit. Compress the encoded helper
  // source before placing it in -EncodedCommand; the target command and
  // project path remain literal payload data inside the decompressed script.
  const compressed = deflateRawSync(
    Buffer.from(payloadScript, "utf16le"),
  ).toString("base64");
  const bootstrap = [
    `$compressed = '${compressed}'`,
    "$bytes = [Convert]::FromBase64String($compressed)",
    "$inputStream = [IO.MemoryStream]::new($bytes)",
    "$deflate = [IO.Compression.DeflateStream]::new($inputStream, [IO.Compression.CompressionMode]::Decompress)",
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

function parseFrame(line: string): Record<string, unknown> | undefined {
  if (
    !line.startsWith(FRAME_PREFIX) ||
    Buffer.byteLength(line, "utf8") > MAX_FRAME_BYTES
  )
    return undefined;
  try {
    const value: unknown = JSON.parse(line.slice(FRAME_PREFIX.length));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function commandLine(command: string, args: readonly string[]): string {
  const quote = (value: string) => {
    if (value.length === 0) return '""';
    if (!/[\s"\\]/u.test(value)) return value;
    return `"${value.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\+)$/u, "$1$1")}"`;
  };
  return [command, ...args].map(quote).join(" ");
}

async function defaultRun(command: string, args: readonly string[]) {
  const result = await execFileAsync(command, [...args], {
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024,
    encoding: "utf8",
  });
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}

function failHandle(handle: JobHandle, error: Error): void {
  if (handle.closed) return;
  handle.closed = true;
  const pending = handle.pending.splice(0);
  for (const waiter of pending) {
    if (waiter.timer !== undefined) clearTimeout(waiter.timer);
    waiter.reject(error);
  }
}

async function waitForHelperExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null) return true;
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(child.exitCode !== null), timeoutMs);
    timer.unref?.();
    child.once("exit", onExit);
  });
}

/** Close the controller synchronously enough for the helper's finally block
 * to close its Job, then terminate only that exact launch-owned helper if it
 * does not exit within the bounded grace period. */
async function cleanupHelper(handle: JobHandle, error: Error): Promise<void> {
  failHandle(handle, error);
  try {
    handle.child.stdin?.end();
  } catch {
    /* the helper may already be gone */
  }
  if (await waitForHelperExit(handle.child, 1_500)) return;
  try {
    handle.child.kill();
  } catch {
    /* bounded cleanup is best effort */
  }
  await waitForHelperExit(handle.child, 500);
}

function waitForFrame(
  handle: JobHandle,
  expected: string,
  timeoutMs = 10_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const waiter: PendingFrame = { expected, resolve, reject };
    waiter.timer = setTimeout(() => {
      const index = handle.pending.indexOf(waiter);
      if (index >= 0) handle.pending.splice(index, 1);
      reject(new Error("Job helper response timed out."));
    }, timeoutMs);
    waiter.timer.unref?.();
    handle.pending.push(waiter);
  });
}

function responseFor(operation: Record<string, unknown>): string {
  if (operation.op === "inspect") return "inspect";
  if (operation.op === "term" || operation.op === "kill") return "terminated";
  if (operation.op === "close") return "closed";
  return "error";
}

function send(
  handle: JobHandle,
  operation: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (
    handle.closed ||
    handle.child.stdin === null ||
    handle.pending.length >= MAX_PENDING_FRAMES
  ) {
    return Promise.reject(new Error("Job helper is unavailable."));
  }
  // Register the paired waiter before writing.  This makes a synchronous
  // helper response safe and ensures timeout/error cleanup removes both sides
  // of the request atomically.
  const expected = responseFor(operation);
  const response = waitForFrame(handle, expected);
  try {
    handle.child.stdin.write(`${JSON.stringify(operation)}\n`, "utf8");
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    failHandle(handle, failure);
    return Promise.reject(failure);
  }
  return response;
}

function createBackend(
  options: WindowsJobObjectOptions,
): WindowsJobObjectBackend {
  const run = options.runner?.run ?? defaultRun;
  const powershell = helperPath(options);
  const probe = async () => {
    if (process.platform !== "win32") return false;
    try {
      const result = await run(powershell, helperArgs({ op: "probe" }));
      const frame = result.stdout
        .split(/\r?\n/u)
        .map(parseFrame)
        .find((value) => value !== undefined);
      return (
        frame?.op === "ready" &&
        frame.supported === true &&
        frame.killOnClose === true
      );
    } catch {
      return false;
    }
  };
  const managedLaunch = async (
    request: SpawnRequest,
  ): Promise<WindowsManagedLaunch> => {
    if (process.platform !== "win32")
      throw new Error("Windows Job Objects are unavailable on this host.");
    if (!(await probe()))
      throw new Error("Windows Job Object capability probe failed.");
    const child = spawn(
      powershell,
      helperArgs({
        op: "launch",
        commandLine: commandLine(request.command, request.args),
        cwd: request.cwd,
      }),
      {
        cwd: request.cwd,
        env: request.env,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const handle: JobHandle = {
      child,
      pid: 0,
      startedAt: 0,
      closed: false,
      pending: [],
      outputQueue: [],
      outputBytes: 0,
    };
    let buffer = "";
    const consume = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (Buffer.byteLength(buffer, "utf8") > MAX_FRAME_BYTES * 2) {
        const error = new Error("Job helper output exceeded the bound.");
        failHandle(handle, error);
        child.kill();
        return;
      }
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const frame = parseFrame(line);
        if (frame === undefined) continue;
        if (frame.op === "output") {
          const stream = frame.stream;
          const data = frame.data;
          if (
            (stream !== "stdout" && stream !== "stderr") ||
            typeof data !== "string" ||
            data.length % 4 !== 0 ||
            !/^[A-Za-z0-9+/]*={0,2}$/u.test(data)
          )
            continue;
          const bytes = Buffer.from(data, "base64");
          if (bytes.byteLength > 8192) continue;
          const text = bytes.toString("utf8");
          if (handle.output !== undefined) handle.output(stream, text);
          else if (handle.outputBytes + bytes.byteLength <= 8_000) {
            handle.outputQueue.push({ stream, data: text });
            handle.outputBytes += bytes.byteLength;
          }
          continue;
        }
        const index = handle.pending.findIndex(
          (waiter) => frame.op === waiter.expected || frame.op === "error",
        );
        if (index < 0) continue;
        const waiter = handle.pending.splice(index, 1)[0];
        if (waiter.timer !== undefined) clearTimeout(waiter.timer);
        if (frame.op === "error")
          waiter.reject(new Error(`Job helper rejected ${waiter.expected}.`));
        else waiter.resolve(frame);
      }
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", (chunk: Buffer) => {
      if (Buffer.byteLength(chunk) > MAX_FRAME_BYTES) {
        failHandle(
          handle,
          new Error("Job helper error output exceeded the bound."),
        );
        child.kill();
      }
    });
    child.once("error", (error) => {
      failHandle(handle, error);
    });
    child.once("exit", () => {
      failHandle(
        handle,
        new Error("Job helper exited before custody release."),
      );
    });
    try {
      const ready = await waitForFrame(handle, "attached");
      if (
        ready.op !== "attached" ||
        typeof ready.pid !== "number" ||
        typeof ready.startedAt !== "number" ||
        ready.pid <= 0 ||
        ready.startedAt <= 0
      ) {
        throw new Error("Job helper returned an invalid launch identity.");
      }
      handle.pid = ready.pid;
      handle.startedAt = ready.startedAt;
      handle.output = (stream, data) => request.onOutput?.(stream, data);
      for (const output of handle.outputQueue.splice(0))
        handle.output(output.stream, output.data);
      handle.outputBytes = 0;
      const opaqueHandle = handle;
      const isTargetAlive = async () => {
        if (handle.closed || handle.pid <= 0) return false;
        const response = await send(handle, { op: "inspect" }).catch(
          () => undefined,
        );
        return (
          response?.op === "inspect" &&
          response.pid === handle.pid &&
          response.startedAt === handle.startedAt &&
          response.descendantsComplete === true
        );
      };
      return {
        child,
        pid: ready.pid,
        identity: {
          startedAt: ready.startedAt,
          commandLine: commandLine(request.command, request.args),
        },
        attachment: { mechanism: "windows_job_object", opaqueHandle },
        isTargetAlive,
      };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      await cleanupHelper(handle, failure);
      throw failure;
    }
  };
  return {
    probe,
    capability: async () =>
      (await probe())
        ? {
            mechanism: "windows_job_object",
            state: "supported",
            code: "windows_job_object_available",
            killOnClose: true,
          }
        : {
            mechanism: "windows_job_object",
            state: "unavailable",
            code: "windows_job_object_unavailable",
            killOnClose: false,
          },
    managedLaunch,
    attach: async () => {
      throw new Error("Windows Job custody cannot be reattached by PID.");
    },
    inspect: async (pid, attachment) => {
      const handle = attachment.opaqueHandle as JobHandle | undefined;
      if (handle === undefined || handle.closed || handle.pid !== pid)
        return undefined;
      const response = await send(handle, { op: "inspect" }).catch(
        () => undefined,
      );
      return response?.op === "inspect" &&
        response.pid === pid &&
        response.startedAt === handle.startedAt
        ? { descendantsComplete: response.descendantsComplete === true }
        : undefined;
    },
    waitForTermination: async (pid, attachment, timeoutMs) => {
      const handle = attachment.opaqueHandle as JobHandle | undefined;
      if (handle === undefined || handle.closed || handle.pid !== pid)
        return false;
      const deadline = Date.now() + Math.max(0, timeoutMs);
      do {
        const response = await send(handle, { op: "inspect" }).catch(
          () => undefined,
        );
        if (
          response?.op === "inspect" &&
          response.pid === pid &&
          response.startedAt === handle.startedAt &&
          response.descendantsComplete !== true
        )
          return true;
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(25, remaining)),
        );
      } while (Date.now() <= deadline);
      return false;
    },
    inspectNonce: async () => undefined,
    terminate: async (_pid, attachment, signal) => {
      const handle = attachment.opaqueHandle as JobHandle | undefined;
      if (handle === undefined || handle.closed)
        throw new Error("Windows Job handle is unavailable.");
      const response = await send(handle, { op: signal }).catch(
        () => undefined,
      );
      if (response?.op !== "terminated")
        throw new Error("Windows Job termination did not converge.");
    },
    release: async (attachment) => {
      const handle = attachment.opaqueHandle as JobHandle | undefined;
      if (handle === undefined || handle.closed) return;
      try {
        await send(handle, { op: "close" });
      } catch {
        /* EOF still closes the Job. */
      }
      handle.closed = true;
      handle.child.stdin?.end();
      await new Promise<void>((resolve) => {
        if (handle.child.exitCode !== null) return resolve();
        handle.child.once("exit", () => resolve());
        setTimeout(resolve, 2_000).unref();
      });
      if (handle.child.exitCode === null) handle.child.kill();
    },
  };
}

export function createWindowsJobObjectOperations(
  options: WindowsJobObjectOptions = {},
) {
  return createBackend(options);
}

export function createWindowsJobObjectNativeOperations(
  options: WindowsJobObjectOptions = {},
): NativeProcessOperations {
  const backend = createBackend(options);
  return {
    inspectSystem: async () => ({
      status: "unavailable",
      cause: new Error("Native Job backend owns launch identity inspection."),
    }),
    terminateTree: async () => {
      throw new Error("Raw-PID termination is not release-grade on Windows.");
    },
    providerOwner: async () => ({
      status: "unavailable",
      cause: new Error(
        "Provider ownership requires the managed launch boundary.",
      ),
    }),
    custody: backend,
  };
}

export function helperSourceHash(): string {
  return createHash("sha256").update(WINDOWS_JOB_HELPER, "utf8").digest("hex");
}
