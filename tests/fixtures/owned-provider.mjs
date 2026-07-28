import { createServer } from "node:http";

const port = Number(process.env.TAURI_WEBDRIVER_PORT);
const providerNonce = process.env.TAURI_WEBDRIVER_NONCE;
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  !/^[a-f0-9]{64}$/u.test(providerNonce ?? "")
) {
  process.exit(2);
}

let sessionActive = false;
const server = createServer((request, response) => {
  if (
    request.headers["x-tauri-agent-provider-nonce"] !== providerNonce
  ) {
    response
      .writeHead(401, { "content-type": "application/json" })
      .end('{"value":{"error":"unauthorized"}}');
    return;
  }

  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  let status = 200;
  let value;
  if (request.method === "GET" && path === "/status") {
    value = { ready: true };
  } else if (request.method === "POST" && path === "/session") {
    sessionActive = true;
    value = { sessionId: "owned-session" };
  } else if (
    request.method === "GET" &&
    path === "/session/owned-session/window/handles" &&
    sessionActive
  ) {
    value = ["main"];
  } else if (
    request.method === "DELETE" &&
    path === "/session/owned-session" &&
    sessionActive
  ) {
    sessionActive = false;
    value = null;
  } else {
    status = 404;
    value = { error: "unknown command" };
  }
  response
    .writeHead(status, { "content-type": "application/json" })
    .end(JSON.stringify({ value }));
});

server.listen(port, "127.0.0.1");

function close() {
  server.close(() => process.exit(0));
}

process.once("SIGTERM", close);
process.once("SIGINT", close);
