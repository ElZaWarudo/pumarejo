import {
  lstat,
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
import { ArtifactStore } from "../../src/artifacts/store.js";

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
    });
    await disposable.open();
    await disposable.writePng(PNG);
    await disposable.close();
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

  it("recovers interrupted non-retained sessions from durable manifests", async () => {
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
      }),
    ).resolves.toEqual({ removed: 1, retained: 0 });
    expect(await readdir(artifactsRoot)).toEqual([]);
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
      code: "SCREENSHOT_FAILED",
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
    ).rejects.toMatchObject({ code: "SCREENSHOT_FAILED" });
    expect((await lstat(artifact)).isSymbolicLink()).toBe(true);
  });
});
