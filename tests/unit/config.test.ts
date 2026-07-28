import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CONFIG_FILE_NAME,
  loadProjectConfig,
  materializeLaunchProfile,
  projectConfigSchema,
  resolveProjectRoot,
} from "../../src/config/index.js";
import { PumarejoError } from "../../src/shared/errors.js";

const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), "pumarejo-config-"));
  temporaryDirectories.push(project);
  await mkdir(join(project, "src-tauri"));
  return project;
}

async function writeConfig(
  project: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const config = {
    version: 1,
    launch: {
      command: "pnpm",
      args: [
        "tauri",
        "dev",
        "--features",
        "pumarejo",
        "--config",
        "{tauriConfig}",
      ],
    },
    window: "main",
    artifactsDirectory: ".pumarejo/artifacts",
    ...overrides,
  };

  await writeFile(
    join(project, CONFIG_FILE_NAME),
    JSON.stringify(config),
    "utf8",
  );
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("projectConfigSchema", () => {
  it("accepts the v1 contract and applies safe defaults", () => {
    const parsed = projectConfigSchema.parse({
      version: 1,
      launch: {
        command: "pnpm",
        args: ["tauri", "dev", "--config", "{tauriConfig}"],
      },
      window: "main",
      artifactsDirectory: ".pumarejo/artifacts",
    });

    expect(parsed.retainArtifacts).toBe(false);
  });

  it.each([
    [{ version: 2 }, "version"],
    [{ webdriverPort: 1023 }, "webdriverPort"],
    [{ webdriverPort: 65536 }, "webdriverPort"],
    [{ unexpected: true }, "unexpected"],
    [
      {
        launch: {
          command: "pnpm && calc",
          args: ["tauri", "dev", "--config", "{tauriConfig}"],
        },
      },
      "command",
    ],
    [
      {
        launch: {
          command: "C:\\tools\\pnpm.cmd",
          args: ["tauri", "dev", "--config", "{tauriConfig}"],
        },
      },
      "command",
    ],
    [
      {
        launch: {
          command: "pnpm",
          args: ["tauri", "dev"],
        },
      },
      "{tauriConfig}",
    ],
    [
      {
        launch: {
          command: "pnpm",
          args: ["{tauriConfig}", "{tauriConfig}"],
        },
      },
      "{tauriConfig}",
    ],
  ])("rejects invalid or drifted configuration %#", (override, expected) => {
    const result = projectConfigSchema.safeParse({
      version: 1,
      launch: {
        command: "pnpm",
        args: ["tauri", "dev", "--config", "{tauriConfig}"],
      },
      window: "main",
      artifactsDirectory: ".pumarejo/artifacts",
      ...override,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain(expected);
    }
  });
});

describe("loadProjectConfig", () => {
  it("canonicalizes the project and resolves artifacts inside it", async () => {
    const project = await createProject();
    await writeConfig(project);

    const loaded = await loadProjectConfig(project);

    expect(loaded.projectRoot).toBe(await resolveProjectRoot(project));
    expect(loaded.artifactsPath).toBe(
      join(loaded.projectRoot, ".pumarejo", "artifacts"),
    );
    expect(loaded.config.retainArtifacts).toBe(false);
  });

  it("rejects artifact traversal", async () => {
    const project = await createProject();
    await writeConfig(project, { artifactsDirectory: "../outside" });

    await expect(loadProjectConfig(project)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });

  it("rejects the project root as an artifact directory", async () => {
    const project = await createProject();
    await writeConfig(project, { artifactsDirectory: "." });

    await expect(loadProjectConfig(project)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });

  it("rejects malformed JSON without exposing parser details", async () => {
    const project = await createProject();
    await writeFile(join(project, CONFIG_FILE_NAME), '{"version":', "utf8");

    await expect(loadProjectConfig(project)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: "The project configuration does not satisfy the v1 contract.",
    });
  });

  it("rejects an existing symlink in the artifact path", async () => {
    const project = await createProject();
    const outside = await mkdtemp(join(tmpdir(), "pumarejo-outside-"));
    temporaryDirectories.push(outside);
    await mkdir(join(project, ".pumarejo"));
    await symlink(
      outside,
      join(project, ".pumarejo", "artifacts"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await writeConfig(project);

    await expect(loadProjectConfig(project)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });

  it("rejects a project path that is itself a link", async () => {
    const project = await createProject();
    const link = `${project}-link`;
    temporaryDirectories.push(link);
    await symlink(
      project,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(resolveProjectRoot(link)).rejects.toBeInstanceOf(
      PumarejoError,
    );
  });

  it("rejects a project path reached through a linked parent", async () => {
    const project = await createProject();
    const container = await mkdtemp(join(tmpdir(), "pumarejo-parent-"));
    temporaryDirectories.push(container);
    const link = join(container, "linked-parent");
    await symlink(
      project,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(
      resolveProjectRoot(join(link, "src-tauri")),
    ).rejects.toBeInstanceOf(PumarejoError);
  });
});

describe("materializeLaunchProfile", () => {
  it("replaces only the approved placeholder and preserves argv literally", () => {
    const projectRoot = resolve("safe project");
    const configPath = join(projectRoot, ".pumarejo", "background.json");
    const command = materializeLaunchProfile(
      {
        command: "pnpm",
        args: [
          "tauri",
          "dev",
          "--label",
          "literal && value",
          "--config",
          "{tauriConfig}",
        ],
      },
      configPath,
      projectRoot,
    );

    expect(command).toEqual({
      command: "pnpm",
      args: [
        "tauri",
        "dev",
        "--label",
        "literal && value",
        "--config",
        configPath,
      ],
    });
    expect(command).not.toHaveProperty("shell");
  });

  it("rejects an overlay outside the trusted project", () => {
    expect(() =>
      materializeLaunchProfile(
        {
          command: "pnpm",
          args: ["tauri", "dev", "--config", "{tauriConfig}"],
        },
        resolve("outside", "background.json"),
        resolve("project"),
      ),
    ).toThrowError(PumarejoError);
  });
});
