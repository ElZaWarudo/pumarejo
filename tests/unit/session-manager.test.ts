import { describe, expect, it, vi } from "vitest";

import {
  launchCommandHash,
  type ProcessIdentity,
} from "../../src/platform/types.js";
import {
  SessionManager,
  type SessionManagerDependencies,
} from "../../src/session/manager.js";
import { TauriAgentError } from "../../src/shared/errors.js";
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
  const webdriver = {
    async waitUntilReady() {
      events.push("webdriver-ready");
      if (options.failure === "webdriver-ready") {
        throw new TauriAgentError("WEBDRIVER_NOT_READY");
      }
    },
    async createSession() {
      events.push("create-session");
      if (options.failure === "session") {
        throw new TauriAgentError("SESSION_CREATE_FAILED");
      }
    },
    async selectWindow(window: string) {
      events.push("select-window");
      selectedWindow = window;
      if (options.failure === "window") {
        throw new TauriAgentError("WINDOW_NOT_FOUND");
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
        throw new TauriAgentError("PORT_UNAVAILABLE");
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
          sessionNonce: String(request.env.TAURI_AGENT_SESSION_NONCE),
        };
        const application = {
          ...identity,
          async waitUntilProviderReady(_port: number, signal?: AbortSignal) {
            events.push("provider-ready");
            if (options.failure === "provider-ready") {
              throw new TauriAgentError("WEBDRIVER_NOT_READY");
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
  };
}

const launchOptions = {
  mode: "background" as const,
  platform: "windows" as const,
  window: "main",
};

describe("SessionManager", () => {
  it("transitions idle -> starting -> ready -> cleaning -> idle in owned cleanup order", async () => {
    const runtime = harness();
    const ready = await runtime.manager.launch(launchOptions);

    expect(ready).toMatchObject({
      state: "ready",
      mode: "background",
      platform: "windows",
      window: "main",
      webdriverPort: 50_002,
    });
    expect(runtime.manager.readySession).toBe(ready);
    expect(runtime.manager.snapshot).not.toHaveProperty("webdriver");
    expect(runtime.manager.snapshot).not.toHaveProperty("nonce");
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
    expect(runtime.manager.snapshot.state).toBe("failed");
    await expect(runtime.manager.launch(launchOptions)).rejects.toMatchObject({
      code: "SESSION_ALREADY_ACTIVE",
    });
    await expect(runtime.manager.close()).resolves.toEqual({ state: "idle" });
    expect(deleteAttempts).toBe(2);
    expect(
      runtime.events.filter((event) => event === "terminate"),
    ).toHaveLength(1);
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

  it("never spawns when an explicit occupied port is rejected", async () => {
    const runtime = harness({ failure: "reserve" });
    await expect(
      runtime.manager.launch({ ...launchOptions, webdriverPort: 49_200 }),
    ).rejects.toMatchObject({ code: "PORT_UNAVAILABLE" });
    expect(runtime.events).toEqual(["reserve:49200"]);
  });
});
