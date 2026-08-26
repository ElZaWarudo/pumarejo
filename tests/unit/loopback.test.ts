import { describe, expect, it } from "vitest";

import {
  compareBuildDevUrl,
  createLoopbackEndpoint,
  observeLoopback,
  parseBuildDevUrl,
  type LoopbackEndpoint,
} from "../../src/platform/loopback.js";

function endpoint(
  host: "127.0.0.1" | "::1" = "127.0.0.1",
  port = 49_152,
): LoopbackEndpoint {
  const result = createLoopbackEndpoint({ host, port });
  if (!result.ok)
    throw new Error(`fixture endpoint rejected: ${result.reason}`);
  return result.endpoint;
}

describe("strict loopback endpoint model", () => {
  it("formats explicit IPv4 and bracketed IPv6 endpoints", () => {
    expect(createLoopbackEndpoint({ host: "127.0.0.1", port: 49_152 })).toEqual(
      {
        ok: true,
        endpoint: {
          family: "ipv4",
          host: "127.0.0.1",
          port: 49_152,
          url: "http://127.0.0.1:49152",
        },
      },
    );
    expect(createLoopbackEndpoint({ host: "[::1]", port: 49_153 })).toEqual({
      ok: true,
      endpoint: {
        family: "ipv6",
        host: "::1",
        port: 49_153,
        url: "http://[::1]:49153",
      },
    });
  });

  it.each([
    ["localhost", "localhost"],
    ["0.0.0.0", "wildcard"],
    ["::", "wildcard"],
    ["192.0.2.1", "external"],
    ["example.test", "external"],
  ] as const)("rejects %s without DNS resolution", (host, reason) => {
    expect(createLoopbackEndpoint({ host, port: 49_152 })).toEqual({
      ok: false,
      reason,
    });
  });

  it("rejects invalid ports and a declared family that disagrees with the host", () => {
    expect(createLoopbackEndpoint({ host: "127.0.0.1", port: 80 })).toEqual({
      ok: false,
      reason: "invalid-port",
    });
    expect(
      createLoopbackEndpoint({
        host: "127.0.0.1",
        port: 49_152,
        family: "ipv6",
      }),
    ).toEqual({ ok: false, reason: "family-mismatch" });
  });
});

describe("bounded build.devUrl comparison", () => {
  it("accepts only explicit loopback URLs and retains a sanitized summary", () => {
    expect(parseBuildDevUrl("http://127.0.0.1:49152")).toEqual({
      ok: true,
      value: { scheme: "http", family: "ipv4", port: 49_152 },
    });
    expect(parseBuildDevUrl("http://[::1]:49152")).toEqual({
      ok: true,
      value: { scheme: "http", family: "ipv6", port: 49_152 },
    });
    expect(parseBuildDevUrl("http://user:secret@127.0.0.1:49152")).toEqual({
      ok: false,
      reason: "credentials",
    });
    expect(parseBuildDevUrl("http://localhost:49152")).toEqual({
      ok: false,
      reason: "localhost",
    });
    expect(parseBuildDevUrl("http://0.0.0.0:49152")).toEqual({
      ok: false,
      reason: "wildcard",
    });
    expect(parseBuildDevUrl("ftp://127.0.0.1:49152")).toEqual({
      ok: false,
      reason: "invalid-scheme",
    });
    expect(parseBuildDevUrl("http://127.0.0.1:80")).toEqual({
      ok: false,
      reason: "invalid-port",
    });
  });

  it("reports family/port mismatch with explicit correction and no raw URL", () => {
    const comparison = compareBuildDevUrl(
      endpoint("::1", 49_153),
      "http://127.0.0.1:49152/private?token=secret",
    );
    expect(comparison).toMatchObject({
      matches: false,
      code: "dev-url-invalid",
      family: "ipv6",
      port: 49_153,
      suggestion: "Use http://[::1]:49153.",
    });
    expect(JSON.stringify(comparison)).not.toContain("token");
    expect(compareBuildDevUrl(endpoint(), "http://127.0.0.1:49153")).toEqual({
      matches: false,
      code: "dev-url-port-mismatch",
      family: "ipv4",
      port: 49_152,
      devUrl: {
        state: "mismatch",
        scheme: "http",
        family: "ipv4",
        port: 49_153,
      },
      suggestion: "Use http://127.0.0.1:49152.",
    });
  });

  it("matches an exact family, scheme, and port", () => {
    expect(compareBuildDevUrl(endpoint("::1"), "http://[::1]:49152")).toEqual({
      matches: true,
      code: "dev-url-match",
      family: "ipv6",
      port: 49_152,
      devUrl: {
        state: "match",
        scheme: "http",
        family: "ipv6",
        port: 49_152,
      },
      suggestion: "The configured loopback URL matches the observed endpoint.",
    });
  });

  it("normalizes an HTTPS mismatch to the explicit HTTP correction", () => {
    expect(compareBuildDevUrl(endpoint(), "https://127.0.0.1:49152")).toEqual({
      matches: false,
      code: "dev-url-scheme-mismatch",
      family: "ipv4",
      port: 49_152,
      devUrl: {
        state: "mismatch",
        scheme: "https",
        family: "ipv4",
        port: 49_152,
      },
      suggestion: "Use http://127.0.0.1:49152.",
    });
  });
});

describe("bounded loopback observation", () => {
  it("distinguishes available, refused, timeout, wrong-family, and ownership refusal", async () => {
    const target = endpoint();
    await expect(
      observeLoopback(target, {
        probe: async () => ({ state: "available" }),
      }),
    ).resolves.toMatchObject({ state: "available", ready: false });
    await expect(
      observeLoopback(target, {
        probe: async () => ({ state: "refused" }),
      }),
    ).resolves.toMatchObject({ state: "refused", ready: false });
    await expect(
      observeLoopback(target, {
        probe: async () => ({ state: "occupied", family: "ipv6" }),
      }),
    ).resolves.toMatchObject({ state: "wrong-family", ready: false });
    await expect(
      observeLoopback(target, {
        probe: async () => ({ state: "occupied" }),
        ownership: async () => "unknown",
      }),
    ).resolves.toMatchObject({
      state: "ownership-unproven",
      listener: "occupied",
      ownership: "unknown",
      ready: false,
    });
    await expect(
      observeLoopback(target, {
        probe: async () => ({ state: "occupied" }),
        ownership: async () => "owned",
      }),
    ).resolves.toMatchObject({ state: "occupied", ready: true });
  });

  it("returns a bounded timeout without exposing probe errors", async () => {
    const observation = await observeLoopback(endpoint(), {
      timeoutMs: 5,
      probe: async (_endpoint, signal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
        throw new Error("secret path/cause");
      },
    });
    expect(observation).toEqual({
      state: "timeout",
      listener: "timeout",
      family: "ipv4",
      port: 49_152,
      ownership: "not-applicable",
      ready: false,
    });
    expect(JSON.stringify(observation)).not.toContain("secret");
  });

  it("preserves caller cancellation instead of relabeling it as a timeout", async () => {
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    controller.abort(reason);
    await expect(
      observeLoopback(endpoint(), {
        signal: controller.signal,
        probe: async () => ({ state: "available" }),
      }),
    ).rejects.toBe(reason);
  });
});
