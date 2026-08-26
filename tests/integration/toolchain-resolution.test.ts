import { describe, expect, it } from "vitest";

import { DiagnosticStore } from "../../src/observability/diagnostics.js";
import { buildChildEnvironment } from "../../src/platform/launch-environment.js";
import {
  emitToolchainEvidence,
  projectToolchainEvidence,
} from "../../src/platform/toolchain-evidence.js";
import {
  resolveToolchain,
  type ToolchainFileSystem,
} from "../../src/platform/toolchain-resolver.js";

function fixtureFileSystem(path: string): ToolchainFileSystem {
  return {
    async lstat(candidate) {
      return candidate === path
        ? { kind: "regular-file", executable: true }
        : { kind: "missing" };
    },
    async realpath(candidate) {
      return candidate;
    },
    async readFile() {
      return "";
    },
  };
}

describe("toolchain resolution evidence integration", () => {
  it("resolves from the effective child environment and projects safe evidence", async () => {
    const environment = buildChildEnvironment({
      platform: "linux",
      host: { PATH: "/host", HOME: "/home/dev", OPENAI_API_KEY: "secret" },
      profile: { pathPrepend: ["/child"] },
    });
    const command = "/child/node";
    const resolution = await resolveToolchain("node", {
      platform: "linux",
      environment: environment.environment,
      explicit: { node: command },
      fileSystem: fixtureFileSystem(command),
      probeRunner: { run: async () => ({ exitCode: 0, stdout: "v22.1.0" }) },
    });
    expect(resolution.accepted?.path).toBe(command);
    const events = projectToolchainEvidence(
      { node: resolution },
      { sessionId: "session-1", environment: environment.comparison },
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.candidates[0]).toMatchObject({
      kind: "node",
      accepted: true,
      version: "22.1.0",
    });
    expect(JSON.stringify(events)).not.toContain("/child/node");
    expect(JSON.stringify(events)).not.toContain("OPENAI_API_KEY");
  });

  it("does not attribute evidence after ownership loss and keeps launch success independent", async () => {
    const resolution = {
      kind: "node" as const,
      outcome: "resolved" as const,
      candidates: [
        {
          kind: "node" as const,
          source: "child-path" as const,
          path: "C:\\secret\\node.exe",
          basename: "node.exe",
          identity: "0123456789abcdef",
          fileKind: "regular-file" as const,
          accepted: true,
          version: "22.1.0",
          probe: "success" as const,
        },
      ],
    };
    const sink = {
      append: async () => ({ accepted: true }),
    };
    const result = await emitToolchainEvidence(
      { node: resolution },
      {
        sessionId: "new-session",
        ownership: { sessionId: "old-session", active: false },
      },
      sink,
    );
    expect(result).toEqual({ emitted: 0, dropped: 0 });
  });

  it("isolates rejecting and throwing evidence sinks from launch success", async () => {
    const resolution = {
      kind: "node" as const,
      outcome: "resolved" as const,
      candidates: [
        {
          kind: "node" as const,
          source: "child-path" as const,
          path: "C:\\private\\node.exe",
          basename: "node.exe",
          identity: "0123456789abcdef",
          fileKind: "regular-file" as const,
          accepted: true,
          version: "22.1.0",
          probe: "success" as const,
        },
      ],
    };
    const context = { sessionId: "session-1" };

    await expect(
      emitToolchainEvidence({ node: resolution }, context, {
        append: async () => {
          throw new Error("sink unavailable");
        },
      }),
    ).resolves.toEqual({ emitted: 0, dropped: 1 });
    await expect(
      emitToolchainEvidence({ node: resolution }, context, {
        append: async () => ({ accepted: false }),
      }),
    ).resolves.toEqual({ emitted: 0, dropped: 1 });
    await expect(
      emitToolchainEvidence({ node: resolution }, context, {
        record: () => {
          throw new Error("diagnostic store unavailable");
        },
      }),
    ).resolves.toEqual({ emitted: 0, dropped: 1 });
    await expect(
      emitToolchainEvidence({ node: resolution }, context, {
        append: async () => ({ accepted: true }),
      }),
    ).resolves.toEqual({ emitted: 1, dropped: 0 });
  });

  it("adapts only sanitized events into the RDM-015 diagnostic store", async () => {
    const store = new DiagnosticStore({ sessionId: "session-1" });
    const resolution = {
      kind: "node" as const,
      outcome: "unavailable" as const,
      candidates: [
        {
          kind: "node" as const,
          source: "child-path" as const,
          path: "C:\\Users\\dev\\node.exe",
          basename: "node.exe",
          identity: "0123456789abcdef",
          fileKind: "regular-file" as const,
          accepted: false,
          rejection: "probe-timeout" as const,
          probe: "timeout" as const,
        },
      ],
    };
    const result = await emitToolchainEvidence(
      { node: resolution },
      { sessionId: "session-1" },
      store,
    );
    expect(result).toEqual({ emitted: 1, dropped: 0 });
    const records = store.query({}).records;
    expect(records).toHaveLength(1);
    expect(records[0]?.message).not.toContain("C:\\Users");
    expect(records[0]?.code).toBe("toolchain_resolution");
  });
});
