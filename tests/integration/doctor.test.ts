import {
  cp,
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

import { runCli } from "../../src/cli/index.js";
import {
  doctorProject,
  formatDoctorReport,
  type DoctorDependencies,
} from "../../src/installer/doctor.js";
import { initializeProject } from "../../src/installer/plan.js";

const FIXTURE = join(
  import.meta.dirname,
  "..",
  "fixtures",
  "projects",
  "pnpm-json",
);
const temporaryDirectories: string[] = [];

async function projectCopy(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tauri-agent-doctor-"));
  temporaryDirectories.push(root);
  await cp(FIXTURE, root, { recursive: true });
  return root;
}

const READY_DEPENDENCIES: DoctorDependencies = {
  platform: "win32",
  environment: {},
  executableAvailable: async () => true,
  webviewAvailable: async () => true,
  portAvailable: async () => true,
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Tauri Agent doctor", () => {
  it("reports every required prerequisite independently with stable identities", async () => {
    const project = await projectCopy();
    await initializeProject(project);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.status).toBe("ready");
    expect(report.diagnostics.map((item) => item.id)).toEqual([
      "project.detected",
      "config.valid",
      "integration.manifest",
      "integration.debug-registration",
      "integration.capability-permission",
      "toolchain.node",
      "toolchain.rust",
      "toolchain.launch",
      "platform.supported",
      "platform.display",
      "platform.webview",
      "port.available",
      "residue.owned",
    ]);
    expect(new Set(report.diagnostics.map((item) => item.id))).toHaveLength(13);
  });

  it("keeps independent failures visible when the project and platform are unavailable", async () => {
    const empty = await mkdtemp(join(tmpdir(), "tauri-agent-doctor-empty-"));
    temporaryDirectories.push(empty);
    const report = await doctorProject(empty, {
      platform: "darwin",
      environment: {},
      executableAvailable: async () => false,
      webviewAvailable: async () => false,
      portAvailable: async () => false,
    });

    expect(report.status).toBe("error");
    expect(
      report.diagnostics.filter((item) => item.status === "error").length,
    ).toBeGreaterThanOrEqual(11);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "project.detected", status: "error" }),
        expect.objectContaining({ id: "config.valid", status: "error" }),
        expect.objectContaining({ id: "toolchain.rust", status: "error" }),
        expect.objectContaining({ id: "platform.display", status: "error" }),
        expect.objectContaining({ id: "platform.webview", status: "error" }),
        expect.objectContaining({ id: "port.available", status: "error" }),
      ]),
    );
  });

  it("uses identical diagnostic identities in human and JSON CLI output", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const jsonOutput: string[] = [];
    const humanOutput: string[] = [];
    const io = (output: string[]) => ({
      stdout: (text: string) => output.push(text),
      stderr: () => undefined,
    });

    await expect(
      runCli(
        ["doctor", "--project", project, "--json"],
        undefined,
        io(jsonOutput),
      ),
    ).resolves.toBe(0);
    await expect(
      runCli(["doctor", "--project", project], undefined, io(humanOutput)),
    ).resolves.toBe(0);

    const report = JSON.parse(jsonOutput.join("")) as {
      diagnostics: Array<{ id: string }>;
    };
    for (const { id } of report.diagnostics) {
      expect(humanOutput.join("")).toContain(`] ${id}:`);
    }
  });

  it("reports changed capability separately from valid manifest structure", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const capabilityPath = join(
      project,
      ".tauri-agent",
      "agent-capability.json",
    );
    const capability = JSON.parse(await readFile(capabilityPath, "utf8")) as {
      permissions: string[];
    };
    capability.permissions = [];
    await writeFile(capabilityPath, `${JSON.stringify(capability, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "integration.manifest",
          status: "warn",
        }),
        expect.objectContaining({
          id: "integration.capability-permission",
          status: "error",
        }),
      ]),
    );
  });

  it("warns about owned residue without deleting or terminating it", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const residue = join(project, ".tauri-agent", "sessions", "owned-session");
    await mkdir(residue, { recursive: true });
    await writeFile(join(residue, "lease.json"), '{"pid":123}\n');

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.status).toBe("warn");
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "residue.owned", status: "warn" }),
      ]),
    );
    expect(await readFile(join(residue, "lease.json"), "utf8")).toContain(
      '"pid":123',
    );
  });

  it("reports an interrupted removal journal as integration error and residue", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const manifestPath = join(
      project,
      ".tauri-agent",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      state: string;
    };
    manifest.state = "removing";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "integration.manifest",
          status: "error",
        }),
        expect.objectContaining({ id: "residue.owned", status: "warn" }),
      ]),
    );
  });

  it("refuses to enumerate a linked residue directory", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const outside = await mkdtemp(
      join(tmpdir(), "tauri-agent-residue-outside-"),
    );
    temporaryDirectories.push(outside);
    await writeFile(join(outside, "private-name"), "unchanged");
    await symlink(
      outside,
      join(project, ".tauri-agent", "sessions"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "residue.owned", status: "warn" }),
      ]),
    );
    expect(await readFile(join(outside, "private-name"), "utf8")).toBe(
      "unchanged",
    );
  });

  it("formats one actionable line per diagnostic", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const report = await doctorProject(project, {
      ...READY_DEPENDENCIES,
      portAvailable: async () => false,
    });
    const human = formatDoctorReport(report);

    expect(human.trim().split("\n")).toHaveLength(report.diagnostics.length);
    expect(human).toContain("[ERROR] port.available:");
    expect(human).toContain("Action:");
  });
});
