import { execFile } from "node:child_process";
import { lstat, readdir, realpath } from "node:fs/promises";
import { createServer } from "node:net";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";

import { loadProjectConfig, resolveProjectRoot } from "../config/load.js";
import { planCargoRemoval } from "./cargo.js";
import {
  contentHash,
  INTEGRATION_MANIFEST_RELATIVE_PATH,
  parseCanonicalIntegrationManifest,
  type IntegrationManifest,
} from "./manifest.js";
import { readSafeFile, validateAppliedManifest } from "./plan.js";
import { detectTauriProject, type DetectedTauriProject } from "./project.js";
import { planRustRemoval } from "./rust.js";

export type DiagnosticStatus = "ready" | "warn" | "error";

export interface DoctorDiagnostic {
  readonly id:
    | "project.detected"
    | "config.valid"
    | "integration.manifest"
    | "integration.debug-registration"
    | "integration.capability-permission"
    | "toolchain.node"
    | "toolchain.rust"
    | "toolchain.launch"
    | "platform.supported"
    | "platform.display"
    | "platform.webview"
    | "port.available"
    | "residue.owned";
  readonly status: DiagnosticStatus;
  readonly summary: string;
  readonly action?: string;
}

export interface DoctorReport {
  readonly status: DiagnosticStatus;
  readonly diagnostics: readonly DoctorDiagnostic[];
}

export interface DoctorDependencies {
  readonly platform: NodeJS.Platform;
  readonly environment: NodeJS.ProcessEnv;
  readonly executableAvailable: (command: string) => Promise<boolean>;
  readonly webviewAvailable: (platform: NodeJS.Platform) => Promise<boolean>;
  readonly portAvailable: (port: number) => Promise<boolean>;
}

const execFileAsync = promisify(execFile);

async function executableAvailable(command: string): Promise<boolean> {
  const path = process.env.PATH ?? "";
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
      : [""];
  const candidates = extensions.map((extension) =>
    command.toLowerCase().endsWith(extension.toLowerCase())
      ? command
      : `${command}${extension.toLowerCase()}`,
  );
  for (const directory of path.split(delimiter).filter(Boolean)) {
    for (const candidate of candidates) {
      try {
        const metadata = await lstat(join(directory, candidate));
        if (metadata.isFile() && !metadata.isSymbolicLink()) {
          return true;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          return false;
        }
      }
    }
  }
  return false;
}

async function defaultWebviewAvailable(
  platform: NodeJS.Platform,
): Promise<boolean> {
  if (platform === "win32") {
    const executable = resolve("C:\\Windows\\System32\\reg.exe");
    try {
      const metadata = await lstat(executable);
      if (
        metadata.isSymbolicLink() ||
        !metadata.isFile() ||
        (await realpath(executable)) !== executable
      ) {
        return false;
      }
    } catch {
      return false;
    }
    const registryRoots = [
      "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients",
      "HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients",
      "HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients",
    ];
    for (const root of registryRoots) {
      try {
        await execFileAsync(
          executable,
          ["query", root, "/s", "/f", "Microsoft Edge WebView2 Runtime"],
          { timeout: 5_000, windowsHide: true },
        );
        return true;
      } catch {
        // Continue through the fixed registry locations.
      }
    }
    return false;
  }
  try {
    if (platform === "linux") {
      const executable = "/usr/sbin/ldconfig";
      const metadata = await lstat(executable);
      if (
        metadata.isSymbolicLink() ||
        !metadata.isFile() ||
        (await realpath(executable)) !== executable
      ) {
        return false;
      }
      const result = await execFileAsync(executable, ["-p"], {
        timeout: 5_000,
        windowsHide: true,
      });
      return /libwebkit2gtk|libwebkitgtk/u.test(result.stdout);
    }
  } catch {
    return false;
  }
  return false;
}

async function portAvailable(port: number): Promise<boolean> {
  return await new Promise((resolveAvailability) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolveAvailability(false));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close(() => resolveAvailability(true));
    });
  });
}

