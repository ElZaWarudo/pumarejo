import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  launchOwnedProvider,
  type OwnedLaunchDependencies,
} from "./owned-launch.js";
import { commandHash, type ProcessIdentity } from "./process-lease.js";

const fixture = resolve("tests/fixtures/tauri-app");

describe("owned fixture lifecycle", () => {
  it("passes a private overlay without shell interpolation and cleans owned resources", async () => {
    let identity: ProcessIdentity | undefined;
    const events: string[] = [];
    const spawn = vi.fn(async (request) => {
      events.push("spawn");
      identity = {
        pid: 71,
        startedAt: 1000,
        commandHash: commandHash(request.command, request.args),
      };
      return {
        ...identity,
        waitUntilReady: async (port: number) => {
          expect(port).toBe(49152);
          events.push("ready");
        },
      };
    });
    const dependencies: OwnedLaunchDependencies = {
      spawn,
      inspect: async () => identity,
      terminate: async () => {
        events.push("terminate");
        identity = undefined;
      },
      providerOwner: async (pid, port) =>
        pid === 71 && port === 49152 ? 79 : undefined,
      startProxy: async ({ nonce, providerNonce }) => {
        expect(nonce).toHaveLength(64);
        expect(providerNonce).toHaveLength(64);
        expect(providerNonce).not.toBe(nonce);
        events.push("proxy");
        return {
          port: 49153,
          close: async () => {
            events.push("close-proxy");
          },
        };
      },
      portReleased: async () => true,
    };

    const launch = await launchOwnedProvider(
      { mode: "background", providerPort: 49152, command: "pnpm" },
      dependencies,
    );
    const request = spawn.mock.calls[0]?.[0];
    expect(request?.shell).toBe(false);
    expect(request?.env.TAURI_WEBDRIVER_PORT).toBe("49152");
    expect(request?.env.TAURI_WEBDRIVER_NONCE).toHaveLength(64);
    expect(request?.env.CARGO_TARGET_DIR).toBe(
      resolve(".proof-target", "provider-live"),
    );
    expect(request?.args).toContain(launch.overlayPath);
    expect(launch.lease.providerPid).toBe(79);
    await expect(readFile(launch.overlayPath, "utf8")).resolves.toContain(
      '"visible": false',
    );

    await launch.cleanup(async () => {
      events.push("delete-session");
    });
    await expect(access(launch.overlayPath)).rejects.toThrow();
    expect(events).toEqual([
      "spawn",
      "ready",
      "proxy",
      "delete-session",
      "close-proxy",
      "terminate",
    ]);
  });

  it("reports lease drift and never kills the replacement process", async () => {
    const terminate = vi.fn(async () => undefined);
    const dependencies: OwnedLaunchDependencies = {
      spawn: async (request) => ({
        pid: 72,
        startedAt: 1000,
        commandHash: commandHash(request.command, request.args),
        waitUntilReady: async () => undefined,
      }),
      inspect: async () => ({
        pid: 72,
        startedAt: 2000,
        commandHash: "replacement",
      }),
      terminate,
      providerOwner: async () => 72,
      startProxy: async () => ({ port: 49155, close: async () => undefined }),
      portReleased: async () => true,
    };
    const launch = await launchOwnedProvider(
      { mode: "visible", providerPort: 49154 },
      dependencies,
    );
    await expect(launch.cleanup()).rejects.toThrow(
      "process lease no longer matches",
    );
    expect(terminate).not.toHaveBeenCalled();
  });

  it("rejects a provider port won by another process", async () => {
    const terminate = vi.fn(async () => undefined);
    const identity: ProcessIdentity = {
      pid: 73,
      startedAt: 1000,
      commandHash: "",
    };
    const dependencies: OwnedLaunchDependencies = {
      spawn: async (request) => {
        identity.commandHash = commandHash(request.command, request.args);
        return { ...identity, waitUntilReady: async () => undefined };
      },
      inspect: async () => identity,
      terminate,
      providerOwner: async () => undefined,
      startProxy: async () => {
        throw new Error("proxy must not start for an unowned provider");
      },
      portReleased: async () => true,
    };
    await expect(
      launchOwnedProvider(
        { mode: "visible", providerPort: 49156 },
        dependencies,
      ),
    ).rejects.toThrow("provider port is not owned by the spawned fixture");
    expect(terminate).toHaveBeenCalledWith(73);
  });
});
