import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ArtifactCleanupNativeError,
  runArtifactCleanup,
  type WindowsArtifactInspection,
  type WindowsArtifactNativeOperations,
} from "../../src/artifacts/maintenance.js";

const roots: string[] = [];
const OWNER = "S-1-5-21-1001";
const MAINTAINER = "S-1-5-21-2001";

async function fixture() {
  const project = await mkdtemp(
    join(tmpdir(), "pumarejo-artifact-maintenance-"),
  );
  roots.push(project);
  const authorizedRoot = join(project, ".pumarejo");
  const target = join(authorizedRoot, "qa-project");
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "evidence.txt"), "bounded\n", "utf8");
  const inspection: WindowsArtifactInspection = {
    canonicalPath: target,
    filesystemIdentity: {
      volumeSerialNumber: "0000000000000001",
      fileId: "00112233445566778899aabbccddeeff",
    },
    ownerSid: OWNER,
    creationTimeFiletime: "133000000000000000",
    lastWriteTimeFiletime: "133000000000000001",
    attributes: 16,
    reparseTag: 0,
  };
  const manifestPath = join(authorizedRoot, "cleanup-manifest.json");
  const manifest = {
    schema: "pumarejo-artifact-cleanup-manifest/v1",
    manifestId: "a".repeat(32),
    projectRoot: project,
    authorizedArtifactRoot: authorizedRoot,
    target: {
      artifactId: basename(target),
      canonicalPath: target,
      filesystemIdentity: inspection.filesystemIdentity,
      expectedOwnerSid: OWNER,
      creationMetadata: {
        creationTimeFiletime: inspection.creationTimeFiletime,
        lastWriteTimeFiletime: inspection.lastWriteTimeFiletime,
      },
      origin: {
        workflowId: "icook-integration-repair-2026-08-31",
        sessionId: "historical-qa-project",
        command: "native-acceptance-qa",
      },
      eligibility: {
        state: "historical-orphaned",
        verifiedAt: 10_000,
        reason: "historical scanner-blocking artifact",
      },
    },
    authorization: {
      basis: "original-owner",
      authorizedSid: OWNER,
      authorizedAt: 11_000,
      approvedBy: "workspace-owner",
      reference: "user-request-2026-09-01",
    },
    reason: "remove historical scanner-blocking artifact",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
  return { project, target, manifestPath, inspection, manifest };
}

function native(
  inspection: WindowsArtifactInspection,
  options: {
    summary?: { files: number; directories: number; bytes: number };
    preflightError?: ArtifactCleanupNativeError;
    onInspect?: (count: number) => WindowsArtifactInspection;
  } = {},
): WindowsArtifactNativeOperations {
  let inspections = 0;
  const summary = options.summary ?? { files: 1, directories: 1, bytes: 8 };
  return {
    inspect: async () => {
      inspections += 1;
      return options.onInspect?.(inspections) ?? inspection;
    },
    preflight: async () => {
      if (options.preflightError !== undefined) throw options.preflightError;
      return summary;
    },
    delete: async (request) => {
      await rm(request.targetPath, { recursive: true });
      return summary;
    },
  };
}

