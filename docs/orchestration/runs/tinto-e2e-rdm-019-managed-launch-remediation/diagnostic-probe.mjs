import { Client } from "../../../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../../../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

const wrapper = new URL("./diagnostic-mcp-wrapper.mjs", import.meta.url);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [wrapper.pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1))],
  stderr: "pipe",
});
const client = new Client({ name: "rdm019-diagnostic", version: "1.0.0" });
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr = `${stderr}${chunk.toString("utf8")}`.slice(-12_000);
});

try {
  await client.connect(transport);
  const launch = await client.callTool({
    name: "tauri_launch",
    arguments: { mode: "visible", waitMs: 30_000 },
  });
  process.stdout.write(`${JSON.stringify({ launch, stderr })}\n`);
} catch (error) {
  const status = await client
    .callTool({ name: "tauri_status", arguments: {} })
    .catch((cause) => ({ cause: String(cause) }));
  process.stdout.write(
    `${JSON.stringify({ error: String(error), status, stderr })}\n`,
  );
} finally {
  await client.callTool({ name: "tauri_close", arguments: {} }).catch(() => undefined);
  await client.close().catch(() => undefined);
}
