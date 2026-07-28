import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/index.js";
import { initializeProject } from "../../src/installer/plan.js";
import { removeIntegration } from "../../src/installer/remove.js";

const FIXTURE = join(
  import.meta.dirname,
  "..",
  "fixtures",
  "projects",
  "pnpm-json",
);
const temporaryDirectories: string[] = [];

async function projectCopy(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pumarejo-remove-"));
  temporaryDirectories.push(root);
  await cp(FIXTURE, root, { recursive: true });
  return root;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function integrationState(
  project: string,
): Promise<Record<string, string | null>> {
  const paths = [
    "src-tauri/Cargo.toml",
    "src-tauri/src/lib.rs",
    ".gitignore",
    ".pumarejo.json",
    ".pumarejo/agent-capability.json",
    ".pumarejo/integration-manifest.json",
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        path,
        (await exists(join(project, path)))
          ? await readFile(join(project, path), "utf8")
          : null,
      ]),
    ),
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Tauri project integration removal", () => {
  it("previews removal without changing the initialized project", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const before = await readFile(manifestPath, "utf8");

    await expect(
      removeIntegration(project, { dryRun: true }),
    ).resolves.toMatchObject({
      status: "planned",
      changes: expect.arrayContaining([
        { relativePath: "src-tauri/Cargo.toml", action: "restore" },
        { relativePath: ".pumarejo.json", action: "delete" },
      ]),
    });
    expect(await readFile(manifestPath, "utf8")).toBe(before);
  });

  it("restores attributable edits while preserving unrelated developer edits", async () => {
    const project = await projectCopy();
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    const rustPath = join(project, "src-tauri", "src", "lib.rs");
    const ignorePath = join(project, ".gitignore");
    await initializeProject(project);
    await writeFile(
      cargoPath,
      `${await readFile(cargoPath, "utf8")}\n# developer cargo note\n`,
      "utf8",
    );
    await writeFile(
      rustPath,
      `${await readFile(rustPath, "utf8")}\n// developer rust note\n`,
      "utf8",
    );
    await writeFile(
      ignorePath,
      `${await readFile(ignorePath, "utf8")}developer-cache/\n`,
      "utf8",
    );

    await expect(removeIntegration(project)).resolves.toMatchObject({
      status: "removed",
    });
    expect(await readFile(cargoPath, "utf8")).not.toContain(
      "tauri-plugin-wdio-webdriver",
    );
    expect(await readFile(cargoPath, "utf8")).toContain(
      "# developer cargo note",
    );
    expect(await readFile(rustPath, "utf8")).not.toContain("<pumarejo:begin>");
    expect(await readFile(rustPath, "utf8")).toContain(
      "// developer rust note",
    );
    expect(await readFile(ignorePath, "utf8")).toContain("developer-cache/");
    expect(await exists(join(project, ".pumarejo.json"))).toBe(false);
    expect(await exists(join(project, ".pumarejo"))).toBe(false);
  });

  it("preserves pre-existing Cargo dependency and feature values exactly", async () => {
    const project = await projectCopy();
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    const original = (await readFile(cargoPath, "utf8")).replace(
      'tauri = "2.8.5"',
      [
        'tauri = "2.8.5"',
        'tauri-plugin-wdio-webdriver = { version = "1", optional = true }',
        "",
        "[features]",
        'pumarejo = ["existing"] # preserve',
      ].join("\n"),
    );
    await writeFile(cargoPath, original, "utf8");

    await initializeProject(project);
    await removeIntegration(project);
    expect(await readFile(cargoPath, "utf8")).toBe(original);
  });

  it("refuses all removal when an owned created file was changed", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const configPath = join(project, ".pumarejo.json");
    await writeFile(
      configPath,
      `${await readFile(configPath, "utf8")}\n`,
      "utf8",
    );
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifestBefore = await readFile(manifestPath, "utf8");

    await expect(removeIntegration(project)).rejects.toMatchObject({
      reason: "ALREADY_INTEGRATED_MODIFIED",
    });
    expect(await readFile(manifestPath, "utf8")).toBe(manifestBefore);
    expect(await exists(configPath)).toBe(true);
  });

  it("rolls back every prior restoration when a later removal write fails", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const before = await integrationState(project);

    await expect(
      removeIntegration(project, {
        writeOptions: {
          beforeWrite: (index) => {
            if (index === 4) {
              throw new Error("injected remove failure");
            }
          },
        },
      }),
    ).rejects.toThrow("injected remove failure");
    expect(await integrationState(project)).toEqual(before);
  });

  it("restores an init-created gitignore to an inert empty file", async () => {
    const project = await projectCopy();
    await rm(join(project, ".gitignore"));
    await initializeProject(project);
    expect(await exists(join(project, ".gitignore"))).toBe(true);

    await removeIntegration(project);
    expect(await readFile(join(project, ".gitignore"), "utf8")).toBe("");
  });

  it("refuses to delete a generated Cargo dependency changed by the developer", async () => {
    const project = await projectCopy();
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    await initializeProject(project);
    const changed = (await readFile(cargoPath, "utf8")).replace(
      'tauri-plugin-wdio-webdriver = { version = "1", optional = true }',
      'tauri-plugin-wdio-webdriver = { version = "1", optional = true, features = ["custom"] }',
    );
    await writeFile(cargoPath, changed, "utf8");
    const before = await integrationState(project);

    await expect(removeIntegration(project)).rejects.toMatchObject({
      reason: "ALREADY_INTEGRATED_MODIFIED",
    });
    expect(await integrationState(project)).toEqual(before);
  });

  it("rejects forged Cargo attribution for a pre-existing dependency", async () => {
    const project = await projectCopy();
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    const original = (await readFile(cargoPath, "utf8")).replace(
      'tauri = "2.8.5"',
      [
        'tauri = "2.8.5"',
        'tauri-plugin-wdio-webdriver = { version = "1", optional = true }',
      ].join("\n"),
    );
    await writeFile(cargoPath, original, "utf8");
    await initializeProject(project);
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      changes: Array<{ kind: string; attribution: string[] }>;
    };
    const cargo = manifest.changes.find((entry) => entry.kind === "cargo");
    if (cargo === undefined) throw new Error("expected Cargo entry");
    cargo.attribution.unshift(
      "dependency:tauri-plugin-wdio-webdriver:optional",
    );
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await expect(removeIntegration(project)).rejects.toMatchObject({
      reason: "ALREADY_INTEGRATED_MODIFIED",
    });
    expect(await readFile(cargoPath, "utf8")).toContain(
      'tauri-plugin-wdio-webdriver = { version = "1", optional = true }',
    );
  });

  it("rejects a forged manifest entry before deleting any file", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      changes: Array<{ relativePath: string }>;
    };
    manifest.changes[0].relativePath = "package.json";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const packageBefore = await readFile(join(project, "package.json"), "utf8");

    await expect(removeIntegration(project)).rejects.toMatchObject({
      reason: "ALREADY_INTEGRATED_MODIFIED",
    });
    expect(await readFile(join(project, "package.json"), "utf8")).toBe(
      packageBefore,
    );
  });

  it("runs remove through the real CLI with stable JSON output", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const stdout: string[] = [];

    await expect(
      runCli(["remove", "--project", project], undefined, {
        stdout: (text) => stdout.push(text),
        stderr: () => undefined,
      }),
    ).resolves.toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ status: "removed" });
  });

  it("returns an actionable integration failure when removal is repeated", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    await removeIntegration(project);
    const stderr: string[] = [];

    await expect(
      runCli(["remove", "--project", project], undefined, {
        stdout: () => undefined,
        stderr: (text) => stderr.push(text),
      }),
    ).resolves.toBe(1);
    expect(JSON.parse(stderr.join(""))).toMatchObject({
      code: "INTEGRATION_INCOMPLETE",
      suggestion: expect.stringMatching(/doctor/i),
    });
  });
});
