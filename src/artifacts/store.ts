import { randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
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

import { TauriAgentError } from "../shared/errors.js";
import {
  createArtifactPermissionEnforcer,
  type ArtifactPermissionEnforcer,
} from "./permissions.js";

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
  readonly now?: () => Date;
}

export interface StoredArtifact {
  readonly projectRelativePath: string;
}

export interface ArtifactRecoveryResult {
  readonly removed: number;
  readonly retained: number;
}

function screenshotError(cause?: unknown): TauriAgentError {
  return new TauriAgentError("SCREENSHOT_FAILED", { cause });
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

function canonicalManifest(manifest: ArtifactManifest): string {
  const source = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(source, "utf8") > MAX_MANIFEST_BYTES) {
    throw new Error("artifact manifest exceeds the size limit");
  }
  return source;
}

async function assertDirectory(path: string, expected?: string): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("artifact directory is not an owned directory");
  }
  if (
    expected !== undefined &&
    !sameCanonicalPath(await realpath(path), expected)
  ) {
    throw new Error("artifact directory canonical path changed");
  }
}

async function assertRegularFile(
  path: string,
  expected: string,
): Promise<void> {
  const metadata = await lstat(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !sameCanonicalPath(await realpath(path), expected)
  ) {
    throw new Error("artifact file canonical path changed");
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
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.size > MAX_MANIFEST_BYTES ||
    !sameCanonicalPath(await realpath(path), path)
  ) {
    throw new Error("unsafe artifact manifest");
  }
  const source = await readFile(path, "utf8");
  const manifest = artifactManifestSchema.parse(JSON.parse(source));
  if (canonicalManifest(manifest) !== source) {
    throw new Error("artifact manifest is not canonical");
  }
  return manifest;
}

async function safeUnlink(root: string, path: string): Promise<void> {
  if (!isInside(root, path)) throw new Error("artifact file escapes root");
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("artifact file is not a regular file");
    }
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function removeManifestArtifacts(
  artifactsRoot: string,
  manifestPath: string,
  manifest: ArtifactManifest,
): Promise<void> {
  const sessionDirectory = join(artifactsRoot, manifest.sessionDirectory);
  await assertDirectory(artifactsRoot, artifactsRoot);
  try {
    await assertDirectory(sessionDirectory, sessionDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await safeUnlink(artifactsRoot, manifestPath);
    await syncParentDirectory(manifestPath);
    return;
  }
  await validateManifestArtifacts(artifactsRoot, manifest);
  for (const entry of manifest.entries) {
    await safeUnlink(artifactsRoot, join(sessionDirectory, entry.path));
    await safeUnlink(artifactsRoot, join(sessionDirectory, entry.tempPath));
  }
  const unknown = await readdir(sessionDirectory);
  if (unknown.length > 0) {
    throw new Error("artifact session contains unmanifested content");
  }
  await rmdir(sessionDirectory);
  await safeUnlink(artifactsRoot, manifestPath);
  await syncParentDirectory(manifestPath);
}

async function validateManifestArtifacts(
  artifactsRoot: string,
  manifest: ArtifactManifest,
): Promise<void> {
  const sessionDirectory = join(artifactsRoot, manifest.sessionDirectory);
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
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("artifact session contains an unsafe entry");
    }
    actual.set(name, metadata);
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

export class ArtifactStore {
  readonly #projectRoot: string;
  readonly #artifactsRoot: string;
  readonly #retainArtifacts: boolean;
  readonly #sessionId: string;
  readonly #permissions: ArtifactPermissionEnforcer;
  readonly #now: () => Date;
  #manifest: ArtifactManifest | undefined;
  #manifestPath: string | undefined;
  #sessionDirectory: string | undefined;
  #writeTail: Promise<void> = Promise.resolve();
  #closePending: Promise<void> | undefined;
  #closing = false;

  constructor(options: ArtifactStoreOptions) {
    this.#projectRoot = resolve(options.projectRoot);
    this.#artifactsRoot = resolve(options.artifactsRoot);
    this.#retainArtifacts = options.retainArtifacts;
    this.#sessionId = options.sessionId ?? randomBytes(16).toString("hex");
    this.#permissions =
      options.permissions ?? createArtifactPermissionEnforcer();
    this.#now = options.now ?? (() => new Date());
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
      throw screenshotError(error);
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

  close(): Promise<void> {
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

  private async closeNow(): Promise<void> {
    await this.#writeTail;
    if (
      this.#manifest === undefined ||
      this.#manifestPath === undefined ||
      this.#sessionDirectory === undefined
    ) {
      this.#closing = false;
      return;
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
        return;
      }
      await removeManifestArtifacts(
        this.#artifactsRoot,
        this.#manifestPath,
        this.#manifest,
      );
      this.#manifest = undefined;
      this.#manifestPath = undefined;
      this.#sessionDirectory = undefined;
    } catch (error) {
      this.#closing = false;
      throw screenshotError(error);
    }
  }

  static async recover(options: {
    readonly projectRoot: string;
    readonly artifactsRoot: string;
    readonly permissions?: ArtifactPermissionEnforcer;
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
      const manifests = await Promise.all(
        candidates.map(async (entry) => {
          if (!entry.isFile() || entry.isSymbolicLink()) {
            throw new Error("unsafe artifact manifest entry");
          }
          const path = join(artifactsRoot, entry.name);
          const manifest = await readManifest(path);
          if (`session-${manifest.sessionId}.manifest.json` !== entry.name) {
            throw new Error("artifact manifest identity mismatch");
          }
          return { path, manifest };
        }),
      );
      let removed = 0;
      let retained = 0;
      for (const { path, manifest } of manifests) {
        if (manifest.retainArtifacts) {
          await validateManifestArtifacts(artifactsRoot, manifest);
          retained += 1;
          continue;
        }
        try {
          await validateManifestArtifacts(artifactsRoot, manifest);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        await removeManifestArtifacts(artifactsRoot, path, manifest);
        removed += 1;
      }
      return { removed, retained };
    } catch (error) {
      throw screenshotError(error);
    }
  }
}
