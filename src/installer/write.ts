import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import { contentHash } from "./manifest.js";
import { IntegrationPlanError } from "./plan-error.js";

export interface WritableChange {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly beforeContent: string | null;
  readonly beforeHash: string | null;
  readonly afterContent: string | null;
  readonly afterHash: string | null;
}

export interface ApplyWritesOptions {
  readonly beforeWrite?: (index: number) => void | Promise<void>;
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

async function validatePath(root: string, target: string): Promise<void> {
  try {
    const rootMetadata = await lstat(root);
    if (
      rootMetadata.isSymbolicLink() ||
      !rootMetadata.isDirectory() ||
      (await realpath(root)) !== root
    ) {
      throw new IntegrationPlanError("UNSAFE_TARGET");
    }
  } catch (error) {
    if (error instanceof IntegrationPlanError) {
      throw error;
    }
    throw new IntegrationPlanError("UNSAFE_TARGET", { cause: error });
  }

  if (!isInside(root, target)) {
    throw new IntegrationPlanError("UNSAFE_TARGET");
  }
  const segments = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        throw new IntegrationPlanError("UNSAFE_TARGET");
      }
      if ((await realpath(current)) !== current) {
        throw new IntegrationPlanError("UNSAFE_TARGET");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function currentHash(path: string): Promise<string | null> {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new IntegrationPlanError("UNSAFE_TARGET");
    }
    return contentHash(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function atomicWrite(
  root: string,
  change: WritableChange,
  expectedHash: string | null,
  content: string | null,
): Promise<void> {
  await validatePath(root, change.absolutePath);
  if ((await currentHash(change.absolutePath)) !== expectedHash) {
    throw new IntegrationPlanError("PROJECT_CHANGED");
  }
  if (content === null) {
    await validatePath(root, change.absolutePath);
    if ((await currentHash(change.absolutePath)) !== expectedHash) {
      throw new IntegrationPlanError("PROJECT_CHANGED");
    }
    await rm(change.absolutePath);
    return;
  }

  await mkdir(dirname(change.absolutePath), { recursive: true });
  if (dirname(change.absolutePath) !== root) {
    await validatePath(root, dirname(change.absolutePath));
  }

  const temporaryPath = resolve(
    dirname(change.absolutePath),
    `.${basename(change.absolutePath)}.tauri-agent-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await validatePath(root, change.absolutePath);
    if ((await currentHash(change.absolutePath)) !== expectedHash) {
      throw new IntegrationPlanError("PROJECT_CHANGED");
    }
    await rename(temporaryPath, change.absolutePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function applyWrites(
  projectRoot: string,
  changes: readonly WritableChange[],
  options: ApplyWritesOptions = {},
): Promise<void> {
  const virtualHashes = new Map<string, string | null>();
  for (const change of changes) {
    await validatePath(projectRoot, change.absolutePath);
    const expected = virtualHashes.has(change.absolutePath)
      ? virtualHashes.get(change.absolutePath)
      : await currentHash(change.absolutePath);
    if (expected !== change.beforeHash) {
      throw new IntegrationPlanError("PROJECT_CHANGED");
    }
    virtualHashes.set(change.absolutePath, change.afterHash);
  }

  const applied: WritableChange[] = [];
  try {
    for (const [index, change] of changes.entries()) {
      await options.beforeWrite?.(index);
      await atomicWrite(
        projectRoot,
        change,
        change.beforeHash,
        change.afterContent,
      );
      applied.push(change);
    }
  } catch (error) {
    for (const change of applied.reverse()) {
      try {
        if ((await currentHash(change.absolutePath)) !== change.afterHash) {
          continue;
        }
        if (change.beforeContent === null) {
          await validatePath(projectRoot, change.absolutePath);
          await rm(change.absolutePath, { force: true });
        } else {
          await atomicWrite(
            projectRoot,
            change,
            change.afterHash,
            change.beforeContent,
          );
        }
      } catch {
        throw new IntegrationPlanError("WRITE_FAILED", { cause: error });
      }
    }
    for (const change of changes) {
      const parent = dirname(change.absolutePath);
      if (
        change.beforeHash !== null ||
        change.afterContent === null ||
        parent === projectRoot
      ) {
        continue;
      }
      try {
        const parentMetadata = await lstat(parent);
        if (parentMetadata.isSymbolicLink()) {
          await rm(parent, { force: true });
        } else {
          await rmdir(parent);
        }
      } catch (cleanupError) {
        if (
          !["ENOENT", "ENOTEMPTY"].includes(
            String((cleanupError as NodeJS.ErrnoException).code),
          )
        ) {
          throw new IntegrationPlanError("WRITE_FAILED", { cause: error });
        }
      }
    }
    throw error;
  }
}
