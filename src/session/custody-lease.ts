import { randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type {
  ProcessCustodyInspection,
  ProcessCustodyMechanism,
  ProcessIdentity,
} from "../platform/types.js";
import type { LoopbackFamily } from "../platform/loopback.js";

export const CUSTODY_LEASE_VERSION = 1 as const;
export const CUSTODY_LEASE_MAX_BYTES = 32 * 1024;
export const CUSTODY_LEASE_MAX_COUNT = 64;

const HEX_32 = /^[a-f0-9]{32}$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const MECHANISMS = new Set<ProcessCustodyMechanism>([
  "windows_job_object",
  "windows_validated_tree",
  "posix_process_group",
]);
const STATES = new Set<CustodyLeaseState>([
  "active",
  "closing",
  "recovering",
  "retryable",
  "closed",
]);

export type CustodyLeaseState =
  | "active"
  | "closing"
  | "recovering"
  | "retryable"
  | "closed";

export interface CustodyLeaseRecord {
  readonly version: typeof CUSTODY_LEASE_VERSION;
  readonly launchId: string;
  readonly controllerId: string;
  readonly controllerPid: number;
  readonly pid: number;
  readonly startedAt: number;
  readonly commandHash: string;
  readonly systemHash?: string;
  readonly sessionNonce: string;
  readonly providerPid?: number;
  readonly providerPort?: number;
  readonly providerFamily?: LoopbackFamily;
  readonly proxyPort?: number;
  readonly mechanism: ProcessCustodyMechanism;
  readonly groupId?: number;
  readonly sessionId?: number;
  readonly state: CustodyLeaseState;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CustodyLeaseInput {
  readonly controllerId: string;
  readonly controllerPid?: number;
  readonly identity: ProcessIdentity;
  readonly mechanism: ProcessCustodyMechanism;
  readonly groupId?: number;
  readonly sessionId?: number;
  readonly providerPid?: number;
  readonly providerPort?: number;
  readonly providerFamily?: LoopbackFamily;
  readonly proxyPort?: number;
  readonly launchId?: string;
  readonly now?: number;
}

export interface CustodyLeaseScan {
  readonly leases: readonly CustodyLeaseRecord[];
  readonly malformed: readonly string[];
  readonly skipped: readonly string[];
}

export interface CustodyLeaseStoreOptions {
  readonly root: string;
  readonly controllerId: string;
  readonly controllerPid?: number;
  readonly now?: () => number;
  readonly maxBytes?: number;
  readonly maxCount?: number;
}

export type CustodyProofFailure =
  | "missing-observation"
  | "identity-mismatch"
  | "mechanism-mismatch"
  | "group-mismatch"
  | "session-mismatch"
  | "incomplete-tree";

export type CustodyProof =
  | { readonly owned: true }
  | { readonly owned: false; readonly reason: CustodyProofFailure };

export interface SanitizedCustodyEvidence {
  readonly source: "process";
  readonly owner: "session" | "process";
  readonly code: string;
  readonly mechanism?: ProcessCustodyMechanism;
  readonly phase: "lease" | "attach" | "terminate" | "recover" | "listener";
  readonly state:
    | "supported"
    | "unsupported"
    | "unavailable"
    | "denied"
    | "failed";
  readonly retryable: boolean;
  readonly durationMs?: number;
  readonly resourcePresent?: boolean;
}

function validPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1024 &&
    value <= 65_535
  );
}

function validPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value < 9_007_199_254_740_991
  );
}

function optionalPositiveInteger(value: unknown): boolean {
  return value === undefined || validPositiveInteger(value);
}

function optionalPort(value: unknown): boolean {
  return value === undefined || validPort(value);
}

function validProviderMetadata(
  providerPort: unknown,
  providerFamily: unknown,
): boolean {
  return (
    (providerPort === undefined && providerFamily === undefined) ||
    (validPort(providerPort) &&
      (providerFamily === "ipv4" || providerFamily === "ipv6"))
  );
}