const DEFAULT_DEPENDENCIES: DoctorDependencies = {
  platform: process.platform,
  environment: process.env,
  executableAvailable,
  webviewAvailable: defaultWebviewAvailable,
  portAvailable,
};

function diagnostic(
  id: DoctorDiagnostic["id"],
  status: DiagnosticStatus,
  summary: string,
  action?: string,
): DoctorDiagnostic {
  return { id, status, summary, ...(action === undefined ? {} : { action }) };
}

function overallStatus(
  diagnostics: readonly DoctorDiagnostic[],
): DiagnosticStatus {
  if (diagnostics.some((item) => item.status === "error")) {
    return "error";
  }
  return diagnostics.some((item) => item.status === "warn") ? "warn" : "ready";
}

async function integrationDiagnostics(
  projectRoot: string | undefined,
): Promise<DoctorDiagnostic[]> {
  const unavailable = (id: DoctorDiagnostic["id"], subject: string) =>
    diagnostic(
      id,
      "error",
      `${subject} could not be verified.`,
      "Fix project detection, then rerun doctor.",
    );
  if (projectRoot === undefined) {
    return [
      unavailable("integration.manifest", "Integration manifest"),
      unavailable(
        "integration.debug-registration",
        "Debug integration registration",
      ),
      unavailable(
        "integration.capability-permission",
        "Agent capability permission",
      ),
    ];
  }

  let manifest: IntegrationManifest;
  let manifestDrift = false;
  try {
    const source = await readSafeFile(
      projectRoot,
      resolve(projectRoot, INTEGRATION_MANIFEST_RELATIVE_PATH),
      true,
    );
    if (source === null) {
      throw new Error("manifest missing");
    }
    manifest = parseCanonicalIntegrationManifest(source);
    validateAppliedManifest(manifest);
    if (manifest.state !== "applied") {
      throw new Error(`manifest is ${manifest.state}`);
    }
    for (const entry of manifest.changes) {
      const content = await readSafeFile(
        projectRoot,
        resolve(projectRoot, entry.relativePath),
        true,
      );
      if (content === null || contentHash(content) !== entry.afterHash) {
        manifestDrift = true;
      }
    }
  } catch {
    return [
      diagnostic(
        "integration.manifest",
        "error",
        "The applied integration manifest is missing, unsafe, or interrupted.",
        "Restore the recorded integration or complete removal manually.",
      ),
      unavailable(
        "integration.debug-registration",
        "Debug integration registration",
      ),
      unavailable(
        "integration.capability-permission",
        "Agent capability permission",
      ),
    ];
  }

  const manifestDiagnostic = diagnostic(
    "integration.manifest",
    manifestDrift ? "warn" : "ready",
    manifestDrift
      ? "The manifest is canonical, but one or more recorded files have drifted."
      : "The applied integration manifest has the canonical entry set and hashes.",
    manifestDrift
      ? "Review the changed files before running remove."
      : undefined,
  );
  const cargo = manifest.changes.find((entry) => entry.kind === "cargo");
  const rust = manifest.changes.find((entry) => entry.kind === "rust");
  let registrationReady = rust !== undefined;
  try {
    if (rust !== undefined) {
      const source = await readSafeFile(
        projectRoot,
        resolve(projectRoot, rust.relativePath),
        true,
      );
      if (source === null) throw new Error("Rust source missing");
      planRustRemoval(source);
    }
    if (cargo !== undefined) {
      const source = await readSafeFile(
        projectRoot,
        resolve(projectRoot, cargo.relativePath),
        true,
      );
      if (source === null) throw new Error("Cargo manifest missing");
      planCargoRemoval(source, cargo.attribution);
    }
  } catch {
    registrationReady = false;
  }

  const capability = manifest.changes.find(
    (entry) => entry.kind === "capability",
  );
  let capabilityReady = capability !== undefined;
  try {
    if (capability === undefined) throw new Error("capability missing");
    const source = await readSafeFile(
      projectRoot,
      resolve(projectRoot, capability.relativePath),
      true,
    );
    if (
      source === null ||
      contentHash(source) !== capability.afterHash ||
      !source.includes('"wdio-webdriver:default"')
    ) {
      throw new Error("capability drift");
    }
  } catch {
    capabilityReady = false;
  }

  return [
    manifestDiagnostic,
    diagnostic(
      "integration.debug-registration",
      registrationReady ? "ready" : "error",
      registrationReady
        ? "Cargo and Rust retain the attributable debug-and-feature registration."
        : "Cargo or Rust no longer retains the attributable registration.",
      registrationReady ? undefined : "Restore the owned values or rerun init.",
    ),
    diagnostic(
      "integration.capability-permission",
      capabilityReady ? "ready" : "error",
      capabilityReady
        ? "The isolated agent capability grants the provider permission."
        : "The isolated agent capability is missing or changed.",
      capabilityReady ? undefined : "Restore the generated capability.",
    ),
  ];
}

