import { join, posix } from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolveToolchain,
  resolveToolchains,
  type ToolchainFileSystem,
  type ToolchainKind,
  type ToolchainProbeRunner,
} from "../../src/platform/toolchain-resolver.js";

function fakeWindowsFileSystem(
  files: Readonly<Record<string, "file" | "link" | "reparse">>,
  shims: Readonly<Record<string, string>> = {},
  realpaths: Readonly<Record<string, string>> = {},
): ToolchainFileSystem {
  return {
    async lstat(path) {
      const kind = files[path];
      return kind === "file"
        ? { kind: "regular-file", executable: true }
        : kind === "link"
          ? { kind: "symbolic-link" }
          : kind === "reparse"
            ? { kind: "reparse-point" }
            : { kind: "missing" };
    },
    async realpath(path) {
      return realpaths[path] ?? path;
    },
    async readFile(path) {
      return shims[path] ?? "";
    },
  };
}

const probe: ToolchainProbeRunner = {
  async run(command, args) {
    expect(args.at(-1)).toBe("--version");
    const basename = command.toLowerCase();
    return {
      exitCode: 0,
      stdout: basename.includes("cargo")
        ? "cargo 1.2.3 (abc123 2026-01-01)\n"
        : basename.includes("rustc")
          ? "rustc 1.2.3 (abc123 2026-01-01)\n"
          : basename.includes("npm") || basename.includes("pnpm")
            ? "1.2.3\n"
            : "v1.2.3\n",
    };
  },
};

