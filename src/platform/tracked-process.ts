import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { PumarejoError } from "../shared/errors.js";
import {
  launchCommandHash,
  type ProcessAdapter,
  type ProcessIdentity,
  type SpawnRequest,
  type SpawnedApplication,
} from "./types.js";

export interface SystemIdentity {
  readonly startedAt: number;
  readonly commandLine: string;
}

export type ProcessInspectionFailure =
  | { readonly status: "access-denied"; readonly cause: unknown }
  | { readonly status: "unavailable"; readonly cause: unknown }
  | { readonly status: "timed-out"; readonly cause: unknown }
  | { readonly status: "invalid-response"; readonly cause: unknown };

export type SystemInspectionResult =
  | { readonly status: "found"; readonly identity: SystemIdentity }
  | { readonly status: "not-found" }
  | ProcessInspectionFailure;

export type ProviderOwnerResult =
  | { readonly status: "found"; readonly pid: number }
  | { readonly status: "not-found" }
  | ProcessInspectionFailure;

interface TrackedProcess {
  readonly child: ChildProcess;
  readonly identity: ProcessIdentity;
  readonly systemHash: string;
  output: string;
}

export interface NativeProcessOperations {
  inspectSystem(pid: number): Promise<SystemInspectionResult>;
  terminateTree(pid: number): Promise<void>;
  providerOwner(
    rootPid: number,
    providerPort: number,
  ): Promise<ProviderOwnerResult>;
}

function systemHash(identity: SystemIdentity): string {
  return createHash("sha256")
    .update(JSON.stringify([identity.startedAt, identity.commandLine]))
    .digest("hex");
}

async function waitForSystemIdentity(
  pid: number,
  inspect: (pid: number) => Promise<SystemInspectionResult>,
  timeoutMs: number,
  pollMs: number,
): Promise<SystemIdentity> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await inspect(pid);
    if (result.status === "found") return result.identity;
    if (result.status !== "not-found") throw inspectionError(result);
    await delay(pollMs);
  }
  throw new PumarejoError("PROCESS_NOT_FOUND", {
    cause: new Error(`Process ${pid} was not found before inspection timeout.`),
  });
}

function inspectionError(result: ProcessInspectionFailure): PumarejoError {
  const codes = {
    "access-denied": "PROCESS_INSPECTION_DENIED",
    unavailable: "PROCESS_INSPECTION_UNAVAILABLE",
    "timed-out": "PROCESS_INSPECTION_TIMED_OUT",
    "invalid-response": "PROCESS_INSPECTION_INVALID_RESPONSE",
  } satisfies Record<
    ProcessInspectionFailure["status"],
    | "PROCESS_INSPECTION_DENIED"
    | "PROCESS_INSPECTION_UNAVAILABLE"
    | "PROCESS_INSPECTION_TIMED_OUT"
    | "PROCESS_INSPECTION_INVALID_RESPONSE"
  >;
  return new PumarejoError(codes[result.status], { cause: result.cause });
}

function observedIdentity(
  result: SystemInspectionResult,
): SystemIdentity | undefined {
  if (result.status === "found") return result.identity;
  if (result.status === "not-found") return undefined;
  throw inspectionError(result);
}

async function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null) return true;
  return await new Promise<boolean>((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(child.exitCode !== null);
    }, timeoutMs);
    timer.unref();
    child.once("exit", onExit);
    if (child.exitCode !== null) {
      child.off("exit", onExit);
      clearTimeout(timer);
      resolve(true);
    }
  });
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
      throw new PumarejoError("APP_START_FAILED", {
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
  throw new PumarejoError("WEBDRIVER_NOT_READY", {
    cause: new Error(`Provider readiness timed out: ${output()}`),
  });
}

export function createTrackedProcessAdapter(
  operations: NativeProcessOperations,
  options: {
    readonly inspectionTimeoutMs?: number;
    readonly inspectionPollMs?: number;
  } = {},
): ProcessAdapter {
  const tracked = new Map<number, TrackedProcess>();
  const inspectionTimeoutMs = options.inspectionTimeoutMs ?? 5_000;
  const inspectionPollMs = options.inspectionPollMs ?? 25;

  return {
    async spawn(request: SpawnRequest): Promise<SpawnedApplication> {
      const sessionNonce = request.env.PUMAREJO_SESSION_NONCE;
      const readinessTimeout = Number(
        request.env.PUMAREJO_PROVIDER_READY_TIMEOUT_MS ?? "300000",
      );
      if (
        typeof sessionNonce !== "string" ||
        !/^[a-f0-9]{64}$/u.test(sessionNonce) ||
        !Number.isInteger(readinessTimeout) ||
        readinessTimeout < 1_000 ||
        readinessTimeout > 600_000
      ) {
        throw new PumarejoError("APP_START_FAILED");
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
        throw new PumarejoError("APP_START_FAILED", { cause: error });
      });
      if (child.pid === undefined) {
        throw new PumarejoError("APP_START_FAILED");
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
          inspectionTimeoutMs,
          inspectionPollMs,
        );
      } catch (error) {
        let cleanup:
          | "terminated"
          | "already-exited"
          | "survived"
          | "not-attempted" =
          child.exitCode === null ? "not-attempted" : "already-exited";
        if (child.exitCode === null) {
          try {
            await operations.terminateTree(child.pid);
            cleanup = (await waitForChildExit(child, 2_000))
              ? "terminated"
              : "survived";
          } catch {
            cleanup = child.exitCode === null ? "survived" : "terminated";
          }
        }
        if (
          error instanceof PumarejoError &&
          error.phase === "process-inspection"
        ) {
          throw new PumarejoError(error.code, {
            cause: error.cause ?? error,
            diagnostic: {
              check: "Windows process identity and ownership via CIM",
              applicationStarted: true,
              cleanup,
              webdriverSessionCreated: false,
            },
          });
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
        throw new PumarejoError("APP_START_FAILED");
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
      const observed = observedIdentity(await operations.inspectSystem(pid));
      return observed !== undefined && systemHash(observed) === entry.systemHash
        ? entry.identity
        : undefined;
    },

    async terminateTree(pid) {
      const entry = tracked.get(pid);
      if (entry === undefined) {
        throw new Error("Refusing to terminate an untracked process.");
      }
      const observed = observedIdentity(await operations.inspectSystem(pid));
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

    async providerOwner(rootPid, providerPort) {
      const result = await operations.providerOwner(rootPid, providerPort);
      if (result.status === "found") return result.pid;
      if (result.status === "not-found") return undefined;
      throw inspectionError(result);
    },
  };
}
