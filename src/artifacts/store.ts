import { randomBytes } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { z } from "zod";

import { PumarejoError } from "../shared/errors.js";
import {
  createArtifactPermissionEnforcer,
  type ArtifactPermissionEnforcer,
} from "./permissions.js";
import {
  evaluateRetentionPlan,
  type RetentionPlan,
  type RetentionPolicy,
} from "./retention.js";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ARTIFACT_BYTES = 24 * 1024 * 1024;
const MAX_SESSION_ARTIFACT_BYTES = 256 * 1024 * 1024;
const MAX_ARTIFACTS_PER_SESSION = 256;
const SESSION_ID = /^[a-f0-9]{32,64}$/u;
const ENTRY_NAME = /^screenshot-\d{4}\.png$/u;
const TEMP_NAME = /^\.(?:screenshot-\d{4}\.png)\.[a-f0-9]{16}\.tmp$/u;

const artifactEntrySchema = z
  .object({
    path: z.string().regex(ENTRY_NAME),
    tempPath: z.string().regex(TEMP_NAME),
    size: z.number().int().positive().max(MAX_ARTIFACT_BYTES),
    state: z.enum(["reserved", "written"]),
  })
  .strict();

const artifactManifestSchema = z
  .object({
    version: z.literal(1),
    sessionId: z.string().regex(SESSION_ID),
    sessionDirectory: z.string().regex(/^session-[a-f0-9]{32,64}$/u),
    retainArtifacts: z.boolean(),
    createdAt: z.string().datetime(),
    closed: z.boolean(),
    entries: z.array(artifactEntrySchema).max(MAX_ARTIFACTS_PER_SESSION),
  })
  .strict();

type ArtifactManifest = z.infer<typeof artifactManifestSchema>;

export interface ArtifactStoreOptions {
  readonly projectRoot: string;
  readonly artifactsRoot: string;
  readonly retainArtifacts: boolean;
  readonly sessionId?: string;
  readonly permissions?: ArtifactPermissionEnforcer;
  /** Internal-only native adapter; absent means preserve quarantine bytes. */
  readonly quarantineDeleter?: ArtifactQuarantineDeleter;
  readonly now?: () => Date;
}

export interface StoredArtifact {
  readonly projectRelativePath: string;
}

export interface ArtifactRecoveryResult {
  readonly removed: number;
  readonly retained: number;
  readonly status?: "unavailable";
  readonly retryable?: true;
  readonly reason?: "identity_bound_quarantine_deletion_unavailable";
}

export interface ArtifactCleanupOutcome {
  readonly state: "removed" | "retained" | "quarantined";
  readonly status: "complete" | "unavailable";
  readonly removed: number;
  readonly retained: number;
  readonly retryable: boolean;
  readonly reason?: "identity_bound_quarantine_deletion_unavailable";
}

export interface ArtifactOrphanProof {
  readonly sessionId: string;
  readonly owned: true;
  readonly orphaned: true;
  readonly active: false;
}

export type ArtifactOrphanProofVerifier = (
  proof: ArtifactOrphanProof,
) => boolean | Promise<boolean>;

export interface ArtifactRetentionProofRequest {
  readonly sessionId: string;
  readonly createdAt: string;
  readonly closed: boolean;
  readonly retainArtifacts: true;
}

export interface ArtifactRetentionProof {
  readonly sessionId: string;
  readonly owned: boolean;
  readonly active: boolean;
}

/** RDM-016-backed proof; malformed or conflicting results are preserved. */
export type ArtifactRetentionProofVerifier = (
  candidate: ArtifactRetentionProofRequest,
) => unknown | Promise<unknown>;

type ArtifactIdentityMetadata = Pick<
  Awaited<ReturnType<typeof lstat>>,
  "dev" | "ino" | "mode" | "size" | "mtimeMs" | "ctimeMs"
>;

export interface ArtifactQuarantineIdentity extends ArtifactIdentityMetadata {
  readonly relativePath: string;
  readonly kind: "directory" | "file";
}

export interface ArtifactQuarantineDeletionRequest {
  readonly quarantineRoot: string;
  readonly root: ArtifactQuarantineIdentity;
  readonly entries: readonly ArtifactQuarantineIdentity[];
}

export interface ArtifactQuarantineDeletionAttestation {
  readonly attested: true;
  readonly root: ArtifactQuarantineIdentity;
  readonly entries: readonly ArtifactQuarantineIdentity[];
}

/** Internal-only seam for a platform native, identity-bound deleter. */
export type ArtifactQuarantineDeleter = (
  request: ArtifactQuarantineDeletionRequest,
) =>
  | ArtifactQuarantineDeletionAttestation
  | undefined
  | Promise<ArtifactQuarantineDeletionAttestation | undefined>;

const QUARANTINE_DELETION_UNAVAILABLE =
  "identity_bound_quarantine_deletion_unavailable" as const;

