import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type {
  ProcessAdapter,
  ProcessCustodyAttachment,
  ProcessCustodyInspection,
} from "../../src/platform/types.js";
import { CustodyLeaseStore } from "../../src/session/custody-lease.js";
import { SessionManager } from "../../src/session/manager.js";

const identity = {
  pid: 71,
  startedAt: 1_000,
  commandHash: "a".repeat(64),
  systemHash: "b".repeat(64),
  sessionNonce: "c".repeat(64),
};

function fakeProcess(options: {
  readonly proveOwnership: boolean;
  readonly providerOwnerResult?: number;
}) {
  let present = true;
  let terminated = 0;
  let spawnAttempts = 0;
  const providerOwnerCalls: Array<{
    readonly pid: number;
    readonly port: number;
    readonly family: string | undefined;
  }> = [];
  const custody = {
    async capability() {
      return {
        mechanism: "posix_process_group" as const,
        state: "supported" as const,
        code: "posix_process_group_available",
        killOnClose: false,
      };
    },
    async attach(): Promise<ProcessCustodyAttachment> {
      return { mechanism: "posix_process_group", groupId: 71, sessionId: 71 };
    },
    async inspect(): Promise<ProcessCustodyInspection | undefined> {
      if (!present) return undefined;
      return {
        identity: options.proveOwnership
          ? identity
          : { ...identity, startedAt: 2_000 },
        mechanism: "posix_process_group",
        groupId: 71,
        sessionId: 71,
        descendantsComplete: true,
      };
    },
    async terminate() {
      terminated += 1;
      present = false;
      return { state: "terminated" as const, escalated: false };
    },
    async release() {
      // no-op
    },
  };
  const process: ProcessAdapter = {
    custody,
    async spawn() {
      spawnAttempts += 1;
      throw new Error("spawn should not run before orphan recovery");
    },
    async inspect() {
      return undefined;
    },
    async terminateTree() {
      throw new Error("legacy termination should not run");
    },
    async providerOwner(pid, port, family) {
      providerOwnerCalls.push({ pid, port, family });
      return options.providerOwnerResult;
    },
  };
  return {
    process,
    get terminated() {
      return terminated;
    },
    get spawnAttempts() {
      return spawnAttempts;
    },
    providerOwnerCalls,
  };
}

async function seed(root: string, providerPid = 79) {
  const old = new CustodyLeaseStore({
    root,
    controllerId: "d".repeat(64),
    controllerPid: 999_999,
    now: () => 1_000,
  });
  return await old.create({
    controllerId: "d".repeat(64),
    controllerPid: 999_999,
    identity,
    mechanism: "posix_process_group",
    groupId: 71,
    sessionId: 71,
    ...(providerPid === 0 ? {} : { providerPid }),
    providerPort: 50_001,
    providerFamily: "ipv6",
  });
}

