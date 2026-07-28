import { randomInt, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, request } from "node:http";
import { createServer as createNetServer, type Server } from "node:net";

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
      /^\/session\/[^/]+\/(?:window\/handles|window\/rect|title|screenshot)$/u,
  },
  {
    method: "POST",
    route:
      /^\/session\/[^/]+\/(?:window|execute\/sync|element|elements|actions)$/u,
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
  release(): Promise<void>;
}

export interface AuthenticatedProxy {
  readonly port: number;
  close(): Promise<void>;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function tryReserve(port: number): Promise<PortReservation | undefined> {
  const server = createNetServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  } catch {
    server.close();
    return undefined;
  }
  let released = false;
  return {
    port,
    async release() {
      if (released) return;
      released = true;
      await closeServer(server);
    },
  };
}

export async function reserveProviderPort(
  preferredPort?: number,
): Promise<PortReservation> {
  if (preferredPort !== undefined) {
    if (
      !Number.isInteger(preferredPort) ||
      preferredPort < 1024 ||
      preferredPort > MAX_HIGH_PORT
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    const reservation = await tryReserve(preferredPort);
    if (reservation === undefined) {
      throw new PumarejoError("PORT_UNAVAILABLE");
    }
    return reservation;
  }
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const reservation = await tryReserve(
      randomInt(MIN_HIGH_PORT, MAX_HIGH_PORT + 1),
    );
    if (reservation !== undefined) return reservation;
  }
  throw new PumarejoError("PORT_UNAVAILABLE");
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
      if (
        options.authorizeUpstream !== undefined &&
        !(await options.authorizeUpstream())
      ) {
        outgoing
          .writeHead(503, { "content-type": "application/json" })
          .end('{"value":{"error":"provider unavailable"}}');
        return;
      }

      const upstream = request(
        {
          host: "127.0.0.1",
          port: options.providerPort,
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
      server.listen(0, "127.0.0.1", resolve);
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
    close: async () => {
      const closing = closeServer(server);
      server.closeAllConnections();
      await closing;
    },
  };
}
