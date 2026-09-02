import { createHash, randomBytes } from "node:crypto";
import type { Stats } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  readWindowsBootIdentifier,
  sameWindowsBootIdentifier,
  validateLegacyWindowsBootIdentifier,
  validateWindowsBootIdentifier,
  type LegacyWindowsBootIdentifier,
  type WindowsBootIdentifier,
} from "../platform/windows/boot-identifier.js";
import {
  readWindowsActingIdentity,
  type WindowsActingIdentity,
} from "../platform/windows/identity.js";
import {
  CUSTODY_LEASE_MAX_BYTES,
  CUSTODY_LEASE_MAX_COUNT,
  CUSTODY_LEASE_VERSION,
  validateCustodyLease,
  type CustodyLeaseRecord,
  type CustodyLeaseRecoveryEvent,
} from "./custody-lease.js";

const HEX_32 = /^[a-f0-9]{32}$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const SID = /^S-\d(?:-\d+)+$/u;
const LEGACY_BINDING_SCHEMA = "pumarejo-legacy-lease-boot-binding/v1" as const;
const BINDING_SCHEMA = "pumarejo-legacy-lease-boot-binding/v2" as const;
const AUDIT_SCHEMA = "pumarejo-lease-recovery-audit/v1" as const;
const RESULT_SCHEMA = "pumarejo-lease-recovery/v1" as const;

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
}

interface LeaseSnapshot {
  readonly path: string;
  readonly leaseId: string;
  readonly source: string;
  readonly sha256: string;
  readonly identity: FileIdentity;
  readonly record?: CustodyLeaseRecord;
  readonly malformed: boolean;
}

interface LegacyBootBindingV1 {
  readonly schema: typeof LEGACY_BINDING_SCHEMA;
  readonly operationId: string;
  readonly leaseId: string;
  readonly leaseSha256: string;
  readonly fileIdentity: FileIdentity;
  readonly observedBootIdentifier: LegacyWindowsBootIdentifier;
  readonly capturedAt: number;
  readonly actor: WindowsActingIdentity;
  readonly projectRoot: string;
}

interface LegacyBootBinding {
  readonly schema: typeof BINDING_SCHEMA;
  readonly operationId: string;
  readonly leaseId: string;
  readonly leaseSha256: string;
  readonly fileIdentity: FileIdentity;
  readonly observedBootIdentifier: WindowsBootIdentifier;
  readonly capturedAt: number;
  readonly actor: WindowsActingIdentity;
  readonly projectRoot: string;
  readonly supersedes?: {
    readonly schema: typeof LEGACY_BINDING_SCHEMA;
    readonly operationId: string;
    readonly bindingSha256: string;
  };
}

interface BindingSnapshot<T> {
  readonly path: string;
  readonly source: string;
  readonly sha256: string;
  readonly identity: FileIdentity;
  readonly binding: T;
}

export type LeaseRecoveryReason =
  | "previous_boot"
  | "same_boot"
  | "ambiguous_missing_boot"
  | "malformed_lease"
  | "unsupported_mechanism"
  | "unsupported_platform"
  | "lease_changed"
  | "recovery_locked"
  | "contradictory_binding"
  | "legacy_binding_mismatch"
  | "legacy_binding_upgrade_required"
  | "legacy_binding_upgraded"
  | "legacy_boot_bound"
  | "already_bound"
  | "already_recovered";

export type LeaseRecoveryDecision =
  | "would_recover"
  | "recovered"
  | "would_bind"
  | "bound"
  | "would_upgrade"
  | "upgraded"
  | "already_bound"
  | "already_recovered"
  | "rejected";

export interface LeaseRecoveryItemResult {
  readonly leaseId: string;
  readonly decision: LeaseRecoveryDecision;
  readonly reason: LeaseRecoveryReason;
  readonly evidenceSource?: "creation_boot" | "legacy_binding";
  readonly previousBootIdentifier?: WindowsBootIdentifier;
  readonly auditPath?: string;
}

export interface LeaseRecoveryResult {
  readonly schema: typeof RESULT_SCHEMA;
  readonly operationId: string;
  readonly action: "recover" | "bind-legacy" | "upgrade-binding";
  readonly dryRun: boolean;
  readonly status: "complete" | "unsupported_platform";
  readonly currentBootIdentifier?: WindowsBootIdentifier;
  readonly results: readonly LeaseRecoveryItemResult[];
}

