import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_NAME,
  TauriAgentError,
  projectConfigSchema,
} from "../../src/index.js";
import { VERSION } from "../../src/cli/index.js";

describe("public package surface", () => {
  it("exports configuration and error contracts from the root", () => {
    expect(CONFIG_FILE_NAME).toBe(".tauri-agent.json");
    expect(projectConfigSchema).toBeDefined();
    expect(TauriAgentError).toBeTypeOf("function");
  });

  it("declares a strict ESM package and executable", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve("package.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(packageJson).toMatchObject({
      name: "@cie/tauri-agent",
      type: "module",
      private: true,
      bin: { "tauri-agent": "./dist/cli/index.js" },
    });
    expect(packageJson.version).toBe(VERSION);
    await expect(access(resolve("src/cli/index.ts"))).resolves.toBeUndefined();
  });
});
