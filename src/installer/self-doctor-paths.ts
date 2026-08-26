import { constants, type Stats } from "node:fs";
import {
  lstat as nodeLstat,
  open,
  readlink as nodeReadlink,
  realpath as nodeRealpath,
  type FileHandle,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, win32 } from "node:path";

export const MAX_SELF_DOCTOR_ENTRIES = 256;
export const MAX_SELF_DOCTOR_DEPTH = 8;
export const MAX_SELF_DOCTOR_FILE_BYTES = 1 * 1024 * 1024;
export const MAX_SELF_DOCTOR_TOTAL_BYTES = 8 * 1024 * 1024;
export const MAX_SELF_DOCTOR_PATH_LENGTH = 4_096;

export type SelfDoctorPathStatus =
  | "safe"
  | "missing"
  | "broken-link"
  | "unsafe"
  | "unknown"
  | "budget";

export type SelfDoctorPathKind =
  | "regular-file"
  | "directory"
  | "symbolic-link"
  | "junction"
  | "reparse-point"
  | "non-regular"
  | "missing"
  | "unknown";

export type SelfDoctorPathReason =
  | "verified"
  | "absolute-path"
  | "drive-relative-path"
  | "unc-path"
  | "separator-confused"
  | "nul-path"
  | "parent-escape"
  | "overlong-path"
  | "root-missing"
  | "root-unsafe"
  | "outside-root"
  | "link-unverified"
  | "broken-link"
  | "reparse-uncertain"
  | "non-regular-entry"
  | "canonical-escape"
  | "identity-changed"
  | "identity-unproven"
  | "read-failed"
  | "file-too-large"
  | "entry-limit"
  | "depth-limit"
  | "bytes-limit";

export interface SelfDoctorFileMetadata {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymbolicLink: boolean;
  readonly size?: number;
  readonly mtimeMs?: number;
  readonly mode?: number;
  readonly dev?: number;
  readonly ino?: number;
  readonly reparsePoint?: boolean;
  readonly linkType?: "symbolic-link" | "junction" | "reparse-point";
}

export interface SelfDoctorFileSystem {
  readonly lstat: (path: string) => Promise<SelfDoctorFileMetadata>;
  readonly realpath: (path: string) => Promise<string>;
  readonly readVerifiedFile: (
    path: string,
    canonicalRoot: string,
    maxBytes: number,
  ) => Promise<{
    readonly content: string;
    readonly canonicalPath: string;
    readonly before: SelfDoctorFileMetadata;
    readonly after: SelfDoctorFileMetadata;
  }>;
  readonly readlink?: (path: string) => Promise<string>;
}

export interface SelfDoctorPathBudget {
  entries: number;
  bytes: number;
}

export interface SelfDoctorPathInspection {
  readonly entry: string;
  readonly status: SelfDoctorPathStatus;
  readonly kind: SelfDoctorPathKind;
  readonly reason: SelfDoctorPathReason;
  readonly depth: number;
  readonly bytes?: number;
  readonly content?: string;
  readonly executable?: boolean;
}

export type RelativeEntryValidation =
  | { readonly ok: true; readonly parts: readonly string[] }
  | { readonly ok: false; readonly reason: SelfDoctorPathReason };

function metadataFromStats(metadata: Stats): SelfDoctorFileMetadata {
  return {
    isFile: metadata.isFile(),
    isDirectory: metadata.isDirectory(),
    isSymbolicLink: metadata.isSymbolicLink(),
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    mode: metadata.mode,
    dev: metadata.dev,
    ino: metadata.ino,
  };
}

async function readVerifiedBoundedFile(
  path: string,
  canonicalRoot: string,
  maxBytes: number,
): Promise<{
  readonly content: string;
  readonly canonicalPath: string;
  readonly before: SelfDoctorFileMetadata;
  readonly after: SelfDoctorFileMetadata;
}> {
  if (process.platform === "win32") throw new Error("identity-unproven");
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, flags);
    const before = metadataFromStats(await handle.stat());
    const canonicalPath = await nodeRealpath(`/proc/self/fd/${handle.fd}`);
    if (!isContained(canonicalRoot, canonicalPath)) {
      throw new Error("identity-changed");
    }
    if (before.size !== undefined && before.size > maxBytes) {
      throw new Error("file-too-large");
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    while (bytes < maxBytes) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes - bytes));
      const result = await handle.read(buffer, 0, buffer.length, null);
      if (result.bytesRead === 0) break;
      bytes += result.bytesRead;
      chunks.push(buffer.subarray(0, result.bytesRead));
    }
    const after = metadataFromStats(await handle.stat());
    if (after.size !== undefined && after.size > maxBytes) {
      throw new Error("file-too-large");
    }
    return {
      content: Buffer.concat(chunks).toString("utf8"),
      canonicalPath,
      before,
      after,
    };
  } finally {
    await handle?.close();
  }
}

