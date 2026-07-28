import { createServer } from "node:net";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLinuxProcessAdapter } from "../../src/platform/linux/process.js";
import type {
  ProcessAdapter,
  SpawnRequest,
  SpawnedApplication,
} from "../../src/platform/types.js";
import { createWindowsProcessAdapter } from "../../src/platform/windows/process.js";
import { SessionManager } from "../../src/session/manager.js";

function nativeAdapter(): ProcessAdapter {
  if (process.platform === "win32") return createWindowsProcessAdapter();
  if (process.platform === "linux") return createLinuxProcessAdapter();
  throw new Error(`unsupported integration host: ${process.platform}`);
}

async function canBind(port: number): Promise<boolean> {
  const server = createServer();
  try {
    await new Promise<void>((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolvePromise);
    });
    return true;
  } catch {
    return false;
  } finally {
    if (server.listening) {
      await new Promise<void>((resolvePromise) =>
        server.close(() => resolvePromise()),
      );
    }
  }
}

describe("native session cleanup", () => {
  it.runIf(process.platform === "win32" || process.platform === "linux")(
    "owns a real child, authenticated endpoints, session, ports, and cleanup",
    async () => {
      const native = nativeAdapter();
      let spawned: SpawnedApplication | undefined;
      let providerPort = 0;
      let preparedCleaned = false;
      const processAdapter: ProcessAdapter = {
        ...native,
        async spawn(request: SpawnRequest) {
          spawned = await native.spawn(request);
          return spawned;
        },
      };
      const manager = new SessionManager({
        process: processAdapter,
        async prepareLaunch(options) {
          providerPort = options.providerPort;
          return {
            request: {
              command: process.execPath,
              args: [resolve("tests/fixtures/owned-provider.mjs")],
              cwd: resolve("."),
              env: {},
            },
            async cleanup() {
              preparedCleaned = true;
            },
          };
        },
      });

      const ready = await manager.launch({
        mode: "visible",
        platform: process.platform === "win32" ? "windows" : "linux",
        window: "main",
      });
      expect(spawned).toBeDefined();
      expect(await processAdapter.inspect(spawned!.pid)).toMatchObject({
        pid: spawned!.pid,
        startedAt: spawned!.startedAt,
        commandHash: spawned!.commandHash,
        sessionNonce: spawned!.sessionNonce,
      });
      expect(await canBind(providerPort)).toBe(false);
      expect(await canBind(ready.webdriverPort)).toBe(false);

      const direct = await fetch(`http://127.0.0.1:${providerPort}/status`);
      expect(direct.status).toBe(401);
      for (const path of [
        "/status",
        "/session",
        "/session/owned-session/actions",
        "/session/owned-session",
      ]) {
        const response = await fetch(
          `http://127.0.0.1:${ready.webdriverPort}${path}`,
          {
            method: path === "/status" ? "GET" : "POST",
            headers: { "content-type": "application/json" },
            body: path === "/status" ? undefined : "{}",
          },
        );
        expect(response.status).toBe(401);
      }

      await expect(manager.close()).resolves.toEqual({ state: "idle" });
      expect(preparedCleaned).toBe(true);
      expect(await processAdapter.inspect(spawned!.pid)).toBeUndefined();
      expect(await canBind(providerPort)).toBe(true);
      expect(await canBind(ready.webdriverPort)).toBe(true);
    },
    90_000,
  );
});
