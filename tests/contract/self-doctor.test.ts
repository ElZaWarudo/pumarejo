import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/index.js";
import { parseCliArgs } from "../../src/cli/parse.js";
import {
  doctorSelf,
  SELF_DOCTOR_DIAGNOSTIC_IDS,
  SELF_DOCTOR_REPORT_VERSION,
} from "../../src/installer/self-doctor.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("self-doctor contract", () => {
  it("keeps self CLI selection explicit and unambiguous", () => {
    expect(parseCliArgs(["doctor", "--self"])).toMatchObject({
      kind: "command",
      command: "doctor",
      self: true,
      json: false,
      project: ".",
    });
    const jsonInvocation = parseCliArgs(["doctor", "--self", "--json"]);
    expect(jsonInvocation).toMatchObject({ kind: "command", self: true });
    expect(() =>
      parseCliArgs(["doctor", "--self", "--project", "."]),
    ).toThrowError(/cannot be combined/i);
  });

  it("retains the version and approved diagnostic namespace", () => {
    expect(SELF_DOCTOR_REPORT_VERSION).toBe(1);
    expect(SELF_DOCTOR_DIAGNOSTIC_IDS).toEqual([
      "self.package.metadata",
      "self.installation.paths",
      "self.installation.links",
      "self.dependencies.resolution",
      "self.installation.lockfile",
      "self.installation.binaries",
      "self.toolchain.node",
      "self.toolchain.package-manager",
      "self.toolchain.host-child",
      "self.report.bounds",
    ]);
  });

  it("bounds and sanitizes the JSON report before CLI serialization", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-self-contract-"));
    temporaryDirectories.push(root);
    const report = await doctorSelf({
      installationRoot: root,
      platform: "linux",
    });
    const serialized = JSON.stringify(report);

    expect(report.diagnostics.length).toBeLessThanOrEqual(32);
    for (const item of report.diagnostics) {
      expect(item.code.length).toBeLessThanOrEqual(64);
      expect(item.summary.length).toBeLessThanOrEqual(512);
      expect(item.action?.length ?? 0).toBeLessThanOrEqual(512);
      expect(Object.keys(item.evidence ?? {}).length).toBeLessThanOrEqual(16);
    }
    expect(serialized).not.toMatch(/[A-Za-z]:\\|\/private\/|\/Users\//u);
  });

  it("uses the existing usage-error route for invalid combinations", async () => {
    const stderr: string[] = [];
    await expect(
      runCli(["doctor", "--self", "--project", "."], undefined, {
        stdout: () => undefined,
        stderr: (text) => stderr.push(text),
      }),
    ).resolves.toBe(2);
    expect(stderr.join("")).toMatch(/cannot be combined/i);
  });
});
