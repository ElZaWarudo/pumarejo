import { execFile, spawn } from "node:child_process";
import { win32 } from "node:path";
import { promisify } from "node:util";

import { TauriAgentError } from "../shared/errors.js";
import type { RuntimeMode } from "../session/state.js";
import { sanitizedLaunchEnvironment } from "./launch-environment.js";

const execFileAsync = promisify(execFile);

function windowsPowerShell(environment: NodeJS.ProcessEnv): string {
  const systemRoot = Object.entries(environment).find(
    ([key]) => key.toUpperCase() === "SYSTEMROOT",
  )?.[1];
  if (systemRoot === undefined) throw new Error("SystemRoot missing");
  return win32.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

export interface DesktopState {
  readonly platform: "windows" | "linux";
  readonly activeWindow: string;
  readonly display: string;
}

export type DiagnosticExecutor = (
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
) => Promise<string>;

export interface FocusMonitor {
  stop(): Promise<string | undefined>;
}

export function validatedFocusMonitorResult(
  changedWindow: string | undefined,
  unexpectedExit: boolean,
): string | undefined {
  if (unexpectedExit && changedWindow === undefined) {
    throw new TauriAgentError("BACKGROUND_UNAVAILABLE", {
      cause: new Error("Foreground monitor exited unexpectedly."),
    });
  }
  return changedWindow;
}

const defaultExecutor: DiagnosticExecutor = async (
  command,
  args,
  environment,
) => {
  const { stdout } = await execFileAsync(command, args, {
    env: environment,
    timeout: 10_000,
  });
  return stdout;
};

export async function captureDesktopState(
  platform: "windows" | "linux",
  environment: NodeJS.ProcessEnv = process.env,
  execute: DiagnosticExecutor = defaultExecutor,
): Promise<DesktopState> {
  try {
    const diagnosticEnvironment = sanitizedLaunchEnvironment(
      platform,
      environment,
    );
    if (platform === "windows") {
      const script = [
        'Add-Type -Namespace TauriAgent -Name Desktop -MemberDefinition \'[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);\'',
        "$h = [TauriAgent.Desktop]::GetForegroundWindow()",
        "$p = [uint32]0",
        "[void][TauriAgent.Desktop]::GetWindowThreadProcessId($h, [ref]$p)",
        'Write-Output ("{0}:{1}" -f $p, $h.ToInt64())',
      ].join("; ");
      const activeWindow = (
        await execute(
          windowsPowerShell(diagnosticEnvironment),
          ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
          diagnosticEnvironment,
        )
      ).trim();
      if (!/^\d+:\d+$/u.test(activeWindow)) throw new Error("invalid focus");
      return { platform, activeWindow, display: "interactive-desktop" };
    }

    const display = diagnosticEnvironment.DISPLAY;
    if (display === undefined) throw new Error("missing display");
    let output: string;
    try {
      output = await execute(
        "/usr/bin/xprop",
        ["-display", display, "-root", "_NET_ACTIVE_WINDOW"],
        diagnosticEnvironment,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { platform, activeWindow: "not-observed", display };
      }
      throw error;
    }
    const activeWindow = /(0x[0-9a-f]+)/iu.exec(output)?.[1];
    if (activeWindow === undefined) throw new Error("invalid active window");
    return { platform, activeWindow, display };
  } catch (error) {
    throw new TauriAgentError("BACKGROUND_UNAVAILABLE", { cause: error });
  }
}

export async function startWindowsFocusMonitor(
  expectedWindow: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<FocusMonitor> {
  if (!/^\d+:\d+$/u.test(expectedWindow)) {
    throw new TauriAgentError("BACKGROUND_UNAVAILABLE");
  }
  const script = [
    'Add-Type -Namespace TauriAgent -Name FocusMonitor -MemberDefinition \'[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);\'',
    "$expected = $env:TAURI_AGENT_EXPECTED_FOREGROUND",
    'Write-Output "READY"',
    "while ($true) {",
    "  $h = [TauriAgent.FocusMonitor]::GetForegroundWindow()",
    "  $p = [uint32]0",
    "  [void][TauriAgent.FocusMonitor]::GetWindowThreadProcessId($h, [ref]$p)",
    '  $current = ("{0}:{1}" -f $p, $h.ToInt64())',
    '  if ($current -ne $expected) { Write-Output ("CHANGED:{0}" -f $current); exit 0 }',
    "  Start-Sleep -Milliseconds 10",
    "}",
  ].join("; ");
  try {
    const child = spawn(
      windowsPowerShell(environment),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      {
        env: {
          ...sanitizedLaunchEnvironment("windows", environment),
          TAURI_AGENT_EXPECTED_FOREGROUND: expectedWindow,
        },
        shell: false,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      },
    );
    let output = "";
    let changedWindow: string | undefined;
    let stopRequested = false;
    let unexpectedExit = false;
    let monitorReady = false;
    let stopPromise: Promise<string | undefined> | undefined;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      changedWindow ??= /CHANGED:(\d+:\d+)/u.exec(output)?.[1];
    });
    child.on("exit", () => {
      if (monitorReady && !stopRequested && changedWindow === undefined) {
        unexpectedExit = true;
      }
    });
    await new Promise<void>((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("focus monitor readiness timed out"));
      }, 10_000);
      const ready = (chunk: string): void => {
        if (!chunk.includes("READY")) return;
        clearTimeout(timeout);
        child.stdout.off("data", ready);
        monitorReady = true;
        resolvePromise();
      };
      child.stdout.on("data", ready);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", () => {
        if (!output.includes("READY")) {
          clearTimeout(timeout);
          reject(new Error("focus monitor exited before readiness"));
        }
      });
    });
    return {
      stop() {
        stopPromise ??= (async () => {
          stopRequested = true;
          if (child.exitCode === null) {
            child.kill();
            await new Promise<void>((resolvePromise, reject) => {
              const timeout = setTimeout(
                () => reject(new Error("focus monitor did not exit")),
                5_000,
              );
              child.once("exit", () => {
                clearTimeout(timeout);
                resolvePromise();
              });
            });
          }
          return validatedFocusMonitorResult(changedWindow, unexpectedExit);
        })().catch((error: unknown) => {
          if (error instanceof TauriAgentError) throw error;
          throw new TauriAgentError("BACKGROUND_UNAVAILABLE", { cause: error });
        });
        return stopPromise;
      },
    };
  } catch (error) {
    throw new TauriAgentError("BACKGROUND_UNAVAILABLE", { cause: error });
  }
}

export function validateModeIsolation(options: {
  readonly mode: RuntimeMode;
  readonly before: DesktopState;
  readonly after: DesktopState;
  readonly controlledDisplay?: string;
  readonly transientFocusChanged?: string;
}): void {
  if (
    options.before.platform !== options.after.platform ||
    options.before.display !== options.after.display
  ) {
    throw new TauriAgentError("BACKGROUND_UNAVAILABLE");
  }
  if (options.mode === "background") {
    if (
      options.transientFocusChanged !== undefined ||
      options.before.activeWindow !== options.after.activeWindow
    ) {
      throw new TauriAgentError("BACKGROUND_UNAVAILABLE", {
        cause: new Error(
          `Foreground changed from ${options.before.activeWindow} to ${
            options.transientFocusChanged ?? options.after.activeWindow
          }.`,
        ),
      });
    }
    if (
      options.before.platform === "linux" &&
      (options.controlledDisplay === undefined ||
        options.controlledDisplay === options.before.display)
    ) {
      throw new TauriAgentError("BACKGROUND_UNAVAILABLE");
    }
  }
}
