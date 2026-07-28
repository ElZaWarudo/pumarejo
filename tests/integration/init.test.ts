import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/index.js";
import {
  applyIntegrationPlan,
  initializeProject,
  planIntegration,
} from "../../src/installer/plan.js";

const FIXTURE_ROOT = join(
  import.meta.dirname,
  "..",
  "fixtures",
  "projects",
  "pnpm-json",
);
const temporaryDirectories: string[] = [];

async function projectCopy(fixture = "pnpm-json"): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), "tauri-agent-init-"));
  temporaryDirectories.push(project);
  const { cp } = await import("node:fs/promises");
  await cp(
    fixture === "pnpm-json" ? FIXTURE_ROOT : join(FIXTURE_ROOT, "..", fixture),
    project,
    { recursive: true },
  );
  if (fixture !== "pnpm-json") {
    await mkdir(join(project, "src-tauri", "src"), { recursive: true });
    await mkdir(join(project, "src-tauri", "capabilities"), {
      recursive: true,
    });
    await cp(
      join(FIXTURE_ROOT, "src-tauri", "src", "lib.rs"),
      join(project, "src-tauri", "src", "lib.rs"),
    );
    await cp(
      join(FIXTURE_ROOT, "src-tauri", "capabilities", "default.json"),
      join(project, "src-tauri", "capabilities", "default.json"),
    );
    await cp(join(FIXTURE_ROOT, ".gitignore"), join(project, ".gitignore"));
  }
  return project;
}

