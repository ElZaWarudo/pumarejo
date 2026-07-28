import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import {
  materializeLaunchProfile,
  type LoadedProjectConfig,
} from "../../config/load.js";
import type { PreparedLaunch } from "../../session/manager.js";
import type { RuntimeMode } from "../../session/state.js";
import { PumarejoError } from "../../shared/errors.js";
import { sanitizedLaunchEnvironment } from "../launch-environment.js";
import { createRuntimeOverlay } from "../mode-config.js";
import { resolveProjectTauriCommand } from "../tauri-command.js";

const DISPLAY_PATTERN = /^(?:(?:127\.0\.0\.1|localhost))?:\d+(?:\.\d+)?$/u;
const XVFB_READY_TIMEOUT_MS = 10_000;
const LINUX_SYSTEM_COMMAND_DIRECTORIES = ["/usr/bin", "/bin"] as const;
const execFileAsync = promisify(execFile);

interface OwnedDisplay {
  readonly display: string;
  readonly xauthority: string;
  close(): Promise<void>;
}

async function tcpListening(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolveReady) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(100);
    socket.once("connect", () => {
      socket.destroy();
      resolveReady(true);
    });
    const unavailable = () => {
      socket.destroy();
      resolveReady(false);
    };
    socket.once("error", unavailable);
    socket.once("timeout", unavailable);
  });
}

function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === "" ||
    (!difference.startsWith(`..${sep}`) &&
      difference !== ".." &&
      !isAbsolute(difference))
  );
}

async function resolveLinuxCommand(
  command: string,
  projectRoot: string,
  searchDirectories: readonly string[] = (process.env.PATH ?? "").split(
    delimiter,
  ),
): Promise<string> {
  const candidates = isAbsolute(command)
    ? [command]
    : searchDirectories.map((directory) => resolve(directory, command));
  for (const candidate of candidates) {
    try {
      const canonical = await realpath(candidate);
      await access(canonical, constants.X_OK);
      if (isInside(resolve(projectRoot), resolve(canonical))) {
        throw new PumarejoError("APP_START_FAILED");
      }
      return canonical;
    } catch (error) {
      if (error instanceof PumarejoError) throw error;
    }
  }
  throw new PumarejoError("APP_START_FAILED");
}

async function waitForXvfb(child: ChildProcess, port: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < XVFB_READY_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new PumarejoError("BACKGROUND_UNAVAILABLE");
    }
    const listening = await tcpListening(port);
    if (listening) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new PumarejoError("BACKGROUND_UNAVAILABLE");
}

async function stopOwnedProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolveExit) => {
    child.once("exit", () => resolveExit());
  });
  child.kill("SIGTERM");
  await Promise.race([
    exited,
    new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 2_000)),
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

export async function startOwnedLinuxDisplay(): Promise<OwnedDisplay> {
  if (process.platform !== "linux") {
    throw new PumarejoError("PLATFORM_UNSUPPORTED");
  }
  const directory = await mkdtemp(join(tmpdir(), "pumarejo-xvfb-"));
  let child: ChildProcess | undefined;
  try {
    await chmod(directory, 0o700);
    const xauthority = join(directory, "Xauthority");
    await writeFile(xauthority, "", { mode: 0o600 });
    const [xvfb, xauth] = await Promise.all([
      resolveLinuxCommand("Xvfb", directory, LINUX_SYSTEM_COMMAND_DIRECTORIES),
      resolveLinuxCommand("xauth", directory, LINUX_SYSTEM_COMMAND_DIRECTORIES),
    ]);
    const cookie = randomBytes(16).toString("hex");
    for (let displayNumber = 90; displayNumber <= 199; displayNumber += 1) {
      const display = `127.0.0.1:${displayNumber}`;
      try {
        if (await tcpListening(6_000 + displayNumber)) continue;
        await execFileAsync(
          xauth,
          ["-f", xauthority, "add", display, "MIT-MAGIC-COOKIE-1", cookie],
          { timeout: 10_000 },
        );
        child = spawn(
          xvfb,
          [
            `:${displayNumber}`,
            "-screen",
            "0",
            "1280x720x24",
            "-listen",
            "tcp",
            "-auth",
            xauthority,
          ],
          {
            detached: false,
            shell: false,
            stdio: "ignore",
          },
        );
        await waitForXvfb(child, 6_000 + displayNumber);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
        if (child.exitCode !== null) {
          throw new PumarejoError("BACKGROUND_UNAVAILABLE");
        }
        let closed = false;
        return {
          display,
          xauthority,
          close: async () => {
            if (closed) return;
            closed = true;
            await stopOwnedProcess(child!);
            await rm(directory, { recursive: true, force: true });
          },
        };
      } catch {
        if (child !== undefined) {
          await stopOwnedProcess(child).catch(() => undefined);
          child = undefined;
        }
      }
    }
    throw new PumarejoError("BACKGROUND_UNAVAILABLE");
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(
      () => undefined,
    );
    throw error instanceof PumarejoError
      ? error
      : new PumarejoError("BACKGROUND_UNAVAILABLE", { cause: error });
  }
}

