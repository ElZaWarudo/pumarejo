import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/index.js";
import { parseCliArgs } from "../../src/cli/parse.js";

describe("CLI contract", () => {
  it("parses the public project commands without executable overrides", () => {
    expect(parseCliArgs(["mcp", "--project", "."])).toEqual({
      kind: "command",
      command: "mcp",
      project: ".",
      dryRun: false,
      json: false,
    });

    expect(() =>
      parseCliArgs(["mcp", "--project", ".", "--command", "calc"]),
    ).toThrowError(/unknown option/i);
    expect(() => parseCliArgs(["init", "--scripts"])).toThrowError(
      /unknown option/i,
    );
  });

  it("distinguishes help, version, and invalid usage", () => {
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["--version"])).toEqual({ kind: "version" });
    expect(() => parseCliArgs(["mcp"])).toThrowError(/--project/);
    expect(() =>
      parseCliArgs(["mcp", "--project", `x${"a".repeat(4_096)}`]),
    ).toThrowError(/invalid path/);
  });

  it("executes help and version with the documented exit code", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    };

    await expect(runCli(["--help"], undefined, io)).resolves.toBe(0);
    await expect(runCli(["--version"], undefined, io)).resolves.toBe(0);
    expect(stdout.join("")).toContain("tauri-agent mcp --project <path>");
    expect(stdout.join("")).toContain("0.1.0");
    expect(stderr).toEqual([]);
  });

  it("keeps stdout clean when an MCP command fails before serving", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(
      runCli(["mcp", "--project", "."], undefined, {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      }),
    ).resolves.toBe(1);

    expect(stdout).toEqual([]);
    expect(JSON.parse(stderr.join(""))).toMatchObject({
      code: "CONFIG_INVALID",
      phase: "configuration",
    });
  });

  it("injects protocol and diagnostic channels into command handlers", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    };

    await expect(
      runCli(
        ["mcp", "--project", "."],
        async (_invocation, channels) => {
          channels.stdout('{"jsonrpc":"2.0"}\n');
          channels.stderr("diagnostic\n");
        },
        io,
      ),
    ).resolves.toBe(0);

    expect(stdout).toEqual(['{"jsonrpc":"2.0"}\n']);
    expect(stderr).toEqual(["diagnostic\n"]);
  });
});