export interface LeaseRecoveryOptions {
  readonly projectRoot: string;
  readonly action: "recover" | "bind-legacy" | "upgrade-binding";
  readonly execute: boolean;
  readonly platform?: NodeJS.Platform;
  readonly currentBootIdentifier?: () => Promise<WindowsBootIdentifier>;
  readonly actingIdentity?: () => Promise<WindowsActingIdentity>;
  readonly now?: () => number;
  readonly operationId?: string;
  /** Test seam for proving the final compare-and-swap revalidation. */
  readonly beforeMutation?: (leaseId: string) => void | Promise<void>;
}

interface RecoveryContext {
  readonly projectRoot: string;
  readonly sessionsRoot: string;
  readonly maintenanceRoot: string;
  readonly legacyBindingsRoot: string;
  readonly bindingsRoot: string;
  readonly auditsRoot: string;
  readonly action: LeaseRecoveryOptions["action"];
  readonly execute: boolean;
  readonly currentBootIdentifier: WindowsBootIdentifier;
  readonly actor: WindowsActingIdentity;
  readonly now: number;
  readonly operationId: string;
  readonly beforeMutation?: LeaseRecoveryOptions["beforeMutation"];
}

function contained(root: string, candidate: string): boolean {
  const difference = relative(resolve(root), resolve(candidate));
  return (
    difference === "" ||
    (difference !== ".." &&
      !difference.startsWith(`..${sep}`) &&
      !isAbsolute(difference))
  );
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? resolve(left).toLowerCase() === resolve(right).toLowerCase()
    : resolve(left) === resolve(right);
}

function identityOf(metadata: Stats): FileIdentity {
  return {
    dev: metadata.dev,
    ino: metadata.ino,
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    ctimeMs: metadata.ctimeMs,
  };
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

async function assertRegularDirectory(
  path: string,
  expected: string,
): Promise<void> {
  const before = await lstat(path);
  const canonical = await realpath(path);
  const after = await lstat(path);
  const revalidatedCanonical = await realpath(path);
  if (
    before.isSymbolicLink() ||
    !before.isDirectory() ||
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    !sameFileIdentity(identityOf(before), identityOf(after)) ||
    !samePath(canonical, expected) ||
    !samePath(revalidatedCanonical, expected)
  ) {
    throw new Error("Lease recovery directory identity is ambiguous.");
  }
}

async function ensureDirectory(path: string, parent: string): Promise<void> {
  if (!contained(parent, path) || samePath(parent, path)) {
    throw new Error("Lease recovery directory escaped its authorized parent.");
  }
  await assertRegularDirectory(parent, parent);
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await assertRegularDirectory(path, path);
}

function sha256(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

async function readSnapshot(
  path: string,
  leaseId: string,
): Promise<LeaseSnapshot> {
  try {
    const before = await lstat(path);
    const canonical = await realpath(path);
    const source = await readFile(path, "utf8");
    const after = await lstat(path);
    const revalidatedCanonical = await realpath(path);
    if (
      before.isSymbolicLink() ||
      !before.isFile() ||
      after.isSymbolicLink() ||
      !after.isFile() ||
      Buffer.byteLength(source, "utf8") > CUSTODY_LEASE_MAX_BYTES ||
      !sameFileIdentity(identityOf(before), identityOf(after)) ||
      !samePath(canonical, path) ||
      !samePath(revalidatedCanonical, path)
    ) {
      return {
        path,
        leaseId,
        source,
        sha256: sha256(source),
        identity: identityOf(after),
        malformed: true,
      };
    }
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      value = undefined;
    }
    const record =
      validateCustodyLease(value) && value.launchId === leaseId
        ? value
        : undefined;
    return {
      path,
      leaseId,
      source,
      sha256: sha256(source),
      identity: identityOf(after),
      ...(record === undefined ? {} : { record }),
      malformed: record === undefined,
    };
  } catch {
    return {
      path,
      leaseId,
      source: "",
      sha256: sha256(""),
      identity: { dev: 0, ino: 0, size: 0, mtimeMs: 0, ctimeMs: 0 },
      malformed: true,
    };
  }
}

function validateActingIdentity(value: WindowsActingIdentity): void {
  if (!SID.test(value.sid) || !Number.isInteger(value.pid) || value.pid <= 0) {
    throw new Error("Lease recovery acting identity is invalid.");
  }
}

function validateBindingFields(
  binding: Record<string, unknown>,
  expectedKeys: string,
  schema: string,
  validateBoot: (value: unknown) => boolean,
): boolean {
  const actor = binding.actor as Record<string, unknown> | undefined;
  const identity = binding.fileIdentity as Record<string, unknown> | undefined;
  return (
    Object.keys(binding).sort().join(",") === expectedKeys &&
    binding.schema === schema &&
    typeof binding.operationId === "string" &&
    HEX_32.test(binding.operationId) &&
    typeof binding.leaseId === "string" &&
    HEX_32.test(binding.leaseId) &&
    typeof binding.leaseSha256 === "string" &&
    HEX_64.test(binding.leaseSha256) &&
    typeof binding.capturedAt === "number" &&
    Number.isSafeInteger(binding.capturedAt) &&
    binding.capturedAt > 0 &&
    typeof binding.projectRoot === "string" &&
    validateBoot(binding.observedBootIdentifier) &&
    actor !== undefined &&
    Object.keys(actor).sort().join(",") === "pid,sid" &&
    typeof actor.sid === "string" &&
    SID.test(actor.sid) &&
    typeof actor.pid === "number" &&
    Number.isInteger(actor.pid) &&
    actor.pid > 0 &&
    identity !== undefined &&
    Object.keys(identity).sort().join(",") === "ctimeMs,dev,ino,mtimeMs,size" &&
    Object.values(identity).every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  );
}

function validateLegacyBinding(value: unknown): value is LegacyBootBindingV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return validateBindingFields(
    value as Record<string, unknown>,
    "actor,capturedAt,fileIdentity,leaseId,leaseSha256,observedBootIdentifier,operationId,projectRoot,schema",
    LEGACY_BINDING_SCHEMA,
    validateLegacyWindowsBootIdentifier,
  );
}

