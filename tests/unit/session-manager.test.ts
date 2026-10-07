import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  launchCommandHash,
  type ProcessAdapter,
  type ProcessCustodyAttachment,
  type ProcessCustodyInspection,
  type SpawnRequest,
  type ProcessIdentity,
} from "../../src/platform/types.js";
import {
  SessionManager,
  providerReadinessTimeout,
  type SessionManagerDependencies,
} from "../../src/session/manager.js";
import { CustodyLeaseStore } from "../../src/session/custody-lease.js";
import { PumarejoError } from "../../src/shared/errors.js";
import type { WebDriverClient } from "../../src/webdriver/client.js";

const SESSION_NONCE = "a".repeat(64);
const PROVIDER_NONCE = "b".repeat(64);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type FailurePhase =
  | "reserve"
  | "prepare"
  | "spawn"
  | "identity"
  | "provider-ready"
  | "owner"
  | "owner-race"
  | "identity-race"
  | "proxy"
  | "webdriver-ready"
  | "session"
  | "window";

function harness(
  options: {
    failure?: FailurePhase;
    providerReady?: Promise<void>;
    deleteSession?: () => Promise<void>;
    closeProxy?: () => Promise<void>;
    terminate?: () => Promise<void>;
    inspect?: () => Promise<ProcessIdentity | undefined>;
    providerOwnerError?: PumarejoError;
    preparedWindow?: string;
  } = {},
) {
  const events: string[] = [];
  let identity: ProcessIdentity | undefined;
  let nonceIndex = 0;
  let ownerChecks = 0;
  let identityChecks = 0;
  let reservationReleased = false;
  let preparedCleaned = false;
  let selectedWindow: string | undefined;
  const readyDeadlines: (number | undefined)[] = [];
  const webdriver = {
    async waitUntilReady(ready?: { readonly deadlineMs?: number }) {
      readyDeadlines.push(ready?.deadlineMs);
      events.push("webdriver-ready");
      if (options.failure === "webdriver-ready") {
        throw new PumarejoError("WEBDRIVER_NOT_READY");
      }
    },
    async createSession() {
      events.push("create-session");
      if (options.failure === "session") {
        throw new PumarejoError("SESSION_CREATE_FAILED");
      }
    },
    async selectWindow(window: string) {
      events.push("select-window");
      selectedWindow = window;
      if (options.failure === "window") {
        throw new PumarejoError("WINDOW_NOT_FOUND");
      }
    },
    async deleteSession() {
      events.push("delete-session");
      await options.deleteSession?.();
    },
  } as unknown as WebDriverClient;

  const dependencies: SessionManagerDependencies = {
    nonce: () => {
      nonceIndex += 1;
      return nonceIndex % 2 === 1 ? SESSION_NONCE : PROVIDER_NONCE;
    },
    async reservePort(preferredPort) {
      events.push(`reserve:${preferredPort ?? "random"}`);
      if (options.failure === "reserve") {
        throw new PumarejoError("PORT_UNAVAILABLE");
      }
      return {
        port: preferredPort ?? 50_001,
        async release() {
          if (reservationReleased) return;
          reservationReleased = true;
          events.push("release-reservation");
        },
      };
    },
    async prepareLaunch() {
      events.push("prepare");
      if (options.failure === "prepare") throw new Error("prepare failed");
      return {
        request: {
          command: "pnpm",
          args: ["tauri", "dev", "--config", "overlay.json"],
          cwd: "C:\\fixture",
          env: {},
        },
        ...(options.preparedWindow === undefined
          ? {}
          : { window: options.preparedWindow }),
        async cleanup() {
          if (preparedCleaned) return;
          preparedCleaned = true;
          events.push("cleanup-prepared");
        },
      };
    },
    process: {
      async spawn(request) {
        events.push("spawn");
        if (options.failure === "spawn") throw new Error("spawn failed");
        identity = {
          pid: 71,
          startedAt: 1_000,
          commandHash: launchCommandHash(request.command, request.args),
          sessionNonce: String(request.env.PUMAREJO_SESSION_NONCE),
        };
        const application = {
          ...identity,
          async waitUntilProviderReady(_port: number, signal?: AbortSignal) {
            events.push("provider-ready");
            if (options.failure === "provider-ready") {
              throw new PumarejoError("WEBDRIVER_NOT_READY");
            }
            if (options.providerReady !== undefined) {
              await Promise.race([
                options.providerReady,
                new Promise<never>((_resolve, reject) => {
                  signal?.addEventListener(
                    "abort",
                    () => reject(signal.reason),
                    { once: true },
                  );
                }),
              ]);
            }
          },
        };
        return options.failure === "identity"
          ? { ...application, commandHash: "unexpected" }
          : application;
      },
      inspect:
        options.inspect ??
        (async () => {
          events.push("inspect");
          identityChecks += 1;
          if (options.failure === "identity-race" && identityChecks >= 2) {
            return {
              pid: 71,
              startedAt: 2_000,
              commandHash: "replacement",
              sessionNonce: "c".repeat(64),
            };
          }
          return identity;
        }),
      async terminateTree() {
        events.push("terminate");
        await options.terminate?.();
        identity = undefined;
      },
      async providerOwner() {
        events.push("owner");
        if (options.providerOwnerError !== undefined) {
          throw options.providerOwnerError;
        }
        ownerChecks += 1;
        if (options.failure === "owner") return undefined;
        return options.failure === "owner-race" && ownerChecks === 2 ? 80 : 79;
      },
    },
    async startProxy() {
      events.push("proxy");
      if (options.failure === "proxy") throw new Error("proxy failed");
      return {
        port: 50_002,
        async close() {
          events.push("close-proxy");
          await options.closeProxy?.();
        },
      };
    },
    createWebDriver: ({ port, nonce }) => {
      expect(port).toBe(50_002);
      expect(nonce).toBe(SESSION_NONCE);
      return webdriver;
    },
  };

  return {
    manager: new SessionManager(dependencies),
    events,
    get identity() {
      return identity;
    },
    get selectedWindow() {
      return selectedWindow;
    },
    readyDeadlines,
  };
}