describe("portable toolchain resolver", () => {
  it("orders child PATH candidates, deduplicates identity, and resolves the matrix", async () => {
    const tools = "C:\\tinto-tools";
    const files: Record<string, "file"> = {};
    for (const kind of ["node", "npm", "pnpm", "cargo", "rustc"] as const) {
      files[join(tools, `${kind}.exe`)] = "file";
    }
    const result = await resolveToolchains({
      platform: "windows",
      environment: { Path: `${tools};${tools}` },
      fileSystem: fakeWindowsFileSystem(files),
      probeRunner: probe,
    });
    for (const kind of ["node", "npm", "pnpm", "cargo", "rustc"] as const) {
      expect(result[kind].accepted?.basename.toLowerCase()).toBe(`${kind}.exe`);
      expect(result[kind].accepted?.version).toBe("1.2.3");
      expect(
        result[kind].candidates.some(
          (candidate) => candidate.rejection === "duplicate",
        ),
      ).toBe(true);
    }
  });

  it("orders and labels explicit, child PATH, then platform-root candidates", async () => {
    const explicit = "C:\\explicit\\node.exe";
    const childDirectory = "C:\\child";
    const platformDirectory = "C:\\platform";
    const child = join(childDirectory, "node.exe");
    const platform = join(platformDirectory, "node.exe");
    const result = await resolveToolchain("node", {
      platform: "windows",
      environment: { PATH: childDirectory },
      explicit: { node: explicit },
      platformRoots: [platformDirectory],
      fileSystem: fakeWindowsFileSystem({
        [explicit]: "file",
        [child]: "file",
        [platform]: "file",
      }),
      probeRunner: probe,
    });

    expect(result.accepted?.path).toBe(explicit);
    expect(
      result.candidates
        .filter((candidate) => candidate.accepted)
        .map((candidate) => candidate.source),
    ).toEqual(["explicit", "child-path", "platform-root"]);
  });

  it("rejects symlink, reparse, non-executable, and malformed shim candidates", async () => {
    const tools = "C:\\tinto-unsafe";
    const node = join(tools, "node.exe");
    const npm = join(tools, "npm.cmd");
    const fs = fakeWindowsFileSystem(
      { [node]: "link", [npm]: "file" },
      { [npm]: '@echo off\n"%TEMP%\\node.exe" "%TEMP%\\npm-cli.js" %*' },
    );
    const nodeResult = await resolveToolchain("node", {
      platform: "windows",
      environment: { Path: tools },
      fileSystem: fs,
      probeRunner: probe,
    });
    expect(nodeResult.accepted).toBeUndefined();
    expect(
      nodeResult.candidates.find(
        (candidate) => candidate.rejection === "broken-link",
      ),
    ).toBeDefined();
    const npmResult = await resolveToolchain("npm", {
      platform: "windows",
      environment: { Path: tools },
      fileSystem: fs,
      probeRunner: probe,
    });
    expect(
      npmResult.candidates.find(
        (candidate) => candidate.rejection === "unsafe-shim",
      ),
    ).toBeDefined();
  });

  it("retains timeout and malformed probe evidence without accepting it", async () => {
    const tools = "C:\\tinto-probes";
    const node = join(tools, "node.exe");
    const fs = fakeWindowsFileSystem({ [node]: "file" });
    const timeout: ToolchainProbeRunner = {
      run: async () => ({ timedOut: true }),
    };
    const timeoutResult = await resolveToolchain("node", {
      platform: "windows",
      environment: { PATH: tools },
      fileSystem: fs,
      probeRunner: timeout,
    });
    expect(
      timeoutResult.candidates.find(
        (candidate) => candidate.rejection === "probe-timeout",
      ),
    ).toBeDefined();
    const malformed: ToolchainProbeRunner = {
      run: async () => ({ exitCode: 0, stdout: "node development" }),
    };
    const malformedResult = await resolveToolchain("node", {
      platform: "windows",
      environment: { PATH: tools },
      fileSystem: fs,
      probeRunner: malformed,
    });
    expect(
      malformedResult.candidates.find(
        (candidate) => candidate.rejection === "probe-invalid-output",
      ),
    ).toBeDefined();
  });

  it.each([
    ["nonzero", { exitCode: 9 }],
    ["missing", {}],
  ] as const)(
    "rejects a %s probe exit as probe-failed",
    async (_name, output) => {
      const tools = "C:\\tinto-failed-probe";
      const node = join(tools, "node.exe");
      const result = await resolveToolchain("node", {
        platform: "windows",
        environment: { PATH: tools },
        fileSystem: fakeWindowsFileSystem({ [node]: "file" }),
        probeRunner: { run: async () => output },
      });

      expect(result.accepted).toBeUndefined();
      expect(
        result.candidates.find((candidate) => candidate.path === node),
      ).toMatchObject({
        rejection: "probe-failed",
        probe: "failed",
      });
    },
  );

  it("rejects canonical targets outside the allowed roots before probing", async () => {
    const tools = "C:\\trusted";
    const node = join(tools, "node.exe");
    const escaped = "C:\\outside\\node.exe";
    let probes = 0;
    const result = await resolveToolchain("node", {
      platform: "windows",
      environment: { PATH: tools },
      allowedRoots: [tools],
      fileSystem: fakeWindowsFileSystem(
        { [node]: "file" },
        {},
        { [node]: escaped },
      ),
      probeRunner: {
        run: async () => {
          probes += 1;
          return { exitCode: 0, stdout: "v1.2.3" };
        },
      },
    });

    expect(probes).toBe(0);
    expect(
      result.candidates.find(
        (candidate) => candidate.rejection === "outside-root",
      ),
    ).toMatchObject({ path: escaped, accepted: false });
  });

  it("accepts a fixed safe npm shim and rejects a wrong-tool probe", async () => {
    const tools = "C:\\safe-shim";
    const npm = join(tools, "npm.cmd");
    const node = join(tools, "node.exe");
    const cli = "C:\\npm-cli.js";
    const shim = `@echo off\n"${node}" "${cli}" %*`;
    const npmResult = await resolveToolchain("npm", {
      platform: "windows",
      environment: { PATH: tools },
      fileSystem: fakeWindowsFileSystem(
        { [npm]: "file", [node]: "file", [cli]: "file" },
        { [npm]: shim },
      ),
      probeRunner: {
        async run(command, args) {
          expect(command).toBe(node);
          expect(args).toEqual([cli, "--version"]);
          return { exitCode: 0, stdout: "10.8.0" };
        },
      },
    });
    expect(npmResult.accepted).toMatchObject({
      path: npm,
      version: "10.8.0",
      shim: { command: node, args: [cli] },
    });

    const wrongTool = await resolveToolchain("node", {
      platform: "windows",
      environment: { PATH: tools },
      fileSystem: fakeWindowsFileSystem({ [node]: "file" }),
      probeRunner: {
        run: async () => ({ exitCode: 0, stdout: "cargo 1.2.3" }),
      },
    });
    expect(wrongTool.accepted).toBeUndefined();
    expect(
      wrongTool.candidates.find(
        (candidate) => candidate.rejection === "wrong-tool",
      ),
    ).toBeDefined();
  });

  it("rejects a generic CLI target that does not identify the requested tool", async () => {
    const tools = "C:\\wrong-shim";
    const npm = join(tools, "npm.cmd");
    const node = join(tools, "node.exe");
    const cli = join(tools, "other-cli.js");
    const result = await resolveToolchain("npm", {
      platform: "windows",
      environment: { PATH: tools },
      fileSystem: fakeWindowsFileSystem(
        { [npm]: "file", [node]: "file", [cli]: "file" },
        { [npm]: `@echo off\n"${node}" "${cli}" %*` },
      ),
      probeRunner: {
        run: async () => {
          throw new Error("wrong-tool shim must not be probed");
        },
      },
    });

    expect(result.accepted).toBeUndefined();
    expect(
      result.candidates.find(
        (candidate) => candidate.rejection === "unsafe-shim",
      ),
    ).toBeDefined();
  });

  it("accepts standard Cargo and rustc version suffixes", async () => {
    const tools = "/rust-tools";
    const files: ToolchainFileSystem = {
      async lstat(path) {
        return path === posix.join(tools, "cargo") ||
          path === posix.join(tools, "rustc")
          ? { kind: "regular-file", executable: true }
          : { kind: "missing" };
      },
      async realpath(path) {
        return path;
      },
      async readFile() {
        return "";
      },
    };
    const results = await resolveToolchains({
      platform: "linux",
      environment: { PATH: tools },
      fileSystem: files,
      probeRunner: {
        run: async (command) => ({
          exitCode: 0,
          stdout: command.endsWith("cargo")
            ? "cargo 1.93.1 (083ac5135 2025-12-15)"
            : command.endsWith("rustc")
              ? "rustc 1.93.1 (01f6ddf75 2026-02-11)"
              : "invalid",
        }),
      },
    });

    expect(results.cargo.accepted?.version).toBe("1.93.1");
    expect(results.rustc.accepted?.version).toBe("1.93.1");
  });

  it("rejects bare versions for labeled Node and Rust tools", async () => {
    const tools = "/wrong-version-shape";
    for (const kind of ["node", "cargo", "rustc"] as const) {
      const command = posix.join(tools, kind);
      const result = await resolveToolchain(kind, {
        platform: "linux",
        environment: { PATH: tools },
        fileSystem: {
          async lstat(path) {
            return path === command
              ? { kind: "regular-file", executable: true }
              : { kind: "missing" };
          },
          async realpath(path) {
            return path;
          },
          async readFile() {
            return "";
          },
        },
        probeRunner: {
          run: async () => ({ exitCode: 0, stdout: "1.2.3" }),
        },
      });
      expect(result.accepted).toBeUndefined();
      expect(
        result.candidates.find(
          (candidate) => candidate.rejection === "wrong-tool",
        ),
      ).toBeDefined();
    }
  });

  it("compares host and child identity without exposing paths", async () => {
    const hostTools = "C:\\host-tools";
    const childTools = "C:\\child-tools";
    const nodeHost = join(hostTools, "node.exe");
    const nodeChild = join(childTools, "node.exe");
    const fs = fakeWindowsFileSystem({
      [nodeHost]: "file",
      [nodeChild]: "file",
    });
    const result = await resolveToolchain("node", {
      platform: "windows",
      environment: { PATH: childTools },
      hostEnvironment: { PATH: hostTools },
      fileSystem: fs,
      probeRunner: probe,
    });
    expect(result.comparison?.disposition).toBe("environment_mismatch");
    expect(JSON.stringify(result.comparison)).not.toContain("C:\\");
  });

  it.each([
    ["unknown", false, false, "1.2.3", "1.2.3", "unknown"],
    ["child only", true, false, "1.2.3", "1.2.3", "child_only"],
    ["host only", false, true, "1.2.3", "1.2.3", "host_only"],
    ["same identity", true, true, "1.2.3", "1.2.3", "consistent"],
    [
      "different identity, same version",
      true,
      true,
      "1.2.3",
      "1.2.3",
      "environment_mismatch",
    ],
    [
      "different identity and version",
      true,
      true,
      "2.0.0",
      "1.2.3",
      "version_mismatch",
    ],
  ] as const)(
    "reports %s as %s",
    async (name, hasChild, hasHost, childVersion, hostVersion, disposition) => {
      const shared = name === "same identity";
      const childDirectory = shared ? "C:\\shared" : "C:\\child-compare";
      const hostDirectory = shared ? "C:\\shared" : "C:\\host-compare";
      const child = join(childDirectory, "node.exe");
      const host = join(hostDirectory, "node.exe");
      const files: Record<string, "file"> = {};
      if (hasChild) files[child] = "file";
      if (hasHost) files[host] = "file";
      const result = await resolveToolchain("node", {
        platform: "windows",
        environment: { PATH: childDirectory },
        hostEnvironment: { PATH: hostDirectory },
        fileSystem: fakeWindowsFileSystem(files),
        probeRunner: {
          run: async (command) => ({
            exitCode: 0,
            stdout: `v${command === child ? childVersion : hostVersion}`,
          }),
        },
      });

      expect(result.comparison?.disposition).toBe(disposition);
    },
  );

  it("uses executable mode checks for Linux fixtures", async () => {
    const tools = "/tinto-tools";
    const rustc = posix.join(tools, "rustc");
    const fs: ToolchainFileSystem = {
      async lstat(path) {
        return path === rustc
          ? { kind: "regular-file", executable: false }
          : { kind: "missing" };
      },
      async realpath(path) {
        return path;
      },
      async readFile() {
        return "";
      },
    };
    const result = await resolveToolchain("rustc", {
      platform: "linux",
      environment: { PATH: tools },
      fileSystem: fs,
      probeRunner: probe,
    });
    expect(result.candidates[0]?.rejection).toBe("not-executable");
  });
});
