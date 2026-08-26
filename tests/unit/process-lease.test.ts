import { mkdtemp, readFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  CustodyLeaseStore,
  proveCustodyOwnership,
  sanitizeCustodyEvidence,
  validateCustodyLease,
} from "../../src/session/custody-lease.js";

const IDENTITY = {
  pid: 71,
  startedAt: 1_000,
  commandHash: "a".repeat(64),
  systemHash: "b".repeat(64),
  sessionNonce: "c".repeat(64),
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function store() {
  const root = await mkdtemp(join(tmpdir(), "pumarejo-custody-"));
  roots.push(root);
  return new CustodyLeaseStore({
    root,
    controllerId: "d".repeat(64),
    now: () => 10_000,
  });
}

describe("durable custody lease", () => {
  it("writes a bounded owner-only record and converges idempotent transitions", async () => {
    const leases = await store();
    const record = await leases.create({
      controllerId: "d".repeat(64),
      identity: IDENTITY,
      mechanism: "posix_process_group",
      groupId: 71,
      sessionId: 71,
      providerPort: 50_001,
      providerFamily: "ipv6",
      proxyPort: 50_002,
    });
    const persisted = JSON.parse(
      await readFile(leases.pathFor(record.launchId), "utf8"),
    ) as unknown;
    expect(validateCustodyLease(persisted)).toBe(true);
    expect(persisted).toMatchObject({
      providerPort: 50_001,
      providerFamily: "ipv6",
    });
    expect(JSON.stringify(persisted)).not.toContain("/Users/");
    const closing = await leases.transition(record, "closing");
    expect(await leases.transition(closing, "closing")).toMatchObject({
      state: "closing",
    });
    const closed = await leases.transition(closing, "closed");
    await leases.remove(closed);
    await expect(leases.read(record.launchId)).resolves.toBeUndefined();
  });

  it("rejects provider ports without an exact loopback family", async () => {
    const leases = await store();
    await expect(
      leases.create({
        controllerId: "d".repeat(64),
        identity: IDENTITY,
        mechanism: "posix_process_group",
        providerPort: 50_001,
      }),
    ).rejects.toThrow("Custody lease fields are invalid.");
  });

  it.skipIf(process.platform === "win32")(
    "does not follow a linked lease file",
    async () => {
      const leases = await store();
      const outside = await mkdtemp(join(tmpdir(), "pumarejo-outside-"));
      roots.push(outside);
      const record = await leases.create({
        controllerId: "d".repeat(64),
        identity: IDENTITY,
        mechanism: "posix_process_group",
      });
      const path = leases.pathFor(record.launchId);
      await rm(path);
      await symlink(join(outside, "foreign.json"), path);
      await expect(leases.read(record.launchId)).rejects.toThrow();
    },
  );

  it("requires the complete conjunctive proof and sanitizes evidence before storage", () => {
    const lease = {
      version: 1 as const,
      launchId: "e".repeat(32),
      controllerId: "d".repeat(64),
      controllerPid: 500,
      ...IDENTITY,
      mechanism: "posix_process_group" as const,
      groupId: 71,
      sessionId: 71,
      state: "active" as const,
      createdAt: 10_000,
      updatedAt: 10_000,
    };
    expect(
      proveCustodyOwnership(lease, {
        identity: { ...IDENTITY, startedAt: 2_000 },
        mechanism: "posix_process_group",
        groupId: 71,
        sessionId: 71,
        descendantsComplete: true,
      }),
    ).toEqual({ owned: false, reason: "identity-mismatch" });
    expect(
      proveCustodyOwnership(lease, {
        identity: IDENTITY,
        mechanism: "posix_process_group",
        groupId: 71,
        sessionId: 71,
        descendantsComplete: false,
      }),
    ).toEqual({ owned: false, reason: "incomplete-tree" });
    const evidence = sanitizeCustodyEvidence({
      phase: "terminate",
      code: "custody_cleanup_converged",
      mechanism: "posix_process_group",
      state: "supported",
      retryable: false,
    });
    expect(evidence).not.toHaveProperty("pid");
    expect(evidence).not.toHaveProperty("sessionNonce");
    expect(JSON.stringify(evidence)).not.toContain("/Users/");
  });
});
