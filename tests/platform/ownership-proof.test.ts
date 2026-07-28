import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startAuthenticatedProxy,
  type AuthenticatedProxy,
} from "./authenticated-proxy.js";
import {
  commandHash,
  createProcessLease,
  terminateOwnedProcess,
} from "./process-lease.js";

let proxy: AuthenticatedProxy | undefined;
let closeProvider: (() => Promise<void>) | undefined;

afterEach(async () => {
  await proxy?.close();
  await closeProvider?.();
  proxy = undefined;
  closeProvider = undefined;
});

async function provider(): Promise<number> {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        value: {
          path: request.url,
          providerNonce: request.headers["x-tauri-agent-provider-nonce"],
        },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("provider bind failed");
  closeProvider = () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  return address.port;
}

describe("authenticated provider ownership", () => {
  it("rejects missing/wrong nonce and non-W3C routes", async () => {
    const nonce = "a".repeat(64);
    proxy = await startAuthenticatedProxy({
      providerPort: await provider(),
      nonce,
      providerNonce: "c".repeat(64),
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    expect((await fetch(`${base}/status`)).status).toBe(401);
    expect(
      (
        await fetch(`${base}/status`, {
          headers: { "x-tauri-agent-session-nonce": "b".repeat(64) },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${base}/not-allowed`, {
          headers: { "x-tauri-agent-session-nonce": nonce },
        })
      ).status,
    ).toBe(404);
    const allowed = await fetch(`${base}/status`, {
      headers: { "x-tauri-agent-session-nonce": nonce },
    });
    expect(allowed.status).toBe(200);
    await expect(allowed.json()).resolves.toEqual({
      value: { path: "/status", providerNonce: "c".repeat(64) },
    });
  });

  it("terminates only the exact leased process identity", async () => {
    const identity = {
      pid: 42,
      startedAt: 1234,
      commandHash: commandHash("fixture", ["--config", "overlay.json"]),
    };
    const lease = createProcessLease(identity, {
      providerPort: 4444,
      proxyPort: 5555,
    });
    expect(lease.nonce).toHaveLength(64);
    const terminate = vi.fn(async () => undefined);
    await expect(
      terminateOwnedProcess(
        lease,
        async () => ({ ...identity, startedAt: 9999 }),
        terminate,
      ),
    ).resolves.toBe(false);
    expect(terminate).not.toHaveBeenCalled();
    await expect(
      terminateOwnedProcess(lease, async () => identity, terminate),
    ).resolves.toBe(true);
    expect(terminate).toHaveBeenCalledWith(42);
  });
});