function boundedId(value: unknown): value is string {
  return typeof value === "string" && HEX_32.test(value);
}

function boundedControllerId(value: unknown): value is string {
  return typeof value === "string" && HEX_64.test(value);
}

function ensureKnownKeys(value: Record<string, unknown>): boolean {
  const allowed = new Set([
    "version",
    "launchId",
    "controllerId",
    "controllerPid",
    "pid",
    "startedAt",
    "commandHash",
    "systemHash",
    "sessionNonce",
    "providerPid",
    "providerPort",
    "providerFamily",
    "proxyPort",
    "mechanism",
    "groupId",
    "sessionId",
    "state",
    "createdAt",
    "updatedAt",
  ]);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function validateCustodyLease(
  value: unknown,
): value is CustodyLeaseRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (!ensureKnownKeys(record)) return false;
  if (
    record.version !== CUSTODY_LEASE_VERSION ||
    !boundedId(record.launchId) ||
    !boundedControllerId(record.controllerId) ||
    !validPositiveInteger(record.controllerPid) ||
    !validPositiveInteger(record.pid) ||
    !validTimestamp(record.startedAt) ||
    typeof record.commandHash !== "string" ||
    !HEX_64.test(record.commandHash) ||
    (record.systemHash !== undefined &&
      (typeof record.systemHash !== "string" ||
        !HEX_64.test(record.systemHash))) ||
    typeof record.sessionNonce !== "string" ||
    !HEX_64.test(record.sessionNonce) ||
    !MECHANISMS.has(record.mechanism as ProcessCustodyMechanism) ||
    !STATES.has(record.state as CustodyLeaseState) ||
    !validTimestamp(record.createdAt) ||
    !validTimestamp(record.updatedAt) ||
    record.updatedAt < record.createdAt ||
    !optionalPositiveInteger(record.providerPid) ||
    !optionalPositiveInteger(record.groupId) ||
    !optionalPositiveInteger(record.sessionId) ||
    !validProviderMetadata(record.providerPort, record.providerFamily) ||
    !optionalPort(record.proxyPort)
  ) {
    return false;
  }
  return true;
}

function cloneRecord(record: CustodyLeaseRecord): CustodyLeaseRecord {
  return { ...record };
}

function assertController(
  record: CustodyLeaseRecord,
  controllerId: string,
): void {
  if (record.controllerId !== controllerId) {
    throw new Error("Custody lease is owned by another controller.");
  }
}

function transitionAllowed(
  from: CustodyLeaseState,
  to: CustodyLeaseState,
): boolean {
  if (from === to) return true;
  if (from === "closed") return false;
  if (to === "active") return false;
  if (from === "active")
    return ["closing", "recovering", "retryable"].includes(to);
  if (from === "closing" || from === "recovering") {
    return ["closed", "retryable"].includes(to);
  }
  return (
    from === "retryable" && ["closing", "recovering", "closed"].includes(to)
  );
}

async function assertSafeDirectory(
  path: string,
  create: boolean,
): Promise<void> {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Custody lease root is not a regular directory.");
  }
  await chmod(path, 0o700).catch(() => undefined);
}

function contained(root: string, path: string): boolean {
  const rootPath = resolve(root);
  const child = resolve(path);
  const rel = relative(rootPath, child);
  return (
    rel === "" ||
    (rel !== ".." &&
      !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
  );
}

async function safeLeaseFile(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Custody lease file is not a regular file.");
  }
}

function serializedRecord(record: CustodyLeaseRecord): string {
  return `${JSON.stringify(record)}\n`;
}

export class CustodyLeaseStore {
  readonly #root: string;
  readonly #controllerId: string;
  readonly #controllerPid: number;
  readonly #now: () => number;
  readonly #maxBytes: number;
  readonly #maxCount: number;