async function treeSnapshot(root: string): Promise<string> {
  const entries: string[] = [];
  async function visit(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const path = join(directory, child.name);
      const relativePath = path.slice(root.length + 1);
      const metadata = await lstat(path);
      if (child.isDirectory()) {
        entries.push(`d:${relativePath}`);
        await visit(path);
      } else {
        entries.push(
          `f:${relativePath}:${metadata.size}:${await readFile(path, "utf8")}`,
        );
      }
    }
  }
  await visit(root);
  return entries.join("\n");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Tauri project initialization", () => {
  it("wires init dry-run through the real CLI without mutating", async () => {
    const project = await projectCopy();
    const before = await treeSnapshot(project);
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(
      runCli(["init", "--project", project, "--dry-run"], undefined, {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      }),
    ).resolves.toBe(0);

    expect(JSON.parse(stdout.join(""))).toMatchObject({ status: "planned" });
    expect(stderr).toEqual([]);
    expect(await treeSnapshot(project)).toBe(before);
  });

  it("previews every attributable edit without writing", async () => {
    const project = await projectCopy();
    const before = await treeSnapshot(project);

    const result = await initializeProject(project, { dryRun: true });

    expect(result.status).toBe("planned");
    expect(result.changes.map((change) => change.relativePath)).toEqual([
      "src-tauri/Cargo.toml",
      "src-tauri/src/lib.rs",
      ".tauri-agent/agent-capability.json",
      ".gitignore",
      ".tauri-agent.json",
    ]);
    expect(await treeSnapshot(project)).toBe(before);
  });

  it("applies once and reports an unchanged integration on the second run", async () => {
    const project = await projectCopy();
    const first = await initializeProject(project);
    const afterFirst = await treeSnapshot(project);
    const second = await initializeProject(project);

    expect(first.status).toBe("applied");
    expect(second).toMatchObject({ status: "already-integrated", changes: [] });
    expect(await treeSnapshot(project)).toBe(afterFirst);

    const cargo = await readFile(
      join(project, "src-tauri", "Cargo.toml"),
      "utf8",
    );
    expect(cargo.match(/tauri-plugin-wdio-webdriver/g)).toHaveLength(2);
    expect(cargo).toContain(
      'tauri-agent = ["dep:tauri-plugin-wdio-webdriver"]',
    );
    expect(cargo).not.toContain("target.'cfg(debug_assertions)'.dependencies");

    const rust = await readFile(
      join(project, "src-tauri", "src", "lib.rs"),
      "utf8",
    );
    expect(rust).toContain(
      '#[cfg(all(debug_assertions, feature = "tauri-agent"))]',
    );
    expect(rust).toContain("tauri_agent_builder(tauri::Builder::default())");
    expect(rust.match(/<tauri-agent:begin>/g)).toHaveLength(1);

    const capability = JSON.parse(
      await readFile(
        join(project, ".tauri-agent", "agent-capability.json"),
        "utf8",
      ),
    ) as { permissions: string[] };
    expect(capability.permissions).toEqual([
      "core:default",
      "core:window:default",
      "wdio-webdriver:default",
    ]);
    const projectCapability = await readFile(
      join(project, "src-tauri", "capabilities", "default.json"),
      "utf8",
    );
    expect(projectCapability).not.toContain("wdio-webdriver:default");

    const packageManifest = JSON.parse(
      await readFile(join(project, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(packageManifest.scripts).toEqual({ tauri: "tauri" });

    const config = JSON.parse(
      await readFile(join(project, ".tauri-agent.json"), "utf8"),
    ) as { launch: { args: string[] } };
    expect(config.launch.args).toContain("tauri-agent");
    expect(config.launch.args).toContain("{tauriConfig}");

    const manifest = JSON.parse(
      await readFile(
        join(project, ".tauri-agent", "integration-manifest.json"),
        "utf8",
      ),
    ) as {
      version: number;
      state: string;
      changes: Array<{ attribution: string[] }>;
    };
    expect(manifest).toMatchObject({ version: 1, state: "applied" });
    expect(manifest.changes).toHaveLength(5);
    expect(manifest.changes.flatMap((change) => change.attribution)).toEqual(
      expect.arrayContaining([
        "dependency:tauri-plugin-wdio-webdriver:optional",
        "feature:tauri-agent:created:dep:tauri-plugin-wdio-webdriver",
        "marker:<tauri-agent:begin>",
        "permission:wdio-webdriver:default",
        "created:.tauri-agent.json",
      ]),
    );
  });

  it.each([
    ["npm-json5", "npm"],
    ["yarn-toml", "yarn"],
    ["bun-json", "bun"],
    ["deno-json", "deno"],
    ["cargo-json", "cargo"],
  ] as const)(
    "initializes the %s project shape idempotently",
    async (fixture, command) => {
      const project = await projectCopy(fixture);

      await expect(initializeProject(project)).resolves.toMatchObject({
        status: "applied",
      });
      await expect(initializeProject(project)).resolves.toMatchObject({
        status: "already-integrated",
      });
      const config = JSON.parse(
        await readFile(join(project, ".tauri-agent.json"), "utf8"),
      ) as { launch: { command: string } };
      expect(config.launch.command).toBe(command);
    },
  );

  it("aborts an ambiguous Rust layout before any integration write", async () => {
    const project = await projectCopy();
    const rustPath = join(project, "src-tauri", "src", "lib.rs");
    await writeFile(
      rustPath,
      `${await readFile(rustPath, "utf8")}\nfn other() { let _ = tauri::Builder::default(); }\n`,
      "utf8",
    );
    const before = await treeSnapshot(project);

    await expect(initializeProject(project)).rejects.toMatchObject({
      reason: "RUST_LAYOUT_AMBIGUOUS",
    });
    expect(await treeSnapshot(project)).toBe(before);
  });

  it("ignores builder text in Rust comments and string literals", async () => {
    const project = await projectCopy();
    const rustPath = join(project, "src-tauri", "src", "lib.rs");
    const source = await readFile(rustPath, "utf8");
    await writeFile(
      rustPath,
      `// tauri::Builder::default()\nconst NOTE: &str = r#"tauri::Builder::default()"#;\n${source}`,
      "utf8",
    );

    await expect(initializeProject(project)).resolves.toMatchObject({
      status: "applied",
    });
    const integrated = await readFile(rustPath, "utf8");
    expect(integrated).toContain(
      "tauri_agent_builder(tauri::Builder::default())",
    );
  });

  it("inserts its Rust helper after multiline crate attributes", async () => {
    const project = await projectCopy();
    const rustPath = join(project, "src-tauri", "src", "lib.rs");
    const source = await readFile(rustPath, "utf8");
    await writeFile(
      rustPath,
      `#![\n    allow(\n        dead_code\n    )\n]\n${source}`,
      "utf8",
    );

    await expect(initializeProject(project)).resolves.toMatchObject({
      status: "applied",
    });
    const integrated = await readFile(rustPath, "utf8");
    expect(integrated.indexOf("#![")).toBeLessThan(
      integrated.indexOf("// <tauri-agent:begin>"),
    );
  });

  it("rejects builder text that exists only in a Rust comment", async () => {
    const project = await projectCopy();
    const rustPath = join(project, "src-tauri", "src", "lib.rs");
    await writeFile(
      rustPath,
      [
        "// tauri::Builder::default()",
        "use tauri::Builder;",
        "pub fn run() {",
        "    Builder::default()",
        "        .run(tauri::generate_context!())",
        '        .expect("error while running tauri application");',
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    const before = await treeSnapshot(project);

    await expect(initializeProject(project)).rejects.toMatchObject({
      reason: "RUST_LAYOUT_AMBIGUOUS",
    });
    expect(await treeSnapshot(project)).toBe(before);
  });

  it("returns actionable CLI guidance for an ambiguous Rust layout", async () => {
    const project = await projectCopy();
    const rustPath = join(project, "src-tauri", "src", "lib.rs");
    await writeFile(
      rustPath,
      `${await readFile(rustPath, "utf8")}\nfn other() { let _ = tauri::Builder::default(); }\n`,
      "utf8",
    );
    const stderr: string[] = [];

    await expect(
      runCli(["init", "--project", project], undefined, {
        stdout: () => undefined,
        stderr: (text) => stderr.push(text),
      }),
    ).resolves.toBe(1);

    expect(JSON.parse(stderr.join(""))).toMatchObject({
      code: "INTEGRATION_INCOMPLETE",
      phase: "integration",
      suggestion: expect.stringMatching(/manually wrap/i),
    });
  });

  it("rejects a pre-write race before applying any planned edit", async () => {
    const project = await projectCopy();
    const plan = await planIntegration(project);
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    await writeFile(
      cargoPath,
      `${await readFile(cargoPath, "utf8")}\n# developer edit\n`,
      "utf8",
    );
    const raced = await treeSnapshot(project);

    await expect(applyIntegrationPlan(plan)).rejects.toMatchObject({
      reason: "PROJECT_CHANGED",
    });
    expect(await treeSnapshot(project)).toBe(raced);
  });

  it("rolls back prior atomic writes when a later write fails", async () => {
    const project = await projectCopy();
    const before = await treeSnapshot(project);
    const plan = await planIntegration(project);

    await expect(
      applyIntegrationPlan(plan, {
        beforeWrite: (index) => {
          if (index === 2) {
            throw new Error("injected write failure");
          }
        },
      }),
    ).rejects.toThrow("injected write failure");

    expect(await treeSnapshot(project)).toBe(before);
  });

  it("rejects a junction introduced during writes and rolls back inside the root", async () => {
    const project = await projectCopy();
    const plan = await planIntegration(project);
    const outside = await mkdtemp(join(tmpdir(), "tauri-agent-race-outside-"));
    temporaryDirectories.push(outside);
    const before = await treeSnapshot(project);
    const { symlink } = await import("node:fs/promises");

    await expect(
      applyIntegrationPlan(plan, {
        beforeWrite: async (index) => {
          if (index === 2) {
            await rm(
              join(project, ".tauri-agent", "integration-manifest.json"),
            );
            const { rmdir } = await import("node:fs/promises");
            await rmdir(join(project, ".tauri-agent"));
            await symlink(
              outside,
              join(project, ".tauri-agent"),
              process.platform === "win32" ? "junction" : "dir",
            );
          }
        },
      }),
    ).rejects.toMatchObject({ reason: "UNSAFE_TARGET" });

    expect(await readdir(outside)).toEqual([]);
    expect(await treeSnapshot(project)).toBe(before);
  });

  it("rejects replacement of the canonical project root before writing", async () => {
    const project = await projectCopy();
    const plan = await planIntegration(project);
    const backup = `${project}-original`;
    const outside = await mkdtemp(join(tmpdir(), "tauri-agent-root-outside-"));
    temporaryDirectories.push(backup, outside);

    await expect(
      applyIntegrationPlan(plan, {
        beforeWrite: async (index) => {
          if (index === 0) {
            await rename(project, backup);
            await symlink(
              outside,
              project,
              process.platform === "win32" ? "junction" : "dir",
            );
          }
        },
      }),
    ).rejects.toMatchObject({ reason: "UNSAFE_TARGET" });

    expect(await readdir(outside)).toEqual([]);
    await rm(project);
    await rename(backup, project);
    expect(await treeSnapshot(project)).not.toMatch(
      /(?:^|\n)d:\.tauri-agent(?:\\|\n|$)/,
    );
  });

  it("leaves an interrupted applying journal diagnosable instead of resuming blindly", async () => {
    const project = await projectCopy();
    const plan = await planIntegration(project);
    if (plan.manifestChange === null) {
      throw new Error("expected an applying manifest");
    }
    await mkdir(join(project, ".tauri-agent"));
    await writeFile(
      plan.manifestChange.absolutePath,
      plan.manifestChange.afterContent,
      "utf8",
    );
    await writeFile(
      plan.changes[0].absolutePath,
      plan.changes[0].afterContent,
      "utf8",
    );

    await expect(initializeProject(project)).rejects.toMatchObject({
      reason: "ALREADY_INTEGRATED_MODIFIED",
    });
    const journal = JSON.parse(
      await readFile(plan.manifestChange.absolutePath, "utf8"),
    ) as { state: string; changes: unknown[] };
    expect(journal).toMatchObject({ state: "applying" });
    expect(journal.changes).toHaveLength(5);
  });

  it("derives an agent-only capability from TOML without changing the source", async () => {
    const project = await projectCopy();
    const capabilityDirectory = join(project, "src-tauri", "capabilities");
    const jsonCapability = join(capabilityDirectory, "default.json");
    await rm(jsonCapability);
    const tomlCapability = join(capabilityDirectory, "default.toml");
    const original = `identifier = "default"
windows = ["main"]
permissions = ["core:default", "core:window:default"]
`;
    await writeFile(tomlCapability, original, "utf8");

    await initializeProject(project);

    expect(await readFile(tomlCapability, "utf8")).toBe(original);
    const generated = JSON.parse(
      await readFile(
        join(project, ".tauri-agent", "agent-capability.json"),
        "utf8",
      ),
    ) as { permissions: string[] };
    expect(generated.permissions).toContain("wdio-webdriver:default");
  });

  it("refuses to overwrite a pre-existing public configuration", async () => {
    const project = await projectCopy();
    await writeFile(
      join(project, ".tauri-agent.json"),
      '{"version":1}',
      "utf8",
    );
    const before = await treeSnapshot(project);

    await expect(initializeProject(project)).rejects.toMatchObject({
      reason: "ALREADY_INTEGRATED_MODIFIED",
    });
    expect(await treeSnapshot(project)).toBe(before);
  });

  it("creates a missing gitignore atomically", async () => {
    const project = await projectCopy();
    await rm(join(project, ".gitignore"));

    await expect(initializeProject(project)).resolves.toMatchObject({
      status: "applied",
    });
    expect(await readFile(join(project, ".gitignore"), "utf8")).toContain(
      "/.tauri-agent/",
    );
  });

  it("preserves unrelated Cargo values, features, capability entries, and ignore rules", async () => {
    const project = await projectCopy();
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    await writeFile(
      cargoPath,
      `${await readFile(cargoPath, "utf8")}
[features]
existing = ["tauri/custom-protocol"]
`,
      "utf8",
    );
    const ignorePath = join(project, ".gitignore");
    const beforeIgnore = await readFile(ignorePath, "utf8");

    await initializeProject(project);

    const cargo = await readFile(cargoPath, "utf8");
    expect(cargo).toContain('existing = ["tauri/custom-protocol"]');
    expect(await readFile(ignorePath, "utf8")).toContain(beforeIgnore.trim());
    const capability = await readFile(
      join(project, "src-tauri", "capabilities", "default.json"),
      "utf8",
    );
    expect(capability).toContain("core:window:default");
    expect(capability).not.toContain("wdio-webdriver:default");
  });

  it("extends an existing agent feature without dropping its values or comment", async () => {
    const project = await projectCopy();
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    await writeFile(
      cargoPath,
      `${await readFile(cargoPath, "utf8")}
[features]
tauri-agent = ["tauri/custom-protocol"] # developer feature
`,
      "utf8",
    );

    await initializeProject(project);

    const cargo = await readFile(cargoPath, "utf8");
    expect(cargo).toContain('"tauri/custom-protocol"');
    expect(cargo).toContain('"dep:tauri-plugin-wdio-webdriver"');
    expect(cargo).toContain("# developer feature");
  });
});