function options(
  value: Awaited<ReturnType<typeof fixture>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    projectRoot: value.project,
    manifestPath: value.manifestPath,
    expectedWorkflowId: "icook-integration-repair-2026-08-31",
    expectedSessionId: "historical-qa-project",
    execute: false,
    platform: "win32" as const,
    native: native(value.inspection),
    actingIdentity: async () => ({
      sid: OWNER,
      pid: 44,
      elevatedAdministrator: false,
    }),
    now: () => 20_000,
    operationId: "b".repeat(32),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("identity-bound artifact maintenance", () => {
  it("dry-runs and then removes a valid target with structured attestations", async () => {
    const value = await fixture();
    const dryRun = await runArtifactCleanup(options(value));
    expect(dryRun).toMatchObject({
      decision: "would_remove",
      completed: false,
    });
    await expect(
      readFile(join(value.target, "evidence.txt"), "utf8"),
    ).resolves.toBe("bounded\n");
    expect(
      JSON.parse(await readFile(dryRun.attestationPath, "utf8")),
    ).toMatchObject({
      decision: "would_remove",
      actingIdentity: { sid: OWNER },
      canonicalTargetPath: value.target,
      summary: { files: 1, directories: 1, bytes: 8 },
      deletionCompleted: false,
    });

    const removed = await runArtifactCleanup(
      options(value, { execute: true, operationId: "c".repeat(32) }),
    );
    expect(removed).toMatchObject({ decision: "removed", completed: true });
    await expect(
      readFile(join(value.target, "evidence.txt"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects targets outside the authorized root and manifest identity mismatches", async () => {
    const value = await fixture();
    const outside = join(value.project, "outside");
    await mkdir(outside);
    const changed = {
      ...value.manifest,
      target: { ...value.manifest.target, canonicalPath: outside },
    };
    await writeFile(value.manifestPath, `${JSON.stringify(changed)}\n`, "utf8");
    await expect(runArtifactCleanup(options(value))).resolves.toMatchObject({
      decision: "rejected",
      reason: "path_outside_authorized_root",
    });

    await writeFile(
      value.manifestPath,
      `${JSON.stringify(value.manifest)}\n`,
      "utf8",
    );
    const mismatch = {
      ...value.inspection,
      filesystemIdentity: {
        ...value.inspection.filesystemIdentity,
        fileId: "e".repeat(32),
      },
    };
    await expect(
      runArtifactCleanup(
        options(value, {
          native: native(mismatch),
          operationId: "d".repeat(32),
        }),
      ),
    ).resolves.toMatchObject({
      decision: "rejected",
      reason: "manifest_mismatch",
    });
  });

  it.each([
    ["symlink", "unsafe_symlink"],
    ["junction", "unsafe_junction"],
    ["mount point", "unsafe_mount_point"],
    ["other reparse point", "unsafe_reparse_point"],
  ])(
    "rejects a %s discovered by the native preflight",
    async (_label, code) => {
      const value = await fixture();
      const result = await runArtifactCleanup(
        options(value, {
          native: native(value.inspection, {
            preflightError: new ArtifactCleanupNativeError(code as never),
          }),
        }),
      );
      expect(result).toMatchObject({ decision: "rejected", reason: code });
    },
  );

  it("rejects missing durable metadata and workflow mismatches", async () => {
    const value = await fixture();
    const incomplete = {
      ...value.manifest,
      target: { ...value.manifest.target, filesystemIdentity: undefined },
    };
    await writeFile(
      value.manifestPath,
      `${JSON.stringify(incomplete)}\n`,
      "utf8",
    );
    await expect(runArtifactCleanup(options(value))).resolves.toMatchObject({
      decision: "rejected",
      reason: "manifest_invalid",
    });

    await writeFile(
      value.manifestPath,
      `${JSON.stringify(value.manifest)}\n`,
      "utf8",
    );
    await expect(
      runArtifactCleanup(
        options(value, { expectedWorkflowId: "different-workflow" }),
      ),
    ).resolves.toMatchObject({
      decision: "rejected",
      reason: "origin_mismatch",
    });
  });

  it("fails closed when the target changes between inspection and deletion", async () => {
    const value = await fixture();
    const changed = {
      ...value.inspection,
      filesystemIdentity: {
        ...value.inspection.filesystemIdentity,
        fileId: "f".repeat(32),
      },
    };
    const result = await runArtifactCleanup(
      options(value, {
        execute: true,
        native: native(value.inspection, {
          onInspect: (count) => (count === 1 ? value.inspection : changed),
        }),
      }),
    );
    expect(result).toMatchObject({
      decision: "rejected",
      reason: "target_changed",
    });
    await expect(
      readFile(join(value.target, "evidence.txt"), "utf8"),
    ).resolves.toBe("bounded\n");
  });

  it("is safe and idempotent when the manifested target is already gone", async () => {
    const value = await fixture();
    await rm(value.target, { recursive: true });
    const result = await runArtifactCleanup(options(value));
    expect(result).toMatchObject({
      decision: "already_removed",
      completed: true,
    });
  });

  it("attests a large recursive aggregate without emitting a path list", async () => {
    const value = await fixture();
    const result = await runArtifactCleanup(
      options(value, {
        native: native(value.inspection, {
          summary: { files: 125_000, directories: 8_000, bytes: 9_876_543_210 },
        }),
      }),
    );
    const attestation = JSON.parse(
      await readFile(result.attestationPath, "utf8"),
    );
    expect(attestation.summary).toEqual({
      files: 125_000,
      directories: 8_000,
      bytes: 9_876_543_210,
    });
    expect(attestation).not.toHaveProperty("removedPaths");
  });

  it("rejects unauthorized identities and permits an explicitly authorized elevated maintainer", async () => {
    const value = await fixture();
    await expect(
      runArtifactCleanup(
        options(value, {
          actingIdentity: async () => ({
            sid: MAINTAINER,
            pid: 55,
            elevatedAdministrator: true,
          }),
        }),
      ),
    ).resolves.toMatchObject({
      decision: "rejected",
      reason: "unauthorized_identity",
    });

    const maintenanceManifest = {
      ...value.manifest,
      authorization: {
        ...value.manifest.authorization,
        basis: "explicit-maintenance",
        authorizedSid: MAINTAINER,
      },
    };
    await writeFile(
      value.manifestPath,
      `${JSON.stringify(maintenanceManifest)}\n`,
      "utf8",
    );
    const privilegeRequests: boolean[] = [];
    const maintenanceNative: WindowsArtifactNativeOperations = {
      inspect: async (_path, maintenancePrivileges) => {
        privilegeRequests.push(maintenancePrivileges === true);
        return value.inspection;
      },
      preflight: async (request) => {
        privilegeRequests.push(request.maintenancePrivileges === true);
        return { files: 1, directories: 1, bytes: 8 };
      },
      delete: async () => ({ files: 1, directories: 1, bytes: 8 }),
    };
    await expect(
      runArtifactCleanup(
        options(value, {
          native: maintenanceNative,
          actingIdentity: async () => ({
            sid: MAINTAINER,
            pid: 55,
            elevatedAdministrator: true,
          }),
        }),
      ),
    ).resolves.toMatchObject({ decision: "would_remove" });
    expect(privilegeRequests).toEqual([true, true]);
  });
});
