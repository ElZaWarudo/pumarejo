import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { PumarejoError } from "../shared/errors.js";
import {
  launchCommandHash,
  type ProcessCustodyAdapter,
  type ProcessCustodyAttachment,
  type ProcessCustodyCapability,
  type ProcessCustodyInspection,
  type ProcessCustodyTermination,
  type ProcessAdapter,
  type ProcessIdentity,
  type SpawnRequest,
  type SpawnedApplication,
} from "./types.js";
import type { LoopbackFamily } from "./loopback.js";

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
  readonly managed: boolean;
  readonly identity: ProcessIdentity;
  readonly systemHash: string;
  readonly attachment?: ProcessCustodyAttachment;
  helperExited: boolean;
  output: string;
}

export interface NativeManagedLaunch {
  readonly child: ChildProcess;
  readonly pid: number;
  readonly identity: SystemIdentity;
  readonly attachment: ProcessCustodyAttachment;
  /** Reports target liveness through the launch-owned custody handle. */
  readonly isTargetAlive?: () => Promise<boolean>;
}

export interface NativeProcessOperations {
  /** Optional launch barrier. Windows uses this to create/configure/assign a
   * Job Object while the target is suspended, before returning the process. */
  readonly managedLaunch?: (
    request: SpawnRequest,
  ) => Promise<NativeManagedLaunch>;
  inspectSystem(pid: number): Promise<SystemInspectionResult>;
  terminateTree(pid: number): Promise<void>;
  providerOwner(
    rootPid: number,
    providerPort: number,
    family?: LoopbackFamily,
    signal?: AbortSignal,
  ): Promise<ProviderOwnerResult>;
  /** Optional native ownership boundary used by RDM-016. */
  readonly custody?: NativeProcessCustodyOperations;
}

export interface NativeProcessCustodyInspection {
  readonly groupId?: number;
  readonly sessionId?: number;
  /** Complete enumeration is required before a destructive fallback. */
  readonly descendantsComplete: boolean;
}

