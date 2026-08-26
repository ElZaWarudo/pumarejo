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

import {
  defaultSelfDoctorFileSystem,
  inspectSelfDoctorPath,
  isSafeSelfDoctorRelativeEntry,
  validateSelfDoctorRelativeEntry,
  type SelfDoctorPathBudget,
} from "../../src/installer/self-doctor-paths.js";

const temporaryDirectories: string[] = [];

const authoritativeTestFileSystem = {
  ...defaultSelfDoctorFileSystem,
  async readVerifiedFile(
    path: string,
    _canonicalRoot: string,
    maxBytes: number,
  ) {
    const before = await defaultSelfDoctorFileSystem.lstat(path);
    const content = await readFile(path, "utf8");
    if (Buffer.byteLength(content, "utf8") > maxBytes) {
      throw new Error("file-too-large");
    }
    return {
      content,
      canonicalPath: await defaultSelfDoctorFileSystem.realpath(path),
      before,
      after: await defaultSelfDoctorFileSystem.lstat(path),
    };
  },
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("self-doctor path validation", () => {
  it.each([
    ["../outside", "parent-escape"],
    ["/outside", "absolute-path"],
    ["C:relative", "drive-relative-path"],
    ["\\\\server\\share", "separator-confused"],
    ["safe\\confused", "separator-confused"],
    [`safe${"\0"}entry`, "nul-path"],
  ] as const)("rejects %s before filesystem access", (entry, reason) => {
    const result = validateSelfDoctorRelativeEntry(entry, "win32");
    expect(result).toEqual({ ok: false, reason });
    expect(isSafeSelfDoctorRelativeEntry(entry, "win32")).toBe(false);
  });

  it("normalizes only harmless leading dot segments", () => {
    expect(validateSelfDoctorRelativeEntry("./dist/index.js", "linux")).toEqual(
      {
        ok: true,
        parts: ["dist", "index.js"],
      },
    );
    expect(isSafeSelfDoctorRelativeEntry("dist/index.js", "linux")).toBe(true);
  });

  it("checks every entry without following a link", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-self-path-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "index.js"), "export {}\n", "utf8");

    const inspection = await inspectSelfDoctorPath(root, "dist/index.js", {
      platform: "linux",
      fileSystem: authoritativeTestFileSystem,
    });

    expect(inspection).toMatchObject({
      status: "safe",
      kind: "regular-file",
      entry: "dist/index.js",
      content: "export {}\n",
    });
  });

  it.runIf(process.platform !== "win32")(
    "classifies a broken link and refuses an outside target",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "pumarejo-self-link-"));
      const outside = await mkdtemp(join(tmpdir(), "pumarejo-self-outside-"));
      temporaryDirectories.push(root, outside);
      await mkdir(join(root, "dist"));
      await symlink("missing.js", join(root, "dist", "index.js"));
      const broken = await inspectSelfDoctorPath(root, "dist/index.js", {
        platform: "linux",
      });
      expect(broken.status).toBe("broken-link");

      await rm(join(root, "dist", "index.js"));
      await symlink(join(outside, "secret.js"), join(root, "dist", "index.js"));
      const outsideLink = await inspectSelfDoctorPath(root, "dist/index.js", {
        platform: "linux",
      });
      expect(outsideLink).toMatchObject({
        status: "unsafe",
        reason: "absolute-path",
      });
      await expect(
        readFile(join(outside, "secret.js"), "utf8"),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("stops at the entry budget before broad traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-self-budget-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "index.js"), "export {}\n", "utf8");
    const budget: SelfDoctorPathBudget = { entries: 256, bytes: 0 };

    const inspection = await inspectSelfDoctorPath(root, "dist/index.js", {
      budget,
    });

    expect(inspection.status).toBe("budget");
    expect(inspection.reason).toBe("entry-limit");
    expect(budget.entries).toBe(256);
  });

  it("fails closed when the authoritative handle resolves outside the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-self-race-"));
    const outside = await mkdtemp(
      join(tmpdir(), "pumarejo-self-race-outside-"),
    );
    temporaryDirectories.push(root, outside);
    await mkdir(join(root, "dist"));
    const path = join(root, "dist", "index.js");
    await writeFile(path, "safe", "utf8");
    const metadata = await defaultSelfDoctorFileSystem.lstat(path);

    const inspection = await inspectSelfDoctorPath(root, "dist/index.js", {
      platform: "linux",
      fileSystem: {
        ...authoritativeTestFileSystem,
        async readVerifiedFile() {
          return {
            content: "outside",
            canonicalPath: join(outside, "index.js"),
            before: metadata,
            after: metadata,
          };
        },
      },
    });

    expect(inspection).toMatchObject({
      status: "unknown",
      reason: "identity-changed",
    });
    expect(inspection).not.toHaveProperty("content");
  });

  it("rejects canonical root widening before any file read", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-self-root-race-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "index.js"), "safe", "utf8");
    let reads = 0;

    const inspection = await inspectSelfDoctorPath(root, "dist/index.js", {
      platform: "linux",
      fileSystem: {
        ...authoritativeTestFileSystem,
        async realpath(path) {
          return path === root ? join(root, "..") : path;
        },
        async readVerifiedFile(path, canonicalRoot, maxBytes) {
          reads += 1;
          return await authoritativeTestFileSystem.readVerifiedFile(
            path,
            canonicalRoot,
            maxBytes,
          );
        },
      },
    });

    expect(inspection).toMatchObject({
      status: "unsafe",
      reason: "canonical-escape",
    });
    expect(reads).toBe(0);
  });

  it("caps each read to the remaining total-byte budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumarejo-self-bytes-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "index.js"), "ten-bytes!", "utf8");
    const budget: SelfDoctorPathBudget = {
      entries: 0,
      bytes: 8 * 1024 * 1024 - 4,
    };
    let observedLimit = 0;

    const inspection = await inspectSelfDoctorPath(root, "dist/index.js", {
      platform: "linux",
      budget,
      fileSystem: {
        ...authoritativeTestFileSystem,
        async readVerifiedFile(path, canonicalRoot, maxBytes) {
          observedLimit = maxBytes;
          return await authoritativeTestFileSystem.readVerifiedFile(
            path,
            canonicalRoot,
            maxBytes,
          );
        },
      },
    });

    expect(observedLimit).toBe(4);
    expect(inspection).toMatchObject({
      status: "budget",
      reason: "bytes-limit",
    });
    expect(budget.bytes).toBe(8 * 1024 * 1024 - 4);
  });
});
