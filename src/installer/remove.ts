import { readdir, rmdir } from "node:fs/promises";
import { resolve } from "node:path";

import { planCargoRemoval } from "./cargo.js";
import {
  contentHash,
  createIntegrationManifest,
  INTEGRATION_MANIFEST_RELATIVE_PATH,
  parseCanonicalIntegrationManifest,
  serializeIntegrationManifest,
  type IntegrationManifestChange,
} from "./manifest.js";
import { IntegrationPlanError } from "./plan-error.js";
import { IGNORE_BLOCK, readSafeFile, validateAppliedManifest } from "./plan.js";
import { detectTauriProject } from "./project.js";
import { planRustRemoval } from "./rust.js";
import {
  applyWrites,
  type ApplyWritesOptions,
  type WritableChange,
} from "./write.js";

export interface RemovalChange {
  readonly relativePath: string;
  readonly action: "restore" | "delete";
}

export interface RemovalResult {
  readonly status: "planned" | "removed";
  readonly changes: readonly RemovalChange[];
}

export interface RemoveIntegrationOptions {
  readonly dryRun?: boolean;
  readonly writeOptions?: ApplyWritesOptions;
}

function removalChange(
  projectRoot: string,
  entry: IntegrationManifestChange,
  current: string,
  afterContent: string | null,
): WritableChange {
  return {
    absolutePath: resolve(projectRoot, entry.relativePath),
    relativePath: entry.relativePath,
    beforeContent: current,
    beforeHash: contentHash(current),
    afterContent,
    afterHash: afterContent === null ? null : contentHash(afterContent),
  };
}

function removeIgnoreBlock(source: string): string {
  if (source.split(IGNORE_BLOCK).length - 1 !== 1) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  return source.replace(IGNORE_BLOCK, "");
}

async function planConsumerRemoval(
  projectRoot: string,
  entry: IntegrationManifestChange,
): Promise<WritableChange> {
  const current = await readSafeFile(
    projectRoot,
    resolve(projectRoot, entry.relativePath),
    true,
  );
  if (current === null) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }

  switch (entry.kind) {
    case "cargo":
      return removalChange(
        projectRoot,
        entry,
        current,
        planCargoRemoval(current, entry.attribution),
      );
    case "rust":
      return removalChange(
        projectRoot,
        entry,
        current,
        planRustRemoval(current),
      );
    case "ignore": {
      const restored = removeIgnoreBlock(current);
      return removalChange(projectRoot, entry, current, restored);
    }
    case "capability":
    case "config":
      if (contentHash(current) !== entry.afterHash) {
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      }
      return removalChange(projectRoot, entry, current, null);
  }
}

export async function removeIntegration(
  projectPath: string,
  options: RemoveIntegrationOptions = {},
): Promise<RemovalResult> {
  const detected = await detectTauriProject(projectPath);
  const manifestPath = resolve(
    detected.projectRoot,
    INTEGRATION_MANIFEST_RELATIVE_PATH,
  );
  let manifestSource: string | null;
  try {
    manifestSource = await readSafeFile(
      detected.projectRoot,
      manifestPath,
      true,
    );
  } catch (error) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED", {
      cause: error,
    });
  }
  if (manifestSource === null) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }

  let manifest;
  try {
    manifest = parseCanonicalIntegrationManifest(manifestSource);
    if (manifest.state !== "applied") {
      throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
    }
    validateAppliedManifest(manifest);
  } catch (error) {
    if (error instanceof IntegrationPlanError) {
      throw error;
    }
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED", {
      cause: error,
    });
  }

  const consumerChanges = await Promise.all(
    manifest.changes.map((entry) =>
      planConsumerRemoval(detected.projectRoot, entry),
    ),
  );
  const changes = consumerChanges.map((change) => ({
    relativePath: change.relativePath,
    action: change.afterContent === null ? "delete" : "restore",
  })) satisfies RemovalChange[];
  if (options.dryRun) {
    return { status: "planned", changes };
  }

  const removingSource = serializeIntegrationManifest(
    createIntegrationManifest(manifest.changes, "removing"),
  );
  const manifestToRemoving: WritableChange = {
    absolutePath: manifestPath,
    relativePath: INTEGRATION_MANIFEST_RELATIVE_PATH,
    beforeContent: manifestSource,
    beforeHash: contentHash(manifestSource),
    afterContent: removingSource,
    afterHash: contentHash(removingSource),
  };
  const removeManifest: WritableChange = {
    absolutePath: manifestPath,
    relativePath: INTEGRATION_MANIFEST_RELATIVE_PATH,
    beforeContent: removingSource,
    beforeHash: contentHash(removingSource),
    afterContent: null,
    afterHash: null,
  };

  await applyWrites(
    detected.projectRoot,
    [manifestToRemoving, ...consumerChanges, removeManifest],
    options.writeOptions,
  );

  const agentDirectory = resolve(detected.projectRoot, ".tauri-agent");
  try {
    if ((await readdir(agentDirectory)).length === 0) {
      await rmdir(agentDirectory);
    }
  } catch (error) {
    if (
      !["ENOENT", "ENOTEMPTY"].includes(
        String((error as NodeJS.ErrnoException).code),
      )
    ) {
      throw error;
    }
  }
  return { status: "removed", changes };
}
