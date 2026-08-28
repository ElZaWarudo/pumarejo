import { randomInt, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, request } from "node:http";
import {
  createConnection,
  createServer as createNetServer,
  type Server,
} from "node:net";

import {
  createLoopbackEndpoint,
  type LoopbackEndpoint,
  type LoopbackFamily,
  type LoopbackProbeResult,
} from "../platform/loopback.js";
import { PumarejoError } from "../shared/errors.js";

const MIN_HIGH_PORT = 49_152;
const MAX_HIGH_PORT = 65_535;
const MAX_PROXY_REQUEST_BYTES = 2 * 1024 * 1024;
const NONCE_HEADER = "x-pumarejo-session-nonce";
const PROVIDER_NONCE_HEADER = "x-pumarejo-provider-nonce";
const ALLOWED_COMMANDS = [
  { method: "GET", route: /^\/status$/u },
  { method: "POST", route: /^\/session$/u },
  { method: "DELETE", route: /^\/session$/u },
  { method: "DELETE", route: /^\/session\/[^/]+$/u },
  {
    method: "GET",
    route:
      /^\/session\/[^/]+\/(?:window\/handles|window\/rect|title|screenshot|pumarejo\/window-capabilities|pumarejo\/tauri-dialog)$/u,
  },
  {
    method: "POST",
    route:
      /^\/session\/[^/]+\/(?:window(?:\/rect|\/maximize|\/minimize|\/fullscreen)?|execute\/sync|element|elements|actions|pumarejo\/tauri-dialog\/decision)$/u,
  },
  {
    method: "GET",
    route: /^\/session\/[^/]+\/element\/[^/]+\/(?:displayed|enabled)$/u,
  },
  {
    method: "POST",
    route: /^\/session\/[^/]+\/element\/[^/]+\/(?:click|clear|value)$/u,
  },
  {
    method: "GET",
    route: /^\/session\/[^/]+\/element\/[^/]+\/shadow$/u,
  },
  {
    method: "POST",
    route: /^\/session\/[^/]+\/shadow\/[^/]+\/elements$/u,
  },
];

export interface PortReservation {
  readonly port: number;
  /** The concrete family used by the reservation. Optional for old doubles. */
  readonly family?: LoopbackFamily;
  readonly endpoint?: LoopbackEndpoint;
  release(): Promise<void>;
  /** Internal postcondition; omitted by compatibility test doubles. */
  listenerState?(): Promise<ListenerOwnership>;
}

export interface AuthenticatedProxy {
  readonly port: number;
  takeAuthorizationFailure?(): unknown;
  close(): Promise<void>;
  /** Internal postcondition; omitted by compatibility test doubles. */
  listenerState?(): Promise<ListenerOwnership>;
}

export type ListenerOwnership = "owned" | "released" | "foreign" | "unknown";

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function tryReserve(
  port: number,
  family: LoopbackFamily,
): Promise<PortReservation | undefined> {
  const endpointResult = createLoopbackEndpoint({
    host: family === "ipv6" ? "::1" : "127.0.0.1",
    port,
    family,
  });
  if (!endpointResult.ok) return undefined;
  const endpoint = endpointResult.endpoint;
  const server = createNetServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, endpoint.host, resolve);
    });
  } catch {
    server.close();
    return undefined;
  }
  let released = false;
  return {
    port,
    family,
    endpoint,
    async release() {
      if (released) return;
      await closeServer(server);
      released = true;
    },
    async listenerState() {
      return released || !server.listening ? "released" : "owned";
    },
  };
}

export async function reserveProviderPort(
  preferredPort?: number,
  family: LoopbackFamily = "ipv4",
): Promise<PortReservation> {
  if (preferredPort !== undefined) {
    if (
      !Number.isInteger(preferredPort) ||
      preferredPort < 1024 ||
      preferredPort > MAX_HIGH_PORT
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    const reservation = await tryReserve(preferredPort, family);
    if (reservation === undefined) {
      throw new PumarejoError("PORT_UNAVAILABLE");
    }
    return reservation;
  }
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const reservation = await tryReserve(
      randomInt(MIN_HIGH_PORT, MAX_HIGH_PORT + 1),
      family,
    );
    if (reservation !== undefined) return reservation;
  }
  throw new PumarejoError("PORT_UNAVAILABLE");
}

function probeFamily(
  endpoint: LoopbackEndpoint,
  family: LoopbackFamily,
  signal: AbortSignal,
  timeoutMs = 250,
): Promise<LoopbackProbeResult> {
  const host = family === "ipv6" ? "::1" : "127.0.0.1";
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(
        signal.reason ??
          new DOMException("The operation was aborted.", "AbortError"),
      );
      return;
    }
    const socket = createConnection({
      host,
      port: endpoint.port,
      family: family === "ipv6" ? 6 : 4,
    });
    let settled = false;
    const finish = (result: LoopbackProbeResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      socket.destroy();
      resolve(result);
    };
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(
        signal.reason ??
          new DOMException("The operation was aborted.", "AbortError"),
      );
    };
    const timer = setTimeout(() => finish({ state: "timeout" }), timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    socket.once("connect", () => finish({ state: "occupied", family }));
    socket.once("timeout", () => finish({ state: "timeout" }));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED" || error.code === "EADDRNOTAVAIL") {
        finish({ state: "available" });
      } else {
        finish({ state: "refused" });
      }
    });
    socket.setTimeout(timeoutMs);
  });
}