export const defaultSelfDoctorFileSystem: SelfDoctorFileSystem = {
  async lstat(path) {
    return metadataFromStats(await nodeLstat(path));
  },
  realpath: nodeRealpath,
  readVerifiedFile: readVerifiedBoundedFile,
  readlink: async (path) => await nodeReadlink(path, "utf8"),
};

function isWindowsPlatform(platform: NodeJS.Platform): boolean {
  return platform === "win32";
}

export function validateSelfDoctorRelativeEntry(
  entry: string,
  platform: NodeJS.Platform = process.platform,
): RelativeEntryValidation {
  if (entry.includes("\0")) return { ok: false, reason: "nul-path" };
  if (entry.length === 0 || entry.length > MAX_SELF_DOCTOR_PATH_LENGTH) {
    return { ok: false, reason: "overlong-path" };
  }
  if (entry.includes("\\")) {
    return { ok: false, reason: "separator-confused" };
  }
  if (entry.startsWith("/")) {
    return {
      ok: false,
      reason:
        isWindowsPlatform(platform) && entry.startsWith("//")
          ? "unc-path"
          : "absolute-path",
    };
  }
  if (entry.startsWith("\\")) return { ok: false, reason: "unc-path" };
  if (isWindowsPlatform(platform)) {
    if (/^[A-Za-z]:/u.test(entry)) {
      return { ok: false, reason: "drive-relative-path" };
    }
    if (win32.isAbsolute(entry)) return { ok: false, reason: "absolute-path" };
    if (entry.includes(":")) {
      return { ok: false, reason: "drive-relative-path" };
    }
  } else if (isAbsolute(entry)) {
    return { ok: false, reason: "absolute-path" };
  }

  const parts = entry.split("/").filter((part) => part !== "");
  if (parts.length === 0) return { ok: false, reason: "overlong-path" };
  if (parts.some((part) => part === "..")) {
    return { ok: false, reason: "parent-escape" };
  }
  return { ok: true, parts: parts.filter((part) => part !== ".") };
}

export function isSafeSelfDoctorRelativeEntry(
  entry: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return validateSelfDoctorRelativeEntry(entry, platform).ok;
}

function isContained(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith("..\\") &&
    !difference.startsWith("../") &&
    !isAbsolute(difference)
  );
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function metadataChanged(
  before: SelfDoctorFileMetadata,
  after: SelfDoctorFileMetadata,
): boolean {
  for (const key of ["dev", "ino", "size", "mtimeMs", "mode"] as const) {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (
      beforeValue !== undefined &&
      afterValue !== undefined &&
      beforeValue !== afterValue
    ) {
      return true;
    }
  }
  return (
    before.isFile !== after.isFile ||
    before.isDirectory !== after.isDirectory ||
    before.isSymbolicLink !== after.isSymbolicLink
  );
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? typeof error.code === "string"
      ? error.code
      : undefined
    : undefined;
}

function kindForMetadata(
  metadata: SelfDoctorFileMetadata,
  platform: NodeJS.Platform,
): SelfDoctorPathKind {
  if (metadata.isSymbolicLink) {
    if (metadata.linkType === "junction") return "junction";
    if (metadata.linkType === "reparse-point" || metadata.reparsePoint) {
      return "reparse-point";
    }
    return platform === "win32" && metadata.linkType === undefined
      ? "reparse-point"
      : "symbolic-link";
  }
  if (metadata.isFile) return "regular-file";
  if (metadata.isDirectory) return "directory";
  return "non-regular";
}