function validateBinding(value: unknown): value is LegacyBootBinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const binding = value as Record<string, unknown>;
  const supersedes = binding.supersedes as Record<string, unknown> | undefined;
  const keys = Object.keys(binding).sort().join(",");
  return (
    validateBindingFields(
      binding,
      supersedes === undefined
        ? "actor,capturedAt,fileIdentity,leaseId,leaseSha256,observedBootIdentifier,operationId,projectRoot,schema"
        : "actor,capturedAt,fileIdentity,leaseId,leaseSha256,observedBootIdentifier,operationId,projectRoot,schema,supersedes",
      BINDING_SCHEMA,
      validateWindowsBootIdentifier,
    ) &&
    (supersedes === undefined ||
      (keys.endsWith(",supersedes") &&
        Object.keys(supersedes).sort().join(",") ===
          "bindingSha256,operationId,schema" &&
        supersedes.schema === LEGACY_BINDING_SCHEMA &&
        typeof supersedes.operationId === "string" &&
        HEX_32.test(supersedes.operationId) &&
        typeof supersedes.bindingSha256 === "string" &&
        HEX_64.test(supersedes.bindingSha256)))
  );
}

async function readBindingAt<T>(
  path: string,
  validate: (value: unknown) => value is T,
): Promise<BindingSnapshot<T> | undefined | "malformed"> {
  try {
    const before = await lstat(path);
    const canonical = await realpath(path);
    const source = await readFile(path, "utf8");
    const after = await lstat(path);
    const revalidatedCanonical = await realpath(path);
    if (
      before.isSymbolicLink() ||
      !before.isFile() ||
      after.isSymbolicLink() ||
      !after.isFile() ||
      !sameFileIdentity(identityOf(before), identityOf(after)) ||
      !samePath(canonical, path) ||
      !samePath(revalidatedCanonical, path)
    ) {
      return "malformed";
    }
    const value: unknown = JSON.parse(source);
    return validate(value)
      ? {
          path,
          source,
          sha256: sha256(source),
          identity: identityOf(after),
          binding: value,
        }
      : "malformed";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? undefined
      : "malformed";
  }
}

async function readBinding(
  context: RecoveryContext,
  leaseId: string,
): Promise<BindingSnapshot<LegacyBootBinding> | undefined | "malformed"> {
  return await readBindingAt(
    join(context.bindingsRoot, `${leaseId}.json`),
    validateBinding,
  );
}

async function readLegacyBinding(
  context: RecoveryContext,
  leaseId: string,
): Promise<BindingSnapshot<LegacyBootBindingV1> | undefined | "malformed"> {
  return await readBindingAt(
    join(context.legacyBindingsRoot, `${leaseId}.json`),
    validateLegacyBinding,
  );
}

