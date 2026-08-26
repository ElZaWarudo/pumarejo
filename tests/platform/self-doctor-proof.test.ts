import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  doctorSelf,
  SELF_DOCTOR_RELATIVE_ENTRY_MANIFEST,
} from "../../src/installer/self-doctor.js";

async function installationRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pumarejo-self-platform-"));
  for (const entry of SELF_DOCTOR_RELATIVE_ENTRY_MANIFEST) {
    const path = join(root, entry);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(
      path,
      entry === "package.json"
        ? JSON.stringify({
            name: "pumarejo",
            version: "0.1.0",
            bin: "./dist/cli/index.js",
            exports: { ".": "./dist/index.js" },
          })
        : "export {};\n",
      "utf8",
    );
  }
  return root;
}

describe("self-doctor platform proof", () => {
  it.runIf(process.platform === "win32")(
    "reports missing authoritative handle identity as platform unavailability",
    async () => {
      const root = await installationRoot();
      try {
        const report = await doctorSelf({
          installationRoot: root,
          platform: "win32",
        });

        expect(report.status).toBe("warn");
        expect(report.diagnostics).toContainEqual(
          expect.objectContaining({
            id: "self.package.metadata",
            code: "identity-unproven",
            status: "warn",
          }),
        );
        expect(report.diagnostics).toContainEqual(
          expect.objectContaining({
            id: "self.installation.paths",
            code: "identity-unproven",
            status: "warn",
          }),
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it.runIf(process.platform === "win32")(
    "does not let platform unavailability mask a missing required entry",
    async () => {
      const root = await installationRoot();
      try {
        await rm(join(root, "dist", "index.js"));
        const report = await doctorSelf({
          installationRoot: root,
          platform: "win32",
        });

        expect(report.status).toBe("error");
        expect(report.diagnostics).toContainEqual(
          expect.objectContaining({
            id: "self.installation.paths",
            status: "error",
          }),
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it.runIf(process.platform === "linux")(
    "does not follow a Linux symlink",
    async () => {
      const root = await installationRoot();
      const outside = await mkdtemp(
        join(tmpdir(), "pumarejo-self-platform-outside-"),
      );
      try {
        await rm(join(root, "dist", "index.js"));
        await symlink(
          join(outside, "private.js"),
          join(root, "dist", "index.js"),
        );
        const report = await doctorSelf({
          installationRoot: root,
          platform: "linux",
        });
        expect(report.diagnostics).toContainEqual(
          expect.objectContaining({
            id: "self.installation.links",
            status: "error",
          }),
        );
        expect(JSON.stringify(report)).not.toContain(outside);
      } finally {
        await rm(root, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform === "win32")(
    "does not follow a Windows junction",
    async () => {
      const root = await installationRoot();
      const outside = await mkdtemp(
        join(tmpdir(), "pumarejo-self-platform-outside-"),
      );
      try {
        await rm(join(root, "dist", "index.js"));
        await symlink(outside, join(root, "dist", "index.js"), "junction");
        const report = await doctorSelf({
          installationRoot: root,
          platform: "win32",
        });
        expect(report.diagnostics).toContainEqual(
          expect.objectContaining({
            id: "self.installation.links",
            status: "error",
          }),
        );
        expect(JSON.stringify(report)).not.toContain(outside);
      } finally {
        await rm(root, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    },
  );
});
