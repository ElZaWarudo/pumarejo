import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ArtifactPermissionEnforcer } from "../../src/artifacts/permissions.js";
import {
  ArtifactStore,
  type ArtifactQuarantineDeletionRequest,
} from "../../src/artifacts/store.js";

const SESSION_ID = "a".repeat(32);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const temporaryDirectories: string[] = [];

async function project(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "pumarejo-artifacts-"));
  temporaryDirectories.push(path);
  return path;
}

function noOpPermissions(): ArtifactPermissionEnforcer {
  return { ensureOwnerOnly: vi.fn(async () => undefined) };
}

async function identityBoundDeleter(
  request: ArtifactQuarantineDeletionRequest,
) {
  await rm(request.quarantineRoot, { recursive: true, force: true });
  return {
    attested: true as const,
    root: request.root,
    entries: request.entries,
  };
}

afterEach(async () => {
  for (const path of temporaryDirectories.splice(0)) {
    await rm(path, { recursive: true, force: true });
  }
});

describe("ArtifactStore", () => {
  it("establishes owner-only permissions before writing any content", async () => {
    const root = await project();
    const observations: { kind: string; size: number }[] = [];
    const permissions: ArtifactPermissionEnforcer = {
      async ensureOwnerOnly(path, kind) {
        observations.push({ kind, size: (await stat(path)).size });
      },
    };
    const store = new ArtifactStore({
      projectRoot: root,
      artifactsRoot: join(root, ".pumarejo", "artifacts"),
      retainArtifacts: true,
      sessionId: SESSION_ID,
      permissions,
    });

    await store.open();
    await store.writePng(PNG);
    await store.close();

    const fileObservations = observations.filter(({ kind }) => kind === "file");
    expect(fileObservations.length).toBeGreaterThanOrEqual(4);
    expect(fileObservations.every(({ size }) => size === 0)).toBe(true);
  });

  it("deletes non-retained artifacts and keeps explicitly retained artifacts", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const disposable = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: false,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
      quarantineDeleter: identityBoundDeleter,
    });
    await disposable.open();
    await disposable.writePng(PNG);
    await expect(disposable.close()).resolves.toMatchObject({
      state: "removed",
      status: "complete",
      removed: 1,
      retained: 0,
      retryable: false,
    });
    expect(await readdir(artifactsRoot)).toEqual([]);

    const retainedId = "b".repeat(32);
    const retained = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: true,
      sessionId: retainedId,
      permissions: noOpPermissions(),
    });
    await retained.open();
    const saved = await retained.writePng(PNG);
    await retained.close();
    expect(await readFile(join(root, saved.projectRelativePath))).toEqual(PNG);
    expect(
      JSON.parse(
        await readFile(
          join(artifactsRoot, `session-${retainedId}.manifest.json`),
          "utf8",
        ),
      ),
    ).toMatchObject({ retainArtifacts: true, closed: true });
  });

  it("converges empty non-retained sessions without a native deleter", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const store = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: false,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
    });

    await store.open();
    await expect(store.close()).resolves.toMatchObject({
      state: "removed",
      status: "complete",
      removed: 1,
      retained: 0,
      retryable: false,
    });
    expect(await readdir(artifactsRoot)).toEqual([]);
    await expect(store.close()).resolves.toMatchObject({
      state: "removed",
      status: "complete",
      removed: 0,
      retained: 0,
      retryable: false,
    });
    expect(await readdir(artifactsRoot)).toEqual([]);
  });

  it("removes captured screenshots on close without a native deleter", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const store = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: false,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
    });

    await store.open();
    await store.writePng(PNG);
    await store.writePng(PNG);

    await expect(store.close()).resolves.toEqual({
      state: "removed",
      status: "complete",
      removed: 1,
      retained: 0,
      retryable: false,
    });
    expect(await readdir(artifactsRoot)).toEqual([]);
    await expect(store.close()).resolves.toMatchObject({ state: "removed" });
  });

  async function leaveQuarantine(root: string): Promise<string> {
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const store = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: false,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
      // Simulates an earlier release whose deleter could not finish.
      quarantineDeleter: async () => {
        throw new Error("unavailable");
      },
    });
    await store.open();
    await store.writePng(PNG);
    await expect(store.close()).resolves.toMatchObject({
      state: "quarantined",
      retryable: true,
    });
    const quarantine = (await readdir(artifactsRoot)).find((entry) =>
      entry.startsWith(".quarantine-"),
    );
    expect(quarantine).toBeDefined();
    return join(artifactsRoot, quarantine!);
  }

  it("recovers quarantines left with screenshots by earlier releases", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    await leaveQuarantine(root);

    await expect(
      ArtifactStore.recover({
        projectRoot: root,
        artifactsRoot,
        permissions: noOpPermissions(),
      }),
    ).resolves.toEqual({ removed: 1, retained: 0 });
    expect(await readdir(artifactsRoot)).toEqual([]);
  });

  it("preserves a quarantine whose session holds unmanifested content", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const quarantine = await leaveQuarantine(root);
    const foreign = join(quarantine, `session-${SESSION_ID}`, "notes.txt");
    await writeFile(foreign, "keep me");

    await expect(
      ArtifactStore.recover({
        projectRoot: root,
        artifactsRoot,
        permissions: noOpPermissions(),
      }),
    ).resolves.toEqual({ removed: 0, retained: 1 });
    await expect(readFile(foreign, "utf8")).resolves.toBe("keep me");
    await expect(
      readFile(
        join(quarantine, `session-${SESSION_ID}`, "screenshot-0001.png"),
      ),
    ).resolves.toEqual(PNG);
  });

  it("preserves interrupted non-retained sessions without orphan proof", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const interrupted = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: false,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
    });
    await interrupted.open();
    await interrupted.writePng(PNG);

    await expect(
      ArtifactStore.recover({
        projectRoot: root,
        artifactsRoot,
        permissions: noOpPermissions(),
      }),
    ).resolves.toEqual({ removed: 0, retained: 1 });
    expect(await readdir(artifactsRoot)).toContain(
      `session-${SESSION_ID}.manifest.json`,
    );

    await expect(
      ArtifactStore.recover({
        projectRoot: root,
        artifactsRoot,
        permissions: noOpPermissions(),
        orphanProof: () => true,
        quarantineDeleter: identityBoundDeleter,
      }),
    ).resolves.toEqual({ removed: 1, retained: 0 });
    expect(await readdir(artifactsRoot)).toEqual([]);
  });

  it("finishes recovery after a crash between directory and manifest deletion", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const interrupted = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: false,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
    });
    await interrupted.open();
    await rm(join(artifactsRoot, `session-${SESSION_ID}`), {
      recursive: true,
    });

    await expect(
      ArtifactStore.recover({
        projectRoot: root,
        artifactsRoot,
        permissions: noOpPermissions(),
        orphanProof: () => true,
        quarantineDeleter: identityBoundDeleter,
      }),
    ).resolves.toEqual({ removed: 1, retained: 0 });
    expect(await readdir(artifactsRoot)).toEqual([]);
  });

  it("requires affirmative RDM-016 retention proof before policy cleanup", async () => {
    const outcomes = [
      undefined,
      () => ({ sessionId: SESSION_ID, owned: true, active: true }),
      () => ({ sessionId: SESSION_ID, owned: true, active: false }),
    ] as const;

    for (const [index, retentionProof] of outcomes.entries()) {
      const root = await project();
      const artifactsRoot = join(root, ".pumarejo", "artifacts");
      const retained = new ArtifactStore({
        projectRoot: root,
        artifactsRoot,
        retainArtifacts: true,
        sessionId: SESSION_ID,
        permissions: noOpPermissions(),
      });
      await retained.open();
      await retained.writePng(PNG);
      await retained.close();

      const result = await ArtifactStore.recover({
        projectRoot: root,
        artifactsRoot,
        permissions: noOpPermissions(),
        retentionPolicy: { maxAgeMs: 0 },
        now: () => new Date("2100-01-01T00:00:00.000Z"),
        ...(retentionProof === undefined ? {} : { retentionProof }),
        ...(index === 2 ? { quarantineDeleter: identityBoundDeleter } : {}),
      });

      if (index < 2) {
        expect(result).toEqual({ removed: 0, retained: 1 });
        expect(await readdir(artifactsRoot)).toContain(
          `session-${SESSION_ID}.manifest.json`,
        );
      } else {
        expect(result).toEqual({ removed: 1, retained: 0 });
        expect(await readdir(artifactsRoot)).toEqual([]);
      }
    }
  });

  it.each([
    ["malformed", () => ({ sessionId: SESSION_ID, owned: true })],
    [
      "conflicting session",
      () => ({ sessionId: "b".repeat(32), owned: true, active: false }),
    ],
    [
      "throws",
      () => {
        throw new Error("raw cause /tmp/private");
      },
    ],
  ] as const)(
    "preserves retained bytes for %s proof",
    async (_label, retentionProof) => {
      const root = await project();
      const artifactsRoot = join(root, ".pumarejo", "artifacts");
      const retained = new ArtifactStore({
        projectRoot: root,
        artifactsRoot,
        retainArtifacts: true,
        sessionId: SESSION_ID,
        permissions: noOpPermissions(),
      });
      await retained.open();
      await retained.writePng(PNG);
      await retained.close();

      await expect(
        ArtifactStore.recover({
          projectRoot: root,
          artifactsRoot,
          permissions: noOpPermissions(),
          retentionPolicy: { maxAgeMs: 0 },
          now: () => new Date("2100-01-01T00:00:00.000Z"),
          retentionProof,
          quarantineDeleter: identityBoundDeleter,
        }),
      ).resolves.toEqual({ removed: 0, retained: 1 });
      expect(await readdir(artifactsRoot)).toContain(
        `session-${SESSION_ID}.manifest.json`,
      );
    },
  );

  it("preserves a quarantine replacement when the identity-bound deleter races", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const interrupted = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: false,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
    });
    await interrupted.open();
    await interrupted.writePng(PNG);

    const quarantineDeleter = async (
      request: ArtifactQuarantineDeletionRequest,
    ) => {
      await rm(request.quarantineRoot, { recursive: true, force: true });
      await mkdir(request.quarantineRoot);
      await writeFile(join(request.quarantineRoot, "replacement.txt"), "keep");
      return {
        attested: true as const,
        root: request.root,
        entries: request.entries,
      };
    };

    const result = await ArtifactStore.recover({
      projectRoot: root,
      artifactsRoot,
      permissions: noOpPermissions(),
      orphanProof: () => true,
      quarantineDeleter,
    });

    expect(result).toMatchObject({
      removed: 0,
      retained: 1,
      status: "unavailable",
      retryable: true,
    });
    const quarantine = (await readdir(artifactsRoot)).find((entry) =>
      entry.startsWith(".quarantine-"),
    );
    expect(quarantine).toBeDefined();
    expect(
      await readFile(
        join(artifactsRoot, quarantine!, "replacement.txt"),
        "utf8",
      ),
    ).toBe("keep");
  });

  it("fails closed on a linked artifact root without touching its target", async () => {
    const root = await project();
    const outside = await project();
    const linkedRoot = join(root, "artifacts");
    await symlink(
      outside,
      linkedRoot,
      process.platform === "win32" ? "junction" : "dir",
    );
    const marker = join(outside, "keep.txt");
    await writeFile(marker, "keep");
    const store = new ArtifactStore({
      projectRoot: root,
      artifactsRoot: linkedRoot,
      retainArtifacts: false,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
    });

    await expect(store.open()).rejects.toMatchObject({
      code: "ARTIFACTS_DIRECTORY_NOT_WRITABLE",
    });
    expect((await lstat(linkedRoot)).isSymbolicLink()).toBe(true);
    expect(await readFile(marker, "utf8")).toBe("keep");
  });

  it("does not write bytes when file permission establishment fails", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    let fileCalls = 0;
    const permissions: ArtifactPermissionEnforcer = {
      async ensureOwnerOnly(_path, kind) {
        if (kind === "file" && ++fileCalls === 3) {
          throw new Error("permission denied");
        }
      },
    };
    const store = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: false,
      sessionId: SESSION_ID,
      permissions,
    });
    await store.open();

    await expect(store.writePng(PNG)).rejects.toMatchObject({
      code: "SCREENSHOT_FAILED",
    });
    const session = join(artifactsRoot, `session-${SESSION_ID}`);
    const files = await readdir(session);
    expect(files).toHaveLength(1);
    expect((await stat(join(session, files[0]!))).size).toBe(0);
  });

  it("serializes concurrent writes into distinct durable entries", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const store = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: true,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
    });
    await store.open();

    const saved = await Promise.all([
      store.writePng(PNG),
      store.writePng(PNG),
      store.writePng(PNG),
    ]);
    await store.close();

    expect(saved.map(({ projectRelativePath }) => projectRelativePath)).toEqual(
      [
        expect.stringContaining("screenshot-0001.png"),
        expect.stringContaining("screenshot-0002.png"),
        expect.stringContaining("screenshot-0003.png"),
      ],
    );
  });

  it("validates the complete session before deleting known content", async () => {
    const root = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const store = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: false,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
    });
    await store.open();
    const saved = await store.writePng(PNG);
    const artifact = join(root, saved.projectRelativePath);
    await writeFile(
      join(artifactsRoot, `session-${SESSION_ID}`, "unknown"),
      "do not touch",
    );

    await expect(store.close()).rejects.toMatchObject({
      code: "SCREENSHOT_FAILED",
    });
    expect(await readFile(artifact)).toEqual(PNG);
  });

  it("rejects linked content even for retained sessions", async () => {
    const root = await project();
    const outside = await project();
    const artifactsRoot = join(root, ".pumarejo", "artifacts");
    const retained = new ArtifactStore({
      projectRoot: root,
      artifactsRoot,
      retainArtifacts: true,
      sessionId: SESSION_ID,
      permissions: noOpPermissions(),
    });
    await retained.open();
    const saved = await retained.writePng(PNG);
    await retained.close();
    const artifact = join(root, saved.projectRelativePath);
    await rm(artifact);
    await symlink(
      outside,
      artifact,
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(
      ArtifactStore.recover({
        projectRoot: root,
        artifactsRoot,
        permissions: noOpPermissions(),
      }),
    ).resolves.toEqual({ removed: 0, retained: 1 });
    expect((await lstat(artifact)).isSymbolicLink()).toBe(true);
  });
});
