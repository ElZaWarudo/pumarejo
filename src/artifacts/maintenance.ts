import { randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import { z } from "zod";

import { createWindowsArtifactNativeOperations } from "../platform/windows/artifact-cleanup.js";
import {
  readWindowsMaintenanceIdentity,
  type WindowsMaintenanceIdentity,
} from "../platform/windows/maintenance-identity.js";

const MANIFEST_SCHEMA = "pumarejo-artifact-cleanup-manifest/v1" as const;
const ATTESTATION_SCHEMA = "pumarejo-artifact-cleanup-attestation/v1" as const;
const HEX_32 = /^[a-f0-9]{32}$/u;
const HEX_16 = /^[a-f0-9]{16}$/u;
const SID = /^S-\d(?:-\d+)+$/u;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_MANIFEST_BYTES = 64 * 1024;

const filesystemIdentitySchema = z
  .object({
    volumeSerialNumber: z.string().regex(HEX_16),
    fileId: z.string().regex(HEX_32),
  })
  .strict();

const manifestSchema = z
  .object({
    schema: z.literal(MANIFEST_SCHEMA),
    manifestId: z.string().regex(HEX_32),
    projectRoot: z.string().min(1).max(4_096),
    authorizedArtifactRoot: z.string().min(1).max(4_096),
    target: z
      .object({
        artifactId: z.string().regex(SAFE_LABEL),
        canonicalPath: z.string().min(1).max(4_096),
        filesystemIdentity: filesystemIdentitySchema,
        expectedOwnerSid: z.string().regex(SID),
        creationMetadata: z
          .object({
            creationTimeFiletime: z.string().regex(/^\d{1,20}$/u),
            lastWriteTimeFiletime: z.string().regex(/^\d{1,20}$/u),
          })
          .strict(),
        origin: z
          .object({
            workflowId: z.string().regex(SAFE_LABEL),
            sessionId: z.string().regex(SAFE_LABEL).optional(),
            command: z.string().regex(SAFE_LABEL),
          })
          .strict(),
        eligibility: z
          .object({
            state: z.literal("historical-orphaned"),
            verifiedAt: z.number().int().positive().safe(),
            reason: z.string().min(1).max(256),
          })
          .strict(),
      })
      .strict(),
    authorization: z
      .object({
        basis: z.enum(["original-owner", "explicit-maintenance"]),
        authorizedSid: z.string().regex(SID),
        authorizedAt: z.number().int().positive().safe(),
        approvedBy: z.string().regex(SAFE_LABEL),
        reference: z.string().regex(SAFE_LABEL),
      })
      .strict(),
    reason: z.string().min(1).max(256),
  })
  .strict();

export type ArtifactCleanupManifest = z.infer<typeof manifestSchema>;

export interface WindowsArtifactFilesystemIdentity {
  readonly volumeSerialNumber: string;
  readonly fileId: string;
}

export interface WindowsArtifactInspection {
  readonly canonicalPath: string;
  readonly filesystemIdentity: WindowsArtifactFilesystemIdentity;
  readonly ownerSid: string;
  readonly creationTimeFiletime: string;
  readonly lastWriteTimeFiletime: string;
  readonly attributes: number;
  readonly reparseTag: number;
}

export interface ArtifactCleanupSummary {
  readonly files: number;
  readonly directories: number;
  readonly bytes: number;
}

export interface WindowsArtifactDeletionRequest {
  readonly targetPath: string;
  readonly expected: WindowsArtifactInspection;
  readonly maintenancePrivileges?: boolean;
}

export interface WindowsArtifactNativeOperations {
  inspect(
    path: string,
    maintenancePrivileges?: boolean,
  ): Promise<WindowsArtifactInspection>;
  preflight(
    request: WindowsArtifactDeletionRequest,
  ): Promise<ArtifactCleanupSummary>;
  delete(
    request: WindowsArtifactDeletionRequest,
  ): Promise<ArtifactCleanupSummary>;
}

export type ArtifactCleanupReason =
  | "manifest_invalid"
  | "path_outside_authorized_root"
  | "path_ambiguous"
  | "path_unreadable"
  | "unsafe_symlink"
  | "unsafe_junction"
  | "unsafe_mount_point"
  | "unsafe_reparse_point"
  | "ownership_mismatch"
  | "manifest_mismatch"
  | "origin_mismatch"
  | "unauthorized_identity"
  | "maintenance_identity_not_elevated"
  | "maintenance_privilege_unavailable"
  | "target_changed"
  | "native_cleanup_rejected"
  | "deletion_incomplete"
  | "unsupported_platform";

export class ArtifactCleanupNativeError extends Error {
  constructor(readonly code: ArtifactCleanupReason) {
    super(code);
    this.name = "ArtifactCleanupNativeError";
  }
}

export interface ArtifactCleanupResult {
  readonly operationId: string;
  readonly decision:
    | "would_remove"
    | "removed"
    | "already_removed"
    | "rejected";
  readonly reason?: ArtifactCleanupReason;
  readonly completed: boolean;
  readonly attestationPath: string;
  readonly summary: ArtifactCleanupSummary;
}

export interface ArtifactCleanupOptions {
  readonly projectRoot: string;
  readonly manifestPath: string;
  readonly expectedWorkflowId: string;
  readonly expectedSessionId?: string;
  readonly execute: boolean;
  readonly platform?: NodeJS.Platform;
  readonly native?: WindowsArtifactNativeOperations;
  readonly actingIdentity?: () => Promise<WindowsMaintenanceIdentity>;
  readonly now?: () => number;
  readonly operationId?: string;
  /** Test seam for proving immediate pre-mutation identity revalidation. */
  readonly beforeMutation?: () => void | Promise<void>;
}

interface AttestationContext {
  readonly projectRoot: string;
  readonly operationId: string;
  readonly timestamp: number;
  readonly actor: WindowsMaintenanceIdentity;
  readonly validations: Array<{ check: string; status: "passed" | "rejected" }>;
  manifest?: ArtifactCleanupManifest;
  targetPath?: string;
  inspection?: WindowsArtifactInspection;
}

const EMPTY_SUMMARY: ArtifactCleanupSummary = {
  files: 0,
  directories: 0,
  bytes: 0,
};

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? resolve(left).toLowerCase() === resolve(right).toLowerCase()
    : resolve(left) === resolve(right);
}