function unavailableRecoveryResult(
  removed: number,
  retained: number,
): ArtifactRecoveryResult {
  return {
    removed,
    retained,
    status: "unavailable",
    retryable: true,
    reason: QUARANTINE_DELETION_UNAVAILABLE,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function hasExplicitRetentionProof(
  verifier: ArtifactRetentionProofVerifier | undefined,
  candidate: ArtifactRetentionProofRequest,
): Promise<ArtifactRetentionProof | undefined> {
  if (verifier === undefined) return undefined;
  let result: unknown;
  try {
    result = await verifier(candidate);
  } catch {
    return undefined;
  }
  if (!isRecord(result)) return undefined;
  const keys = Object.keys(result).sort();
  if (keys.join(",") !== "active,owned,sessionId") return undefined;
  if (
    result.sessionId !== candidate.sessionId ||
    result.owned !== true ||
    result.active !== false
  ) {
    return undefined;
  }
  return {
    sessionId: result.sessionId,
    owned: result.owned,
    active: result.active,
  };
}

async function hasExplicitOrphanProof(
  verifier: ArtifactOrphanProofVerifier | undefined,
  sessionId: string,
): Promise<boolean> {
  if (verifier === undefined) return false;
  try {
    return (
      (await verifier({
        sessionId,
        owned: true,
        orphaned: true,
        active: false,
      })) === true
    );
  } catch {
    return false;
  }
}

function screenshotError(cause?: unknown): PumarejoError {
  return new PumarejoError("SCREENSHOT_FAILED", { cause });
}

function artifactsPreflightError(cause?: unknown): PumarejoError {
  return new PumarejoError("ARTIFACTS_DIRECTORY_NOT_WRITABLE", { cause });
}

function artifactRecoveryError(cause?: unknown): PumarejoError {
  return new PumarejoError("ARTIFACT_RECOVERY_FAILED", { cause });
}

function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

function sameCanonicalPath(left: string, right: string): boolean {
  if (process.platform !== "win32") return left === right;
  return left.toLowerCase() === right.toLowerCase();
}

function sameMetadata(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function sameMovedIdentity(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>,
): boolean {
  if (left.dev !== right.dev || left.ino !== right.ino) return false;
  if (left.ino > 0 || right.ino > 0) return true;
  return (
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function sameQuarantineIdentity(
  left: ArtifactQuarantineIdentity,
  right: ArtifactQuarantineIdentity,
): boolean {
  return (
    left.relativePath === right.relativePath &&
    left.kind === right.kind &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function identityFromMetadata(
  relativePath: string,
  kind: ArtifactQuarantineIdentity["kind"],
  metadata: ArtifactIdentityMetadata,
): ArtifactQuarantineIdentity {
  return {
    relativePath,
    kind,
    dev: metadata.dev,
    ino: metadata.ino,
    mode: metadata.mode,
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    ctimeMs: metadata.ctimeMs,
  };
}

async function readQuarantineIdentity(
  quarantineRoot: string,
  relativePath: string,
  kind: ArtifactQuarantineIdentity["kind"],
): Promise<ArtifactQuarantineIdentity> {
  const path = join(quarantineRoot, relativePath);
  const metadata = await lstat(path);
  const canonical = await realpath(path);
  const revalidated = await lstat(path);
  const revalidatedCanonical = await realpath(path);
  if (
    metadata.isSymbolicLink() ||
    (kind === "directory" ? !metadata.isDirectory() : !metadata.isFile()) ||
    revalidated.isSymbolicLink() ||
    (kind === "directory"
      ? !revalidated.isDirectory()
      : !revalidated.isFile()) ||
    !sameMetadata(metadata, revalidated) ||
    !sameCanonicalPath(canonical, path) ||
    !sameCanonicalPath(revalidatedCanonical, path) ||
    !sameCanonicalPath(canonical, revalidatedCanonical)
  ) {
    throw new Error("artifact quarantine identity changed");
  }
  return identityFromMetadata(relativePath, kind, revalidated);
}

async function validateQuarantineIdentities(
  request: ArtifactQuarantineDeletionRequest,
): Promise<void> {
  const root = await readQuarantineIdentity(
    request.quarantineRoot,
    ".",
    "directory",
  );
  if (!sameQuarantineIdentity(root, request.root)) {
    throw new Error("artifact quarantine root identity changed");
  }
  for (const expected of request.entries) {
    const current = await readQuarantineIdentity(
      request.quarantineRoot,
      expected.relativePath,
      expected.kind,
    );
    if (!sameQuarantineIdentity(current, expected)) {
      throw new Error("artifact quarantine entry identity changed");
    }
  }
}

function sameIdentityList(
  left: readonly ArtifactQuarantineIdentity[],
  right: readonly ArtifactQuarantineIdentity[],
): boolean {
  return (
    left.length === right.length &&
    left.every((identity, index) => {
      const other = right[index];
      return other !== undefined && sameQuarantineIdentity(identity, other);
    })
  );
}

function isValidDeletionAttestation(
  value: unknown,
  request: ArtifactQuarantineDeletionRequest,
): value is ArtifactQuarantineDeletionAttestation {
  if (!isRecord(value) || value.attested !== true) return false;
  return (
    sameQuarantineIdentity(
      value.root as ArtifactQuarantineIdentity,
      request.root,
    ) &&
    Array.isArray(value.entries) &&
    value.entries.every(isRecord) &&
    sameIdentityList(
      value.entries as unknown as ArtifactQuarantineIdentity[],
      request.entries,
    )
  );
}

async function isQuarantineGone(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

/**
 * An empty session contains no captured bytes, so it can be removed with the
 * portable directory/file primitives after the quarantine identity has been
 * revalidated. Non-empty quarantines still require the identity-bound native
 * deleter because Node has no handle-relative recursive delete operation.
 */
async function deleteEmptyQuarantine(
  request: ArtifactQuarantineDeletionRequest,
): Promise<"removed" | "unavailable"> {
  try {
    await validateQuarantineIdentities(request);
    const expected = new Set(
      request.entries.map((entry) => entry.relativePath),
    );
    const rootEntries = await readdir(request.quarantineRoot, {
      withFileTypes: true,
    });
    if (rootEntries.some((entry) => !expected.has(entry.name))) {
      return "unavailable";
    }
    for (const entry of request.entries) {
      if (entry.kind !== "directory") continue;
      const contents = await readdir(
        join(request.quarantineRoot, entry.relativePath),
      );
      if (contents.length > 0) return "unavailable";
    }

    for (const entry of request.entries) {
      const path = join(request.quarantineRoot, entry.relativePath);
      const current = await readQuarantineIdentity(
        request.quarantineRoot,
        entry.relativePath,
        entry.kind,
      );
      if (!sameQuarantineIdentity(current, entry)) return "unavailable";
      if (entry.kind === "directory") {
        await rmdir(path);
      } else {
        await unlink(path);
      }
    }
    await rmdir(request.quarantineRoot);
    return (await isQuarantineGone(request.quarantineRoot))
      ? "removed"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

async function deleteQuarantine(
  request: ArtifactQuarantineDeletionRequest,
  deleter: ArtifactQuarantineDeleter | undefined,
): Promise<"removed" | "unavailable"> {
  // Node's portable fs API has no handle-relative recursive directory delete.
  // Without an identity-bound native adapter, leave the quarantine intact.
  if (deleter === undefined) return await deleteEmptyQuarantine(request);
  try {
    await validateQuarantineIdentities(request);
    const attestation = await deleter(request);
    if (!isValidDeletionAttestation(attestation, request)) {
      return "unavailable";
    }
    return (await isQuarantineGone(request.quarantineRoot))
      ? "removed"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

function canonicalManifest(manifest: ArtifactManifest): string {
  const source = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(source, "utf8") > MAX_MANIFEST_BYTES) {
    throw new Error("artifact manifest exceeds the size limit");
  }
  return source;
}

async function assertDirectory(path: string, expected?: string): Promise<void> {
  const metadata = await lstat(path);
  const canonical = await realpath(path);
  const revalidated = await lstat(path);
  const revalidatedCanonical = await realpath(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    revalidated.isSymbolicLink() ||
    !revalidated.isDirectory() ||
    !sameMetadata(metadata, revalidated)
  ) {
    throw new Error("artifact directory is not an owned directory");
  }
  if (
    expected !== undefined &&
    (!sameCanonicalPath(canonical, expected) ||
      !sameCanonicalPath(revalidatedCanonical, expected) ||
      !sameCanonicalPath(canonical, revalidatedCanonical))
  ) {
    throw new Error("artifact directory canonical path changed");
  }
}

async function assertRegularFile(
  path: string,
  expected: string,
): Promise<void> {
  const metadata = await lstat(path);
  const canonical = await realpath(path);
  const revalidated = await lstat(path);
  const revalidatedCanonical = await realpath(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    revalidated.isSymbolicLink() ||
    !revalidated.isFile() ||
    !sameMetadata(metadata, revalidated) ||
    !sameCanonicalPath(canonical, expected) ||
    !sameCanonicalPath(revalidatedCanonical, expected) ||
    !sameCanonicalPath(canonical, revalidatedCanonical)
  ) {
    throw new Error("artifact file canonical path changed");
  }
}

async function assertRenameTarget(
  path: string,
  allowExisting: boolean,
): Promise<void> {
  await assertDirectory(dirname(path), dirname(path));
  try {
    await assertRegularFile(path, path);
    if (!allowExisting) throw new Error("artifact target already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    if (allowExisting && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    if (
      !allowExisting &&
      (error as Error).message === "artifact target already exists"
    ) {
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function ensureArtifactRoot(
  projectRoot: string,
  artifactsRoot: string,
  permissions: ArtifactPermissionEnforcer,
): Promise<void> {
  const project = resolve(projectRoot);
  const artifacts = resolve(artifactsRoot);
  await assertDirectory(project, project);
  if (!isInside(project, artifacts)) {
    throw new Error("artifact root escapes the project");
  }
  let current = project;
  for (const segment of relative(project, artifacts)
    .split(sep)
    .filter(Boolean)) {
    current = resolve(current, segment);
    try {
      await assertDirectory(current, current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current, { mode: 0o700 });
      await assertDirectory(current, current);
    }
  }
  await permissions.ensureOwnerOnly(artifacts, "directory");
}

async function syncParentDirectory(path: string): Promise<void> {
  try {
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    if (
      process.platform !== "win32" ||
      !["EISDIR", "EPERM", "EACCES"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
      throw error;
    }
  }
}

async function atomicProtectedWrite(
  target: string,
  contents: string | Buffer,
  permissions: ArtifactPermissionEnforcer,
): Promise<void> {
  const temporary = join(
    dirname(target),
    `.${target.slice(target.lastIndexOf(sep) + 1)}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await assertDirectory(dirname(target), dirname(target));
    await assertRegularFile(temporary, temporary);
    await permissions.ensureOwnerOnly(temporary, "file");
    await assertDirectory(dirname(target), dirname(target));
    await assertRegularFile(temporary, temporary);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertRenameTarget(target, true);
    await rename(temporary, target);
    await assertDirectory(dirname(target), dirname(target));
    await assertRegularFile(target, target);
    await syncParentDirectory(target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function readManifest(path: string): Promise<ArtifactManifest> {
  const metadata = await lstat(path);
  if (metadata.size > MAX_MANIFEST_BYTES) {
    throw new Error("unsafe artifact manifest");
  }
  await assertRegularFile(path, path);
  const source = await readFile(path, "utf8");
  await assertRegularFile(path, path);
  const manifest = artifactManifestSchema.parse(JSON.parse(source));
  if (canonicalManifest(manifest) !== source) {
    throw new Error("artifact manifest is not canonical");
  }
  return manifest;
}

async function restoreQuarantinedPath(
  source: string,
  quarantineRoot: string,
  relativePath: string,
  expected: ArtifactQuarantineIdentity,
): Promise<void> {
  const sourceMetadata = await lstat(source).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    },
  );
  if (sourceMetadata !== undefined) return;
  try {
    const current = await readQuarantineIdentity(
      quarantineRoot,
      relativePath,
      expected.kind,
    );
    if (!sameQuarantineIdentity(current, expected)) return;
    await assertDirectory(dirname(source), dirname(source));
    await rename(join(quarantineRoot, relativePath), source);
  } catch {
    // Never restore from an identity that can no longer be proven.
  }
}

async function quarantineOwnedPath(
  root: string,
  source: string,
  quarantine: string,
  kind: "directory" | "file",
): Promise<void> {
  if (!isInside(root, source) || !isInside(root, quarantine)) {
    throw new Error("artifact quarantine path escapes root");
  }
  const metadata = await lstat(source);
  const canonical = await realpath(source);
  if (
    metadata.isSymbolicLink() ||
    (kind === "directory" ? !metadata.isDirectory() : !metadata.isFile()) ||
    !sameCanonicalPath(canonical, source)
  ) {
    throw new Error("artifact quarantine target is not owned");
  }
  await rename(source, quarantine);
  const moved = await lstat(quarantine);
  const movedCanonical = await realpath(quarantine);
  if (
    !sameMovedIdentity(metadata, moved) ||
    moved.isSymbolicLink() ||
    (kind === "directory" ? !moved.isDirectory() : !moved.isFile()) ||
    !sameCanonicalPath(movedCanonical, quarantine)
  ) {
    // Leave the quarantined bytes untouched when the post-rename identity is
    // uncertain; never restore from a path that may now name a replacement.
    throw new Error("artifact replacement won the quarantine race");
  }
}

async function removeManifestArtifacts(
  artifactsRoot: string,
  manifestPath: string,
  manifest: ArtifactManifest,
  deleter: ArtifactQuarantineDeleter | undefined,
): Promise<
  | { readonly removed: true; readonly unavailable: false }
  | {
      readonly removed: false;
      readonly unavailable: true;
      readonly retry: ArtifactQuarantineDeletionRequest;
    }
> {
  const current = await readManifest(manifestPath);
  if (canonicalManifest(current) !== canonicalManifest(manifest)) {
    throw new Error("artifact manifest changed during cleanup");
  }
  const sessionDirectory = join(artifactsRoot, manifest.sessionDirectory);
  await assertDirectory(artifactsRoot, artifactsRoot);
  const quarantineRoot = await mkdtemp(join(artifactsRoot, ".quarantine-"));
  await assertDirectory(quarantineRoot, quarantineRoot);
  await syncParentDirectory(quarantineRoot);
  let movedManifest = false;
  let movedSession = false;
  let manifestIdentity: ArtifactQuarantineIdentity | undefined;
  let sessionIdentity: ArtifactQuarantineIdentity | undefined;
  try {
    await quarantineOwnedPath(
      artifactsRoot,
      manifestPath,
      join(quarantineRoot, "manifest.json"),
      "file",
    );
    movedManifest = true;
    manifestIdentity = await readQuarantineIdentity(
      quarantineRoot,
      "manifest.json",
      "file",
    );
    const quarantinedManifest = await readManifest(
      join(quarantineRoot, "manifest.json"),
    );
    if (
      canonicalManifest(quarantinedManifest) !== canonicalManifest(manifest)
    ) {
      throw new Error("artifact manifest changed during quarantine");
    }
    try {
      await quarantineOwnedPath(
        artifactsRoot,
        sessionDirectory,
        join(quarantineRoot, manifest.sessionDirectory),
        "directory",
      );
      movedSession = true;
      sessionIdentity = await readQuarantineIdentity(
        quarantineRoot,
        manifest.sessionDirectory,
        "directory",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (movedSession) {
      await validateManifestArtifacts(
        artifactsRoot,
        manifest,
        join(quarantineRoot, manifest.sessionDirectory),
      );
    }
    if (manifestIdentity === undefined) {
      throw new Error("artifact manifest quarantine identity missing");
    }
    const retry = {
      quarantineRoot,
      root: await readQuarantineIdentity(quarantineRoot, ".", "directory"),
      entries: [
        manifestIdentity,
        ...(sessionIdentity === undefined ? [] : [sessionIdentity]),
      ],
    } satisfies ArtifactQuarantineDeletionRequest;
    const deletion = await deleteQuarantine(retry, deleter);
    if (deletion === "unavailable") {
      return { removed: false, unavailable: true, retry };
    }
    await syncParentDirectory(manifestPath);
    return { removed: true, unavailable: false };
  } catch (error) {
    if (movedSession && sessionIdentity !== undefined) {
      await restoreQuarantinedPath(
        sessionDirectory,
        quarantineRoot,
        manifest.sessionDirectory,
        sessionIdentity,
      );
    }
    if (movedManifest && manifestIdentity !== undefined) {
      await restoreQuarantinedPath(
        manifestPath,
        quarantineRoot,
        "manifest.json",
        manifestIdentity,
      );
    }
    throw error;
  }
}

async function validateManifestArtifacts(
  artifactsRoot: string,
  manifest: ArtifactManifest,
  sessionDirectoryOverride?: string,
): Promise<void> {
  const sessionDirectory =
    sessionDirectoryOverride ?? join(artifactsRoot, manifest.sessionDirectory);
  await assertDirectory(sessionDirectory, sessionDirectory);
  const expected = new Set(
    manifest.entries.flatMap((entry) => [entry.path, entry.tempPath]),
  );
  const actual = new Map<string, Awaited<ReturnType<typeof lstat>>>();
  for (const name of await readdir(sessionDirectory)) {
    if (!expected.has(name)) {
      throw new Error("artifact session contains unmanifested content");
    }
    const path = join(sessionDirectory, name);
    await assertRegularFile(path, path);
    actual.set(name, await lstat(path));
  }
  for (const entry of manifest.entries) {
    const target = actual.get(entry.path);
    const temporary = actual.get(entry.tempPath);
    if (target !== undefined && temporary !== undefined) {
      throw new Error("artifact entry has conflicting files");
    }
    if (
      entry.state === "written" &&
      (target?.size !== entry.size || temporary !== undefined)
    ) {
      throw new Error("written artifact does not match its manifest");
    }
    if (
      entry.state === "reserved" &&
      ((target !== undefined && target.size !== entry.size) ||
        (temporary !== undefined && temporary.size > entry.size))
    ) {
      throw new Error("reserved artifact exceeds its manifest");
    }
  }
}

async function recoverWithExplicitRetention(
  artifactsRoot: string,
  candidates: readonly Dirent[],
  policy: RetentionPolicy,
  now: Date,
  orphanProof?: ArtifactOrphanProofVerifier,
  retentionProof?: ArtifactRetentionProofVerifier,
  quarantineDeleter?: ArtifactQuarantineDeleter,
): Promise<ArtifactRecoveryResult> {
  const retainedCandidates = new Map<
    string,
    {
      readonly path: string;
      readonly manifest: ArtifactManifest;
      readonly proof: ArtifactRetentionProof;
    }
  >();
  let removed = 0;
  let retained = 0;
  let unavailable = false;

  for (const entry of candidates) {
    const path = join(artifactsRoot, entry.name);
    if (!entry.isFile() || entry.isSymbolicLink()) {
      retained += 1;
      continue;
    }
    let manifest: ArtifactManifest;
    try {
      manifest = await readManifest(path);
      if (`session-${manifest.sessionId}.manifest.json` !== entry.name) {
        retained += 1;
        continue;
      }
    } catch {
      // Explicit retention never turns an ambiguous manifest into a delete.
      retained += 1;
      continue;
    }
    if (!manifest.retainArtifacts) {
      const provenOrphan = await hasExplicitOrphanProof(
        orphanProof,
        manifest.sessionId,
      );
      if (!provenOrphan) {
        retained += 1;
        continue;
      }
      try {
        try {
          await validateManifestArtifacts(artifactsRoot, manifest);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            retained += 1;
            continue;
          }
        }
        const result = await removeManifestArtifacts(
          artifactsRoot,
          path,
          manifest,
          quarantineDeleter,
        );
        if (result.removed) {
          removed += 1;
        } else {
          retained += 1;
          unavailable ||= result.unavailable;
        }
      } catch {
        retained += 1;
      }
      continue;
    }
    try {
      await validateManifestArtifacts(artifactsRoot, manifest);
    } catch {
      retained += 1;
      continue;
    }
    const proof = await hasExplicitRetentionProof(retentionProof, {
      sessionId: manifest.sessionId,
      createdAt: manifest.createdAt,
      closed: manifest.closed,
      retainArtifacts: true,
    });
    if (proof === undefined) {
      retained += 1;
      continue;
    }
    retainedCandidates.set(manifest.sessionId, { path, manifest, proof });
    retained += 1;
  }

  const plan: RetentionPlan = evaluateRetentionPlan({
    now,
    policy,
    sessions: [...retainedCandidates.values()].map(({ manifest, proof }) => ({
      sessionId: manifest.sessionId,
      createdAt: manifest.createdAt,
      bytes: manifest.entries.reduce((total, entry) => total + entry.size, 0),
      closed: manifest.closed,
      retainArtifacts: manifest.retainArtifacts,
      owned: proof.owned,
      active: proof.active,
      manifestState: "valid",
    })),
  });
  for (const deletion of plan.deletions) {
    const candidate = retainedCandidates.get(deletion.sessionId);
    if (candidate === undefined) continue;
    try {
      const result = await removeManifestArtifacts(
        artifactsRoot,
        candidate.path,
        candidate.manifest,
        quarantineDeleter,
      );
      if (result.removed) {
        removed += 1;
        retained = Math.max(0, retained - 1);
      } else {
        unavailable ||= result.unavailable;
      }
    } catch {
      // A concurrent replacement, link, or permission failure is retained.
    }
  }
  return unavailable
    ? unavailableRecoveryResult(removed, retained)
    : { removed, retained };
}

/**
 * A failed cleanup can leave an empty quarantine when no native recursive
 * deleter is available. Empty quarantines contain no retained bytes, so a
 * subsequent recovery can safely converge them with the same identity checks
 * used by close; non-empty quarantines remain preserved for the native retry.
 */
async function recoverEmptyQuarantines(
  artifactsRoot: string,
): Promise<{ readonly removed: number; readonly retained: number }> {
  let removed = 0;
  let retained = 0;
  const candidates = await readdir(artifactsRoot, { withFileTypes: true });
  for (const entry of candidates) {
    if (!entry.name.startsWith(".quarantine-")) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      retained += 1;
      continue;
    }
    const quarantineRoot = join(artifactsRoot, entry.name);
    try {
      await assertDirectory(quarantineRoot, quarantineRoot);
      const rootEntries = await readdir(quarantineRoot, {
        withFileTypes: true,
      });
      const manifestEntry = rootEntries.find(
        (candidate) => candidate.name === "manifest.json",
      );
      if (
        manifestEntry === undefined ||
        !manifestEntry.isFile() ||
        manifestEntry.isSymbolicLink()
      ) {
        continue;
      }
      const manifestPath = join(quarantineRoot, "manifest.json");
      const manifest = await readManifest(manifestPath);
      if (manifest.retainArtifacts || manifest.entries.length !== 0) continue;
      const expectedNames = new Set([
        "manifest.json",
        manifest.sessionDirectory,
      ]);
      if (rootEntries.some((candidate) => !expectedNames.has(candidate.name))) {
        continue;
      }
      const sessionEntry = rootEntries.find(
        (candidate) => candidate.name === manifest.sessionDirectory,
      );
      if (
        sessionEntry !== undefined &&
        (!sessionEntry.isDirectory() || sessionEntry.isSymbolicLink())
      ) {
        continue;
      }
      if (sessionEntry !== undefined) {
        const sessionPath = join(quarantineRoot, manifest.sessionDirectory);
        if ((await readdir(sessionPath)).length > 0) continue;
      }
      const request = {
        quarantineRoot,
        root: await readQuarantineIdentity(quarantineRoot, ".", "directory"),
        entries: [
          await readQuarantineIdentity(quarantineRoot, "manifest.json", "file"),
          ...(sessionEntry === undefined
            ? []
            : [
                await readQuarantineIdentity(
                  quarantineRoot,
                  manifest.sessionDirectory,
                  "directory",
                ),
              ]),
        ],
      } satisfies ArtifactQuarantineDeletionRequest;
      if ((await deleteEmptyQuarantine(request)) === "removed") removed += 1;
      else retained += 1;
    } catch {
      retained += 1;
    }
  }
  return { removed, retained };
}

export class ArtifactStore {
  readonly #projectRoot: string;
  readonly #artifactsRoot: string;
  readonly #retainArtifacts: boolean;
  readonly #sessionId: string;
  readonly #permissions: ArtifactPermissionEnforcer;
  readonly #now: () => Date;
  readonly #quarantineDeleter: ArtifactQuarantineDeleter | undefined;
  #manifest: ArtifactManifest | undefined;
  #manifestPath: string | undefined;
  #sessionDirectory: string | undefined;
  #pendingCleanup: ArtifactQuarantineDeletionRequest | undefined;
  #writeTail: Promise<void> = Promise.resolve();
  #closePending: Promise<ArtifactCleanupOutcome> | undefined;
  #closing = false;

  constructor(options: ArtifactStoreOptions) {
    this.#projectRoot = resolve(options.projectRoot);
    this.#artifactsRoot = resolve(options.artifactsRoot);
    this.#retainArtifacts = options.retainArtifacts;
    this.#sessionId = options.sessionId ?? randomBytes(16).toString("hex");
    this.#permissions =
      options.permissions ?? createArtifactPermissionEnforcer();
    this.#now = options.now ?? (() => new Date());
    this.#quarantineDeleter = options.quarantineDeleter;
    if (!SESSION_ID.test(this.#sessionId)) {
      throw screenshotError();
    }
  }

  get isOpen(): boolean {
    return this.#manifest !== undefined;
  }

  async open(): Promise<void> {
    if (this.#manifest !== undefined) return;
    let createdSessionDirectory: string | undefined;
    try {
      await ensureArtifactRoot(
        this.#projectRoot,
        this.#artifactsRoot,
        this.#permissions,
      );
      const sessionName = `session-${this.#sessionId}`;
      const sessionDirectory = join(this.#artifactsRoot, sessionName);
      const manifestPath = join(
        this.#artifactsRoot,
        `${sessionName}.manifest.json`,
      );
      await mkdir(sessionDirectory, { mode: 0o700 });
      createdSessionDirectory = sessionDirectory;
      await assertDirectory(sessionDirectory, sessionDirectory);
      await this.#permissions.ensureOwnerOnly(sessionDirectory, "directory");
      const manifest: ArtifactManifest = {
        version: 1,
        sessionId: this.#sessionId,
        sessionDirectory: sessionName,
        retainArtifacts: this.#retainArtifacts,
        createdAt: this.#now().toISOString(),
        closed: false,
        entries: [],
      };
      await atomicProtectedWrite(
        manifestPath,
        canonicalManifest(manifest),
        this.#permissions,
      );
      this.#manifest = manifest;
      this.#manifestPath = manifestPath;
      this.#sessionDirectory = sessionDirectory;
      this.#closing = false;
    } catch (error) {
      if (createdSessionDirectory !== undefined) {
        const contents = await readdir(createdSessionDirectory).catch(
          () => undefined,
        );
        if (contents?.length === 0) {
          await rmdir(createdSessionDirectory).catch(() => undefined);
        }
      }
      throw artifactsPreflightError(error);
    }
  }

  writePng(contents: Buffer): Promise<StoredArtifact> {
    if (
      !Buffer.isBuffer(contents) ||
      contents.length === 0 ||
      contents.length > MAX_ARTIFACT_BYTES ||
      this.#closing
    ) {
      return Promise.reject(screenshotError());
    }
    const ownedContents = Buffer.from(contents);
    const operation = this.#writeTail.then(() =>
      this.writePngNow(ownedContents),
    );
    this.#writeTail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async writePngNow(contents: Buffer): Promise<StoredArtifact> {
    if (
      this.#manifest === undefined ||
      this.#manifestPath === undefined ||
      this.#sessionDirectory === undefined
    ) {
      throw screenshotError();
    }
    try {
      const sequence = this.#manifest.entries.length + 1;
      if (sequence > MAX_ARTIFACTS_PER_SESSION) {
        throw new Error("artifact limit exceeded");
      }
      const totalBytes = this.#manifest.entries.reduce(
        (total, entry) => total + entry.size,
        0,
      );
      if (totalBytes + contents.length > MAX_SESSION_ARTIFACT_BYTES) {
        throw new Error("artifact session byte limit exceeded");
      }
      const path = `screenshot-${String(sequence).padStart(4, "0")}.png`;
      const tempPath = `.${path}.${randomBytes(8).toString("hex")}.tmp`;
      const reserved: ArtifactManifest = {
        ...this.#manifest,
        entries: [
          ...this.#manifest.entries,
          { path, tempPath, size: contents.length, state: "reserved" },
        ],
      };
      await assertDirectory(this.#artifactsRoot, this.#artifactsRoot);
      await assertDirectory(this.#sessionDirectory, this.#sessionDirectory);
      await atomicProtectedWrite(
        this.#manifestPath,
        canonicalManifest(reserved),
        this.#permissions,
      );
      this.#manifest = reserved;

      const temporary = join(this.#sessionDirectory, tempPath);
      const target = join(this.#sessionDirectory, path);
      const handle = await open(temporary, "wx", 0o600);
      try {
        await assertDirectory(this.#sessionDirectory, this.#sessionDirectory);
        await assertRegularFile(temporary, temporary);
        await this.#permissions.ensureOwnerOnly(temporary, "file");
        await assertDirectory(this.#sessionDirectory, this.#sessionDirectory);
        await assertRegularFile(temporary, temporary);
        await handle.writeFile(contents);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await assertDirectory(this.#sessionDirectory, this.#sessionDirectory);
      await assertRenameTarget(target, false);
      await rename(temporary, target);
      await assertDirectory(this.#sessionDirectory, this.#sessionDirectory);
      await assertRegularFile(target, target);
      await syncParentDirectory(target);

      const written: ArtifactManifest = {
        ...reserved,
        entries: reserved.entries.map((entry, index) =>
          index === reserved.entries.length - 1
            ? { ...entry, state: "written" as const }
            : entry,
        ),
      };
      await atomicProtectedWrite(
        this.#manifestPath,
        canonicalManifest(written),
        this.#permissions,
      );
      this.#manifest = written;
      return {
        projectRelativePath: relative(this.#projectRoot, target)
          .split(sep)
          .join("/"),
      };
    } catch (error) {
      throw screenshotError(error);
    }
  }

  close(): Promise<ArtifactCleanupOutcome> {
    if (this.#closePending !== undefined) return this.#closePending;
    this.#closing = true;
    const operation = this.closeNow();
    this.#closePending = operation;
    return operation.finally(() => {
      if (this.#closePending === operation) {
        this.#closePending = undefined;
      }
    });
  }

  private async closeNow(): Promise<ArtifactCleanupOutcome> {
    await this.#writeTail;
    if (this.#pendingCleanup !== undefined) {
      const deletion = await deleteQuarantine(
        this.#pendingCleanup,
        this.#quarantineDeleter,
      );
      if (deletion === "removed") {
        this.#pendingCleanup = undefined;
        this.#closing = false;
        return {
          state: "removed",
          status: "complete",
          removed: 1,
          retained: 0,
          retryable: false,
        };
      }
      this.#closing = false;
      return {
        state: "quarantined",
        status: "unavailable",
        removed: 0,
        retained: 1,
        retryable: true,
        reason: QUARANTINE_DELETION_UNAVAILABLE,
      };
    }
    if (
      this.#manifest === undefined ||
      this.#manifestPath === undefined ||
      this.#sessionDirectory === undefined
    ) {
      this.#closing = false;
      return {
        state: "removed",
        status: "complete",
        removed: 0,
        retained: 0,
        retryable: false,
      };
    }
    try {
      if (this.#retainArtifacts) {
        const closed = { ...this.#manifest, closed: true };
        await atomicProtectedWrite(
          this.#manifestPath,
          canonicalManifest(closed),
          this.#permissions,
        );
        this.#manifest = undefined;
        this.#manifestPath = undefined;
        this.#sessionDirectory = undefined;
        this.#closing = false;
        return {
          state: "retained",
          status: "complete",
          removed: 0,
          retained: 1,
          retryable: false,
        };
      }
      const result = await removeManifestArtifacts(
        this.#artifactsRoot,
        this.#manifestPath,
        this.#manifest,
        this.#quarantineDeleter,
      );
      this.#manifest = undefined;
      this.#manifestPath = undefined;
      this.#sessionDirectory = undefined;
      if (result.unavailable) {
        this.#pendingCleanup = result.retry;
        this.#closing = false;
        return {
          state: "quarantined",
          status: "unavailable",
          removed: 0,
          retained: 1,
          retryable: true,
          reason: QUARANTINE_DELETION_UNAVAILABLE,
        };
      }
      this.#closing = false;
      return {
        state: "removed",
        status: "complete",
        removed: 1,
        retained: 0,
        retryable: false,
      };
    } catch (error) {
      this.#closing = false;
      throw screenshotError(error);
    }
  }

  static async recover(options: {
    readonly projectRoot: string;
    readonly artifactsRoot: string;
    readonly permissions?: ArtifactPermissionEnforcer;
    /** Retained cleanup is opt-in and accepts only finite policy values. */
    readonly retentionPolicy?: RetentionPolicy;
    /** Explicit proof is required before deleting a non-retained crash residue. */
    readonly orphanProof?: ArtifactOrphanProofVerifier;
    /** RDM-016-backed proof is required before retained deletion is eligible. */
    readonly retentionProof?: ArtifactRetentionProofVerifier;
    /** Internal-only native adapter; absent means preserve quarantine bytes. */
    readonly quarantineDeleter?: ArtifactQuarantineDeleter;
    readonly now?: () => Date;
  }): Promise<ArtifactRecoveryResult> {
    const projectRoot = resolve(options.projectRoot);
    const artifactsRoot = resolve(options.artifactsRoot);
    const permissions =
      options.permissions ?? createArtifactPermissionEnforcer();
    try {
      await ensureArtifactRoot(projectRoot, artifactsRoot, permissions);
      const candidates = (
        await readdir(artifactsRoot, { withFileTypes: true })
      ).filter((entry) =>
        /^session-[a-f0-9]{32,64}\.manifest\.json$/u.test(entry.name),
      );
      const emptyQuarantines = await recoverEmptyQuarantines(artifactsRoot);
      if (options.retentionPolicy !== undefined) {
        const result = await recoverWithExplicitRetention(
          artifactsRoot,
          candidates,
          options.retentionPolicy,
          options.now?.() ?? new Date(),
          options.orphanProof,
          options.retentionProof,
          options.quarantineDeleter,
        );
        return {
          ...result,
          removed: result.removed + emptyQuarantines.removed,
          retained: result.retained + emptyQuarantines.retained,
        };
      }
      const manifests = await Promise.all(
        candidates.map(async (entry) => {
          if (!entry.isFile() || entry.isSymbolicLink()) return undefined;
          const path = join(artifactsRoot, entry.name);
          let manifest: ArtifactManifest;
          try {
            manifest = await readManifest(path);
          } catch {
            return undefined;
          }
          if (`session-${manifest.sessionId}.manifest.json` !== entry.name) {
            return undefined;
          }
          return { path, manifest };
        }),
      );
      let removed = 0;
      let retained = 0;
      let unavailable = false;
      for (const candidate of manifests) {
        if (candidate === undefined) {
          retained += 1;
          continue;
        }
        const { path, manifest } = candidate;
        if (manifest.retainArtifacts) {
          if (!manifest.closed) {
            retained += 1;
            continue;
          }
          try {
            await validateManifestArtifacts(artifactsRoot, manifest);
          } catch {
            retained += 1;
            continue;
          }
          retained += 1;
          continue;
        }
        const provenOrphan = await hasExplicitOrphanProof(
          options.orphanProof,
          manifest.sessionId,
        );
        if (!provenOrphan) {
          retained += 1;
          continue;
        }
        try {
          await validateManifestArtifacts(artifactsRoot, manifest);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            retained += 1;
            continue;
          }
        }
        try {
          const result = await removeManifestArtifacts(
            artifactsRoot,
            path,
            manifest,
            options.quarantineDeleter,
          );
          if (result.removed) {
            removed += 1;
          } else {
            retained += 1;
            unavailable ||= result.unavailable;
          }
        } catch {
          retained += 1;
        }
      }
      const totalRemoved = removed + emptyQuarantines.removed;
      const totalRetained = retained + emptyQuarantines.retained;
      return unavailable
        ? unavailableRecoveryResult(totalRemoved, totalRetained)
        : { removed: totalRemoved, retained: totalRetained };
    } catch (error) {
      throw artifactRecoveryError(error);
    }
  }
}
