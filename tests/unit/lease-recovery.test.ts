import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { WindowsBootIdentifier } from "../../src/platform/windows/boot-identifier.js";
import { runLeaseRecovery } from "../../src/session/lease-recovery.js";

const CURRENT_BOOT: WindowsBootIdentifier = {
  scheme: "windows-boot-sequence/v2",
  bootEnvironmentGuid: "11111111-1111-4111-8111-111111111111",
  bootId: 52,
};
const PREVIOUS_BOOT: WindowsBootIdentifier = {
  scheme: "windows-boot-sequence/v2",
  bootEnvironmentGuid: "11111111-1111-4111-8111-111111111111",
  bootId: 51,
};
const ACTOR_SID = "S-1-5-21-1000";
const LEASE_ID = "a".repeat(32);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pumarejo-lease-recovery-"));
  roots.push(root);
  await mkdir(join(root, ".pumarejo", "sessions"), { recursive: true });
  return root;
}

function lease(root: string, bootIdentifier = PREVIOUS_BOOT) {
  return {
    version: 2,
    launchId: LEASE_ID,
    controllerId: "b".repeat(64),
    controllerPid: 90_001,
    pid: 90_002,
    startedAt: 10_000,
    commandHash: "c".repeat(64),
    systemHash: "d".repeat(64),
    sessionNonce: "e".repeat(64),
    mechanism: "windows_job_object",
    state: "retryable",
    createdAt: 10_100,
    updatedAt: 10_200,
    platform: "win32",
    bootIdentifier,
    bootProvenance: "creation",
    context: {
      command: "mcp",
      projectRoot: root,
    },
    recoveryHistory: [],
  } as const;
}

function legacyLease() {
  const {
    platform: _platform,
    bootIdentifier: _boot,
    bootProvenance: _bootProvenance,
    context: _context,
    recoveryHistory: _history,
    ...legacy
  } = lease("C:\\legacy");
  return { ...legacy, version: 1 as const };
}

async function seed(root: string, value: unknown): Promise<string> {
  const path = join(root, ".pumarejo", "sessions", `${LEASE_ID}.json`);
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
  return path;
}

async function seedLegacyBinding(root: string, leasePath: string) {
  const source = await readFile(leasePath, "utf8");
  const metadata = await lstat(leasePath);
  const bindingRoot = join(root, ".pumarejo", "lease-recovery", "bindings");
  const bindingPath = join(bindingRoot, `${LEASE_ID}.json`);
  await mkdir(bindingRoot, { recursive: true });
  await writeFile(
    bindingPath,
    `${JSON.stringify({
      schema: "pumarejo-legacy-lease-boot-binding/v1",
      operationId: "9".repeat(32),
      leaseId: LEASE_ID,
      leaseSha256: createHash("sha256").update(source, "utf8").digest("hex"),
      fileIdentity: {
        dev: metadata.dev,
        ino: metadata.ino,
        size: metadata.size,
        mtimeMs: metadata.mtimeMs,
        ctimeMs: metadata.ctimeMs,
      },
      observedBootIdentifier: {
        scheme: "windows-boot-environment-guid/v1",
        value: CURRENT_BOOT.bootEnvironmentGuid,
      },
      capturedAt: 15_000,
      actor: { sid: ACTOR_SID, pid: 123 },
      projectRoot: root,
    })}\n`,
    "utf8",
  );
  return bindingPath;
}

function options(
  root: string,
  overrides: Partial<Parameters<typeof runLeaseRecovery>[0]> = {},
) {
  return {
    projectRoot: root,
    action: "recover" as const,
    execute: true,
    platform: "win32" as const,
    currentBootIdentifier: async () => CURRENT_BOOT,
    actingIdentity: async () => ({ sid: ACTOR_SID, pid: 321 }),
    now: () => 20_000,
    operationId: "f".repeat(32),
    ...overrides,
  };
}

