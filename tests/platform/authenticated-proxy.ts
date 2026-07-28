import { timingSafeEqual } from "node:crypto";
import { createServer, request, type Server } from "node:http";

const NONCE_HEADER = "x-tauri-agent-session-nonce";
const PROVIDER_NONCE_HEADER = "x-tauri-agent-provider-nonce";
const ALLOWED = [
  /^\/status$/,
  /^\/session$/,
  /^\/session\/[^/]+$/,
  /^\/session\/[^/]+\/(?:window\/handles|title|execute\/sync|screenshot|element|elements|actions)$/,
  /^\/session\/[^/]+\/element\/[^/]+\/(?:click|value)$/,
  /^\/session\/[^/]+\/element\/[^/]+\/shadow$/,
  /^\/session\/[^/]+\/shadow\/[^/]+\/elements$/,
];

function sameSecret(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type AuthenticatedProxy = {
  port: number;
  close(): Promise<void>;
};

export async function startAuthenticatedProxy(options: {
  providerPort: number;
  nonce: string;
  providerNonce: string;
}): Promise<AuthenticatedProxy> {
  if (!Number.isInteger(options.providerPort) || options.providerPort < 1024) {
    throw new Error("provider port must be an unprivileged integer");
  }
  if (options.nonce.length < 32)
    throw new Error("nonce must be at least 32 characters");
  if (options.providerNonce.length < 32)
    throw new Error("provider nonce must be at least 32 characters");

  const server = createServer((incoming, outgoing) => {
    const path = new URL(incoming.url ?? "/", "http://127.0.0.1").pathname;
    const supplied = incoming.headers[NONCE_HEADER];
    const nonce = Array.isArray(supplied) ? supplied[0] : supplied;
    if (!sameSecret(nonce, options.nonce)) {
      outgoing.writeHead(401).end('{"value":{"error":"unauthorized"}}');
      return;
    }
    if (!ALLOWED.some((route) => route.test(path))) {
      outgoing.writeHead(404).end('{"value":{"error":"unknown command"}}');
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
          [PROVIDER_NONCE_HEADER]: options.providerNonce,
        },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end('{"value":{"error":"provider unavailable"}}');
    });
    incoming.pipe(upstream);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("proxy did not bind a TCP port");
  }
  return { port: address.port, close: () => closeServer(server) };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
