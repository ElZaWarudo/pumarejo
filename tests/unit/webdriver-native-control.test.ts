import { describe, expect, it, vi } from "vitest";

import { WebDriverClient } from "../../src/webdriver/client.js";

const NONCE = "a".repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("WebDriver native control boundary", () => {
  it("probes effective window capabilities without dispatching actions", async () => {
    const routes: string[] = [];
    let nonceHeader: string | null = null;
    const fetchImplementation = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        routes.push(`${init?.method ?? "GET"} ${path}`);
        nonceHeader = new Headers(init?.headers).get(
          "x-pumarejo-session-nonce",
        );
        if (path === "/session") {
          return jsonResponse({ value: { sessionId: "session-1" } });
        }
        if (path.endsWith("/pumarejo/window-capabilities")) {
          return jsonResponse({
            value: {
              window: {
                resize: {
                  state: "supported",
                  code: "provider_resize_supported",
                },
                maximize: { state: "denied", code: "provider_maximize_denied" },
                restore: {
                  state: "supported",
                  code: "provider_restore_supported",
                },
                initialSize: {
                  state: "supported",
                  code: "provider_initial_size_supported",
                },
              },
            },
          });
        }
        throw new Error(`unexpected route: ${path}`);
      },
    ) as unknown as typeof fetch;
    const client = new WebDriverClient({
      port: 49_152,
      nonce: NONCE,
      fetch: fetchImplementation,
    });

    await client.createSession();
    await expect(client.probeWindowCapabilities()).resolves.toMatchObject({
      resize: { state: "supported" },
      maximize: { state: "denied", code: "provider_maximize_denied" },
      initialSize: { state: "supported" },
    });
    expect(routes).toEqual([
      "POST /session",
      "GET /session/session-1/pumarejo/window-capabilities",
    ]);
    expect(nonceHeader).toBe(NONCE);
  });

  it("reports the dedicated dialog boundary as unsupported when the provider lacks it", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/session") {
        return jsonResponse({ value: { sessionId: "session-1" } });
      }
      return jsonResponse({ value: { error: "unknown command" } }, 404);
    }) as unknown as typeof fetch;
    const client = new WebDriverClient({
      port: 49_152,
      nonce: NONCE,
      fetch: fetchImplementation,
    });

    await client.createSession();
    await expect(client.detectNativeDialog()).resolves.toMatchObject({
      state: "unsupported",
      code: "provider_dialog_boundary_unsupported",
    });
    await expect(
      client.decideNativeDialog({ action: "accept", instanceId: "dialog-1" }),
    ).resolves.toMatchObject({
      state: "unsupported",
      code: "provider_dialog_decision_unsupported",
    });
  });

  it("maps provider-supported endpoint with no pending dialog to unavailable", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/session") {
        return jsonResponse({ value: { sessionId: "session-1" } });
      }
      if (path.endsWith("/pumarejo/tauri-dialog")) {
        return jsonResponse({
          value: {
            supported: true,
            pending: false,
            code: "provider_dialog_supported",
          },
        });
      }
      throw new Error(`unexpected route: ${path}`);
    }) as unknown as typeof fetch;
    const client = new WebDriverClient({
      port: 49_152,
      nonce: NONCE,
      fetch: fetchImplementation,
    });

    await client.createSession();
    await expect(client.detectNativeDialog()).resolves.toMatchObject({
      state: "unavailable",
      pending: false,
      code: "provider_dialog_absent",
    });
  });

  it("returns bounded dialog metadata and a provider postcondition", async () => {
    let present = true;
    const fetchImplementation = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path === "/session") {
          return jsonResponse({ value: { sessionId: "session-1" } });
        }
        if (path.endsWith("/pumarejo/tauri-dialog") && present) {
          return jsonResponse({
            value: {
              supported: true,
              code: "provider_dialog_supported",
              dialog: {
                id: "private-dialog-id",
                title: "Confirm",
                message: "Allow access",
                buttons: ["Accept", "Cancel"],
                surfaceRef: "surface-1",
              },
            },
          });
        }
        if (path.endsWith("/pumarejo/tauri-dialog")) {
          return jsonResponse({
            value: { supported: true, code: "provider_dialog_supported" },
          });
        }
        if (path.endsWith("/pumarejo/tauri-dialog/decision")) {
          const payload = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          expect(payload).toEqual({
            action: "accept",
            instanceId: "private-dialog-id",
          });
          present = false;
          return jsonResponse({ value: { resolved: true } });
        }
        throw new Error(`unexpected route: ${path}`);
      },
    ) as unknown as typeof fetch;
    const client = new WebDriverClient({
      port: 49_152,
      nonce: NONCE,
      fetch: fetchImplementation,
    });

    await client.createSession();
    const detected = await client.detectNativeDialog();
    expect(detected).toMatchObject({
      state: "supported",
      dialog: { title: "Confirm", buttons: ["Accept", "Cancel"] },
      providerDialog: { instanceId: "private-dialog-id" },
    });
    expect(detected.dialog).not.toHaveProperty("surfaceRef");
    expect(JSON.stringify(detected)).toContain("private-dialog-id");
    await expect(
      client.decideNativeDialog({
        action: "accept",
        instanceId: "private-dialog-id",
      }),
    ).resolves.toMatchObject({ state: "supported" });
  });

  it("fails closed for contradictory provider states and missing surface proof", async () => {
    const responses = [
      {
        value: {
          supported: true,
          pending: false,
          code: "provider_dialog_supported",
          dialog: {
            id: "dialog-1",
            title: "Confirm",
            message: "Allow access",
            buttons: ["Accept", "Cancel"],
          },
        },
      },
      {
        value: {
          supported: false,
          pending: true,
          code: "provider_dialog_unsupported",
          dialog: {
            id: "dialog-1",
            title: "Confirm",
            message: "Allow access",
            buttons: ["Accept", "Cancel"],
            surfaceRef: "surface-1",
          },
        },
      },
    ];
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/session") {
        return jsonResponse({ value: { sessionId: "session-1" } });
      }
      if (path.endsWith("/pumarejo/tauri-dialog")) {
        return jsonResponse(responses.shift());
      }
      throw new Error(`unexpected route: ${path}`);
    }) as unknown as typeof fetch;
    const client = new WebDriverClient({
      port: 49_152,
      nonce: NONCE,
      fetch: fetchImplementation,
    });

    await client.createSession();
    await expect(client.detectNativeDialog()).resolves.toEqual({
      state: "failed",
      code: "provider_dialog_invalid_response",
    });
    await expect(client.detectNativeDialog()).resolves.toEqual({
      state: "failed",
      code: "provider_dialog_invalid_response",
    });
  });

  it("allowlists public detection fields even when the provider injects enumerable fields", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/session") {
        return jsonResponse({ value: { sessionId: "session-1" } });
      }
      if (path.endsWith("/pumarejo/tauri-dialog")) {
        return jsonResponse({
          value: {
            supported: true,
            pending: true,
            code: "provider_dialog_supported",
            providerSecret: "never-public",
            dialog: {
              id: "dialog-1",
              title: "Confirm",
              message: "Allow access",
              buttons: ["Accept", "Cancel"],
              surfaceRef: "surface-1",
              adapterLeak: "never-public",
            },
          },
        });
      }
      throw new Error(`unexpected route: ${path}`);
    }) as unknown as typeof fetch;
    const client = new WebDriverClient({
      port: 49_152,
      nonce: NONCE,
      fetch: fetchImplementation,
    });

    await client.createSession();
    const result = await client.detectNativeDialog();
    expect(result.dialog).toEqual({
      title: "Confirm",
      message: "Allow access",
      buttons: ["Accept", "Cancel"],
    });
    expect(result.dialog).not.toHaveProperty("surfaceRef");
    expect(JSON.stringify(result)).not.toMatch(/providerSecret|adapterLeak/);
  });
});