export function linuxDisplayEnvironment(
  mode: RuntimeMode,
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (mode === "visible") {
    if (!environment.DISPLAY) {
      throw new PumarejoError("BACKGROUND_UNAVAILABLE");
    }
    return {
      ...sanitizedLaunchEnvironment("linux", environment),
      GDK_BACKEND: "x11",
    };
  }
  const display = environment.PUMAREJO_BACKGROUND_DISPLAY;
  if (display === undefined || !DISPLAY_PATTERN.test(display)) {
    throw new PumarejoError("BACKGROUND_UNAVAILABLE");
  }
  return {
    ...sanitizedLaunchEnvironment("linux", environment),
    DISPLAY: display,
    WAYLAND_DISPLAY: undefined,
    GDK_BACKEND: "x11",
  };
}

export async function prepareLinuxLaunch(
  loaded: LoadedProjectConfig,
  mode: RuntimeMode,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PreparedLaunch> {
  if (process.platform !== "linux") {
    throw new PumarejoError("PLATFORM_UNSUPPORTED");
  }
  const launchEnvironment = linuxDisplayEnvironment(mode, environment);
  const overlay = await createRuntimeOverlay({
    projectRoot: loaded.projectRoot,
    platform: "linux",
    mode,
    windowLabel: loaded.config.window,
  });
  try {
    const profile = materializeLaunchProfile(
      loaded.config.launch,
      overlay.path,
      loaded.projectRoot,
    );
    const direct = await resolveProjectTauriCommand(
      profile.command,
      profile.args,
      loaded.projectRoot,
    );
    return {
      request: {
        command:
          direct?.command ??
          (await resolveLinuxCommand(profile.command, loaded.projectRoot)),
        args: direct?.args ?? profile.args,
        cwd: loaded.projectRoot,
        env: launchEnvironment,
      },
      window: overlay.windowLabel,
      cleanup: overlay.cleanup,
    };
  } catch (error) {
    await overlay.cleanup();
    throw error;
  }
}

export async function prepareOwnedLinuxLaunch(
  loaded: LoadedProjectConfig,
  mode: RuntimeMode,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PreparedLaunch> {
  if (mode === "visible") {
    return await prepareLinuxLaunch(loaded, mode, environment);
  }
  const display = await startOwnedLinuxDisplay();
  try {
    const prepared = await prepareLinuxLaunch(loaded, mode, {
      ...environment,
      PUMAREJO_BACKGROUND_DISPLAY: display.display,
      XAUTHORITY: display.xauthority,
    });
    let closed = false;
    return {
      ...prepared,
      cleanup: async () => {
        if (closed) return;
        closed = true;
        const failures: unknown[] = [];
        await prepared.cleanup().catch((error: unknown) => {
          failures.push(error);
        });
        await display.close().catch((error: unknown) => {
          failures.push(error);
        });
        if (failures.length > 0) throw new AggregateError(failures);
      },
    };
  } catch (error) {
    await display.close().catch(() => undefined);
    throw error;
  }
}