export interface NativeProcessCustodyOperations {
  capability(): Promise<ProcessCustodyCapability>;
  attach(pid: number): Promise<ProcessCustodyAttachment>;
  inspect(
    pid: number,
    attachment: ProcessCustodyAttachment,
  ): Promise<NativeProcessCustodyInspection | undefined>;
  /** Fresh launch nonce proof for crash-resumable reattachment. */
  inspectNonce?(pid: number): Promise<string | undefined>;
  terminate(
    pid: number,
    attachment: ProcessCustodyAttachment,
    signal: "term" | "kill",
  ): Promise<void>;
  /** Waits for the target held by the native custody boundary.  This is
   * deliberately separate from the helper/controller process lifecycle. */
  waitForTermination?(
    pid: number,
    attachment: ProcessCustodyAttachment,
    timeoutMs: number,
  ): Promise<boolean>;
  release(attachment: ProcessCustodyAttachment): Promise<void>;
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
  family: LoopbackFamily = "ipv4",
  isTargetAlive?: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (child.exitCode !== null) {
      throw new PumarejoError("APP_START_FAILED", {
        cause: new Error(`Child exited before readiness: ${output()}`),
      });
    }
    if (isTargetAlive !== undefined) {
      const targetAlive = await isTargetAlive().catch(() => false);
      if (!targetAlive) {
        throw new PumarejoError("APP_START_FAILED", {
          cause: new Error(
            `Managed target exited before readiness: ${output()}`,
          ),
        });
      }
    }
    const connected = await new Promise<boolean>((resolve) => {
      const socket = createConnection({
        host: family === "ipv6" ? "::1" : "127.0.0.1",
        port,
        family: family === "ipv6" ? 6 : 4,
      });
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
  const exited = new Set<number>();
  const inspectionTimeoutMs = options.inspectionTimeoutMs ?? 5_000;
  const inspectionPollMs = options.inspectionPollMs ?? 25;

  const custody: ProcessCustodyAdapter | undefined =
    operations.custody === undefined
      ? undefined
      : createTrackedCustodyAdapter(tracked, exited, operations, {
          inspectionTimeoutMs,
          inspectionPollMs,
        });

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
      let output = "";
      let processPid: number | undefined;
      const append = (stream: "stdout" | "stderr", text: string) => {
        request.onOutput?.(stream, text);
        output = `${output}${text}`.slice(-8_000);
        if (processPid !== undefined) {
          const entry = tracked.get(processPid);
          if (entry !== undefined) entry.output = output;
        }
      };
      // The managed Windows bridge calls this callback for bounded, tagged
      // target-output frames.  It never receives the helper control stream.
      const launchRequest: SpawnRequest = {
        ...request,
        onOutput: append,
      };
      const managed =
        operations.managedLaunch === undefined
          ? undefined
          : await operations
              .managedLaunch(launchRequest)
              .catch((error: unknown) => {
                throw new PumarejoError("APP_START_FAILED", { cause: error });
              });
      const child =
        managed?.child ??
        spawn(request.command, request.args, {
          cwd: request.cwd,
          env: request.env,
          shell: false,
          stdio: "pipe",
          windowsHide: true,
          detached: process.platform !== "win32",
        });
      if (managed === undefined) {
        await new Promise<void>((resolve, reject) => {
          child.once("spawn", resolve);
          child.once("error", reject);
        }).catch((error: unknown) => {
          throw new PumarejoError("APP_START_FAILED", { cause: error });
        });
      }
      processPid = managed?.pid ?? child.pid;
      if (processPid === undefined) {
        throw new PumarejoError("APP_START_FAILED");
      }
      exited.delete(processPid);
      child.once("exit", () => {
        const entry = tracked.get(processPid);
        if (entry?.managed === true) {
          // The Windows helper is the control owner, not the target.  Losing
          // it invalidates custody but never proves that the target exited.
          entry.helperExited = true;
          return;
        }
        tracked.delete(processPid);
        exited.add(processPid);
      });
      // The Windows Job bridge owns a framed control stream. Never forward
      // those frames as application output; doing so would expose helper
      // protocol data and make readiness diagnostics unbounded by framing.
      if (managed === undefined) {
        child.stdout?.on("data", (chunk: Buffer) =>
          append("stdout", chunk.toString("utf8")),
        );
        child.stderr?.on("data", (chunk: Buffer) =>
          append("stderr", chunk.toString("utf8")),
        );
      }

      let observed: SystemIdentity;
      try {
        observed =
          managed?.identity ??
          (await waitForSystemIdentity(
            processPid,
            operations.inspectSystem,
            inspectionTimeoutMs,
            inspectionPollMs,
          ));
      } catch (error) {
        let cleanup:
          | "terminated"
          | "already-exited"
          | "survived"
          | "not-attempted" =
          child.exitCode === null ? "not-attempted" : "already-exited";
        if (child.exitCode === null) {
          try {
            if (managed !== undefined && operations.custody !== undefined) {
              await operations.custody.terminate(
                processPid,
                managed.attachment,
                "kill",
              );
              await operations.custody.release(managed.attachment);
            } else {
              await operations.terminateTree(processPid);
            }
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
        pid: processPid,
        startedAt: observed.startedAt,
        commandHash: launchCommandHash(request.command, request.args),
        sessionNonce,
        systemHash: systemHash(observed),
      };
      tracked.set(processPid, {
        child,
        managed: managed !== undefined,
        identity,
        systemHash: systemHash(observed),
        ...(managed === undefined ? {} : { attachment: managed.attachment }),
        helperExited: false,
        output,
      });
      if (child.exitCode !== null) {
        if (managed !== undefined) {
          const entry = tracked.get(processPid);
          if (entry !== undefined) entry.helperExited = true;
          await operations.custody
            ?.terminate(processPid, managed.attachment, "kill")
            .catch(() => undefined);
          await operations.custody
            ?.release(managed.attachment)
            .catch(() => undefined);
        } else {
          tracked.delete(processPid);
        }
        throw new PumarejoError("APP_START_FAILED");
      }
      return {
        ...identity,
        ...(managed === undefined
          ? {}
          : { custodyAttachment: managed.attachment }),
        waitUntilProviderReady: async (port, signal, family) => {
          await waitForPort(
            child,
            port,
            () => output.trim(),
            readinessTimeout,
            signal,
            family,
            managed?.isTargetAlive,
          );
        },
      };
    },

    async inspect(pid) {
      const entry = tracked.get(pid);
      if (
        entry === undefined ||
        entry.helperExited ||
        (!entry.managed && entry.child.exitCode !== null)
      )
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
      if (entry.managed) {
        if (
          operations.custody === undefined ||
          entry.attachment === undefined
        ) {
          throw new Error("Managed process custody is unavailable.");
        }
        await operations.custody.terminate(pid, entry.attachment, "kill");
        await operations.custody.release(entry.attachment);
        return;
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

    async providerOwner(rootPid, providerPort, family, signal) {
      const result = await operations.providerOwner(
        rootPid,
        providerPort,
        family,
        signal,
      );
      if (result.status === "found") return result.pid;
      if (result.status === "not-found") return undefined;
      throw inspectionError(result);
    },
    ...(custody === undefined ? {} : { custody }),
  };
}

function custodyIdentityMatches(
  expected: ProcessIdentity,
  observed: ProcessIdentity | undefined,
): boolean {
  return (
    observed !== undefined &&
    observed.pid === expected.pid &&
    observed.startedAt === expected.startedAt &&
    observed.commandHash === expected.commandHash &&
    observed.sessionNonce === expected.sessionNonce
  );
}

function createTrackedCustodyAdapter(
  tracked: Map<number, TrackedProcess>,
  exited: Set<number>,
  operations: NativeProcessOperations,
  options: {
    readonly inspectionTimeoutMs: number;
    readonly inspectionPollMs: number;
  },
): ProcessCustodyAdapter {
  const native = operations.custody!;
  let capabilityPromise: Promise<ProcessCustodyCapability> | undefined;
  const capability = async (): Promise<ProcessCustodyCapability> => {
    capabilityPromise ??= native.capability();
    return await capabilityPromise;
  };

  const inspect = async (
    identity: ProcessIdentity,
    attachment: ProcessCustodyAttachment,
  ): Promise<ProcessCustodyInspection | undefined> => {
    const entry = tracked.get(identity.pid);
    if (entry?.managed === true && entry.helperExited) {
      // The helper holds the only handle to a kill-on-close Job, so its exit
      // ends the target tree. Once the identity-bound target is also absent
      // from the system, record the exit so cleanup can converge instead of
      // retrying forever. A still-matching process stays retryable.
      if (identity.systemHash !== undefined) {
        const system = observedIdentity(
          await operations.inspectSystem(identity.pid),
        );
        if (
          system === undefined ||
          systemHash(system) !== identity.systemHash
        ) {
          exited.add(identity.pid);
        }
      }
      return undefined;
    }
    if (entry !== undefined && !entry.managed && entry.child.exitCode !== null)
      return undefined;
    const system = observedIdentity(
      await operations.inspectSystem(identity.pid),
    );
    if (system === undefined && entry?.managed === true) {
      // A live helper plus an absent, identity-bound target is target exit;
      // a helper exit is handled above and remains retryable instead.
      exited.add(identity.pid);
    }
    if (
      system === undefined ||
      identity.systemHash === undefined ||
      systemHash(system) !== identity.systemHash ||
      (entry !== undefined && systemHash(system) !== entry.systemHash)
    ) {
      return undefined;
    }
    const nativeInspection = await native.inspect(identity.pid, attachment);
    if (nativeInspection === undefined) return undefined;
    if (entry === undefined) {
      const nonce = await native.inspectNonce?.(identity.pid);
      if (nonce !== identity.sessionNonce) return undefined;
    }
    return {
      identity: entry?.identity ?? identity,
      mechanism: attachment.mechanism,
      ...(nativeInspection.groupId === undefined
        ? {}
        : { groupId: nativeInspection.groupId }),
      ...(nativeInspection.sessionId === undefined
        ? {}
        : { sessionId: nativeInspection.sessionId }),
      descendantsComplete: nativeInspection.descendantsComplete,
    };
  };

  const waitForTermination = async (
    pid: number,
    attachment: ProcessCustodyAttachment,
    timeoutMs: number,
  ): Promise<boolean> => {
    if (exited.has(pid)) return true;
    const entry = tracked.get(pid);
    if (entry === undefined) return false;
    if (native.waitForTermination !== undefined) {
      const terminated = await native.waitForTermination(
        pid,
        attachment,
        timeoutMs,
      );
      if (terminated) exited.add(pid);
      return terminated;
    }
    if (entry.managed) return false;
    if (entry.child.exitCode !== null) return true;
    return await waitForChildExit(entry.child, timeoutMs);
  };

  return {
    capability,
    async attach(identity) {
      const entry = tracked.get(identity.pid);
      if (
        (entry !== undefined &&
          (!custodyIdentityMatches(identity, entry.identity) ||
            entry.child.exitCode !== null)) ||
        identity.systemHash === undefined
      ) {
        throw new Error("Cannot attach custody to an unowned process.");
      }
      const attachment =
        entry?.attachment ?? (await native.attach(identity.pid));
      const facts = await inspect(identity, attachment);
      if (facts === undefined) {
        await native.release(attachment).catch(() => undefined);
        throw new Error("Custody ownership could not be established.");
      }
      return attachment;
    },
    inspect,
    async terminate(
      identity,
      attachment,
      terminateOptions = {},
    ): Promise<ProcessCustodyTermination> {
      if (tracked.get(identity.pid) === undefined) {
        return { state: "retryable", escalated: false };
      }
      const before = await inspect(identity, attachment);
      if (before === undefined) {
        const entry = tracked.get(identity.pid);
        return {
          state: exited.has(identity.pid) ? "already-exited" : "retryable",
          escalated: false,
        };
      }
      if (!before.descendantsComplete)
        return { state: "retryable", escalated: false };
      await native.terminate(identity.pid, attachment, "term");
      const graceMs = Math.min(
        30_000,
        Math.max(0, terminateOptions.graceMs ?? 2_000),
      );
      const pollMs = Math.min(500, Math.max(1, terminateOptions.pollMs ?? 25));
      const deadline = Date.now() + graceMs;
      while (Date.now() < deadline) {
        if (
          await waitForTermination(
            identity.pid,
            attachment,
            Math.min(pollMs, Math.max(1, deadline - Date.now())),
          )
        ) {
          return { state: "terminated", escalated: false };
        }
        const current = await inspect(identity, attachment);
        if (current === undefined) {
          // Native tree termination can make OS inspection disappear before
          // Node delivers the already-owned child's exit event.  Absence is
          // not proof of exit, so wait only for the tracked event and only
          // until the existing bounded grace deadline before retrying.
          return (await waitForTermination(
            identity.pid,
            attachment,
            Math.max(0, deadline - Date.now()),
          ))
            ? { state: "terminated", escalated: false }
            : { state: "retryable", escalated: false };
        }
        await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
      }
      if (await waitForTermination(identity.pid, attachment, 0)) {
        return { state: "terminated", escalated: false };
      }
      const revalidated = await inspect(identity, attachment);
      if (revalidated === undefined || !revalidated.descendantsComplete) {
        return { state: "retryable", escalated: false };
      }
      await native.terminate(identity.pid, attachment, "kill");
      return (await waitForTermination(
        identity.pid,
        attachment,
        options.inspectionTimeoutMs ?? 2_000,
      ))
        ? { state: "terminated", escalated: true }
        : { state: "retryable", escalated: true };
    },
    async release(attachment) {
      await native.release(attachment);
    },
  };
}