async function classifyLink(
  path: string,
  root: string,
  platform: NodeJS.Platform,
  fileSystem: SelfDoctorFileSystem,
  metadata: SelfDoctorFileMetadata,
): Promise<{
  status: SelfDoctorPathStatus;
  kind: SelfDoctorPathKind;
  reason: SelfDoctorPathReason;
}> {
  const kind = kindForMetadata(metadata, platform);
  if (fileSystem.readlink === undefined) {
    return { status: "unknown", kind, reason: "link-unverified" };
  }
  let target: string;
  try {
    target = await fileSystem.readlink(path);
  } catch {
    return { status: "unknown", kind, reason: "reparse-uncertain" };
  }
  const validation = validateSelfDoctorRelativeEntry(target, platform);
  if (!validation.ok) {
    return { status: "unsafe", kind, reason: validation.reason };
  }
  const lexicalTarget = resolve(dirname(path), ...validation.parts);
  if (!isContained(root, lexicalTarget)) {
    return { status: "unsafe", kind, reason: "outside-root" };
  }
  try {
    await fileSystem.lstat(lexicalTarget);
    return { status: "unknown", kind, reason: "link-unverified" };
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { status: "broken-link", kind, reason: "broken-link" };
    }
    return { status: "unknown", kind, reason: "reparse-uncertain" };
  }
}

async function inspectRoot(
  root: string,
  fileSystem: SelfDoctorFileSystem,
  budget: SelfDoctorPathBudget,
  platform: NodeJS.Platform,
): Promise<{
  status: SelfDoctorPathStatus;
  reason: SelfDoctorPathReason;
  canonicalRoot?: string;
}> {
  if (budget.entries >= MAX_SELF_DOCTOR_ENTRIES) {
    return { status: "budget", reason: "entry-limit" };
  }
  budget.entries += 1;
  let metadata: SelfDoctorFileMetadata;
  try {
    metadata = await fileSystem.lstat(root);
  } catch (error) {
    return {
      status: errorCode(error) === "ENOENT" ? "missing" : "unknown",
      reason: errorCode(error) === "ENOENT" ? "root-missing" : "root-unsafe",
    };
  }
  if (metadata.isSymbolicLink || metadata.reparsePoint) {
    return {
      status: "unsafe",
      reason: platform === "win32" ? "reparse-uncertain" : "root-unsafe",
    };
  }
  if (!metadata.isDirectory) return { status: "unsafe", reason: "root-unsafe" };
  try {
    const canonicalRoot = await fileSystem.realpath(root);
    if (!samePath(canonicalRoot, root)) {
      return { status: "unsafe", reason: "canonical-escape" };
    }
    return { status: "safe", reason: "verified", canonicalRoot };
  } catch {
    return { status: "unknown", reason: "root-unsafe" };
  }
}

