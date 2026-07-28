import { describe, expect, it, vi } from "vitest";

import { PumarejoError } from "../../src/shared/errors.js";
import { WebDriverClient } from "../../src/webdriver/client.js";

const NONCE = "a".repeat(64);
const W3C_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
const W3C_SHADOW_KEY = "shadow-6066-11e4-a52e-4f735466cecf";
const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.from("fixture"),
]).toString("base64");

function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function client(fetchImplementation: typeof fetch): WebDriverClient {
  return new WebDriverClient({
    port: 49_152,
    nonce: NONCE,
    fetch: fetchImplementation,
    requestTimeoutMs: 1_000,
  });
}

describe("WebDriverClient", () => {
  it("accepts only authenticated loopback endpoints", () => {
    expect(
      () =>
        new WebDriverClient({
          host: "example.test",
          port: 49_152,
          nonce: NONCE,
        }),
    ).toThrowError(PumarejoError);
    expect(() => new WebDriverClient({ port: 80, nonce: NONCE })).toThrowError(
      PumarejoError,
    );
    expect(
      () => new WebDriverClient({ port: 49_152, nonce: "short" }),
    ).toThrowError(PumarejoError);
    expect(
      new WebDriverClient({ host: "::1", port: 49_152, nonce: NONCE }).baseUrl
        .hostname,
    ).toBe("[::1]");
  });

  it("retries status readiness within a bounded deadline", async () => {
    let attempts = 0;
    const fetchImplementation = vi.fn(async (_input, init) => {
      expect(new Headers(init?.headers).get("x-pumarejo-session-nonce")).toBe(
        NONCE,
      );
      attempts += 1;
      return attempts < 3
        ? jsonResponse(
            { value: { error: "unknown error", message: "starting" } },
            503,
          )
        : jsonResponse({ value: { ready: true } });
    }) as unknown as typeof fetch;

    await expect(
      client(fetchImplementation).waitUntilReady({
        deadlineMs: 500,
        intervalMs: 10,
      }),
    ).resolves.toBeUndefined();
    expect(attempts).toBe(3);
  });

  it("classifies a readiness timeout", async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({ value: { ready: false } }),
    ) as unknown as typeof fetch;

    await expect(
      client(fetchImplementation).waitUntilReady({
        deadlineMs: 100,
        intervalMs: 10,
      }),
    ).rejects.toMatchObject({ code: "WEBDRIVER_NOT_READY" });
  });

  it("applies the readiness deadline to a hung status request", async () => {
    const fetchImplementation = vi.fn(
      async (
        _input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> =>
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    ) as unknown as typeof fetch;
    const startedAt = Date.now();

    await expect(
      client(fetchImplementation).waitUntilReady({
        deadlineMs: 100,
        intervalMs: 10,
      }),
    ).rejects.toMatchObject({ code: "WEBDRIVER_NOT_READY" });
    expect(Date.now() - startedAt).toBeLessThan(400);
  });

  it("preserves a custom cancellation reason while waiting between readiness attempts", async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({ value: { ready: false } }),
    ) as unknown as typeof fetch;
    const controller = new AbortController();
    const cancellation = new Error("stop readiness");
    const waiting = client(fetchImplementation).waitUntilReady({
      deadlineMs: 500,
      intervalMs: 200,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalled());
    controller.abort(cancellation);

    await expect(waiting).rejects.toBe(cancellation);
  });

  it("implements the required W3C session, window, script, element, action, and screenshot commands", async () => {
    const routes: string[] = [];
    const fetchImplementation = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        routes.push(`${init?.method ?? "GET"} ${url.pathname}`);
        if (url.pathname === "/session") {
          const payload = JSON.parse(String(init?.body)) as {
            capabilities: { alwaysMatch: { browserName: string } };
          };
          expect(payload.capabilities.alwaysMatch.browserName).toBe("wry");
          return jsonResponse({ value: { sessionId: "session-1" } });
        }
        if (url.pathname.endsWith("/window/handles")) {
          return jsonResponse({ value: ["main"] });
        }
        if (url.pathname.endsWith("/title")) {
          return jsonResponse({ value: "Fixture" });
        }
        if (url.pathname.endsWith("/window/rect")) {
          return jsonResponse({
            value: { x: 1, y: 2, width: 800, height: 600 },
          });
        }
        if (url.pathname.endsWith("/execute/sync")) {
          return jsonResponse({ value: { ready: true } });
        }
        if (url.pathname.endsWith("/element")) {
          return jsonResponse({
            value: {
              "element-6066-11e4-a52e-4f735466cecf": "element-1",
            },
          });
        }
        if (
          url.pathname.endsWith("/displayed") ||
          url.pathname.endsWith("/enabled")
        ) {
          return jsonResponse({ value: true });
        }
        if (url.pathname.endsWith("/screenshot")) {
          return jsonResponse({ value: PNG });
        }
        return jsonResponse({ value: null });
      },
    ) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);

    await webdriver.createSession();
    expect(webdriver.sessionId).toBe("session-1");
    await webdriver.selectWindow("main");
    expect(await webdriver.title()).toBe("Fixture");
    expect(await webdriver.windowRect()).toEqual({
      x: 1,
      y: 2,
      width: 800,
      height: 600,
    });
    expect(await webdriver.execute("return { ready: true }")).toEqual({
      ready: true,
    });
    const element = await webdriver.findElement("#button");
    await webdriver.click(element);
    await webdriver.clear(element);
    await webdriver.type(element, "hello");
    await webdriver.pressKey("\uE007");
    expect(await webdriver.screenshot()).toBe(PNG);
    await webdriver.deleteSession();
    expect(webdriver.sessionId).toBeUndefined();
    expect(routes).toEqual(
      expect.arrayContaining([
        "POST /session",
        "GET /session/session-1/window/handles",
        "POST /session/session-1/element/element-1/click",
        "POST /session/session-1/element/element-1/value",
        "POST /session/session-1/actions",
        "DELETE /session/session-1",
      ]),
    );
  });

  it("materializes light-DOM and recursively nested open-shadow handles", async () => {
    const routes: string[] = [];
    let shadowProbe = 0;
    const fetchImplementation = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        routes.push(`${init?.method ?? "GET"} ${path}`);
        if (path === "/session") {
          return jsonResponse({ value: { sessionId: "session-1" } });
        }
        if (path.endsWith("/elements") && !path.includes("/shadow/")) {
          return jsonResponse({
            value: [
              { [W3C_ELEMENT_KEY]: "light-1" },
              { [W3C_ELEMENT_KEY]: "host-1" },
            ],
          });
        }
        if (path.endsWith("/execute/sync")) {
          const values = [[false, true], [true], [false]][shadowProbe++];
          return jsonResponse({ value: values });
        }
        if (path.endsWith("/element/host-1/shadow")) {
          return jsonResponse({
            value: { [W3C_SHADOW_KEY]: "shadow-1" },
          });
        }
        if (path.endsWith("/shadow/shadow-1/elements")) {
          return jsonResponse({
            value: [{ [W3C_ELEMENT_KEY]: "shadow-child-1" }],
          });
        }
        if (path.endsWith("/element/shadow-child-1/shadow")) {
          return jsonResponse({
            value: { [W3C_SHADOW_KEY]: "shadow-2" },
          });
        }
        if (path.endsWith("/shadow/shadow-2/elements")) {
          return jsonResponse({
            value: [{ [W3C_ELEMENT_KEY]: "shadow-child-2" }],
          });
        }
        if (path.endsWith("/shadow")) {
          return jsonResponse(
            {
              value: {
                error: "no such shadow root",
                message: "element has no open shadow root",
              },
            },
            404,
          );
        }
        return jsonResponse({ value: null });
      },
    ) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();

    await expect(webdriver.snapshotElementHandles()).resolves.toEqual([
      "light-1",
      "host-1",
      "shadow-child-1",
      "shadow-child-2",
    ]);
    expect(routes).toEqual(
      expect.arrayContaining([
        "POST /session/session-1/elements",
        "POST /session/session-1/execute/sync",
        "GET /session/session-1/element/host-1/shadow",
        "POST /session/session-1/shadow/shadow-1/elements",
        "GET /session/session-1/element/shadow-child-1/shadow",
        "POST /session/session-1/shadow/shadow-2/elements",
      ]),
    );
  });

  it("rejects an oversized initial snapshot handle set before shadow probing", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/session") {
        return jsonResponse({ value: { sessionId: "session-1" } });
      }
      if (path.endsWith("/elements")) {
        return jsonResponse({
          value: Array.from({ length: 10_001 }, (_, index) => ({
            [W3C_ELEMENT_KEY]: `element-${index}`,
          })),
        });
      }
      throw new Error(`unexpected route: ${path}`);
    }) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();

    await expect(webdriver.snapshotElementHandles()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing configured window", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      return path === "/session"
        ? jsonResponse({ value: { sessionId: "session-1" } })
        : jsonResponse({ value: ["other"] });
    }) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();

    await expect(webdriver.selectWindow("main")).rejects.toMatchObject({
      code: "WINDOW_NOT_FOUND",
    });
  });

  it("uses static script fallbacks for provider commands the embedded adapter omits", async () => {
    const scripts: string[] = [];
    const fetchImplementation = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path === "/session") {
          return jsonResponse({ value: { sessionId: "session-1" } });
        }
        if (path.endsWith("/execute/sync")) {
          const payload = JSON.parse(String(init?.body)) as { script: string };
          scripts.push(payload.script);
          return jsonResponse({
            value: payload.script.includes("window.screenX")
              ? { x: 0, y: 0, width: 640, height: 480 }
              : true,
          });
        }
        if (
          path.endsWith("/window/rect") ||
          path.endsWith("/displayed") ||
          path.endsWith("/enabled") ||
          path.endsWith("/clear")
        ) {
          return jsonResponse(
            { value: { error: "unknown command", message: "not implemented" } },
            404,
          );
        }
        return jsonResponse({ value: null });
      },
    ) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();

    expect(await webdriver.windowRect()).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 480,
    });
    await expect(webdriver.click("element-1")).resolves.toBeUndefined();
    await expect(webdriver.clear("element-1")).resolves.toBeUndefined();
    expect(scripts).toEqual(
      expect.arrayContaining([
        expect.stringContaining("window.screenX"),
        expect.stringContaining("getComputedStyle"),
        expect.stringContaining("InputEvent"),
      ]),
    );
  });

  it("rejects a second session without replacing the owned session", async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({ value: { sessionId: "session-1" } }),
    ) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();

    await expect(webdriver.createSession()).rejects.toMatchObject({
      code: "SESSION_ALREADY_ACTIVE",
    });
    expect(webdriver.sessionId).toBe("session-1");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("attempts compensating cleanup when session creation returns no usable id", async () => {
    const routes: string[] = [];
    const fetchImplementation = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        routes.push(
          `${init?.method ?? "GET"} ${new URL(String(input)).pathname}`,
        );
        return jsonResponse({ value: {} });
      },
    ) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);

    await expect(webdriver.createSession()).rejects.toMatchObject({
      code: "SESSION_CREATE_FAILED",
    });
    expect(routes).toEqual(["POST /session", "DELETE /session"]);
    expect(webdriver.sessionId).toBeUndefined();
  });

  it("rejects concurrent session creation before a second provider request", async () => {
    let releaseFirstRequest: ((response: Response) => void) | undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      releaseFirstRequest = resolve;
    });
    const fetchImplementation = vi.fn(
      async () => await firstResponse,
    ) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    const creating = webdriver.createSession();
    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledOnce());

    await expect(webdriver.createSession()).rejects.toMatchObject({
      code: "SESSION_ALREADY_ACTIVE",
    });
    releaseFirstRequest?.(jsonResponse({ value: { sessionId: "session-1" } }));
    await expect(creating).resolves.toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("retains the session id when deletion fails so cleanup can retry", async () => {
    let deleteAttempts = 0;
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/session") {
        return jsonResponse({ value: { sessionId: "session-1" } });
      }
      deleteAttempts += 1;
      return deleteAttempts === 1
        ? jsonResponse(
            { value: { error: "unknown error", message: "temporary" } },
            500,
          )
        : jsonResponse({ value: null });
    }) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();

    await expect(webdriver.deleteSession()).rejects.toBeInstanceOf(
      PumarejoError,
    );
    expect(webdriver.sessionId).toBe("session-1");
    await expect(webdriver.deleteSession()).resolves.toBeUndefined();
    expect(webdriver.sessionId).toBeUndefined();
  });

  it("forgets a session only when the provider confirms it is invalid", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      return path === "/session"
        ? jsonResponse({ value: { sessionId: "session-1" } })
        : jsonResponse(
            {
              value: {
                error: "invalid session id",
                message: "already closed",
              },
            },
            404,
          );
    }) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();

    await expect(webdriver.deleteSession()).rejects.toMatchObject({
      code: "SESSION_NOT_ACTIVE",
    });
    expect(webdriver.sessionId).toBeUndefined();
  });

  it.each([
    ["stale element reference", "STALE_ELEMENT_REF"],
    ["no such element", "ELEMENT_NOT_FOUND"],
    ["element not interactable", "ELEMENT_NOT_INTERACTABLE"],
    ["invalid session id", "SESSION_NOT_ACTIVE"],
  ])("normalizes provider error %s", async (providerError, code) => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      return path === "/session"
        ? jsonResponse({ value: { sessionId: "session-1" } })
        : jsonResponse(
            { value: { error: providerError, message: "provider detail" } },
            404,
          );
    }) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();

    await expect(webdriver.findElement("#missing")).rejects.toMatchObject({
      code,
    });
  });

  it("distinguishes hidden and disabled elements before clicking", async () => {
    let displayed = false;
    let enabled = true;
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/session") {
        return jsonResponse({ value: { sessionId: "session-1" } });
      }
      if (path.endsWith("/displayed")) {
        return jsonResponse({ value: displayed });
      }
      if (path.endsWith("/enabled")) {
        return jsonResponse({ value: enabled });
      }
      return jsonResponse({ value: null });
    }) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();

    await expect(webdriver.click("element-1")).rejects.toMatchObject({
      code: "ELEMENT_HIDDEN",
    });
    displayed = true;
    enabled = false;
    await expect(webdriver.click("element-1")).rejects.toMatchObject({
      code: "ELEMENT_DISABLED",
    });
  });

  it("cancels an in-flight request and still allows session cleanup", async () => {
    let requestCount = 0;
    const fetchImplementation = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const path = new URL(String(input)).pathname;
        requestCount += 1;
        if (path === "/session") {
          return jsonResponse({ value: { sessionId: "session-1" } });
        }
        if (path.endsWith("/execute/sync")) {
          return await new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          });
        }
        return jsonResponse({ value: null });
      },
    ) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();
    const controller = new AbortController();
    const executing = webdriver.execute("return 1", [], controller.signal);
    const cancellation = new Error("custom cancellation");
    controller.abort(cancellation);

    await expect(executing).rejects.toBe(cancellation);
    expect(webdriver.sessionId).toBe("session-1");
    await expect(webdriver.deleteSession()).resolves.toBeUndefined();
    expect(webdriver.sessionId).toBeUndefined();
    expect(requestCount).toBe(3);
  });

  it("rejects invalid screenshot framing and oversized responses", async () => {
    let oversized = false;
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/session") {
        return jsonResponse({ value: { sessionId: "session-1" } });
      }
      return oversized
        ? jsonResponse({ value: "ignored" }, 200, {
            "content-length": String(5 * 1024 * 1024),
          })
        : jsonResponse({ value: "bm90LXBuZw==" });
    }) as unknown as typeof fetch;
    const webdriver = client(fetchImplementation);
    await webdriver.createSession();

    await expect(webdriver.screenshot()).rejects.toMatchObject({
      code: "SCREENSHOT_FAILED",
    });
    oversized = true;
    await expect(webdriver.screenshot()).rejects.toMatchObject({
      code: "SCREENSHOT_FAILED",
    });
  });
});
