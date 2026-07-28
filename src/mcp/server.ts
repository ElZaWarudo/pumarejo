import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { PumarejoError, toErrorEnvelope } from "../shared/errors.js";
import { VERSION } from "../version.js";
import {
  type DomainResult,
  type ScreenshotDomainResult,
  type PumarejoDomainPorts,
} from "./domain-ports.js";
import { createPumarejoRuntime } from "./runtime.js";
import {
  clickInputSchema,
  emptyInputSchema,
  launchInputSchema,
  pressKeyInputSchema,
  screenshotInputSchema,
  typeInputSchema,
} from "./schemas.js";
import { PUMAREJO_TOOL_DESCRIPTIONS } from "./tools/index.js";

const MAX_STRUCTURED_RESULT_BYTES = 1024 * 1024;
const MAX_IMAGE_DATA_BYTES = 32 * 1024 * 1024;

function serializeResult(value: DomainResult): string {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_STRUCTURED_RESULT_BYTES) {
    throw new PumarejoError("INTERNAL_ERROR");
  }
  return serialized;
}

function successResult(value: DomainResult): CallToolResult {
  return {
    content: [{ type: "text", text: serializeResult(value) }],
    structuredContent: value,
  };
}

function failureResult(error: unknown): CallToolResult {
  const envelope = toErrorEnvelope(error);
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(envelope) }],
    structuredContent: { ...envelope },
  };
}

async function invoke(
  operation: () => Promise<DomainResult>,
): Promise<CallToolResult> {
  try {
    return successResult(await operation());
  } catch (error) {
    return failureResult(error);
  }
}

async function invokeScreenshot(
  operation: () => Promise<ScreenshotDomainResult>,
): Promise<CallToolResult> {
  try {
    const result = await operation();
    if (Buffer.byteLength(result.image.data, "utf8") > MAX_IMAGE_DATA_BYTES) {
      throw new PumarejoError("SCREENSHOT_FAILED");
    }
    return {
      content: [
        {
          type: "image",
          data: result.image.data,
          mimeType: result.image.mimeType,
        },
        { type: "text", text: serializeResult(result.metadata) },
      ],
      structuredContent: result.metadata,
    };
  } catch (error) {
    return failureResult(error);
  }
}

export function createMcpServer(ports: PumarejoDomainPorts): McpServer {
  const server = new McpServer({
    name: "pumarejo",
    version: VERSION,
  });

  server.registerTool(
    "tauri_launch",
    {
      description: PUMAREJO_TOOL_DESCRIPTIONS.tauri_launch,
      inputSchema: launchInputSchema,
    },
    (input, extra) =>
      invoke(() => ports.launch(input, { signal: extra.signal })),
  );
  server.registerTool(
    "tauri_snapshot",
    {
      description: PUMAREJO_TOOL_DESCRIPTIONS.tauri_snapshot,
      inputSchema: emptyInputSchema,
    },
    (_input, extra) => invoke(() => ports.snapshot({ signal: extra.signal })),
  );
  server.registerTool(
    "tauri_screenshot",
    {
      description: PUMAREJO_TOOL_DESCRIPTIONS.tauri_screenshot,
      inputSchema: screenshotInputSchema,
    },
    (input, extra) =>
      invokeScreenshot(() => ports.screenshot(input, { signal: extra.signal })),
  );
  server.registerTool(
    "tauri_click",
    {
      description: PUMAREJO_TOOL_DESCRIPTIONS.tauri_click,
      inputSchema: clickInputSchema,
    },
    (input, extra) =>
      invoke(() => ports.click(input, { signal: extra.signal })),
  );
  server.registerTool(
    "tauri_type",
    {
      description: PUMAREJO_TOOL_DESCRIPTIONS.tauri_type,
      inputSchema: typeInputSchema,
    },
    (input, extra) => invoke(() => ports.type(input, { signal: extra.signal })),
  );
  server.registerTool(
    "tauri_press_key",
    {
      description: PUMAREJO_TOOL_DESCRIPTIONS.tauri_press_key,
      inputSchema: pressKeyInputSchema,
    },
    (input, extra) =>
      invoke(() => ports.pressKey(input, { signal: extra.signal })),
  );
  server.registerTool(
    "tauri_close",
    {
      description: PUMAREJO_TOOL_DESCRIPTIONS.tauri_close,
      inputSchema: emptyInputSchema,
    },
    (_input, extra) => invoke(() => ports.close({ signal: extra.signal })),
  );

  return server;
}

export async function serveMcpOverStdio(
  projectPath: string,
): Promise<McpServer> {
  const runtime = await createPumarejoRuntime(projectPath);
  const server = createMcpServer(runtime);
  const transport = new StdioServerTransport();
  let handlingSignal = false;
  let cleanupReported = false;
  let shutdownPromise: Promise<void> | undefined;
  const shutdownRuntime = (): Promise<void> => {
    shutdownPromise ??= (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await runtime.shutdown();
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    })();
    return shutdownPromise;
  };
  const reportCleanupFailure = () => {
    if (!cleanupReported) {
      cleanupReported = true;
      process.stderr.write("pumarejo: owned runtime cleanup failed\n");
    }
    process.exitCode = 1;
  };
  const closeRuntime = () => {
    void shutdownRuntime()
      .catch(reportCleanupFailure)
      .finally(() => {
        process.off("SIGINT", onSigint);
        process.off("SIGTERM", onSigterm);
      });
  };
  const handleSignal = (exitCode: number) => {
    if (handlingSignal) return;
    handlingSignal = true;
    void shutdownRuntime()
      .catch(() => {
        reportCleanupFailure();
      })
      .then(async () => {
        await server.close();
      })
      .catch(() => {
        reportCleanupFailure();
      })
      .finally(() => {
        if (!cleanupReported) {
          process.exitCode = exitCode;
        }
      });
  };
  const onSigint = () => handleSignal(130);
  const onSigterm = () => handleSignal(143);
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  try {
    await server.connect(transport);
    server.server.onclose = closeRuntime;
  } catch (error) {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    await runtime.shutdown().catch(() => undefined);
    throw error;
  }
  return server;
}

export function isExpectedMcpError(error: unknown): error is PumarejoError {
  return error instanceof PumarejoError;
}