const launchOptions = {
  mode: "background" as const,
  platform: "windows" as const,
  window: "main",
};

async function durableLeaseHarness(
  outcome: "success" | "retryable" | "postcondition",
) {
  const root = await mkdtemp(join(tmpdir(), "pumarejo-session-lease-"));
  const controllerId = "c".repeat(64);
  const store = new CustodyLeaseStore({
    root,
    controllerId,
    controllerPid: process.pid,
    now: () => 1_000,
  });
  const transition = vi.spyOn(store, "transition");
  const mechanism = "windows_validated_tree" as const;
  let identity: ProcessIdentity | undefined;
  let nonceIndex = 0;
  let providerOwnerChecks = 0;
  const providerOwnerCalls: Array<{
    readonly port: number;
    readonly family: string | undefined;
  }> = [];
  let custodyInspections = 0;
  const webdriver = {
    async waitUntilReady() {},
    async createSession() {},
    async selectWindow() {},
    async deleteSession() {},
  } as unknown as WebDriverClient;
  const custody = {
    async capability() {
      return {
        mechanism,
        state: "supported" as const,
        code: "windows_validated_tree",
        killOnClose: false,
      };
    },
    async attach(_owned: ProcessIdentity): Promise<ProcessCustodyAttachment> {
      return { mechanism };
    },
    async inspect(
      owned: ProcessIdentity,
      _attachment: ProcessCustodyAttachment,
    ): Promise<ProcessCustodyInspection | undefined> {
      custodyInspections += 1;
      if (outcome === "success" && custodyInspections > 1) return undefined;
      return {
        identity: owned,
        mechanism,
        descendantsComplete: true,
      };
    },
    async terminate() {
      return {
        state:
          outcome === "retryable"
            ? ("retryable" as const)
            : ("terminated" as const),
        escalated: false,
      };
    },
    async release(_attachment: ProcessCustodyAttachment) {},
  };
  const processAdapter: ProcessAdapter = {
    async spawn(request) {
      identity = {
        pid: 71,
        startedAt: 1_000,
        commandHash: launchCommandHash(request.command, request.args),
        sessionNonce: String(request.env.PUMAREJO_SESSION_NONCE),
      };
      return {
        ...identity,
        async waitUntilProviderReady() {},
      };
    },
    async inspect() {
      return identity;
    },
    async terminateTree() {
      identity = undefined;
    },
    async providerOwner(_pid, port, family) {
      providerOwnerChecks += 1;
      providerOwnerCalls.push({ port, family });
      return providerOwnerChecks <= 2 ? 79 : undefined;
    },
    custody,
  };
  const dependencies: SessionManagerDependencies = {
    process: processAdapter,
    leaseStore: store,
    nonce: () => {
      nonceIndex += 1;
      return nonceIndex % 2 === 1 ? SESSION_NONCE : PROVIDER_NONCE;
    },
    async reservePort() {
      return { port: 50_001, async release() {} };
    },
    async prepareLaunch() {
      return {
        request: {
          command: "pnpm",
          args: ["tauri", "dev", "--config", "overlay.json"],
          cwd: "C:\\fixture",
          env: {},
        },
        async cleanup() {},
      };
    },
    async startProxy() {
      return { port: 50_002, async close() {} };
    },
    createWebDriver: () => webdriver,
  };
  return {
    root,
    manager: new SessionManager(dependencies),
    store,
    transition,
    providerOwnerCalls,
  };
}