export async function inspectSelfDoctorPath(
  rootInput: string,
  entry: string,
  options: {
    readonly platform?: NodeJS.Platform;
    readonly fileSystem?: SelfDoctorFileSystem;
    readonly budget?: SelfDoctorPathBudget;
  } = {},
): Promise<SelfDoctorPathInspection> {
  const platform = options.platform ?? process.platform;
  const fileSystem = options.fileSystem ?? defaultSelfDoctorFileSystem;
  const budget = options.budget ?? { entries: 0, bytes: 0 };
  const validation = validateSelfDoctorRelativeEntry(entry, platform);
  const depth = validation.ok ? validation.parts.length : 0;
  if (!validation.ok) {
    return {
      entry,
      status: "unsafe",
      kind: "unknown",
      reason: validation.reason,
      depth,
    };
  }
  if (depth > MAX_SELF_DOCTOR_DEPTH) {
    return {
      entry,
      status: "budget",
      kind: "unknown",
      reason: "depth-limit",
      depth,
    };
  }

  const root = resolve(rootInput);
  const rootResult = await inspectRoot(root, fileSystem, budget, platform);
  if (rootResult.status !== "safe" || rootResult.canonicalRoot === undefined) {
    return {
      entry,
      status: rootResult.status,
      kind: rootResult.status === "missing" ? "missing" : "unknown",
      reason: rootResult.reason,
      depth,
    };
  }

  let current = root;
  for (let index = 0; index < validation.parts.length; index += 1) {
    if (budget.entries >= MAX_SELF_DOCTOR_ENTRIES) {
      return {
        entry,
        status: "budget",
        kind: "unknown",
        reason: "entry-limit",
        depth,
      };
    }
    current = join(current, validation.parts[index]!);
    if (!isContained(root, current)) {
      return {
        entry,
        status: "unsafe",
        kind: "unknown",
        reason: "outside-root",
        depth,
      };
    }
    budget.entries += 1;
    let metadata: SelfDoctorFileMetadata;
    try {
      metadata = await fileSystem.lstat(current);
    } catch (error) {
      return {
        entry,
        status: errorCode(error) === "ENOENT" ? "missing" : "unknown",
        kind: "missing",
        reason: errorCode(error) === "ENOENT" ? "outside-root" : "read-failed",
        depth,
      };
    }
    if (metadata.isSymbolicLink || metadata.reparsePoint) {
      const link = await classifyLink(
        current,
        root,
        platform,
        fileSystem,
        metadata,
      );
      return { entry, ...link, depth };
    }
    const isLeaf = index === validation.parts.length - 1;
    if (!isLeaf && !metadata.isDirectory) {
      return {
        entry,
        status: "unsafe",
        kind: kindForMetadata(metadata, platform),
        reason: "non-regular-entry",
        depth,
      };
    }
    let canonical: string;
    try {
      canonical = await fileSystem.realpath(current);
    } catch {
      return {
        entry,
        status: "unknown",
        kind: kindForMetadata(metadata, platform),
        reason: "canonical-escape",
        depth,
      };
    }
    if (!isContained(rootResult.canonicalRoot, canonical)) {
      return {
        entry,
        status: "unsafe",
        kind: kindForMetadata(metadata, platform),
        reason: "canonical-escape",
        depth,
      };
    }
    if (isLeaf) {
      if (!metadata.isFile) {
        return {
          entry,
          status: "unsafe",
          kind: kindForMetadata(metadata, platform),
          reason: "non-regular-entry",
          depth,
        };
      }
      if (
        metadata.size !== undefined &&
        metadata.size > MAX_SELF_DOCTOR_FILE_BYTES
      ) {
        return {
          entry,
          status: "budget",
          kind: "regular-file",
          reason: "file-too-large",
          depth,
        };
      }
      if (budget.bytes >= MAX_SELF_DOCTOR_TOTAL_BYTES) {
        return {
          entry,
          status: "budget",
          kind: "regular-file",
          reason: "bytes-limit",
          depth,
        };
      }
      const remainingTotal = MAX_SELF_DOCTOR_TOTAL_BYTES - budget.bytes;
      const readLimit = Math.min(MAX_SELF_DOCTOR_FILE_BYTES, remainingTotal);
      if (readLimit <= 0) {
        return {
          entry,
          status: "budget",
          kind: "regular-file",
          reason: "bytes-limit",
          depth,
        };
      }
      let verifiedRead: Awaited<
        ReturnType<SelfDoctorFileSystem["readVerifiedFile"]>
      >;
      try {
        verifiedRead = await fileSystem.readVerifiedFile(
          current,
          rootResult.canonicalRoot,
          readLimit,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        return {
          entry,
          status: message === "file-too-large" ? "budget" : "unknown",
          kind: "regular-file",
          reason:
            message === "file-too-large" &&
            readLimit < MAX_SELF_DOCTOR_FILE_BYTES
              ? "bytes-limit"
              : message === "file-too-large"
                ? "file-too-large"
                : message === "identity-unproven"
                  ? "identity-unproven"
                  : message === "identity-changed"
                    ? "identity-changed"
                    : "read-failed",
          depth,
        };
      }
      if (
        !isContained(rootResult.canonicalRoot, verifiedRead.canonicalPath) ||
        metadataChanged(metadata, verifiedRead.before) ||
        metadataChanged(verifiedRead.before, verifiedRead.after)
      ) {
        return {
          entry,
          status: "unknown",
          kind: "regular-file",
          reason: "identity-changed",
          depth,
        };
      }
      const source = verifiedRead.content;
      const bytes = Buffer.byteLength(source, "utf8");
      if (bytes > MAX_SELF_DOCTOR_FILE_BYTES) {
        return {
          entry,
          status: "budget",
          kind: "regular-file",
          reason: "file-too-large",
          depth,
        };
      }
      if (budget.bytes + bytes > MAX_SELF_DOCTOR_TOTAL_BYTES) {
        return {
          entry,
          status: "budget",
          kind: "regular-file",
          reason: "bytes-limit",
          depth,
        };
      }
      budget.bytes += bytes;
      return {
        entry,
        status: "safe",
        kind: "regular-file",
        reason: "verified",
        depth,
        bytes,
        content: source,
        ...(platform === "win32" || metadata.mode === undefined
          ? {}
          : { executable: (metadata.mode & 0o111) !== 0 }),
      };
    }
  }
  return {
    entry,
    status: "safe",
    kind: "directory",
    reason: "verified",
    depth,
  };
}

export function isSelfDoctorPathFailure(
  inspection: SelfDoctorPathInspection,
): boolean {
  return inspection.status !== "safe";
}
