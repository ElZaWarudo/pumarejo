export type JsonObject = Record<string, unknown>;

export class W3cError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`W3C request failed (${status})`);
  }
}

export class W3cClient {
  readonly base: URL;
  sessionId: string | undefined;

  constructor(
    port: number,
    host = "127.0.0.1",
    readonly sessionNonce = process.env.TAURI_AGENT_SESSION_NONCE,
  ) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error("W3C port must be an integer in 1024..65535");
    }
    if (
      !new Set(["127.0.0.1", "::1", "[::1]"]).has(host.trim().toLowerCase())
    ) {
      throw new Error("W3C client accepts loopback hosts only");
    }
    if (!sessionNonce || sessionNonce.length < 32) {
      throw new Error("W3C client requires a per-session nonce");
    }
    this.base = new URL(`http://${host}:${port}`);
  }

  async request(path: string, init: RequestInit = {}): Promise<JsonObject> {
    if (
      !path.startsWith("/") ||
      new URL(path, this.base).origin !== this.base.origin
    ) {
      throw new Error("W3C route must be a relative same-origin path");
    }
    const response = await fetch(new URL(path, this.base), {
      ...init,
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        ...(this.sessionNonce
          ? { "x-tauri-agent-session-nonce": this.sessionNonce }
          : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as unknown) : {};
    if (!response.ok) throw new W3cError(response.status, body);
    return (body && typeof body === "object" ? body : {}) as JsonObject;
  }

  async status(): Promise<JsonObject> {
    return this.request("/status");
  }

  async newSession(): Promise<JsonObject> {
    const body = await this.request("/session", {
      method: "POST",
      body: JSON.stringify({
        capabilities: { alwaysMatch: { browserName: "wry" }, firstMatch: [{}] },
      }),
    });
    const value = body.value as JsonObject | undefined;
    this.sessionId = String(body.sessionId ?? value?.sessionId ?? "");
    if (!this.sessionId) throw new Error("provider returned no session id");
    return body;
  }

  async command(
    method: string,
    path: string,
    payload?: unknown,
  ): Promise<JsonObject> {
    if (!this.sessionId) throw new Error("session not created");
    return this.request(
      `/session/${encodeURIComponent(this.sessionId)}${path}`,
      {
        method,
        body: payload === undefined ? undefined : JSON.stringify(payload),
      },
    );
  }

  async deleteSession(): Promise<JsonObject | undefined> {
    if (!this.sessionId) return undefined;
    try {
      return await this.command("DELETE", "");
    } finally {
      this.sessionId = undefined;
    }
  }
}