describe("provider readiness timeout", () => {
  const request = (configured?: string): SpawnRequest => ({
    command: "tinto",
    args: [],
    cwd: "C:\\fixture",
    env:
      configured === undefined
        ? {}
        : { PUMAREJO_PROVIDER_READY_TIMEOUT_MS: configured },
    shell: false,
  });

  it.each([
    ["uses the documented default", undefined, 300_000],
    ["accepts the bounded maximum", "600000", 600_000],
    ["clamps values above the maximum", "900000", 600_000],
    ["uses the fail-closed fallback for invalid values", "invalid", 5_000],
    ["uses the fail-closed fallback below the minimum", "999", 5_000],
  ])("%s", (_label, configured, expected) => {
    expect(providerReadinessTimeout(request(configured))).toBe(expected);
  });
});

describe("SessionManager", () => {
  it("preserves a process-inspection cause and reports successful cleanup", async () => {
    const cause = new Error("host denied CIM");
    const runtime = harness({
      providerOwnerError: new PumarejoError("PROCESS_INSPECTION_DENIED", {
        cause,
      }),
    });

    await expect(runtime.manager.launch(launchOptions)).rejects.toMatchObject({
      code: "PROCESS_INSPECTION_DENIED",
      phase: "process-inspection",
      cause,
      diagnostic: {
        applicationStarted: true,
        cleanup: "terminated",
        webdriverSessionCreated: false,
      },
    });
    expect(runtime.events).toContain("terminate");
    expect(runtime.manager.snapshot).toEqual({ state: "idle" });
  });

  it("reports a launched process that survives failed cleanup", async () => {
    const runtime = harness({
      providerOwnerError: new PumarejoError("PROCESS_INSPECTION_DENIED"),
      terminate: async () => {
        throw new Error("taskkill denied");
      },
    });

    await expect(runtime.manager.launch(launchOptions)).rejects.toMatchObject({
      code: "PROCESS_INSPECTION_DENIED",
      diagnostic: {
        applicationStarted: true,
        cleanup: "survived",
        webdriverSessionCreated: false,
      },
    });
    expect(runtime.manager.snapshot).toMatchObject({
      state: "failed",
      ownedPid: 71,
      cleanupPending: ["application-process"],
    });
  });

  it("transitions idle -> starting -> ready -> cleaning -> idle in owned cleanup order", async () => {
    const runtime = harness();
    const phases: string[] = [];
    const ready = await runtime.manager.launch({
      ...launchOptions,
      onPhase: (phase) => phases.push(phase),
    });

    expect(ready).toMatchObject({
      state: "ready",
      mode: "background",
      platform: "windows",
      window: "main",
      webdriverPort: 50_002,
      ownedPid: 71,
    });
    expect(runtime.manager.readySession).toBe(ready);
    expect(runtime.manager.snapshot).not.toHaveProperty("webdriver");
    expect(runtime.manager.snapshot).not.toHaveProperty("nonce");
    expect(runtime.manager.snapshot).toMatchObject({ ownedPid: 71 });
    expect(phases).toEqual([
      "preparing_runtime",
      "starting_process",
      "waiting_provider",
      "starting_proxy",
      "creating_session",
      "selecting_window",
    ]);
    await expect(runtime.manager.launch(launchOptions)).rejects.toMatchObject({
      code: "SESSION_ALREADY_ACTIVE",
    });

    await expect(runtime.manager.close()).resolves.toEqual({ state: "idle" });
    expect(runtime.identity).toBeUndefined();
    expect(runtime.events.slice(-5)).toEqual([
      "delete-session",
      "close-proxy",
      "inspect",
      "terminate",
      "cleanup-prepared",
    ]);
    await expect(runtime.manager.close()).resolves.toEqual({ state: "idle" });
  });

  it("uses a platform-prepared effective window label", async () => {
    const runtime = harness({ preparedWindow: "platform-main" });
    const ready = await runtime.manager.launch(launchOptions);
    expect(runtime.selectedWindow).toBe("platform-main");
    expect(ready.window).toBe("platform-main");
    await runtime.manager.close();
  });

  it("rejects another launch while starting and lets close cancel and clean the partial launch", async () => {
    const providerReady = deferred<void>();
    const runtime = harness({ providerReady: providerReady.promise });
    const launching = runtime.manager.launch(launchOptions);
    expect(runtime.manager.snapshot.state).toBe("starting");
    expect(runtime.manager.snapshot).not.toHaveProperty("signal");
    await expect(runtime.manager.launch(launchOptions)).rejects.toMatchObject({
      code: "SESSION_ALREADY_ACTIVE",
    });

    const closing = runtime.manager.close();
    await expect(launching).rejects.toMatchObject({ code: "APP_START_FAILED" });
    await expect(closing).resolves.toEqual({ state: "idle" });
    expect(runtime.events.filter((event) => event === "spawn")).toHaveLength(1);
    expect(runtime.events).toContain("terminate");
  });

  it.each([
    ["reserve", "PORT_UNAVAILABLE"],
    ["prepare", "APP_START_FAILED"],
    ["spawn", "APP_START_FAILED"],
    ["identity", "APP_START_FAILED"],
    ["provider-ready", "WEBDRIVER_NOT_READY"],
    ["owner", "SESSION_CREATE_FAILED"],
    ["owner-race", "SESSION_CREATE_FAILED"],
    ["identity-race", "SESSION_CREATE_FAILED"],
    ["proxy", "APP_START_FAILED"],
    ["webdriver-ready", "WEBDRIVER_NOT_READY"],
    ["session", "SESSION_CREATE_FAILED"],
    ["window", "WINDOW_NOT_FOUND"],
  ] as const)(
    "cleans only acquired resources when the %s phase fails",
    async (failure, code) => {
      const runtime = harness({ failure });
      await expect(runtime.manager.launch(launchOptions)).rejects.toMatchObject(
        {
          code,
        },
      );
      expect(runtime.manager.snapshot).toEqual({ state: "idle" });
      expect(runtime.events.includes("terminate")).toBe(
        !["reserve", "prepare", "spawn", "identity-race"].includes(failure),
      );
      expect(runtime.events.includes("close-proxy")).toBe(
        [
          "owner-race",
          "identity-race",
          "webdriver-ready",
          "session",
          "window",
        ].includes(failure),
      );
      expect(runtime.events.includes("delete-session")).toBe(
        failure === "window",
      );
    },
  );

  it("names the failing launch phase, elapsed time, and budget", async () => {
    const runtime = harness({ failure: "webdriver-ready" });
    const error = await runtime.manager.launch(launchOptions).catch((e) => e);
    expect(error).toMatchObject({ code: "WEBDRIVER_NOT_READY" });
    expect(error.toJSON().diagnostic.check).toMatch(
      /^Failed during creating_session after \d+s; launch budget \d+s \(PUMAREJO_PROVIDER_READY_TIMEOUT_MS\)$/u,
    );
    expect(runtime.readyDeadlines[0]).toBeGreaterThanOrEqual(15_000);
  });

  it("keeps failed cleanup retryable and rejects launch until close succeeds", async () => {
    let deleteAttempts = 0;
    const runtime = harness({
      deleteSession: async () => {
        deleteAttempts += 1;
        if (deleteAttempts === 1) throw new Error("temporary delete failure");
      },
    });
    await runtime.manager.launch(launchOptions);

    await expect(runtime.manager.close()).rejects.toMatchObject({
      code: "CLOSE_FAILED",
    });
    expect(runtime.manager.snapshot).toMatchObject({
      state: "failed",
      cleanupPending: ["webdriver-session"],
    });
    expect(runtime.manager.snapshot).not.toHaveProperty("ownedPid");
    await expect(runtime.manager.launch(launchOptions)).rejects.toMatchObject({
      code: "SESSION_ALREADY_ACTIVE",
    });
    await expect(runtime.manager.close()).resolves.toEqual({ state: "idle" });
    expect(runtime.manager.snapshot).toEqual({ state: "idle" });
    expect(deleteAttempts).toBe(2);
    expect(
      runtime.events.filter((event) => event === "terminate"),
    ).toHaveLength(1);
  });

  it("retains only failed resource labels and retries only those resources", async () => {
    let deleteAttempts = 0;
    let proxyAttempts = 0;
    let terminateAttempts = 0;
    const runtime = harness({
      deleteSession: async () => {
        deleteAttempts += 1;
        if (deleteAttempts === 1) throw new Error("temporary delete failure");
      },
      closeProxy: async () => {
        proxyAttempts += 1;
        if (proxyAttempts === 1) throw new Error("temporary proxy failure");
      },
      terminate: async () => {
        terminateAttempts += 1;
        if (terminateAttempts === 1) {
          throw new Error("temporary terminate failure");
        }
      },
    });
    await runtime.manager.launch(launchOptions);

    await expect(runtime.manager.close()).rejects.toMatchObject({
      code: "CLOSE_FAILED",
    });
    expect(runtime.manager.snapshot).toMatchObject({
      state: "failed",
      cleanupPending: [
        "application-process",
        "authenticated-proxy",
        "webdriver-session",
      ],
    });
    expect(
      runtime.events.filter((event) => event === "cleanup-prepared"),
    ).toHaveLength(1);
    expect(
      runtime.events.filter((event) => event === "release-reservation"),
    ).toHaveLength(1);

    await expect(runtime.manager.close()).resolves.toEqual({ state: "idle" });
    expect(deleteAttempts).toBe(2);
    expect(proxyAttempts).toBe(2);
    expect(terminateAttempts).toBe(2);
    expect(
      runtime.events.filter((event) => event === "cleanup-prepared"),
    ).toHaveLength(1);
    expect(
      runtime.events.filter((event) => event === "release-reservation"),
    ).toHaveLength(1);
  });

  it("exposes pending cleanup while close is running", async () => {
    const deleting = deferred<void>();
    const runtime = harness({
      deleteSession: async () => await deleting.promise,
    });
    await runtime.manager.launch(launchOptions);

    const closing = runtime.manager.close();
    expect(runtime.manager.snapshot).toMatchObject({
      state: "cleaning",
      cleanupPending: [
        "runtime-configuration",
        "application-process",
        "authenticated-proxy",
        "webdriver-session",
      ],
    });
    deleting.resolve();
    await expect(closing).resolves.toEqual({ state: "idle" });
  });

  it("rejects launch while cleanup is running", async () => {
    const deleting = deferred<void>();
    const runtime = harness({
      deleteSession: async () => await deleting.promise,
    });
    await runtime.manager.launch(launchOptions);
    const closing = runtime.manager.close();
    expect(runtime.manager.snapshot.state).toBe("cleaning");
    await expect(runtime.manager.launch(launchOptions)).rejects.toMatchObject({
      code: "SESSION_ALREADY_ACTIVE",
    });
    deleting.resolve();
    await closing;
  });

  it("does not terminate a PID-reused replacement when the lease changes", async () => {
    const terminate = vi.fn(async () => undefined);
    let inspections = 0;
    const ownedIdentity = {
      pid: 71,
      startedAt: 1_000,
      commandHash: launchCommandHash("pnpm", [
        "tauri",
        "dev",
        "--config",
        "overlay.json",
      ]),
      sessionNonce: SESSION_NONCE,
    };
    const runtime = harness({
      terminate,
      inspect: async () => {
        inspections += 1;
        return inspections <= 2
          ? ownedIdentity
          : {
              pid: 71,
              startedAt: 2_000,
              commandHash: "replacement",
              sessionNonce: "c".repeat(64),
            };
      },
    });
    await runtime.manager.launch(launchOptions);

    await expect(runtime.manager.close()).resolves.toEqual({ state: "idle" });
    expect(terminate).not.toHaveBeenCalled();
  });

  it.each(["exited", "reused"])(
    "stops provider readiness when the launch process has %s without killing a replacement",
    async (state) => {
      const terminate = vi.fn(async () => undefined);
      const runtime = harness({
        terminate,
        inspect: async () =>
          state === "exited"
            ? undefined
            : {
                pid: 71,
                startedAt: 2_000,
                commandHash: "replacement",
                sessionNonce: "c".repeat(64),
              },
      });
      await expect(
        runtime.manager.launch({ ...launchOptions, loopbackFamily: "ipv4" }),
      ).rejects.toMatchObject({ code: "SESSION_CREATE_FAILED" });
      expect(terminate).not.toHaveBeenCalled();
      expect(runtime.events).not.toContain("proxy");
      expect(runtime.manager.snapshot.state).toBe("idle");
    },
  );

  it("never spawns when an explicit occupied port is rejected", async () => {
    const runtime = harness({ failure: "reserve" });
    await expect(
      runtime.manager.launch({ ...launchOptions, webdriverPort: 49_200 }),
    ).rejects.toMatchObject({ code: "PORT_UNAVAILABLE" });
    expect(runtime.events).toEqual(["reserve:49200"]);
  });

  it("converges the same durable lease from active through closing to closed", async () => {
    const runtime = await durableLeaseHarness("success");
    try {
      await runtime.manager.launch(launchOptions);
      await expect(runtime.manager.close()).resolves.toEqual({ state: "idle" });

      expect(
        runtime.transition.mock.calls.map(([record, state]) => ({
          from: record.state,
          to: state,
        })),
      ).toEqual([
        { from: "active", to: "closing" },
        { from: "closing", to: "closed" },
      ]);
      await expect(runtime.store.scan()).resolves.toMatchObject({ leases: [] });
      expect(runtime.providerOwnerCalls.length).toBeGreaterThan(0);
      expect(
        runtime.providerOwnerCalls.every(({ family }) => family === "ipv4"),
      ).toBe(true);
    } finally {
      await rm(runtime.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["a retryable termination", "retryable"],
    ["a pending postcondition", "postcondition"],
  ] as const)(
    "retains the current durable lease after %s",
    async (_label, outcome) => {
      const runtime = await durableLeaseHarness(outcome);
      try {
        await runtime.manager.launch(launchOptions);
        await expect(runtime.manager.close()).rejects.toMatchObject({
          code: "CLOSE_FAILED",
        });

        expect(
          runtime.transition.mock.calls.map(([record, state]) => ({
            from: record.state,
            to: state,
          })),
        ).toEqual([
          { from: "active", to: "closing" },
          { from: "closing", to: "retryable" },
        ]);
        await expect(runtime.store.scan()).resolves.toMatchObject({
          leases: [expect.objectContaining({ state: "retryable" })],
        });
      } finally {
        await rm(runtime.root, { recursive: true, force: true });
      }
    },
  );
});
