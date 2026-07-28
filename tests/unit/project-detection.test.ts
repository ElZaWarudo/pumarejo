import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { generateProjectConfig } from "../../src/config/generate.js";
import {
  detectTauriProject,
  ProjectDetectionError,
} from "../../src/installer/project.js";

const FIXTURES_ROOT = join(import.meta.dirname, "..", "fixtures", "projects");
const temporaryDirectories: string[] = [];

async function copyFixture(name: string): Promise<string> {
  const destination = await mkdtemp(join(tmpdir(), "tauri-agent-project-"));
  temporaryDirectories.push(destination);
  const { cp } = await import("node:fs/promises");
  await cp(join(FIXTURES_ROOT, name), destination, { recursive: true });
  return destination;
}

async function snapshotTree(root: string): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const entries: string[] = [];

  async function visit(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const path = join(directory, child.name);
      const relativePath = path.slice(root.length + 1);
      const metadata = await lstat(path);
      if (child.isDirectory()) {
        entries.push(`d:${relativePath}`);
        await visit(path);
      } else {
        entries.push(
          `f:${relativePath}:${metadata.size}:${await readFile(path, "utf8")}`,
        );
      }
    }
  }

  await visit(root);
  return entries.join("\n");
}

async function expectReadOnlyFailure(
  project: string,
  reason: string,
): Promise<void> {
  const before = await snapshotTree(project);
  await expect(detectTauriProject(project)).rejects.toMatchObject({
    name: "ProjectDetectionError",
    reason,
  });
  expect(await snapshotTree(project)).toBe(before);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("detectTauriProject", () => {
  it.each([
    [
      "pnpm-json",
      "pnpm",
      ["tauri", "dev", "--features", "tauri-agent"],
      "json",
    ],
    [
      "npm-json5",
      "npm",
      ["run", "tauri", "--", "dev", "--features", "tauri-agent"],
      "json5",
    ],
    [
      "yarn-toml",
      "yarn",
      ["tauri", "dev", "--features", "tauri-agent"],
      "toml",
    ],
    ["bun-json", "bun", ["tauri", "dev", "--features", "tauri-agent"], "json"],
    [
      "deno-json",
      "deno",
      ["task", "tauri", "dev", "--features", "tauri-agent"],
      "json",
    ],
    [
      "cargo-json",
      "cargo",
      ["tauri", "dev", "--features", "tauri-agent"],
      "json",
    ],
  ] as const)(
    "derives the canonical %s launch profile",
    async (fixture, command, prefix, format) => {
      const project = await copyFixture(fixture);

      const detected = await detectTauriProject(project);

      expect(detected.packageManager).toBe(command);
      expect(detected.tauriConfig.format).toBe(format);
      expect(detected.primaryWindowLabel).toBe("main");
      expect(detected.launch).toEqual({
        command,
        args: [...prefix, "--config", "{tauriConfig}"],
      });
      expect(
        detected.launch.args.join(" ").match(/\{tauriConfig\}/g),
      ).toHaveLength(1);
    },
  );

  it("generates the validated public project configuration", async () => {
    const project = await copyFixture("pnpm-json");
    const detected = await detectTauriProject(project);

    expect(generateProjectConfig(detected)).toEqual({
      version: 1,
      launch: detected.launch,
      window: "main",
      artifactsDirectory: ".tauri-agent/artifacts",
      retainArtifacts: false,
    });
  });

  it.each([
    ["rejects Tauri 1", "cargo-v1", "TAURI_VERSION_UNSUPPORTED"],
    ["rejects a missing configuration", "missing-config", "CONFIG_MISSING"],
    [
      "rejects multiple base configurations",
      "multiple-configs",
      "CONFIG_AMBIGUOUS",
    ],
    [
      "rejects multiple package-manager lockfiles",
      "multiple-lockfiles",
      "PACKAGE_MANAGER_AMBIGUOUS",
    ],
    ["rejects a shell-shaped script", "ambiguous-script", "SCRIPT_AMBIGUOUS"],
  ] as const)(
    "%s without modifying the project",
    async (_, fixture, reason) => {
      const project = await copyFixture(fixture);
      await expectReadOnlyFailure(project, reason);
    },
  );

  it.each([
    [
      "missing Cargo manifest",
      "PROJECT_STRUCTURE_MISSING",
      async (project: string) => rm(join(project, "src-tauri", "Cargo.toml")),
    ],
    [
      "malformed Tauri configuration",
      "CONFIG_INVALID",
      async (project: string) =>
        writeFile(
          join(project, "src-tauri", "tauri.conf.json"),
          '{"app":',
          "utf8",
        ),
    ],
    [
      "unsupported package-manager shape",
      "PACKAGE_MANAGER_UNSUPPORTED",
      async (project: string) => rm(join(project, "pnpm-lock.yaml")),
    ],
    [
      "Tauri 1 JavaScript CLI",
      "CLI_VERSION_UNSUPPORTED",
      async (project: string) =>
        writeFile(
          join(project, "package.json"),
          JSON.stringify({
            scripts: { tauri: "tauri" },
            devDependencies: { "@tauri-apps/cli": "1" },
          }),
          "utf8",
        ),
    ],
  ] as const)("rejects %s without writing", async (_, reason, prepare) => {
    const project = await copyFixture("pnpm-json");
    await prepare(project);
    await expectReadOnlyFailure(project, reason);
  });

  it("rejects linked project metadata instead of following it", async () => {
    const project = await copyFixture("pnpm-json");
    const tauriDirectory = join(project, "src-tauri");
    const outside = await mkdtemp(join(tmpdir(), "tauri-agent-outside-"));
    temporaryDirectories.push(outside);
    const { cp } = await import("node:fs/promises");
    await cp(tauriDirectory, outside, { recursive: true });
    await rm(tauriDirectory, { recursive: true });
    const { symlink } = await import("node:fs/promises");
    await symlink(
      outside,
      tauriDirectory,
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(detectTauriProject(project)).rejects.toBeInstanceOf(
      ProjectDetectionError,
    );
  });
});
