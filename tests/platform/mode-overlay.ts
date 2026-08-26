import { readFile } from "node:fs/promises";

export type LaunchMode = "visible" | "background";

export async function readBaseConfig(
  path: string,
): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

/** Overlay used by the proof only; it never mutates tauri.conf.json. */
export function createModeOverlay(mode: LaunchMode): Record<string, unknown> {
  return {
    app: {
      windows: [{ label: "main", visible: mode === "visible" }],
    },
    // The fixture opts into the provider broker only for the debug provider
    // launch overlay. Its normal application capability remains unchanged.
    security: {
      capabilities: [
        "default",
        {
          identifier: "pumarejo-dialog-fixture",
          windows: ["main"],
          permissions: ["wdio-webdriver:allow-request-dialog"],
        },
      ],
    },
  };
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}
