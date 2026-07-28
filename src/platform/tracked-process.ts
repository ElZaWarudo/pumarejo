import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createConnection } from "node:net";

import { TauriAgentError } from "../shared/errors.js";
import {
  launchCommandHash,
  type ProcessAdapter,
  type ProcessIdentity,
  type SpawnRequest,
  type SpawnedApplication,
} from "./types.js";

interface SystemIdentity {
  readonly startedAt: number;
  readonly commandLine: string;
}

interface TrackedProcess {
  readonly child: ChildProcess;
  readonly identity: ProcessIdentity;
  readonly systemHash: string;
  output: string;
}

export interface NativeProcessOperations {
  inspectSystem(pid: number): Promise<SystemIdentity | undefined>;
  terminateTree(pid: number): Promise<void>;
  providerOwner(
    rootPid: number,
    providerPort: number,
  ): Promise<number | undefined>;
}

function systemHash(identity: SystemIdentity): string {
  return createHash("sha256")
    .update(JSON.stringify([identity.startedAt, identity.commandLine]))
    .digest("hex");
}

async function waitForSystemIdentity(
  pid: number,
  inspect: (pid: number) => Promise<SystemIdentity | undefined>,
): Promise<SystemIdentity> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const identity = await inspect(pid);
    if (identity !== undefined) return identity;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new TauriAgentError("APP_START_FAILED");
}

async function waitForPort(
  child: ChildProcess,
  port: number,
  output: () => string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (child.exitCode !== null) {
      throw new TauriAgentError("APP_START_FAILED", {
        cause: new Error(`Child exited before readiness: ${output()}`),
      });
    }
    const connected = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.setTimeout(250);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      const unavailable = () => {
        socket.destroy();
        resolve(false);
      };
      socket.once("error", unavailable);
      socket.once("timeout", unavailable);
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new TauriAgentError("WEBDRIVER_NOT_READY", {
    cause: new Error(`Provider readiness timed out: ${output()}`),
  });
}

export function createTrackedProcessAdapter(
  operations: NativeProcessOperations,
): ProcessAdapter {
  const tracked = new Map<number, TrackedProcess>();

  return {
    async spawn(request: SpawnRequest): Promise<SpawnedApplication> {
      const sessionNonce = request.env.TAURI_AGENT_SESSION_NONCE;
      const readinessTimeout = Number(
        request.env.TAURI_AGENT_PROVIDER_READY_TIMEOUT_MS ?? "300000",
      );
      if (
        typeof sessionNonce !== "string" ||
        !/^[a-f0-9]{64}$/u.test(sessionNonce) ||
        !Number.isInteger(readinessTimeout) ||
        readinessTimeout < 1_000 ||
        readinessTimeout > 600_000
      ) {
        throw new TauriAgentError("APP_START_FAILED");
      }
      const child = spawn(request.command, request.args, {
        cwd: request.cwd,
        env: request.env,
        shell: false,
        stdio: "pipe",
        windowsHide: true,
        detached: process.platform !== "win32",
      });
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      }).catch((error: unknown) => {
        throw new TauriAgentError("APP_START_FAILED", { cause: error });
      });
      if (child.pid === undefined) {
        throw new TauriAgentError("APP_START_FAILED");
      }
      child.once("exit", () => tracked.delete(child.pid!));
      let output = "";
      const append = (chunk: Buffer) => {
        output = `${output}${chunk.toString("utf8")}`.slice(-8_000);
        const entry = tracked.get(child.pid!);
        if (entry !== undefined) entry.output = output;
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);

      let observed: SystemIdentity;
      try {
        observed = await waitForSystemIdentity(
          child.pid,
          operations.inspectSystem,
        );
      } catch (error) {
        if (child.exitCode === null) {
          await operations.terminateTree(child.pid).catch(() => undefined);
        }
        throw error;
      }
      const identity = {
        pid: child.pid,
        startedAt: observed.startedAt,
        commandHash: launchCommandHash(request.command, request.args),
        sessionNonce,
      };
      tracked.set(child.pid, {
        child,
        identity,
        systemHash: systemHash(observed),
        output,
      });
      if (child.exitCode !== null) {
        tracked.delete(child.pid);
        throw new TauriAgentError("APP_START_FAILED");
      }
      return {
        ...identity,
        waitUntilProviderReady: async (port, signal) => {
          await waitForPort(
            child,
            port,
            () => output.trim(),
            readinessTimeout,
            signal,
          );
        },
      };
    },

    async inspect(pid) {
      const entry = tracked.get(pid);
      if (entry === undefined || entry.child.exitCode !== null)
        return undefined;
      const observed = await operations.inspectSystem(pid);
      return observed !== undefined && systemHash(observed) === entry.systemHash
        ? entry.identity
        : undefined;
    },

    async terminateTree(pid) {
      const entry = tracked.get(pid);
      if (entry === undefined) {
        throw new Error("Refusing to terminate an untracked process.");
      }
      const observed = await operations.inspectSystem(pid);
      if (observed === undefined || systemHash(observed) !== entry.systemHash) {
        return;
      }
      await operations.terminateTree(pid);
      await new Promise<void>((resolve, reject) => {
        if (entry.child.exitCode !== null) return resolve();
        const timeout = setTimeout(
          () => reject(new Error("Process termination timed out.")),
          10_000,
        );
        entry.child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    },

    providerOwner: operations.providerOwner,
  };
}