async function residueDiagnostic(
  projectRoot: string | undefined,
): Promise<DoctorDiagnostic> {
  if (projectRoot === undefined) {
    return diagnostic(
      "residue.owned",
      "warn",
      "Owned process residue could not be inspected.",
      "Fix project detection, then inspect .tauri-agent.",
    );
  }
  const sessions = resolve(projectRoot, ".tauri-agent", "sessions");
  const manifestPath = resolve(projectRoot, INTEGRATION_MANIFEST_RELATIVE_PATH);
  let interruptedManifest = false;
  try {
    const source = await readSafeFile(projectRoot, manifestPath, false);
    if (source !== null) {
      interruptedManifest =
        parseCanonicalIntegrationManifest(source).state !== "applied";
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      interruptedManifest = true;
    }
  }
  try {
    const metadata = await lstat(sessions);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isDirectory() ||
      (await realpath(sessions)) !== sessions
    ) {
      throw new Error("unsafe sessions directory");
    }
    const entries = await readdir(sessions);
    return entries.length === 0 && !interruptedManifest
      ? diagnostic("residue.owned", "ready", "No owned session residue exists.")
      : diagnostic(
          "residue.owned",
          "warn",
          interruptedManifest
            ? "An interrupted integration journal requires recovery."
            : `${entries.length} owned session residue entries require recovery.`,
          "Run the documented cleanup flow; doctor never terminates processes.",
        );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return interruptedManifest
        ? diagnostic(
            "residue.owned",
            "warn",
            "An interrupted integration journal requires recovery.",
            "Inspect the journal and complete or reverse its attributable edits.",
          )
        : diagnostic(
            "residue.owned",
            "ready",
            "No owned session residue exists.",
          );
    }
    return diagnostic(
      "residue.owned",
      "warn",
      "Owned session residue could not be read safely.",
      "Inspect .tauri-agent without terminating unrelated processes.",
    );
  }
}

