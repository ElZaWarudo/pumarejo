import { Client } from "../../../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../../../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

const wrapper = new URL("./diagnostic-mcp-wrapper.mjs", import.meta.url);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [wrapper.pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1))],
  stderr: "pipe",
});
const client = new Client({ name: "rdm019-close-diagnostic", version: "1.0.0" });
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr = `${stderr}${chunk.toString("utf8")}`.slice(-16_000);
});

const structured = (result) => {
  if (result.isError) throw new Error(JSON.stringify(result.structuredContent));
  return result.structuredContent;
};

try {
  await client.connect(transport);
  let status = structured(await client.callTool({
    name: "tauri_launch",
    arguments: { mode: "visible", waitMs: 30_000 },
  }));
  const deadline = Date.now() + 600_000;
  while (status.state === "launching" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    status = structured(await client.callTool({ name: "tauri_status", arguments: {} }));
  }
  const firstClose = await client.callTool({ name: "tauri_close", arguments: {} });
  const afterFirst = await client.callTool({ name: "tauri_status", arguments: {} });
  const secondClose = await client.callTool({ name: "tauri_close", arguments: {} });
  const summarize = (value) => ({
    isError: value?.isError,
    state: value?.structuredContent?.state ?? value?.state,
    code: value?.structuredContent?.code,
    cleanupPending: value?.structuredContent?.cleanupPending ?? value?.cleanupPending,
    cleanupOutcome: value?.structuredContent?.cleanupOutcome ?? value?.cleanupOutcome,
    sessionIdPresent: Boolean(value?.structuredContent?.sessionId ?? value?.sessionId),
  });
  process.stdout.write(`${JSON.stringify({
    status: summarize(status),
    firstClose: summarize(firstClose),
    afterFirst: summarize(afterFirst),
    secondClose: summarize(secondClose),
    diagnosticCodes: [...stderr.matchAll(/\[diagnostic-code\] ([^\r\n]+)/gu)].map((match) => match[1]),
    stderrTail: stderr.slice(-4_000),
  })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ error: String(error), stderr })}\n`);
} finally {
  await client.close().catch(() => undefined);
}
