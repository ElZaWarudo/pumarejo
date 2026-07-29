import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { LoadedProjectConfig } from "../../src/config/load.js";
import { MODE_CONFIG_PLACEHOLDER } from "../../src/config/schema.js";
import { AGENT_PERMISSIONS } from "../../src/installer/capabilities.js";
import {
  linuxDisplayEnvironment,
  prepareLinuxLaunch,
} from "../../src/platform/linux/launch.js";
import { sanitizedLaunchEnvironment } from "../../src/platform/launch-environment.js";
import {
  createRuntimeOverlay,
  readRuntimeOverlay,
} from "../../src/platform/mode-config.js";
import { tauriCliArgs } from "../../src/platform/tauri-command.js";
import { prepareWindowsLaunch } from "../../src/platform/windows/launch.js";

const roots: string[] = [];
const hostPlatform = process.platform === "win32" ? "windows" : "linux";

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function fixture(command = "pnpm"): Promise<LoadedProjectConfig> {
  const projectRoot = await mkdtemp(join(tmpdir(), "pumarejo-mode-"));
  roots.push(projectRoot);
  await mkdir(join(projectRoot, ".pumarejo"));
  await writeFile(
    join(projectRoot, "package.json"),
    '{"private":true,"devDependencies":{"@tauri-apps/cli":"2.11.4"}}\n',
  );
  const requireFromFixture = createRequire(
    resolve("tests/fixtures/tauri-app/package.json"),
  );
  const cliPackage = dirname(
    requireFromFixture.resolve("@tauri-apps/cli/tauri.js"),
  );
  const dependencyScope = join(projectRoot, "node_modules", "@tauri-apps");
  await mkdir(dependencyScope, { recursive: true });
  await symlink(
    cliPackage,
    join(dependencyScope, "cli"),
    process.platform === "win32" ? "junction" : "dir",
  );
  return {
    projectRoot,
    configPath: join(projectRoot, ".pumarejo.json"),
    artifactsPath: join(projectRoot, ".pumarejo", "artifacts"),
    config: {
      version: 1,
      launch: {
        command,
        args: [
          "tauri",
          "dev",
          "--features",
          "pumarejo",
          "--config",
          MODE_CONFIG_PLACEHOLDER,
        ],
      },
      window: "primary",
      artifactsDirectory: ".pumarejo/artifacts",
      retainArtifacts: false,
    },
  };
}