/** Probe the requested family and, only when it is absent, its explicit peer. */
export async function probeLoopbackEndpoint(
  endpoint: LoopbackEndpoint,
  signal: AbortSignal,
): Promise<LoopbackProbeResult> {
  const requested = await probeFamily(endpoint, endpoint.family, signal);
  if (requested.state === "occupied" || requested.state === "timeout") {
    return requested;
  }
  const other: LoopbackFamily = endpoint.family === "ipv4" ? "ipv6" : "ipv4";
  const peer = await probeFamily(endpoint, other, signal);
  if (peer.state === "occupied") return peer;
  return requested.state === "refused" || peer.state === "refused"
    ? { state: "refused" }
    : { state: "available" };
}

function validNonce(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function sameNonce(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function startAuthenticatedProxy(options: {
  readonly providerPort: number;
  readonly family?: LoopbackFamily;
  readonly sessionNonce: string;
  readonly providerNonce: string;
  readonly authorizeUpstream?: () => Promise<boolean>;
}): Promise<AuthenticatedProxy> {
  if (
    !Number.isInteger(options.providerPort) ||
    options.providerPort < 1024 ||
    options.providerPort > MAX_HIGH_PORT ||
    !validNonce(options.sessionNonce) ||
    !validNonce(options.providerNonce) ||
    options.sessionNonce === options.providerNonce
  ) {
    throw new PumarejoError("INTERNAL_ERROR");
  }
  const family = options.family ?? "ipv4";
  const provider = createLoopbackEndpoint({
    host: family === "ipv6" ? "::1" : "127.0.0.1",
    port: options.providerPort,
    family,
  });
  if (!provider.ok) throw new PumarejoError("INTERNAL_ERROR");

  let authorizationFailure: unknown;
  let closed = false;
  const server = createHttpServer((incoming, outgoing) => {
    void (async () => {
      const path = new URL(incoming.url ?? "/", "http://127.0.0.1").pathname;
      const supplied = incoming.headers[NONCE_HEADER];
      const sessionNonce = Array.isArray(supplied) ? supplied[0] : supplied;
      if (!sameNonce(sessionNonce, options.sessionNonce)) {
        outgoing
          .writeHead(401, { "content-type": "application/json" })
          .end('{"value":{"error":"unauthorized"}}');
        return;
      }
      if (
        !ALLOWED_COMMANDS.some(
          (command) =>
            command.method === incoming.method && command.route.test(path),
        )
      ) {
        outgoing
          .writeHead(404, { "content-type": "application/json" })
          .end('{"value":{"error":"unknown command"}}');
        return;
      }
      const declaredHeader = incoming.headers["content-length"];
      const declaredLength = Number(declaredHeader);
      if (
        declaredHeader !== undefined &&
        (!Number.isInteger(declaredLength) ||
          declaredLength < 0 ||
          declaredLength > MAX_PROXY_REQUEST_BYTES)
      ) {
        outgoing
          .writeHead(413, { "content-type": "application/json" })
          .end('{"value":{"error":"invalid argument"}}');
        return;
      }
      if (options.authorizeUpstream !== undefined) {
        try {
          if (!(await options.authorizeUpstream())) {
            outgoing
              .writeHead(503, { "content-type": "application/json" })
              .end('{"value":{"error":"provider unavailable"}}');
            return;
          }
        } catch (error) {
          authorizationFailure ??= error;
          outgoing
            .writeHead(503, { "content-type": "application/json" })
            .end('{"value":{"error":"provider unavailable"}}');
          return;
        }
      }

      const upstream = request(
        {
          host: provider.endpoint.host,
          port: options.providerPort,
          family: family === "ipv6" ? 6 : 4,
          method: incoming.method,
          path: incoming.url,
          headers: {
            "content-type":
              incoming.headers["content-type"] ?? "application/json",
            ...(declaredHeader === undefined
              ? {}
              : { "content-length": String(declaredLength) }),
            [PROVIDER_NONCE_HEADER]: options.providerNonce,
          },
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
        },
      );
      let received = 0;
      incoming.on("data", (chunk: Buffer) => {
        received += chunk.byteLength;
        if (received > MAX_PROXY_REQUEST_BYTES) {
          upstream.destroy();
          if (!outgoing.headersSent) outgoing.writeHead(413);
          outgoing.end('{"value":{"error":"invalid argument"}}');
        }
      });
      upstream.on("error", () => {
        if (!outgoing.headersSent) outgoing.writeHead(502);
        outgoing.end('{"value":{"error":"provider unavailable"}}');
      });
      incoming.pipe(upstream);
    })().catch(() => {
      if (!outgoing.headersSent) {
        outgoing.writeHead(503, { "content-type": "application/json" });
      }
      outgoing.end('{"value":{"error":"provider unavailable"}}');
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, family === "ipv6" ? "::1" : "127.0.0.1", resolve);
    });
  } catch (error) {
    throw new PumarejoError("PORT_UNAVAILABLE", { cause: error });
  }
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new PumarejoError("PORT_UNAVAILABLE");
  }
  return {
    port: address.port,
    takeAuthorizationFailure: () => {
      const failure = authorizationFailure;
      authorizationFailure = undefined;
      return failure;
    },
    close: async () => {
      if (closed) return;
      const closing = closeServer(server);
      server.closeAllConnections();
      await closing;
      closed = true;
    },
    async listenerState() {
      return closed || !server.listening ? "released" : "owned";
    },
  };
}
