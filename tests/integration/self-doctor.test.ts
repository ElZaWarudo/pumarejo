import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/index.js";
import { SELF_DOCTOR_RELATIVE_ENTRY_MANIFEST } from "../../src/installer/self-doctor.js";

describe("pumarejo doctor --self", () => {
  it("emits the same bounded identities through JSON and human projections", async () => {
    const json: string[] = [];
    const human: string[] = [];
    const io = (output: string[]) => ({
      stdout: (text: string) => output.push(text),
      stderr: () => undefined,
    });

    await expect(
      runCli(["doctor", "--self", "--json"], undefined, io(json)),
    ).resolves.toBe(0);
    await expect(
      runCli(["doctor", "--self"], undefined, io(human)),
    ).resolves.toBe(0);

    const report = JSON.parse(json.join("")) as {
      version: number;
      mode: string;
      diagnostics: Array<{ id: string }>;
    };
    expect(report).toMatchObject({ version: 1, mode: "self" });
    for (const diagnostic of report.diagnostics) {
      expect(human.join("")).toContain(`] ${diagnostic.id}:`);
    }
  });

  it("does not modify the reviewed package entries", async () => {
    const root = join(import.meta.dirname, "..", "..");
    const before = await Promise.all(
      SELF_DOCTOR_RELATIVE_ENTRY_MANIFEST.map(
        async (entry) =>
          [entry, await readFile(join(root, entry), "utf8")] as const,
      ),
    );
    const result = await runCli(["doctor", "--self", "--json"], undefined, {
      stdout: () => undefined,
      stderr: () => undefined,
    });
    const after = await Promise.all(
      SELF_DOCTOR_RELATIVE_ENTRY_MANIFEST.map(
        async (entry) =>
          [entry, await readFile(join(root, entry), "utf8")] as const,
      ),
    );

    expect(result).toBe(0);
    expect(after).toEqual(before);
  });

  it("keeps the self mode independent from a project path", async () => {
    const result = await runCli(
      ["doctor", "--self", "--project", "."],
      undefined,
      {
        stdout: () => undefined,
        stderr: () => undefined,
      },
    );

    expect(result).toBe(2);
  });
});