describe("startup custody recovery", () => {
  it("repairs a dead-controller orphan before accepting a new launch", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-recovery-"));
    try {
      const seeded = await seed(root);
      const fake = fakeProcess({ proveOwnership: true });
      const manager = new SessionManager({
        process: fake.process,
        leaseRoot: root,
        leaseStore: new CustodyLeaseStore({
          root,
          controllerId: "e".repeat(64),
        }),
        async reservePort() {
          return { port: 50_001, async release() {} };
        },
        async prepareLaunch() {
          throw new Error("stop after recovery");
        },
        async startProxy() {
          throw new Error("not reached");
        },
        createWebDriver() {
          throw new Error("not reached");
        },
        nonce: (() => {
          let count = 0;
          return () => (++count % 2 === 1 ? "a" : "b").repeat(64);
        })(),
      });
      await expect(
        manager.launch({
          mode: "background",
          platform: "linux",
          window: "main",
        }),
      ).rejects.toMatchObject({ code: "APP_START_FAILED" });
      expect(fake.terminated).toBe(1);
      expect(fake.providerOwnerCalls).toEqual([
        { pid: 71, port: 50_001, family: "ipv6" },
      ]);
      await expect(
        new CustodyLeaseStore({ root, controllerId: "e".repeat(64) }).read(
          seeded.launchId,
        ),
      ).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("closes a Windows Job lease whose controller and owned process are both gone", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-recovery-"));
    try {
      const old = new CustodyLeaseStore({
        root,
        controllerId: "d".repeat(64),
        controllerPid: 999_999,
        now: () => 1_000,
      });
      const seeded = await old.create({
        controllerId: "d".repeat(64),
        controllerPid: 999_999,
        identity,
        mechanism: "windows_job_object",
        providerPort: 50_001,
        providerFamily: "ipv4",
      });
      let attached = 0;
      const fake = fakeProcess({ proveOwnership: true });
      const process: ProcessAdapter = {
        ...fake.process,
        custody: {
          ...fake.process.custody!,
          async attach() {
            attached += 1;
            throw new Error("Cannot attach custody to an unowned process.");
          },
        },
        // The kill-on-close Job ended the tree with its controller.
        async inspect() {
          return undefined;
        },
      };
      const manager = new SessionManager({
        process,
        leaseRoot: root,
        leaseStore: new CustodyLeaseStore({
          root,
          controllerId: "e".repeat(64),
        }),
        async reservePort() {
          return { port: 50_001, async release() {} };
        },
        async prepareLaunch() {
          throw new Error("stop after recovery");
        },
        async startProxy() {
          throw new Error("not reached");
        },
        createWebDriver() {
          throw new Error("not reached");
        },
        nonce: (() => {
          let count = 0;
          return () => (++count % 2 === 1 ? "a" : "b").repeat(64);
        })(),
      });
      await expect(
        manager.launch({
          mode: "background",
          platform: "windows",
          window: "main",
        }),
      ).rejects.toMatchObject({ code: "APP_START_FAILED" });
      expect(attached).toBe(0);
      expect(fake.terminated).toBe(0);
      await expect(
        new CustodyLeaseStore({ root, controllerId: "e".repeat(64) }).read(
          seeded.launchId,
        ),
      ).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps a provider listener orphan retryable without a persisted provider pid", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-recovery-"));
    try {
      const seeded = await seed(root, 0);
      const fake = fakeProcess({
        proveOwnership: true,
        providerOwnerResult: 79,
      });
      const manager = new SessionManager({
        process: fake.process,
        leaseStore: new CustodyLeaseStore({
          root,
          controllerId: "e".repeat(64),
        }),
        async prepareLaunch() {
          throw new Error("stop after recovery");
        },
        async reservePort() {
          return { port: 50_001, async release() {} };
        },
        async startProxy() {
          throw new Error("not reached");
        },
        createWebDriver() {
          throw new Error("not reached");
        },
        nonce: (() => {
          let count = 0;
          return () => (++count % 2 === 1 ? "a" : "b").repeat(64);
        })(),
      });
      await expect(
        manager.launch({
          mode: "background",
          platform: "linux",
          window: "main",
        }),
      ).rejects.toMatchObject({ code: "APP_START_FAILED" });
      expect(fake.terminated).toBe(1);
      expect(fake.providerOwnerCalls).toEqual([
        { pid: 71, port: 50_001, family: "ipv6" },
      ]);
      await expect(
        new CustodyLeaseStore({ root, controllerId: "e".repeat(64) }).read(
          seeded.launchId,
        ),
      ).resolves.toMatchObject({ state: "retryable" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("retains an orphan when the launch tuple has been replaced", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-recovery-"));
    try {
      const seeded = await seed(root);
      const fake = fakeProcess({ proveOwnership: false });
      const manager = new SessionManager({
        process: fake.process,
        leaseStore: new CustodyLeaseStore({
          root,
          controllerId: "e".repeat(64),
        }),
        async prepareLaunch() {
          throw new Error("stop after recovery");
        },
        async reservePort() {
          return { port: 50_001, async release() {} };
        },
        async startProxy() {
          throw new Error("not reached");
        },
        createWebDriver() {
          throw new Error("not reached");
        },
        nonce: (() => {
          let count = 0;
          return () => (++count % 2 === 1 ? "a" : "b").repeat(64);
        })(),
      });
      await expect(
        manager.launch({
          mode: "background",
          platform: "linux",
          window: "main",
        }),
      ).rejects.toMatchObject({ code: "APP_START_FAILED" });
      expect(fake.terminated).toBe(0);
      await expect(
        new CustodyLeaseStore({ root, controllerId: "e".repeat(64) }).read(
          seeded.launchId,
        ),
      ).resolves.toMatchObject({ state: "retryable" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks launch before spawn when the custody scan is malformed", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-recovery-"));
    try {
      await writeFile(join(root, `${"f".repeat(32)}.json`), "{ malformed\n");
      const fake = fakeProcess({ proveOwnership: true });
      const manager = new SessionManager({
        process: fake.process,
        leaseStore: new CustodyLeaseStore({
          root,
          controllerId: "e".repeat(64),
        }),
        async prepareLaunch() {
          throw new Error("not reached");
        },
        async reservePort() {
          throw new Error("not reached");
        },
        async startProxy() {
          throw new Error("not reached");
        },
        createWebDriver() {
          throw new Error("not reached");
        },
        nonce: (() => {
          let count = 0;
          return () => (++count % 2 === 1 ? "a" : "b").repeat(64);
        })(),
      });
      await expect(
        manager.launch({
          mode: "background",
          platform: "linux",
          window: "main",
        }),
      ).rejects.toMatchObject({ code: "APP_START_FAILED" });
      expect(fake.spawnAttempts).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