describe("boot-aware Windows lease recovery", () => {
  it("refuses a same-boot lease and audits the rejection", async () => {
    const root = await project();
    const path = await seed(root, lease(root, CURRENT_BOOT));

    const result = await runLeaseRecovery(options(root));

    expect(result.results).toEqual([
      expect.objectContaining({
        leaseId: LEASE_ID,
        decision: "rejected",
        reason: "same_boot",
      }),
    ]);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      state: "retryable",
      recoveryHistory: [],
    });
    await expect(
      lstat(
        join(
          root,
          ".pumarejo",
          "lease-recovery",
          "audits",
          "f".repeat(32),
          `${LEASE_ID}.json`,
        ),
      ),
    ).resolves.toBeDefined();
  });

  it("recovers a previous-boot lease with a durable audit and history", async () => {
    const root = await project();
    const path = await seed(root, lease(root));

    const result = await runLeaseRecovery(options(root));

    expect(result.results).toEqual([
      expect.objectContaining({
        leaseId: LEASE_ID,
        decision: "recovered",
        reason: "previous_boot",
      }),
    ]);
    const recovered = JSON.parse(await readFile(path, "utf8")) as {
      state: string;
      recoveryHistory: unknown[];
    };
    expect(recovered.state).toBe("closed");
    expect(recovered.recoveryHistory).toHaveLength(1);
    const audit = JSON.parse(
      await readFile(
        join(
          root,
          ".pumarejo",
          "lease-recovery",
          "audits",
          "f".repeat(32),
          `${LEASE_ID}.json`,
        ),
        "utf8",
      ),
    );
    expect(audit).toMatchObject({
      schema: "pumarejo-lease-recovery-audit/v1",
      actor: { sid: ACTOR_SID, pid: 321 },
      decision: "recovered",
      previousBootIdentifier: PREVIOUS_BOOT,
      currentBootIdentifier: CURRENT_BOOT,
    });
    expect(JSON.stringify(audit)).not.toContain("e".repeat(64));
  });

  it("fails closed for missing or malformed boot provenance", async () => {
    const missingRoot = await project();
    await seed(missingRoot, legacyLease());
    const missing = await runLeaseRecovery(options(missingRoot));
    expect(missing.results[0]).toMatchObject({
      decision: "rejected",
      reason: "ambiguous_missing_boot",
    });

    const malformedRoot = await project();
    await seed(
      malformedRoot,
      lease(malformedRoot, {
        ...CURRENT_BOOT,
        bootEnvironmentGuid: "malformed",
      }),
    );
    const malformed = await runLeaseRecovery(options(malformedRoot));
    expect(malformed.results[0]).toMatchObject({
      decision: "rejected",
      reason: "malformed_lease",
    });
  });

  it("binds an unchanged legacy record to one observed boot before recovery", async () => {
    const root = await project();
    const path = await seed(root, legacyLease());

    const bound = await runLeaseRecovery(
      options(root, { action: "bind-legacy", operationId: "1".repeat(32) }),
    );
    expect(bound.results[0]).toMatchObject({
      decision: "bound",
      reason: "legacy_boot_bound",
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      version: 1,
      state: "retryable",
    });

    const sameBoot = await runLeaseRecovery(
      options(root, { operationId: "2".repeat(32) }),
    );
    expect(sameBoot.results[0]).toMatchObject({
      decision: "rejected",
      reason: "same_boot",
    });

    const recovered = await runLeaseRecovery(
      options(root, {
        operationId: "3".repeat(32),
        currentBootIdentifier: async () => ({
          ...CURRENT_BOOT,
          bootId: 53,
        }),
      }),
    );
    expect(recovered.results[0]).toMatchObject({
      decision: "recovered",
      reason: "previous_boot",
      evidenceSource: "legacy_binding",
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      version: 2,
      state: "closed",
      recoveryHistory: [expect.objectContaining({ source: "legacy_binding" })],
    });
  });

  it("upgrades an immutable GUID-only binding before trusting a later boot", async () => {
    const root = await project();
    const path = await seed(root, legacyLease());
    const legacyBindingPath = await seedLegacyBinding(root, path);
    const legacyBindingSource = await readFile(legacyBindingPath, "utf8");

    const beforeUpgrade = await runLeaseRecovery(options(root));
    expect(beforeUpgrade.results[0]).toMatchObject({
      decision: "rejected",
      reason: "legacy_binding_upgrade_required",
    });

    const upgraded = await runLeaseRecovery(
      options(root, {
        action: "upgrade-binding",
        operationId: "5".repeat(32),
      }),
    );
    expect(upgraded.results[0]).toMatchObject({
      decision: "upgraded",
      reason: "legacy_binding_upgraded",
    });
    expect(await readFile(legacyBindingPath, "utf8")).toBe(legacyBindingSource);
    expect(
      JSON.parse(
        await readFile(
          join(
            root,
            ".pumarejo",
            "lease-recovery",
            "bindings-v2",
            `${LEASE_ID}.json`,
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({
      schema: "pumarejo-legacy-lease-boot-binding/v2",
      observedBootIdentifier: CURRENT_BOOT,
      supersedes: {
        schema: "pumarejo-legacy-lease-boot-binding/v1",
        operationId: "9".repeat(32),
      },
    });

    const sameBoot = await runLeaseRecovery(
      options(root, { operationId: "6".repeat(32) }),
    );
    expect(sameBoot.results[0]).toMatchObject({
      decision: "rejected",
      reason: "same_boot",
    });

    const nextBoot = await runLeaseRecovery(
      options(root, {
        operationId: "7".repeat(32),
        currentBootIdentifier: async () => ({ ...CURRENT_BOOT, bootId: 53 }),
      }),
    );
    expect(nextBoot.results[0]).toMatchObject({
      decision: "recovered",
      reason: "previous_boot",
      evidenceSource: "legacy_binding",
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      version: 2,
      state: "closed",
    });
  });

  it("revalidates the exact record immediately before mutation", async () => {
    const root = await project();
    const path = await seed(root, lease(root));

    const result = await runLeaseRecovery(
      options(root, {
        beforeMutation: async () => {
          const changed = JSON.parse(await readFile(path, "utf8"));
          changed.updatedAt += 1;
          await writeFile(path, `${JSON.stringify(changed)}\n`, "utf8");
        },
      }),
    );

    expect(result.results[0]).toMatchObject({
      decision: "rejected",
      reason: "lease_changed",
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      state: "retryable",
      recoveryHistory: [],
    });
  });

  it("is idempotent and never appends duplicate recovery history", async () => {
    const root = await project();
    const path = await seed(root, lease(root));
    await runLeaseRecovery(options(root));

    const repeated = await runLeaseRecovery(
      options(root, { operationId: "4".repeat(32) }),
    );

    expect(repeated.results[0]).toMatchObject({
      decision: "already_recovered",
      reason: "already_recovered",
    });
    expect(
      (
        JSON.parse(await readFile(path, "utf8")) as {
          recoveryHistory: unknown[];
        }
      ).recoveryHistory,
    ).toHaveLength(1);
  });

  it("reports dry-run recovery without modifying leases or creating audits", async () => {
    const root = await project();
    const path = await seed(root, lease(root));
    const before = await readFile(path, "utf8");

    const result = await runLeaseRecovery(options(root, { execute: false }));

    expect(result.results[0]).toMatchObject({
      decision: "would_recover",
      reason: "previous_boot",
    });
    expect(await readFile(path, "utf8")).toBe(before);
    await expect(
      lstat(join(root, ".pumarejo", "lease-recovery")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves non-Windows behavior without inspecting or mutating leases", async () => {
    const root = await project();
    const path = await seed(root, lease(root));
    const before = await readFile(path, "utf8");

    const result = await runLeaseRecovery(options(root, { platform: "linux" }));

    expect(result).toMatchObject({
      status: "unsupported_platform",
      results: [],
    });
    expect(await readFile(path, "utf8")).toBe(before);
  });
});
