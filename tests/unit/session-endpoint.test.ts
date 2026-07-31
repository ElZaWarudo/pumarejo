import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import {
  reserveProviderPort,
  startAuthenticatedProxy,
  type AuthenticatedProxy,
} from "../../src/session/endpoint.js";
import { PumarejoError } from "../../src/shared/errors.js";

const SESSION_NONCE = "a".repeat(64);
const PROVIDER_NONCE = "b".repeat(64);
const servers: Array<{ close(callback: (error?: Error) => void): void }> = [];
const proxies: AuthenticatedProxy[] = [];

afterEach(async () => {
  await Promise.allSettled(proxies.splice(0).map((proxy) => proxy.close()));
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function fakeProvider() {
  let accepted = 0;
  const received: Array<{
    readonly contentLength?: string;
    readonly transferEncoding?: string;
    readonly body: string;
  }> = [];
  const server = createHttpServer((request, response) => {
    if (request.headers["x-pumarejo-provider-nonce"] !== PROVIDER_NONCE) {
      response.writeHead(401).end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      accepted += 1;
      received.push({
        ...(request.headers["content-length"] === undefined
          ? {}
          : { contentLength: request.headers["content-length"] }),
        ...(request.headers["transfer-encoding"] === undefined
          ? {}
          : { transferEncoding: request.headers["transfer-encoding"] }),
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ value: { ready: true, path: request.url } }));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("provider did not bind");
  }
  return { port: address.port, accepted: () => accepted, received };
}

describe("owned loopback endpoint", () => {
  it("reserves an unpredictable high port and rejects an occupied explicit port", async () => {
    const random = await reserveProviderPort();
    expect(random.port).toBeGreaterThanOrEqual(49_152);
    expect(random.port).toBeLessThanOrEqual(65_535);
    await random.release();

    const occupied = createNetServer();
    servers.push(occupied);
    await new Promise<void>((resolve, reject) => {
      occupied.once("error", reject);
      occupied.listen(0, "127.0.0.1", resolve);
    });
    const address = occupied.address();
    if (address === null || typeof address === "string") {
      throw new Error("occupied fixture did not bind");
    }
    await expect(reserveProviderPort(address.port)).rejects.toMatchObject({
      code: "PORT_UNAVAILABLE",
    });
  });

  it("forwards only nonce-authenticated allowlisted commands with a distinct provider nonce", async () => {
    const provider = await fakeProvider();
    const proxy = await startAuthenticatedProxy({
      providerPort: provider.port,
      sessionNonce: SESSION_NONCE,
      providerNonce: PROVIDER_NONCE,
    });
    proxies.push(proxy);
    const base = `http://127.0.0.1:${proxy.port}`;

    for (const path of [
      "/status",
      "/session",
      "/session/owned/actions",
      "/session/owned/element/ref-1/value",
      "/session/owned",
    ]) {
      const unauthorized = await fetch(`${base}${path}`, {
        method: path === "/status" ? "GET" : "POST",
        headers: { "content-type": "application/json" },
        body: path === "/status" ? undefined : "{}",
      });
      expect(unauthorized.status).toBe(401);
    }
    expect(provider.accepted()).toBe(0);

    const accepted = await fetch(`${base}/status`, {
      headers: { "x-pumarejo-session-nonce": SESSION_NONCE },
    });
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({
      value: { ready: true, path: "/status" },
    });
    expect(provider.accepted()).toBe(1);

    for (const [method, path] of [
      ["POST", "/session/owned/elements"],
      ["GET", "/session/owned/element/ref-1/shadow"],
      ["POST", "/session/owned/shadow/shadow-1/elements"],
    ] as const) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-pumarejo-session-nonce": SESSION_NONCE,
        },
        body: method === "POST" ? "{}" : undefined,
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        value: { path },
      });
    }
    expect(provider.accepted()).toBe(4);
    expect(provider.received.slice(1)).toEqual([
      { contentLength: "2", body: "{}" },
      { body: "" },
      { contentLength: "2", body: "{}" },
    ]);

    for (const [method, path] of [
      ["GET", "/not-webdriver"],
      ["GET", "/session/owned/elements"],
      ["POST", "/session/owned/element/ref-1/shadow"],
      ["GET", "/session/owned/shadow/shadow-1/elements"],
      ["POST", "/session/owned/shadow/shadow-1/element"],
    ] as const) {
      const forbidden = await fetch(`${base}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-pumarejo-session-nonce": SESSION_NONCE,
        },
        body: method === "POST" ? "{}" : undefined,
      });
      expect(forbidden.status).toBe(404);
    }
    expect(provider.accepted()).toBe(4);
  });

  it("keeps the provider nonce private and makes the proxy unreachable after close", async () => {
    const provider = await fakeProvider();
    const direct = await fetch(`http://127.0.0.1:${provider.port}/status`);
    expect(direct.status).toBe(401);

    const proxy = await startAuthenticatedProxy({
      providerPort: provider.port,
      sessionNonce: SESSION_NONCE,
      providerNonce: PROVIDER_NONCE,
    });
    const proxyPort = proxy.port;
    await proxy.close();

    await expect(
      fetch(`http://127.0.0.1:${proxyPort}/status`),
    ).rejects.toBeInstanceOf(TypeError);
    expect(provider.accepted()).toBe(0);
  });

  it("fails closed before forwarding when the upstream ownership lease is revoked", async () => {
    const provider = await fakeProvider();
    let authorized = true;
    const proxy = await startAuthenticatedProxy({
      providerPort: provider.port,
      sessionNonce: SESSION_NONCE,
      providerNonce: PROVIDER_NONCE,
      authorizeUpstream: async () => authorized,
    });
    proxies.push(proxy);
    const requestStatus = async () =>
      await fetch(`http://127.0.0.1:${proxy.port}/status`, {
        headers: { "x-pumarejo-session-nonce": SESSION_NONCE },
      });

    expect((await requestStatus()).status).toBe(200);
    expect(provider.accepted()).toBe(1);
    authorized = false;
    expect((await requestStatus()).status).toBe(503);
    expect(provider.accepted()).toBe(1);
  });

  it("retains a typed authorization failure for the session owner", async () => {
    const provider = await fakeProvider();
    const failure = new PumarejoError("PROCESS_INSPECTION_DENIED");
    const proxy = await startAuthenticatedProxy({
      providerPort: provider.port,
      sessionNonce: SESSION_NONCE,
      providerNonce: PROVIDER_NONCE,
      authorizeUpstream: async () => {
        throw failure;
      },
    });
    proxies.push(proxy);

    const response = await fetch(`http://127.0.0.1:${proxy.port}/status`, {
      headers: { "x-pumarejo-session-nonce": SESSION_NONCE },
    });

    expect(response.status).toBe(503);
    expect(proxy.takeAuthorizationFailure?.()).toBe(failure);
    expect(proxy.takeAuthorizationFailure?.()).toBeUndefined();
  });
});