async function atomicWrite(
  path: string,
  value: unknown,
  exclusive: boolean,
): Promise<void> {
  const source = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = join(
    dirname(path),
    `.${randomBytes(12).toString("hex")}.tmp`,
  );
  await writeFile(temporary, source, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  try {
    if (exclusive) {
      try {
        await lstat(path);
        throw new Error("Lease recovery target already exists.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function withLeaseLock<T>(
  context: RecoveryContext,
  leaseId: string,
  action: () => Promise<T>,
): Promise<T | "locked"> {
  const lock = join(context.sessionsRoot, `${leaseId}.maintenance.lock`);
  try {
    await writeFile(lock, `${context.operationId}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return "locked";
    throw error;
  }
  try {
    return await action();
  } finally {
    await unlink(lock).catch(() => undefined);
  }
}

function item(
  leaseId: string,
  decision: LeaseRecoveryDecision,
  reason: LeaseRecoveryReason,
  details: Pick<
    LeaseRecoveryItemResult,
    "evidenceSource" | "previousBootIdentifier" | "auditPath"
  > = {},
): LeaseRecoveryItemResult {
  return {
    leaseId,
    decision,
    reason,
    ...(details.evidenceSource === undefined
      ? {}
      : { evidenceSource: details.evidenceSource }),
    ...(details.previousBootIdentifier === undefined
      ? {}
      : { previousBootIdentifier: details.previousBootIdentifier }),
    ...(details.auditPath === undefined
      ? {}
      : { auditPath: details.auditPath }),
  };
}

async function writeAudit(
  context: RecoveryContext,
  snapshot: LeaseSnapshot,
  result: LeaseRecoveryItemResult,
): Promise<string> {
  await ensureDirectory(
    context.maintenanceRoot,
    join(context.projectRoot, ".pumarejo"),
  );
  await ensureDirectory(context.auditsRoot, context.maintenanceRoot);
  const operationRoot = join(context.auditsRoot, context.operationId);
  await ensureDirectory(operationRoot, context.auditsRoot);
  const path = join(operationRoot, `${snapshot.leaseId}.json`);
  const audit = {
    schema: AUDIT_SCHEMA,
    operationId: context.operationId,
    timestamp: new Date(context.now).toISOString(),
    actor: context.actor,
    action: context.action,
    lease: {
      leaseId: snapshot.leaseId,
      sha256: snapshot.sha256,
      ...(snapshot.record === undefined
        ? {}
        : {
            version: snapshot.record.version,
            state: snapshot.record.state,
            mechanism: snapshot.record.mechanism,
          }),
    },
    decision: result.decision,
    reason: result.reason,
    ...(result.evidenceSource === undefined
      ? {}
      : { evidenceSource: result.evidenceSource }),
    ...(result.previousBootIdentifier === undefined
      ? {}
      : { previousBootIdentifier: result.previousBootIdentifier }),
    currentBootIdentifier: context.currentBootIdentifier,
    mutationPerformed:
      result.decision === "recovered" ||
      result.decision === "bound" ||
      result.decision === "upgraded",
  };
  await atomicWrite(path, audit, true);
  return path;
}

async function audited(
  context: RecoveryContext,
  snapshot: LeaseSnapshot,
  result: LeaseRecoveryItemResult,
): Promise<LeaseRecoveryItemResult> {
  if (!context.execute) return result;
  const auditPath = await writeAudit(context, snapshot, result);
  return { ...result, auditPath };
}

async function bindLegacy(
  context: RecoveryContext,
  snapshot: LeaseSnapshot,
): Promise<LeaseRecoveryItemResult> {
  const record = snapshot.record;
  if (record === undefined || snapshot.malformed) {
    return await audited(
      context,
      snapshot,
      item(snapshot.leaseId, "rejected", "malformed_lease"),
    );
  }
  if (
    record.version !== 1 ||
    record.mechanism !== "windows_job_object" ||
    record.state === "closed"
  ) {
    return await audited(
      context,
      snapshot,
      item(snapshot.leaseId, "rejected", "unsupported_mechanism"),
    );
  }
  const existing = await readBinding(context, snapshot.leaseId);
  if (existing === "malformed") {
    return await audited(
      context,
      snapshot,
      item(snapshot.leaseId, "rejected", "contradictory_binding"),
    );
  }
  if (existing !== undefined) {
    const binding = existing.binding;
    const matches =
      binding.leaseSha256 === snapshot.sha256 &&
      sameFileIdentity(binding.fileIdentity, snapshot.identity) &&
      sameWindowsBootIdentifier(
        binding.observedBootIdentifier,
        context.currentBootIdentifier,
      ) &&
      samePath(binding.projectRoot, context.projectRoot);
    return await audited(
      context,
      snapshot,
      item(
        snapshot.leaseId,
        matches ? "already_bound" : "rejected",
        matches ? "already_bound" : "contradictory_binding",
      ),
    );
  }
  const legacyBinding = await readLegacyBinding(context, snapshot.leaseId);
  if (legacyBinding !== undefined) {
    return await audited(
      context,
      snapshot,
      item(
        snapshot.leaseId,
        "rejected",
        legacyBinding === "malformed"
          ? "contradictory_binding"
          : "legacy_binding_upgrade_required",
      ),
    );
  }
  if (!context.execute) {
    return item(snapshot.leaseId, "would_bind", "legacy_boot_bound");
  }
  const outcome = await withLeaseLock(context, snapshot.leaseId, async () => {
    await context.beforeMutation?.(snapshot.leaseId);
    const current = await readSnapshot(snapshot.path, snapshot.leaseId);
    if (
      current.malformed ||
      current.sha256 !== snapshot.sha256 ||
      !sameFileIdentity(current.identity, snapshot.identity)
    ) {
      return item(snapshot.leaseId, "rejected", "lease_changed");
    }
    await ensureDirectory(
      context.maintenanceRoot,
      join(context.projectRoot, ".pumarejo"),
    );
    await ensureDirectory(context.bindingsRoot, context.maintenanceRoot);
    const binding: LegacyBootBinding = {
      schema: BINDING_SCHEMA,
      operationId: context.operationId,
      leaseId: snapshot.leaseId,
      leaseSha256: snapshot.sha256,
      fileIdentity: snapshot.identity,
      observedBootIdentifier: context.currentBootIdentifier,
      capturedAt: context.now,
      actor: context.actor,
      projectRoot: context.projectRoot,
    };
    await atomicWrite(
      join(context.bindingsRoot, `${snapshot.leaseId}.json`),
      binding,
      true,
    );
    return item(snapshot.leaseId, "bound", "legacy_boot_bound");
  });
  const result =
    outcome === "locked"
      ? item(snapshot.leaseId, "rejected", "recovery_locked")
      : outcome;
  return await audited(context, snapshot, result);
}

async function upgradeLegacyBinding(
  context: RecoveryContext,
  snapshot: LeaseSnapshot,
): Promise<LeaseRecoveryItemResult> {
  const record = snapshot.record;
  if (record === undefined || snapshot.malformed) {
    return await audited(
      context,
      snapshot,
      item(snapshot.leaseId, "rejected", "malformed_lease"),
    );
  }
  if (
    record.version !== 1 ||
    record.mechanism !== "windows_job_object" ||
    record.state === "closed"
  ) {
    return await audited(
      context,
      snapshot,
      item(snapshot.leaseId, "rejected", "unsupported_mechanism"),
    );
  }

  const existing = await readBinding(context, snapshot.leaseId);
  if (existing === "malformed") {
    return await audited(
      context,
      snapshot,
      item(snapshot.leaseId, "rejected", "contradictory_binding"),
    );
  }
  if (existing !== undefined) {
    const binding = existing.binding;
    const matches =
      binding.leaseSha256 === snapshot.sha256 &&
      sameFileIdentity(binding.fileIdentity, snapshot.identity) &&
      sameWindowsBootIdentifier(
        binding.observedBootIdentifier,
        context.currentBootIdentifier,
      ) &&
      samePath(binding.projectRoot, context.projectRoot);
    return await audited(
      context,
      snapshot,
      item(
        snapshot.leaseId,
        matches ? "already_bound" : "rejected",
        matches ? "already_bound" : "contradictory_binding",
      ),
    );
  }

  const legacy = await readLegacyBinding(context, snapshot.leaseId);
  if (legacy === undefined) {
    return await audited(
      context,
      snapshot,
      item(snapshot.leaseId, "rejected", "ambiguous_missing_boot"),
    );
  }
  if (legacy === "malformed") {
    return await audited(
      context,
      snapshot,
      item(snapshot.leaseId, "rejected", "contradictory_binding"),
    );
  }
  const legacyBinding = legacy.binding;
  if (
    legacyBinding.leaseSha256 !== snapshot.sha256 ||
    !sameFileIdentity(legacyBinding.fileIdentity, snapshot.identity) ||
    !samePath(legacyBinding.projectRoot, context.projectRoot) ||
    legacyBinding.observedBootIdentifier.value !==
      context.currentBootIdentifier.bootEnvironmentGuid
  ) {
    return await audited(
      context,
      snapshot,
      item(snapshot.leaseId, "rejected", "legacy_binding_mismatch"),
    );
  }
  if (!context.execute) {
    return item(snapshot.leaseId, "would_upgrade", "legacy_binding_upgraded");
  }

  const outcome = await withLeaseLock(context, snapshot.leaseId, async () => {
    await context.beforeMutation?.(snapshot.leaseId);
    const current = await readSnapshot(snapshot.path, snapshot.leaseId);
    const currentLegacy = await readLegacyBinding(context, snapshot.leaseId);
    const currentBinding = await readBinding(context, snapshot.leaseId);
    if (
      current.malformed ||
      current.sha256 !== snapshot.sha256 ||
      !sameFileIdentity(current.identity, snapshot.identity) ||
      currentLegacy === undefined ||
      currentLegacy === "malformed" ||
      currentLegacy.sha256 !== legacy.sha256 ||
      !sameFileIdentity(currentLegacy.identity, legacy.identity) ||
      currentBinding !== undefined
    ) {
      return item(snapshot.leaseId, "rejected", "lease_changed");
    }
    await ensureDirectory(
      context.maintenanceRoot,
      join(context.projectRoot, ".pumarejo"),
    );
    await ensureDirectory(context.bindingsRoot, context.maintenanceRoot);
    const binding: LegacyBootBinding = {
      schema: BINDING_SCHEMA,
      operationId: context.operationId,
      leaseId: snapshot.leaseId,
      leaseSha256: snapshot.sha256,
      fileIdentity: snapshot.identity,
      observedBootIdentifier: context.currentBootIdentifier,
      capturedAt: context.now,
      actor: context.actor,
      projectRoot: context.projectRoot,
      supersedes: {
        schema: LEGACY_BINDING_SCHEMA,
        operationId: legacyBinding.operationId,
        bindingSha256: legacy.sha256,
      },
    };
    await atomicWrite(
      join(context.bindingsRoot, `${snapshot.leaseId}.json`),
      binding,
      true,
    );
    return item(snapshot.leaseId, "upgraded", "legacy_binding_upgraded");
  });
  const result =
    outcome === "locked"
      ? item(snapshot.leaseId, "rejected", "recovery_locked")
      : outcome;
  return await audited(context, snapshot, result);
}

async function recoveryBootEvidence(
  context: RecoveryContext,
  snapshot: LeaseSnapshot,
): Promise<
  | {
      readonly boot: WindowsBootIdentifier;
      readonly source: "creation_boot" | "legacy_binding";
    }
  | LeaseRecoveryItemResult
> {
  const record = snapshot.record;
  if (record === undefined || snapshot.malformed) {
    return item(snapshot.leaseId, "rejected", "malformed_lease");
  }
  if (record.mechanism !== "windows_job_object") {
    return item(snapshot.leaseId, "rejected", "unsupported_mechanism");
  }
  if (
    record.version === CUSTODY_LEASE_VERSION &&
    record.state === "closed" &&
    (record.recoveryHistory?.length ?? 0) > 0
  ) {
    return item(snapshot.leaseId, "already_recovered", "already_recovered");
  }
  if (record.version === CUSTODY_LEASE_VERSION) {
    if (
      record.platform !== "win32" ||
      !validateWindowsBootIdentifier(record.bootIdentifier)
    ) {
      return item(snapshot.leaseId, "rejected", "malformed_lease");
    }
    return {
      boot: record.bootIdentifier,
      source:
        record.bootProvenance === "legacy_binding"
          ? "legacy_binding"
          : "creation_boot",
    };
  }
  const binding = await readBinding(context, snapshot.leaseId);
  if (binding === undefined) {
    const legacyBinding = await readLegacyBinding(context, snapshot.leaseId);
    if (legacyBinding === "malformed") {
      return item(snapshot.leaseId, "rejected", "contradictory_binding");
    }
    return item(
      snapshot.leaseId,
      "rejected",
      legacyBinding === undefined
        ? "ambiguous_missing_boot"
        : "legacy_binding_upgrade_required",
    );
  }
  if (binding === "malformed") {
    return item(snapshot.leaseId, "rejected", "contradictory_binding");
  }
  const currentBinding = binding.binding;
  if (
    currentBinding.leaseSha256 !== snapshot.sha256 ||
    !sameFileIdentity(currentBinding.fileIdentity, snapshot.identity) ||
    !samePath(currentBinding.projectRoot, context.projectRoot)
  ) {
    return item(snapshot.leaseId, "rejected", "legacy_binding_mismatch");
  }
  if (currentBinding.supersedes !== undefined) {
    const legacyBinding = await readLegacyBinding(context, snapshot.leaseId);
    if (
      legacyBinding === undefined ||
      legacyBinding === "malformed" ||
      legacyBinding.sha256 !== currentBinding.supersedes.bindingSha256 ||
      legacyBinding.binding.operationId !==
        currentBinding.supersedes.operationId
    ) {
      return item(snapshot.leaseId, "rejected", "contradictory_binding");
    }
  }
  return {
    boot: currentBinding.observedBootIdentifier,
    source: "legacy_binding",
  };
}

function recoveredRecord(
  context: RecoveryContext,
  snapshot: LeaseSnapshot,
  boot: WindowsBootIdentifier,
  source: "creation_boot" | "legacy_binding",
): CustodyLeaseRecord {
  const record = snapshot.record!;
  const event: CustodyLeaseRecoveryEvent = {
    operationId: context.operationId,
    recoveredAt: context.now,
    actorSid: context.actor.sid,
    actorPid: context.actor.pid,
    source,
    reason: "previous_boot",
    leaseSha256: snapshot.sha256,
    previousBootIdentifier: boot,
    currentBootIdentifier: context.currentBootIdentifier,
  };
  const next: CustodyLeaseRecord = {
    ...record,
    version: CUSTODY_LEASE_VERSION,
    state: "closed",
    updatedAt: context.now,
    platform: "win32",
    bootIdentifier: boot,
    bootProvenance: source === "creation_boot" ? "creation" : "legacy_binding",
    context:
      record.context ??
      ({
        command: "legacy-recovery",
        projectRoot: context.projectRoot,
      } as const),
    recoveryHistory: [...(record.recoveryHistory ?? []), event],
  };
  if (!validateCustodyLease(next)) {
    throw new Error("Recovered custody lease failed schema validation.");
  }
  return next;
}

async function recover(
  context: RecoveryContext,
  snapshot: LeaseSnapshot,
): Promise<LeaseRecoveryItemResult> {
  const evidence = await recoveryBootEvidence(context, snapshot);
  if ("decision" in evidence) {
    return await audited(context, snapshot, evidence);
  }
  if (sameWindowsBootIdentifier(evidence.boot, context.currentBootIdentifier)) {
    return await audited(
      context,
      snapshot,
      item(snapshot.leaseId, "rejected", "same_boot", {
        evidenceSource: evidence.source,
        previousBootIdentifier: evidence.boot,
      }),
    );
  }
  if (!context.execute) {
    return item(snapshot.leaseId, "would_recover", "previous_boot", {
      evidenceSource: evidence.source,
      previousBootIdentifier: evidence.boot,
    });
  }
  const outcome = await withLeaseLock(context, snapshot.leaseId, async () => {
    await context.beforeMutation?.(snapshot.leaseId);
    const current = await readSnapshot(snapshot.path, snapshot.leaseId);
    if (
      current.malformed ||
      current.sha256 !== snapshot.sha256 ||
      !sameFileIdentity(current.identity, snapshot.identity)
    ) {
      return item(snapshot.leaseId, "rejected", "lease_changed");
    }
    const currentEvidence = await recoveryBootEvidence(context, current);
    if ("decision" in currentEvidence) return currentEvidence;
    if (
      !sameWindowsBootIdentifier(currentEvidence.boot, evidence.boot) ||
      currentEvidence.source !== evidence.source ||
      sameWindowsBootIdentifier(
        currentEvidence.boot,
        context.currentBootIdentifier,
      )
    ) {
      return item(snapshot.leaseId, "rejected", "lease_changed");
    }
    const next = recoveredRecord(
      context,
      current,
      currentEvidence.boot,
      currentEvidence.source,
    );
    const finalCheck = await readSnapshot(snapshot.path, snapshot.leaseId);
    if (
      finalCheck.malformed ||
      finalCheck.sha256 !== current.sha256 ||
      !sameFileIdentity(finalCheck.identity, current.identity)
    ) {
      return item(snapshot.leaseId, "rejected", "lease_changed");
    }
    await atomicWrite(snapshot.path, next, false);
    const persisted = await readSnapshot(snapshot.path, snapshot.leaseId);
    if (
      persisted.record?.version !== CUSTODY_LEASE_VERSION ||
      persisted.record.state !== "closed" ||
      persisted.record.recoveryHistory?.at(-1)?.operationId !==
        context.operationId
    ) {
      throw new Error("Recovered custody lease did not persist atomically.");
    }
    return item(snapshot.leaseId, "recovered", "previous_boot", {
      evidenceSource: evidence.source,
      previousBootIdentifier: evidence.boot,
    });
  });
  const result =
    outcome === "locked"
      ? item(snapshot.leaseId, "rejected", "recovery_locked")
      : outcome;
  return await audited(context, snapshot, result);
}

async function resolveContext(
  options: LeaseRecoveryOptions,
): Promise<RecoveryContext> {
  const projectRoot = resolve(options.projectRoot);
  await assertRegularDirectory(projectRoot, projectRoot);
  const pumarejoRoot = join(projectRoot, ".pumarejo");
  await assertRegularDirectory(pumarejoRoot, pumarejoRoot);
  const sessionsRoot = join(pumarejoRoot, "sessions");
  await assertRegularDirectory(sessionsRoot, sessionsRoot);
  const currentBootIdentifier = await (
    options.currentBootIdentifier ?? readWindowsBootIdentifier
  )();
  if (!validateWindowsBootIdentifier(currentBootIdentifier)) {
    throw new Error("Current Windows boot identity is invalid.");
  }
  const actor = await (options.actingIdentity ?? readWindowsActingIdentity)();
  validateActingIdentity(actor);
  const now = (options.now ?? Date.now)();
  if (!Number.isSafeInteger(now) || now <= 0) {
    throw new Error("Lease recovery timestamp is invalid.");
  }
  const operationId = options.operationId ?? randomBytes(16).toString("hex");
  if (!HEX_32.test(operationId)) {
    throw new Error("Lease recovery operation identity is invalid.");
  }
  return {
    projectRoot,
    sessionsRoot,
    maintenanceRoot: join(pumarejoRoot, "lease-recovery"),
    legacyBindingsRoot: join(pumarejoRoot, "lease-recovery", "bindings"),
    bindingsRoot: join(pumarejoRoot, "lease-recovery", "bindings-v2"),
    auditsRoot: join(pumarejoRoot, "lease-recovery", "audits"),
    action: options.action,
    execute: options.execute,
    currentBootIdentifier,
    actor,
    now,
    operationId,
    ...(options.beforeMutation === undefined
      ? {}
      : { beforeMutation: options.beforeMutation }),
  };
}

export async function runLeaseRecovery(
  options: LeaseRecoveryOptions,
): Promise<LeaseRecoveryResult> {
  const operationId = options.operationId ?? randomBytes(16).toString("hex");
  if ((options.platform ?? process.platform) !== "win32") {
    return {
      schema: RESULT_SCHEMA,
      operationId,
      action: options.action,
      dryRun: !options.execute,
      status: "unsupported_platform",
      results: [],
    };
  }
  const context = await resolveContext({ ...options, operationId });
  const entries = (await readdir(context.sessionsRoot, { withFileTypes: true }))
    .filter((entry) => entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const results: LeaseRecoveryItemResult[] = [];
  for (const entry of entries.slice(0, CUSTODY_LEASE_MAX_COUNT)) {
    const leaseId = entry.name.slice(0, -5);
    const path = join(context.sessionsRoot, entry.name);
    const snapshot =
      HEX_32.test(leaseId) &&
      entry.isFile() &&
      contained(context.sessionsRoot, path)
        ? await readSnapshot(path, leaseId)
        : {
            path,
            leaseId,
            source: "",
            sha256: sha256(""),
            identity: { dev: 0, ino: 0, size: 0, mtimeMs: 0, ctimeMs: 0 },
            malformed: true,
          };
    results.push(
      context.action === "bind-legacy"
        ? await bindLegacy(context, snapshot)
        : context.action === "upgrade-binding"
          ? await upgradeLegacyBinding(context, snapshot)
          : await recover(context, snapshot),
    );
  }
  return {
    schema: RESULT_SCHEMA,
    operationId: context.operationId,
    action: context.action,
    dryRun: !context.execute,
    status: "complete",
    currentBootIdentifier: context.currentBootIdentifier,
    results,
  };
}