  constructor(options: CustodyLeaseStoreOptions) {
    this.#root = resolve(options.root);
    this.#controllerId = options.controllerId;
    this.#controllerPid = options.controllerPid ?? process.pid;
    this.#now = options.now ?? Date.now;
    this.#maxBytes = Math.min(
      Math.max(1024, options.maxBytes ?? CUSTODY_LEASE_MAX_BYTES),
      CUSTODY_LEASE_MAX_BYTES,
    );
    this.#maxCount = Math.min(
      Math.max(1, options.maxCount ?? CUSTODY_LEASE_MAX_COUNT),
      CUSTODY_LEASE_MAX_COUNT,
    );
    if (!boundedControllerId(this.#controllerId)) {
      throw new Error("Custody controller identity is invalid.");
    }
  }

  get root(): string {
    return this.#root;
  }

  get controllerId(): string {
    return this.#controllerId;
  }

  pathFor(launchId: string): string {
    if (!boundedId(launchId))
      throw new Error("Custody launch identity is invalid.");
    const path = join(this.#root, `${launchId}.json`);
    if (!contained(this.#root, path))
      throw new Error("Custody lease path escaped root.");
    return path;
  }

  async create(input: CustodyLeaseInput): Promise<CustodyLeaseRecord> {
    if (input.controllerId !== this.#controllerId) {
      throw new Error("Custody lease controller mismatch.");
    }
    const launchId = input.launchId ?? randomBytes(16).toString("hex");
    if (!boundedId(launchId))
      throw new Error("Custody launch identity is invalid.");
    const now = input.now ?? this.#now();
    const record: CustodyLeaseRecord = {
      version: CUSTODY_LEASE_VERSION,
      launchId,
      controllerId: this.#controllerId,
      controllerPid: input.controllerPid ?? this.#controllerPid,
      pid: input.identity.pid,
      startedAt: input.identity.startedAt,
      commandHash: input.identity.commandHash,
      ...(input.identity.systemHash === undefined
        ? {}
        : { systemHash: input.identity.systemHash }),
      sessionNonce: input.identity.sessionNonce,
      ...(input.providerPid === undefined
        ? {}
        : { providerPid: input.providerPid }),
      ...(input.providerPort === undefined
        ? {}
        : { providerPort: input.providerPort }),
      ...(input.providerFamily === undefined
        ? {}
        : { providerFamily: input.providerFamily }),
      ...(input.proxyPort === undefined ? {} : { proxyPort: input.proxyPort }),
      mechanism: input.mechanism,
      ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      state: "active",
      createdAt: now,
      updatedAt: now,
    };
    if (!validateCustodyLease(record))
      throw new Error("Custody lease fields are invalid.");
    await this.writeNew(record);
    return cloneRecord(record);
  }

  async read(launchId: string): Promise<CustodyLeaseRecord | undefined> {
    const path = this.pathFor(launchId);
    try {
      await safeLeaseFile(path);
      const contents = await readFile(path, "utf8");
      if (Buffer.byteLength(contents, "utf8") > this.#maxBytes) {
        throw new Error("Custody lease is oversized.");
      }
      const value: unknown = JSON.parse(contents);
      if (!validateCustodyLease(value))
        throw new Error("Custody lease is invalid.");
      return cloneRecord(value);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return undefined;
      throw error;
    }
  }

  async transition(
    record: CustodyLeaseRecord,
    state: CustodyLeaseState,
    now = this.#now(),
  ): Promise<CustodyLeaseRecord> {
    assertController(record, this.#controllerId);
    if (!transitionAllowed(record.state, state)) {
      throw new Error(
        `Invalid custody lease transition ${record.state} -> ${state}.`,
      );
    }
    const current = await this.read(record.launchId);
    if (current === undefined)
      throw new Error("Custody lease no longer exists.");
    assertController(current, this.#controllerId);
    if (current.state !== record.state) {
      if (current.state === state) return current;
      throw new Error("Custody lease transition lost an ownership race.");
    }
    const next = {
      ...current,
      state,
      updatedAt: now,
    } satisfies CustodyLeaseRecord;
    await this.writeExisting(next);
    return cloneRecord(next);
  }

  async update(
    record: CustodyLeaseRecord,
    fields: Partial<
      Pick<
        CustodyLeaseRecord,
        | "providerPid"
        | "providerPort"
        | "providerFamily"
        | "proxyPort"
        | "groupId"
        | "sessionId"
      >
    >,
    now = this.#now(),
  ): Promise<CustodyLeaseRecord> {
    assertController(record, this.#controllerId);
    const current = await this.read(record.launchId);
    if (current === undefined)
      throw new Error("Custody lease no longer exists.");
    assertController(current, this.#controllerId);
    if (current.state === "closed")
      throw new Error("Closed custody lease cannot be updated.");
    const next = {
      ...current,
      ...fields,
      updatedAt: now,
    } satisfies CustodyLeaseRecord;
    if (!validateCustodyLease(next))
      throw new Error("Custody lease update is invalid.");
    await this.writeExisting(next);
    return cloneRecord(next);
  }

  async remove(record: CustodyLeaseRecord): Promise<void> {
    assertController(record, this.#controllerId);
    const path = this.pathFor(record.launchId);
    await safeLeaseFile(path);
    const current = await this.read(record.launchId);
    if (current === undefined) return;
    assertController(current, this.#controllerId);
    if (current.state !== "closed")
      throw new Error("Only a closed custody lease can be removed.");
    await unlink(path);
    await unlink(this.recoveryLockPath(record.launchId)).catch(() => undefined);
  }

  /**
   * Atomically takes ownership of a lease whose controller has already been
   * proven dead by the caller. A pre-existing recovery marker is never
   * overridden: it is treated as ambiguous residue.
   */
  async claimForRecovery(
    record: CustodyLeaseRecord,
    now = this.#now(),
  ): Promise<CustodyLeaseRecord | undefined> {
    const lock = this.recoveryLockPath(record.launchId);
    await assertSafeDirectory(this.#root, false);
    try {
      await writeFile(lock, `${this.#controllerId}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return undefined;
      throw error;
    }
    try {
      const current = await this.read(record.launchId);
      if (current === undefined || current.state === "closed") {
        await unlink(lock).catch(() => undefined);
        return undefined;
      }
      const claimed: CustodyLeaseRecord = {
        ...current,
        controllerId: this.#controllerId,
        controllerPid: this.#controllerPid,
        state: "recovering",
        updatedAt: now,
      };
      if (!validateCustodyLease(claimed))
        throw new Error("Custody recovery claim is invalid.");
      await this.writeExisting(claimed);
      return cloneRecord(claimed);
    } catch (error) {
      await unlink(lock).catch(() => undefined);
      throw error;
    }
  }

  async releaseRecovery(record: CustodyLeaseRecord): Promise<void> {
    await unlink(this.recoveryLockPath(record.launchId)).catch(() => undefined);
  }

  async scan(): Promise<CustodyLeaseScan> {
    await assertSafeDirectory(this.#root, true);
    const entries = (await readdir(this.#root, { withFileTypes: true }))
      .filter((entry) => entry.name.endsWith(".json"))
      .sort((left, right) => left.name.localeCompare(right.name));
    const leases: CustodyLeaseRecord[] = [];
    const malformed: string[] = [];
    const skipped: string[] = [];
    for (const entry of entries) {
      if (leases.length >= this.#maxCount) {
        skipped.push(entry.name);
        continue;
      }
      const launchId = entry.name.slice(0, -5);
      if (!boundedId(launchId) || !entry.isFile()) {
        malformed.push(entry.name);
        continue;
      }
      try {
        const lease = await this.read(launchId);
        if (lease === undefined) malformed.push(entry.name);
        else leases.push(lease);
      } catch {
        malformed.push(entry.name);
      }
    }
    return { leases, malformed, skipped };
  }

  private async writeNew(record: CustodyLeaseRecord): Promise<void> {
    await assertSafeDirectory(this.#root, true);
    const path = this.pathFor(record.launchId);
    try {
      await safeLeaseFile(path);
      throw new Error("Custody lease already exists.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await this.atomicWrite(path, record, true);
  }

  private async writeExisting(record: CustodyLeaseRecord): Promise<void> {
    await assertSafeDirectory(this.#root, false);
    const path = this.pathFor(record.launchId);
    await safeLeaseFile(path);
    await this.atomicWrite(path, record, false);
  }

  private recoveryLockPath(launchId: string): string {
    const path = join(this.#root, `${launchId}.recover.lock`);
    if (!contained(this.#root, path))
      throw new Error("Custody recovery path escaped root.");
    return path;
  }

  private async atomicWrite(
    path: string,
    record: CustodyLeaseRecord,
    exclusive: boolean,
  ): Promise<void> {
    const contents = serializedRecord(record);
    if (Buffer.byteLength(contents, "utf8") > this.#maxBytes) {
      throw new Error("Custody lease is oversized.");
    }
    const temporary = join(
      dirname(path),
      `.${record.launchId}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
    );
    if (!contained(this.#root, temporary))
      throw new Error("Custody temporary path escaped root.");
    if (exclusive) {
      try {
        await writeFile(temporary, contents, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
        });
        await safeLeaseFile(temporary);
        await rename(temporary, path);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
    } else {
      await writeFile(temporary, contents, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      try {
        await safeLeaseFile(path);
        await safeLeaseFile(temporary);
        await rename(temporary, path);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
    }
    await chmod(path, 0o600).catch(() => undefined);
  }
}

export function identityForLease(record: CustodyLeaseRecord): ProcessIdentity {
  return {
    pid: record.pid,
    startedAt: record.startedAt,
    commandHash: record.commandHash,
    ...(record.systemHash === undefined
      ? {}
      : { systemHash: record.systemHash }),
    sessionNonce: record.sessionNonce,
  };
}

export function proveCustodyOwnership(
  lease: CustodyLeaseRecord,
  observed: ProcessCustodyInspection | undefined,
): CustodyProof {
  if (observed === undefined)
    return { owned: false, reason: "missing-observation" };
  const expected = identityForLease(lease);
  const actual = observed.identity;
  if (
    actual.pid !== expected.pid ||
    actual.startedAt !== expected.startedAt ||
    actual.commandHash !== expected.commandHash ||
    actual.sessionNonce !== expected.sessionNonce
  ) {
    return { owned: false, reason: "identity-mismatch" };
  }
  if (observed.mechanism !== lease.mechanism) {
    return { owned: false, reason: "mechanism-mismatch" };
  }
  if (lease.groupId !== undefined && observed.groupId !== lease.groupId) {
    return { owned: false, reason: "group-mismatch" };
  }
  if (lease.sessionId !== undefined && observed.sessionId !== lease.sessionId) {
    return { owned: false, reason: "session-mismatch" };
  }
  if (!observed.descendantsComplete)
    return { owned: false, reason: "incomplete-tree" };
  return { owned: true };
}

export function sanitizeCustodyEvidence(input: {
  readonly phase: SanitizedCustodyEvidence["phase"];
  readonly code: string;
  readonly mechanism?: ProcessCustodyMechanism;
  readonly state: SanitizedCustodyEvidence["state"];
  readonly retryable: boolean;
  readonly durationMs?: number;
  readonly resourcePresent?: boolean;
}): SanitizedCustodyEvidence {
  const code = /^[a-z][a-z0-9_]{0,63}$/u.test(input.code)
    ? input.code
    : "custody_event";
  return {
    source: "process",
    owner: "process",
    phase: input.phase,
    code,
    state: input.state,
    retryable: input.retryable,
    ...(input.mechanism === undefined ? {} : { mechanism: input.mechanism }),
    ...(input.durationMs === undefined
      ? {}
      : {
          durationMs: Math.min(
            600_000,
            Math.max(0, Math.trunc(input.durationMs)),
          ),
        }),
    ...(input.resourcePresent === undefined
      ? {}
      : { resourcePresent: input.resourcePresent }),
  };
}