describe("mode-specific platform launch", () => {
  it.each([
    ["pnpm", ["tauri", "dev"], ["dev"]],
    ["npm", ["run", "tauri", "--", "dev"], ["dev"]],
    ["yarn", ["tauri", "dev"], ["dev"]],
    ["bun", ["tauri", "dev"], ["dev"]],
    ["deno", ["task", "tauri", "dev"], ["dev"]],
    ["cargo", ["tauri", "dev"], undefined],
  ] as const)(
    "normalizes the canonical %s profile without a package-manager wrapper",
    (command, args, expected) => {
      expect(tauriCliArgs(command, args)).toEqual(expected);
    },
  );

  it.each([
    ["visible", true],
    ["background", false],
  ] as const)(
    "writes an isolated %s overlay and removes it",
    async (mode, visible) => {
      const loaded = await fixture();
      const overlay = await createRuntimeOverlay({
        projectRoot: loaded.projectRoot,
        platform: hostPlatform,
        mode,
        windowLabel: loaded.config.window,
      });

      await expect(readRuntimeOverlay(overlay.path)).resolves.toEqual({
        app: { windows: [{ label: "primary", visible }] },
      });
      expect(resolve(overlay.path).startsWith(loaded.projectRoot)).toBe(true);
      await overlay.cleanup();
      await expect(access(overlay.path)).rejects.toThrow();
    },
  );

  it("adds the generated agent capability only to the runtime overlay", async () => {
    const loaded = await fixture();
    const tauriDirectory = join(loaded.projectRoot, "src-tauri");
    const capabilityDirectory = join(tauriDirectory, "capabilities");
    const sourceCapability = {
      identifier: "default",
      windows: ["primary"],
      permissions: ["core:default"],
    };
    const agentCapability = {
      identifier: "pumarejo-agent",
      windows: ["primary"],
      permissions: [...AGENT_PERMISSIONS],
    };
    await mkdir(capabilityDirectory, { recursive: true });
    await writeFile(
      join(tauriDirectory, "tauri.conf.json"),
      JSON.stringify({ app: { windows: [{ label: "primary" }] } }),
      "utf8",
    );
    const sourcePath = join(capabilityDirectory, "default.json");
    await writeFile(sourcePath, JSON.stringify(sourceCapability), "utf8");
    await writeFile(
      join(loaded.projectRoot, ".pumarejo", "agent-capability.json"),
      JSON.stringify(agentCapability),
      "utf8",
    );

    const overlay = await createRuntimeOverlay({
      projectRoot: loaded.projectRoot,
      platform: hostPlatform,
      mode: "background",
      windowLabel: loaded.config.window,
    });

    await expect(readRuntimeOverlay(overlay.path)).resolves.toMatchObject({
      app: {
        security: { capabilities: [agentCapability] },
      },
    });
    await expect(readFile(sourcePath, "utf8")).resolves.toBe(
      JSON.stringify(sourceCapability),
    );
    await overlay.cleanup();
  });

  it.each([
    {
      identifier: "pumarejo-agent",
      windows: ["*"],
      permissions: [...AGENT_PERMISSIONS],
    },
    {
      identifier: "pumarejo-agent",
      windows: ["primary", "secondary"],
      permissions: [...AGENT_PERMISSIONS],
    },
    {
      identifier: "pumarejo-agent",
      windows: ["primary"],
      permissions: [...AGENT_PERMISSIONS, "core:default"],
    },
    {
      identifier: "pumarejo-agent",
      windows: ["primary"],
      permissions: [...AGENT_PERMISSIONS],
      remote: { urls: ["https://example.test"] },
    },
  ])("rejects an authority-bearing capability superset", async (capability) => {
    const loaded = await fixture();
    await writeFile(
      join(loaded.projectRoot, ".pumarejo", "agent-capability.json"),
      JSON.stringify(capability),
      "utf8",
    );

    await expect(
      createRuntimeOverlay({
        projectRoot: loaded.projectRoot,
        platform: hostPlatform,
        mode: "background",
        windowLabel: loaded.config.window,
      }),
    ).rejects.toMatchObject({ code: "INTEGRATION_INCOMPLETE" });
  });

  it("refuses cleanup through a replaced agent-directory link", async () => {
    const loaded = await fixture();
    const overlay = await createRuntimeOverlay({
      projectRoot: loaded.projectRoot,
      platform: hostPlatform,
      mode: "background",
      windowLabel: loaded.config.window,
    });
    const agentDirectory = join(loaded.projectRoot, ".pumarejo");
    const originalAgentDirectory = join(
      loaded.projectRoot,
      ".pumarejo-original",
    );
    const outside = await mkdtemp(join(tmpdir(), "pumarejo-outside-"));
    roots.push(outside);
    const redirectedRuntime = join(outside, basename(overlay.directory));
    await rename(agentDirectory, originalAgentDirectory);
    await mkdir(redirectedRuntime);
    const sentinel = join(redirectedRuntime, "sentinel.txt");
    await writeFile(sentinel, "do not delete", "utf8");
    await symlink(
      outside,
      agentDirectory,
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(overlay.cleanup()).rejects.toMatchObject({
      code: "INTEGRATION_INCOMPLETE",
    });
    await expect(readFile(sentinel, "utf8")).resolves.toBe("do not delete");

    await rm(agentDirectory, { force: true });
    await rename(originalAgentDirectory, agentDirectory);
    await overlay.cleanup();
  });

  it("preserves the complete Tauri window array while applying mode visibility", async () => {
    const loaded = await fixture();
    const tauriDirectory = join(loaded.projectRoot, "src-tauri");
    await mkdir(tauriDirectory);
    await writeFile(
      join(tauriDirectory, "tauri.conf.json"),
      JSON.stringify({
        app: {
          windows: [
            {
              label: "primary",
              title: "Developer title",
              url: "custom.html",
              width: 901,
              visible: true,
            },
            {
              label: "secondary",
              title: "Secondary",
              height: 602,
              visible: true,
            },
          ],
        },
      }),
      "utf8",
    );
    await writeFile(
      join(tauriDirectory, `tauri.${hostPlatform}.conf.json`),
      JSON.stringify({
        app: {
          windows: [
            {
              label: "primary",
              title: "Platform title",
              url: "platform.html",
              width: 902,
              visible: true,
            },
            {
              label: "secondary",
              title: "Platform secondary",
              height: 603,
              visible: true,
            },
          ],
        },
      }),
      "utf8",
    );

    const overlay = await createRuntimeOverlay({
      projectRoot: loaded.projectRoot,
      platform: hostPlatform,
      mode: "background",
      windowLabel: loaded.config.window,
    });
    await expect(readRuntimeOverlay(overlay.path)).resolves.toEqual({
      app: {
        windows: [
          {
            label: "primary",
            title: "Platform title",
            url: "platform.html",
            width: 902,
            visible: false,
          },
          {
            label: "secondary",
            title: "Platform secondary",
            height: 603,
            visible: false,
          },
        ],
      },
    });
    await overlay.cleanup();
  });

  it("uses the sole effective platform-specific window label", async () => {
    const loaded = await fixture();
    const tauriDirectory = join(loaded.projectRoot, "src-tauri");
    await mkdir(tauriDirectory);
    await writeFile(
      join(tauriDirectory, "tauri.conf.json"),
      JSON.stringify({
        app: { windows: [{ label: "primary", title: "Base" }] },
      }),
      "utf8",
    );
    await writeFile(
      join(tauriDirectory, `tauri.${hostPlatform}.conf.json`),
      JSON.stringify({
        app: { windows: [{ label: "platform-main", title: "Platform" }] },
      }),
      "utf8",
    );

    const overlay = await createRuntimeOverlay({
      projectRoot: loaded.projectRoot,
      platform: hostPlatform,
      mode: "visible",
      windowLabel: "primary",
    });
    expect(overlay.windowLabel).toBe("platform-main");
    await expect(readRuntimeOverlay(overlay.path)).resolves.toEqual({
      app: {
        windows: [{ label: "platform-main", title: "Platform", visible: true }],
      },
    });
    await overlay.cleanup();
  });

  it("configures visible and isolated-X11 Linux environments without mutating input", () => {
    const source = {
      DISPLAY: ":0",
      WAYLAND_DISPLAY: "wayland-0",
      PUMAREJO_BACKGROUND_DISPLAY: "127.0.0.1:99",
    };
    expect(linuxDisplayEnvironment("visible", source)).toMatchObject({
      DISPLAY: ":0",
      WAYLAND_DISPLAY: "wayland-0",
      GDK_BACKEND: "x11",
    });
    expect(linuxDisplayEnvironment("background", source)).toMatchObject({
      DISPLAY: "127.0.0.1:99",
      WAYLAND_DISPLAY: undefined,
      GDK_BACKEND: "x11",
    });
    expect(source).toEqual({
      DISPLAY: ":0",
      WAYLAND_DISPLAY: "wayland-0",
      PUMAREJO_BACKGROUND_DISPLAY: "127.0.0.1:99",
    });
    expect(() => linuxDisplayEnvironment("background", {})).toThrowError(
      expect.objectContaining({ code: "BACKGROUND_UNAVAILABLE" }),
    );
  });

  it("passes only toolchain and display variables to an application child", () => {
    const source = {
      PATH: "/tools",
      HOME: "/home/developer",
      DISPLAY: ":0",
      CARGO_TARGET_DIR: "/tmp/target",
      OPENAI_API_KEY: "must-not-leak",
      AWS_SECRET_ACCESS_KEY: "must-not-leak",
      INTERNAL_AUTH_TOKEN: "must-not-leak",
    };
    expect(sanitizedLaunchEnvironment("linux", source)).toEqual({
      PATH: "/tools",
      HOME: "/home/developer",
      DISPLAY: ":0",
      CARGO_TARGET_DIR: "/tmp/target",
    });
    expect(
      sanitizedLaunchEnvironment("windows", {
        Path: "C:\\tools",
        USERPROFILE: "C:\\Users\\developer",
        RUSTUP_TOOLCHAIN: "stable-msvc",
        OPENAI_API_KEY: "must-not-leak",
      }),
    ).toEqual({
      Path: "C:\\tools",
      USERPROFILE: "C:\\Users\\developer",
      RUSTUP_TOOLCHAIN: "stable-msvc",
    });
  });

  it.runIf(process.platform === "win32")(
    "resolves a Windows package-manager shim to node plus a fixed CLI without a shell",
    async () => {
      const loaded = await fixture();
      const prepared = await prepareWindowsLaunch(loaded, "background", {});
      expect(prepared.request.command.toLowerCase()).toMatch(/node\.exe$/u);
      expect(prepared.request.args[0]?.toLowerCase()).toMatch(
        /@tauri-apps.*cli.*tauri\.js$/u,
      );
      expect(prepared.request.args).toContain("--config");
      const overlayPath =
        prepared.request.args[prepared.request.args.indexOf("--config") + 1];
      expect(await readFile(String(overlayPath), "utf8")).toContain(
        '"visible": false',
      );
      await prepared.cleanup();
    },
  );

  it.runIf(process.platform === "win32")(
    "resolves Windows commands from the configured PATH prepend",
    async () => {
      const loaded = await fixture("cargo");
      const tools = await mkdtemp(join(tmpdir(), "pumarejo-tools-"));
      roots.push(tools);
      const executable = join(tools, "cargo.exe");
      const decoyWhere = join(tools, "where.exe");
      await writeFile(executable, "");
      await writeFile(decoyWhere, "");
      loaded.config.launch.pathPrepend = [tools];
      const prepared = await prepareWindowsLaunch(loaded, "visible", {
        Path: join(process.env.SystemRoot ?? "C:\\Windows", "System32"),
        SystemRoot: process.env.SystemRoot,
      });

      expect(prepared.request.command).toBe(executable);
      await prepared.cleanup();
    },
  );

  it.runIf(process.platform === "win32")(
    "parses an explicit package-manager cmd shim without spawning a shell",
    async () => {
      const loaded = await fixture("pnpm");
      const tools = await mkdtemp(join(tmpdir(), "pumarejo-shim-"));
      roots.push(tools);
      const cli = join(tools, "pnpm-cli.js");
      const shim = join(tools, "pnpm.cmd");
      await writeFile(cli, "");
      await writeFile(shim, `@"${process.execPath}" "${cli}" %*\n`);
      loaded.config.launch.executablePath = shim;
      const prepared = await prepareWindowsLaunch(loaded, "visible", {});

      expect(prepared.request.command).toBe(process.execPath);
      expect(prepared.request.args[0]).toBe(cli);
      await prepared.cleanup();
    },
  );

  it.runIf(process.platform === "linux")(
    "resolves the Linux executable and materializes the display environment",
    async () => {
      const loaded = await fixture();
      const prepared = await prepareLinuxLaunch(loaded, "visible", {
        DISPLAY: ":0",
        PATH: process.env.PATH,
      });
      expect(resolve(prepared.request.command)).toBe(prepared.request.command);
      expect(prepared.request.env.DISPLAY).toBe(":0");
      await prepared.cleanup();
    },
  );

  it.runIf(process.platform === "linux")(
    "resolves Linux commands from the configured PATH prepend",
    async () => {
      const loaded = await fixture("cargo");
      const tools = await mkdtemp(join(tmpdir(), "pumarejo-tools-"));
      roots.push(tools);
      const executable = join(tools, "cargo");
      await writeFile(executable, "#!/bin/sh\nexit 0\n");
      await import("node:fs/promises").then(({ chmod }) =>
        chmod(executable, 0o755),
      );
      loaded.config.launch.pathPrepend = [tools];
      const prepared = await prepareLinuxLaunch(loaded, "visible", {
        DISPLAY: ":0",
        PATH: "/usr/bin:/bin",
      });

      expect(prepared.request.command).toBe(executable);
      await prepared.cleanup();
    },
  );
});
