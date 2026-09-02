import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createWindowsArtifactNativeOperations } from "../../src/platform/windows/artifact-cleanup.js";
import { readWindowsMaintenanceIdentity } from "../../src/platform/windows/maintenance-identity.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe.runIf(process.platform === "win32")(
  "Windows identity-bound artifact deletion",
  () => {
    it("preflights and deletes a nested NTFS tree through held handles", async () => {
      const root = await mkdtemp(join(tmpdir(), "pumarejo-native-delete-"));
      roots.push(root);
      const target = join(root, "target");
      await mkdir(join(target, "nested"), { recursive: true });
      await writeFile(join(target, "one.txt"), "one", "utf8");
      await writeFile(join(target, "nested", "two.txt"), "two-two", "utf8");

      const operations = createWindowsArtifactNativeOperations();
      const expected = await operations.inspect(target);
      await expect(
        operations.preflight({ targetPath: target, expected }),
      ).resolves.toEqual({ files: 2, directories: 2, bytes: 10 });
      await expect(
        operations.delete({ targetPath: target, expected }),
      ).resolves.toEqual({ files: 2, directories: 2, bytes: 10 });
      await expect(
        readFile(join(target, "one.txt"), "utf8"),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
    }, 120_000);

    it("deletes a junction as a leaf without touching its external target", async () => {
      const root = await mkdtemp(join(tmpdir(), "pumarejo-native-junction-"));
      roots.push(root);
      const target = join(root, "target");
      const outside = join(root, "outside");
      await mkdir(target);
      await mkdir(outside);
      await writeFile(join(outside, "preserve.txt"), "preserve", "utf8");
      await symlink(outside, join(target, "linked"), "junction");

      const operations = createWindowsArtifactNativeOperations();
      const expected = await operations.inspect(target);
      await expect(
        operations.preflight({ targetPath: target, expected }),
      ).resolves.toEqual({ files: 0, directories: 2, bytes: 0 });
      await expect(
        operations.delete({ targetPath: target, expected }),
      ).resolves.toEqual({ files: 0, directories: 2, bytes: 0 });
      await expect(readFile(target, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(
        readFile(join(outside, "preserve.txt"), "utf8"),
      ).resolves.toBe("preserve");
    }, 120_000);

    it("rejects a manifested root that is itself a junction", async () => {
      const root = await mkdtemp(join(tmpdir(), "pumarejo-native-root-junction-"));
      roots.push(root);
      const outside = join(root, "outside");
      const target = join(root, "target");
      await mkdir(outside);
      await writeFile(join(outside, "preserve.txt"), "preserve", "utf8");
      await symlink(outside, target, "junction");

      const operations = createWindowsArtifactNativeOperations();
      const expected = await operations.inspect(target);
      await expect(
        operations.preflight({ targetPath: target, expected }),
      ).rejects.toThrow(/unsafe_(?:junction|mount_point)/u);
      await expect(
        readFile(join(outside, "preserve.txt"), "utf8"),
      ).resolves.toBe("preserve");
    }, 120_000);

    it("requires an elevated token before enabling maintenance privileges", async () => {
      const root = await mkdtemp(join(tmpdir(), "pumarejo-native-privilege-"));
      roots.push(root);
      const operations = createWindowsArtifactNativeOperations();
      const identity = await readWindowsMaintenanceIdentity();

      if (identity.elevatedAdministrator) {
        await expect(operations.inspect(root, true)).resolves.toMatchObject({
          canonicalPath: root,
        });
      } else {
        await expect(operations.inspect(root, true)).rejects.toThrow(
          /maintenance_privilege_unavailable/u,
        );
      }
    }, 120_000);
  },
);