function isStrictlyInside(root: string, candidate: string): boolean {
  const difference = relative(resolve(root), resolve(candidate));
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

function sameInspection(
  left: WindowsArtifactInspection,
  right: WindowsArtifactInspection,
): boolean {
  return (
    samePath(left.canonicalPath, right.canonicalPath) &&
    left.filesystemIdentity.volumeSerialNumber ===
      right.filesystemIdentity.volumeSerialNumber &&
    left.filesystemIdentity.fileId === right.filesystemIdentity.fileId &&
    left.ownerSid === right.ownerSid &&
    left.creationTimeFiletime === right.creationTimeFiletime &&
    left.lastWriteTimeFiletime === right.lastWriteTimeFiletime &&
    left.attributes === right.attributes &&
    left.reparseTag === right.reparseTag
  );
}

function matchesManifest(
  inspection: WindowsArtifactInspection,
  manifest: ArtifactCleanupManifest,
): boolean {
  const target = manifest.target;
  return (
    samePath(inspection.canonicalPath, target.canonicalPath) &&
    inspection.filesystemIdentity.volumeSerialNumber ===
      target.filesystemIdentity.volumeSerialNumber &&
    inspection.filesystemIdentity.fileId === target.filesystemIdentity.fileId &&
    inspection.ownerSid === target.expectedOwnerSid &&
    inspection.creationTimeFiletime ===
      target.creationMetadata.creationTimeFiletime &&
    inspection.lastWriteTimeFiletime ===
      target.creationMetadata.lastWriteTimeFiletime &&
    inspection.reparseTag === 0
  );
}

function validSummary(value: ArtifactCleanupSummary): boolean {
  return [value.files, value.directories, value.bytes].every(
    (item) => Number.isSafeInteger(item) && item >= 0,
  );
}

async function assertDirectory(path: string): Promise<string> {
  const before = await lstat(path);
  const canonical = await realpath(path);
  const after = await lstat(path);
  if (
    before.isSymbolicLink() ||
    !before.isDirectory() ||
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    !samePath(canonical, path)
  ) {
    throw new Error("unsafe directory");
  }
  return canonical;
}

async function ensureDirectory(parent: string, child: string): Promise<void> {
  await assertDirectory(parent);
  try {
    await mkdir(child, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await assertDirectory(child);
}

async function writeAttestation(
  context: AttestationContext,
  decision: ArtifactCleanupResult["decision"],
  reason: ArtifactCleanupReason | undefined,
  summary: ArtifactCleanupSummary,
): Promise<ArtifactCleanupResult> {
  const maintenanceRoot = join(
    context.projectRoot,
    ".pumarejo",
    "artifact-cleanup",
  );
  const attestationsRoot = join(maintenanceRoot, "attestations");
  await ensureDirectory(
    join(context.projectRoot, ".pumarejo"),
    maintenanceRoot,
  );
  await ensureDirectory(maintenanceRoot, attestationsRoot);
  const target = join(attestationsRoot, `${context.operationId}.json`);
  const temporary = join(
    attestationsRoot,
    `.${context.operationId}.${randomBytes(6).toString("hex")}.tmp`,
  );
  const completed = decision === "removed" || decision === "already_removed";
  const source = `${JSON.stringify({
    schema: ATTESTATION_SCHEMA,
    operationId: context.operationId,
    timestamp: context.timestamp,
    actingIdentity: context.actor,
    authorizationBasis: context.manifest?.authorization.basis,
    manifestId: context.manifest?.manifestId,
    canonicalTargetPath: context.targetPath,
    durableTargetIdentity: context.inspection?.filesystemIdentity,
    associatedOrigin: context.manifest?.target.origin,
    validationResults: context.validations,
    summary,
    reasonForRemoval: context.manifest?.reason,
    decision,
    deletionCompleted: completed,
    skippedTargets:
      decision === "already_removed" && context.targetPath
        ? [context.targetPath]
        : [],
    rejectedTargets:
      decision === "rejected" && context.targetPath ? [context.targetPath] : [],
    errors: reason === undefined ? [] : [reason],
  })}\n`;
  await writeFile(temporary, source, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  try {
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return {
    operationId: context.operationId,
    decision,
    ...(reason === undefined ? {} : { reason }),
    completed,
    attestationPath: target,
    summary,
  };
}

function reject(
  context: AttestationContext,
  reason: ArtifactCleanupReason,
  summary: ArtifactCleanupSummary = EMPTY_SUMMARY,
): Promise<ArtifactCleanupResult> {
  context.validations.push({ check: reason, status: "rejected" });
  return writeAttestation(context, "rejected", reason, summary);
}

function nativeReason(error: unknown): ArtifactCleanupReason {
  if (error instanceof ArtifactCleanupNativeError) return error.code;
  if (
    error instanceof Error &&
    [
      "unsafe_symlink",
      "unsafe_junction",
      "unsafe_mount_point",
      "unsafe_reparse_point",
      "ownership_mismatch",
      "manifest_mismatch",
      "target_changed",
      "maintenance_privilege_unavailable",
      "native_cleanup_rejected",
    ].includes(error.message)
  ) {
    return error.message as ArtifactCleanupReason;
  }
  return "native_cleanup_rejected";
}

async function targetMissing(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

export async function runArtifactCleanup(
  options: ArtifactCleanupOptions,
): Promise<ArtifactCleanupResult> {
  const projectRoot = resolve(options.projectRoot);
  await assertDirectory(projectRoot);
  await assertDirectory(join(projectRoot, ".pumarejo"));
  const operationId = options.operationId ?? randomBytes(16).toString("hex");
  const timestamp = (options.now ?? Date.now)();
  if (
    !HEX_32.test(operationId) ||
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0
  ) {
    throw new Error("Artifact cleanup operation metadata is invalid.");
  }
  const actor = await (
    options.actingIdentity ?? readWindowsMaintenanceIdentity
  )();
  const context: AttestationContext = {
    projectRoot,
    operationId,
    timestamp,
    actor,
    validations: [],
  };
  if ((options.platform ?? process.platform) !== "win32") {
    return await reject(context, "unsupported_platform");
  }

  let manifest: ArtifactCleanupManifest;
  try {
    const manifestMetadata = await lstat(options.manifestPath);
    if (
      manifestMetadata.isSymbolicLink() ||
      !manifestMetadata.isFile() ||
      manifestMetadata.size > MAX_MANIFEST_BYTES ||
      !samePath(await realpath(options.manifestPath), options.manifestPath)
    ) {
      return await reject(context, "manifest_invalid");
    }
    manifest = manifestSchema.parse(
      JSON.parse(await readFile(options.manifestPath, "utf8")),
    );
    context.manifest = manifest;
    context.targetPath = resolve(manifest.target.canonicalPath);
    context.validations.push({ check: "manifest", status: "passed" });
  } catch {
    return await reject(context, "manifest_invalid");
  }

  const authorizedRoot = resolve(manifest.authorizedArtifactRoot);
  const targetPath = resolve(manifest.target.canonicalPath);
  if (
    !isAbsolute(manifest.projectRoot) ||
    !isAbsolute(manifest.authorizedArtifactRoot) ||
    !isAbsolute(manifest.target.canonicalPath) ||
    !samePath(manifest.projectRoot, projectRoot) ||
    !samePath(authorizedRoot, join(projectRoot, ".pumarejo")) ||
    !isStrictlyInside(authorizedRoot, targetPath)
  ) {
    return await reject(context, "path_outside_authorized_root");
  }
  if (basename(targetPath) !== manifest.target.artifactId) {
    return await reject(context, "manifest_mismatch");
  }
  try {
    await assertDirectory(authorizedRoot);
  } catch {
    return await reject(context, "path_ambiguous");
  }
  context.validations.push({ check: "authorized-root", status: "passed" });

  if (
    manifest.target.origin.workflowId !== options.expectedWorkflowId ||
    manifest.target.origin.sessionId !== options.expectedSessionId
  ) {
    return await reject(context, "origin_mismatch");
  }
  context.validations.push({ check: "origin", status: "passed" });

  if (actor.sid !== manifest.authorization.authorizedSid) {
    return await reject(context, "unauthorized_identity");
  }
  if (
    manifest.authorization.basis === "original-owner" &&
    actor.sid !== manifest.target.expectedOwnerSid
  ) {
    return await reject(context, "ownership_mismatch");
  }
  if (
    manifest.authorization.basis === "explicit-maintenance" &&
    actor.elevatedAdministrator !== true
  ) {
    return await reject(context, "maintenance_identity_not_elevated");
  }
  context.validations.push({ check: "authorization", status: "passed" });

  if (await targetMissing(targetPath)) {
    context.validations.push({ check: "target-absent", status: "passed" });
    return await writeAttestation(
      context,
      "already_removed",
      undefined,
      EMPTY_SUMMARY,
    );
  }
  const maintenancePrivileges =
    manifest.authorization.basis === "explicit-maintenance";
  if (!maintenancePrivileges) {
    try {
      const targetMetadata = await lstat(targetPath);
      if (targetMetadata.isSymbolicLink()) {
        return await reject(context, "unsafe_symlink");
      }
      if (
        !targetMetadata.isDirectory() ||
        !samePath(await realpath(targetPath), targetPath)
      ) {
        return await reject(context, "path_ambiguous");
      }
    } catch {
      return await reject(context, "path_unreadable");
    }
  }

  const native = options.native ?? createWindowsArtifactNativeOperations();
  let inspection: WindowsArtifactInspection;
  try {
    inspection = await native.inspect(targetPath, maintenancePrivileges);
  } catch (error) {
    return await reject(context, nativeReason(error));
  }
  context.inspection = inspection;
  if (inspection.reparseTag !== 0) {
    return await reject(context, "unsafe_reparse_point");
  }
  if (!matchesManifest(inspection, manifest)) {
    return await reject(
      context,
      inspection.ownerSid !== manifest.target.expectedOwnerSid
        ? "ownership_mismatch"
        : "manifest_mismatch",
    );
  }
  context.validations.push({ check: "durable-identity", status: "passed" });

  let summary: ArtifactCleanupSummary;
  try {
    summary = await native.preflight({
      targetPath,
      expected: inspection,
      maintenancePrivileges,
    });
    if (!validSummary(summary))
      throw new ArtifactCleanupNativeError("native_cleanup_rejected");
  } catch (error) {
    return await reject(context, nativeReason(error));
  }
  context.validations.push({ check: "recursive-preflight", status: "passed" });
  if (!options.execute) {
    return await writeAttestation(context, "would_remove", undefined, summary);
  }

  await options.beforeMutation?.();
  let revalidated: WindowsArtifactInspection;
  try {
    revalidated = await native.inspect(targetPath, maintenancePrivileges);
  } catch {
    return await reject(context, "target_changed", summary);
  }
  if (
    !sameInspection(inspection, revalidated) ||
    !matchesManifest(revalidated, manifest)
  ) {
    return await reject(context, "target_changed", summary);
  }
  context.validations.push({
    check: "pre-mutation-revalidation",
    status: "passed",
  });
  try {
    const removed = await native.delete({
      targetPath,
      expected: revalidated,
      maintenancePrivileges,
    });
    if (!validSummary(removed))
      throw new ArtifactCleanupNativeError("native_cleanup_rejected");
    summary = removed;
  } catch (error) {
    return await reject(context, nativeReason(error), summary);
  }
  if (!(await targetMissing(targetPath))) {
    return await reject(context, "deletion_incomplete", summary);
  }
  context.validations.push({ check: "verified-removal", status: "passed" });
  return await writeAttestation(context, "removed", undefined, summary);
}