export async function doctorProject(
  projectPath: string,
  overrides: Partial<DoctorDependencies> = {},
): Promise<DoctorReport> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const diagnostics: DoctorDiagnostic[] = [];
  let project: DetectedTauriProject | undefined;
  let projectRoot: string | undefined;

  try {
    project = await detectTauriProject(projectPath);
    projectRoot = project.projectRoot;
    diagnostics.push(
      diagnostic(
        "project.detected",
        "ready",
        "A supported Tauri 2 project was detected.",
      ),
    );
  } catch {
    try {
      projectRoot = await resolveProjectRoot(projectPath);
    } catch {
      projectRoot = undefined;
    }
    diagnostics.push(
      diagnostic(
        "project.detected",
        "error",
        "A supported Tauri 2 project was not detected.",
        "Fix the project structure and Tauri 2 metadata.",
      ),
    );
  }

  let configuredPort: number | undefined;
  try {
    const loaded = await loadProjectConfig(projectPath);
    configuredPort = loaded.config.webdriverPort;
    diagnostics.push(
      diagnostic(
        "config.valid",
        "ready",
        "The v1 project configuration is valid.",
      ),
    );
  } catch {
    diagnostics.push(
      diagnostic(
        "config.valid",
        "error",
        "The v1 project configuration is missing or invalid.",
        "Run init or fix .tauri-agent.json.",
      ),
    );
  }

  diagnostics.push(...(await integrationDiagnostics(projectRoot)));
  diagnostics.push(
    diagnostic(
      "toolchain.node",
      /^v(?:22|24)\./u.test(process.version) ? "ready" : "error",
      `Node runtime is ${process.version}.`,
      /^v(?:22|24)\./u.test(process.version)
        ? undefined
        : "Use Node 22 or Node 24.",
    ),
  );
  const rustReady = await dependencies.executableAvailable("cargo");
  diagnostics.push(
    diagnostic(
      "toolchain.rust",
      rustReady ? "ready" : "error",
      rustReady ? "Cargo is available." : "Cargo is unavailable.",
      rustReady ? undefined : "Install the stable Rust toolchain.",
    ),
  );
  const launchReady =
    project !== undefined &&
    (await dependencies.executableAvailable(project.launch.command));
  diagnostics.push(
    diagnostic(
      "toolchain.launch",
      launchReady ? "ready" : "error",
      launchReady
        ? "The project launch executable is available."
        : "The project launch executable is unavailable.",
      launchReady
        ? undefined
        : "Install the detected project package manager or Cargo.",
    ),
  );

  const platformReady = ["win32", "linux"].includes(dependencies.platform);
  diagnostics.push(
    diagnostic(
      "platform.supported",
      platformReady ? "ready" : "error",
      platformReady
        ? `Platform ${dependencies.platform} is supported.`
        : `Platform ${dependencies.platform} is unsupported.`,
      platformReady
        ? undefined
        : "Use a certified Windows or Ubuntu environment.",
    ),
  );
  const displayReady =
    dependencies.platform === "win32" ||
    (dependencies.platform === "linux" &&
      Boolean(
        dependencies.environment.DISPLAY ||
          dependencies.environment.WAYLAND_DISPLAY,
      ));
  diagnostics.push(
    diagnostic(
      "platform.display",
      displayReady ? "ready" : "error",
      displayReady
        ? "A desktop display session is available."
        : "No supported desktop display session is available.",
      displayReady
        ? undefined
        : "Configure WSLg/X11/Wayland or a supported desktop session.",
    ),
  );
  const webviewReady =
    platformReady &&
    (await dependencies.webviewAvailable(dependencies.platform));
  diagnostics.push(
    diagnostic(
      "platform.webview",
      webviewReady ? "ready" : "error",
      webviewReady
        ? "The platform WebView runtime is available."
        : "The platform WebView runtime was not found.",
      webviewReady
        ? undefined
        : "Install WebView2 or the supported WebKitGTK runtime.",
    ),
  );

  const requestedPort = configuredPort ?? 0;
  const available = await dependencies.portAvailable(requestedPort);
  diagnostics.push(
    diagnostic(
      "port.available",
      available ? "ready" : "error",
      available
        ? configuredPort === undefined
          ? "A dynamic loopback port can be reserved."
          : `Configured loopback port ${configuredPort} is available.`
        : `Loopback port ${requestedPort} is unavailable.`,
      available
        ? undefined
        : "Release the configured port or omit webdriverPort.",
    ),
  );
  diagnostics.push(await residueDiagnostic(projectRoot));
  return { status: overallStatus(diagnostics), diagnostics };
}

export function formatDoctorReport(report: DoctorReport): string {
  return `${report.diagnostics
    .map(
      (item) =>
        `[${item.status.toUpperCase()}] ${item.id}: ${item.summary}${
          item.action === undefined ? "" : ` Action: ${item.action}`
        }`,
    )
    .join("\n")}\n`;
}
