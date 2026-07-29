import { loadProjectConfig } from "../config/load.js";
import type { McpHost } from "./parse.js";

export async function printMcpConfig(
  projectPath: string,
  host: McpHost,
): Promise<string> {
  const loaded = await loadProjectConfig(projectPath);
  const args = ["mcp", "--project", loaded.projectRoot];
  if (host === "codex") {
    return [
      "[mcp_servers.pumarejo]",
      'command = "pumarejo"',
      `args = ${JSON.stringify(args)}`,
      "",
    ].join("\n");
  }
  return `${JSON.stringify(
    {
      mcpServers: {
        pumarejo: {
          command: "pumarejo",
          args,
        },
      },
    },
    null,
    2,
  )}\n`;
}
