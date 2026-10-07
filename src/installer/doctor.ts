import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { createServer } from "node:net";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  loadProjectConfig,
  resolveProjectRoot,
  type LoadedProjectConfig,
} from "../config/load.js";
import { resolvedLaunchEnvironment } from "../platform/launch-environment.js";
import { PumarejoError } from "../shared/errors.js";
import { executableBasename } from "../shared/executable.js";
import {
  readWindowsBootIdentifier,
  sameWindowsBootIdentifier,
  type WindowsBootIdentifier,
} from "../platform/windows/boot-identifier.js";
import {
  CUSTODY_LEASE_MAX_BYTES,
  CUSTODY_LEASE_MAX_COUNT,
  CUSTODY_LEASE_VERSION,
  validateCustodyLease,
} from "../session/custody-lease.js";
import { TAURI_WEBDRIVER_PLUGIN_VERSION, VERSION } from "../version.js";
import { evaluateAttributedEntry } from "./attributed-drift.js";
import { cargoPluginIntegration, isSupportedProviderVersion } from "./cargo.js";
import {
  INTEGRATION_MANIFEST_RELATIVE_PATH,
  contentHash,
  parseCanonicalIntegrationManifest,
  type IntegrationManifest,
} from "./manifest.js";
import { readSafeFile, validateAppliedManifest } from "./plan.js";
import { detectTauriProject, type DetectedTauriProject } from "./project.js";
import { readLaunchVerification } from "./launch-verification.js";
import {
  PROVIDER_CARGO_PATH,
  PROVIDER_KIND,
  providerContentMatches,
  ProviderDriftError,
  validateProviderStaging,
} from "./provider-source.js";

export type DiagnosticStatus = "ready" | "warn" | "error";

export interface DoctorDiagnostic {
  readonly id:
    | "project.detected"
    | "config.valid"
    | "integration.manifest"
    | "integration.debug-registration"
    | "integration.provider"
    | "integration.capability-permission"
    | "integration.version-alignment"
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
  readonly classification?:
    | "configured"
    | "detected"
    | "missing"
    | "not_detected"
    | "not_on_path"
    | "verified"
    | "version_drift"
    | "recoverable_previous_boot"
    | "ambiguous_same_boot"
    | "ambiguous_missing_boot"
    | "ambiguous_residue"
    | "malformed"
    | "artifact_residue"
    | "verified_closed";
  readonly evidence?: {
    readonly executable?: string;
    readonly arguments?: readonly string[];
    readonly provenance?: string;
    readonly confidence?: "heuristic" | "configured" | "verified";
  };
}

export interface DoctorReport {
  readonly status: DiagnosticStatus;
  readonly diagnostics: readonly DoctorDiagnostic[];
}

export interface DoctorDependencies {
  readonly platform: NodeJS.Platform;
  readonly environment: NodeJS.ProcessEnv;
  readonly executableAvailable: (
    command: string,
    environment: NodeJS.ProcessEnv,
    platform: NodeJS.Platform,
  ) => Promise<boolean>;
  readonly webviewAvailable: (platform: NodeJS.Platform) => Promise<boolean>;
  readonly portAvailable: (port: number) => Promise<boolean>;
  readonly bootIdentifier?: () => Promise<WindowsBootIdentifier>;
}

const execFileAsync = promisify(execFile);

async function executableAvailable(
  command: string,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Promise<boolean> {
  if (isAbsolute(command)) {
    try {
      const metadata = await lstat(command);
      return metadata.isFile() && !metadata.isSymbolicLink();
    } catch {
      return false;
    }
  }
  const path = environment.PATH ?? environment.Path ?? "";
  const extensions =
    platform === "win32"
      ? (environment.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
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
  bootIdentifier: readWindowsBootIdentifier,
};

function diagnostic(
  id: DoctorDiagnostic["id"],
  status: DiagnosticStatus,
  summary: string,
  action?: string,
  details: Pick<DoctorDiagnostic, "classification" | "evidence"> = {},
): DoctorDiagnostic {
  return {
    id,
    status,
    summary,
    ...(action === undefined ? {} : { action }),
    ...(details.classification === undefined
      ? {}
      : { classification: details.classification }),
    ...(details.evidence === undefined ? {} : { evidence: details.evidence }),
  };
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
  expectedWindow: string | undefined,
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
      unavailable("integration.version-alignment", "Integration versions"),
    ];
  }

  let manifest: IntegrationManifest;
  const entrySources = new Map<string, string | null>();
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
      entrySources.set(
        entry.relativePath,
        await readSafeFile(
          projectRoot,
          resolve(projectRoot, entry.relativePath),
          false,
        ),
      );
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
      unavailable("integration.version-alignment", "Integration versions"),
    ];
  }

  const projections = manifest.changes.map((entry) =>
    evaluateAttributedEntry(
      entry,
      entrySources.get(entry.relativePath) ?? null,
      {
        expectedWindow,
      },
    ),
  );
  const providerEntries = manifest.changes.filter(
    (entry) => entry.kind === PROVIDER_KIND,
  );
  let providerStagingIntact = true;
  let driftedProviderFiles: readonly string[] = [];
  if (providerEntries.length > 0) {
    try {
      await validateProviderStaging(projectRoot, providerEntries);
      // Git may rewrite line endings in a committed provider copy; only
      // content differences count as drift.
      const unmatched = providerEntries.filter((entry) => {
        const source = entrySources.get(entry.relativePath);
        return (
          source === undefined ||
          source === null ||
          entry.afterHash === null ||
          !providerContentMatches(source, entry.afterHash)
        );
      });
      driftedProviderFiles = unmatched.map((entry) =>
        entry.relativePath.slice(".pumarejo/provider/".length),
      );
      providerStagingIntact = unmatched.length === 0;
    } catch (error) {
      providerStagingIntact = false;
      if (error instanceof ProviderDriftError) {
        driftedProviderFiles = error.files.map(
          (file) => `tauri-plugin-wdio-webdriver/${file}`,
        );
      }
    }
  }
  const manifestDrift =
    !providerStagingIntact ||
    projections.some((projection) => projection.owned === "drifted");
  const secondaryHashMismatch = projections.some(
    (projection) => projection.owned === "intact" && !projection.hashMatched,
  );

  const manifestDiagnostic = diagnostic(
    "integration.manifest",
    manifestDrift ? "warn" : "ready",
    manifestDrift
      ? "The manifest is canonical, but one or more recorded files have drifted."
      : secondaryHashMismatch
        ? "The owned integration projections are intact; full-file hashes differ only outside attributed content."
        : "The applied integration manifest has canonical entries and intact owned projections.",
    manifestDrift
      ? "Review the changed files before running remove."
      : undefined,
  );
  const cargo = manifest.changes.find((entry) => entry.kind === "cargo");
  const rust = manifest.changes.find((entry) => entry.kind === "rust");
  let registrationReady = rust !== undefined && providerEntries.length === 46;
  let installedPluginVersion: string | undefined;
  try {
    const rustProjection = projections[manifest.changes.indexOf(rust!)];
    registrationReady &&= rustProjection?.owned === "intact";
    const cargoSource =
      cargo === undefined
        ? await readSafeFile(
            projectRoot,
            resolve(projectRoot, "src-tauri", "Cargo.toml"),
            true,
          )
        : (entrySources.get(cargo.relativePath) ?? null);
    if (cargoSource === null) throw new Error("Cargo manifest missing");
    const plugin = cargoPluginIntegration(cargoSource);
    registrationReady &&= plugin.registered;
    installedPluginVersion = plugin.version;
    registrationReady &&= plugin.path === PROVIDER_CARGO_PATH;
    if (cargo !== undefined) {
      const cargoProjection = projections[manifest.changes.indexOf(cargo)];
      registrationReady &&= cargoProjection?.owned === "intact";
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
    const source = entrySources.get(capability.relativePath) ?? null;
    const capabilityProjection =
      projections[manifest.changes.indexOf(capability)];
    capabilityReady =
      source !== null && capabilityProjection?.owned === "intact";
  } catch {
    capabilityReady = false;
  }

  const versionAligned =
    manifest.version === 2 &&
    manifest.pumarejoVersion === VERSION &&
    manifest.pluginVersion === TAURI_WEBDRIVER_PLUGIN_VERSION &&
    isSupportedProviderVersion(installedPluginVersion) &&
    providerEntries.length === 46;

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
      "integration.provider",
      providerStagingIntact ? "ready" : "error",
      providerStagingIntact
        ? "The staged provider copy matches the integration manifest (line endings ignored)."
        : driftedProviderFiles.length === 0
          ? "The staged provider copy under .pumarejo/provider is missing or has unexpected files."
          : `The staged provider copy differs in ${driftedProviderFiles.length} file(s): ${driftedProviderFiles.slice(0, 5).join(", ")}${driftedProviderFiles.length > 5 ? ", …" : ""}.`,
      providerStagingIntact
        ? undefined
        : "Restore these files from the installed pumarejo package (dist/provider), then rerun doctor.",
    ),
    diagnostic(
      "integration.capability-permission",
      capabilityReady ? "ready" : "error",
      capabilityReady
        ? "The isolated agent capability grants the provider permission."
        : "The isolated agent capability is missing or changed.",
      capabilityReady ? undefined : "Restore the generated capability.",
    ),
    diagnostic(
      "integration.version-alignment",
      versionAligned ? "ready" : "error",
      versionAligned
        ? "CLI, integration manifest, and Tauri plugin versions are aligned."
        : "CLI, integration manifest, or Tauri plugin versions have drifted.",
      versionAligned
        ? undefined
        : "Rerun init with the current Pumarejo CLI after reviewing local edits.",
      versionAligned
        ? { classification: "verified" }
        : { classification: "version_drift" },
    ),
  ];
}

function safeLaunchArguments(arguments_: readonly string[]): readonly string[] {
  const allowed = new Set([
    "tauri",
    "dev",
    "run",
    "--",
    "--features",
    "pumarejo",
    "--config",
    "{tauriConfig}",
  ]);
  return arguments_.map((argument) =>
    allowed.has(argument) ? argument : "<redacted>",
  );
}

/** Count `.quarantine-*` folders left in the default artifacts directory. */
async function quarantineResidue(
  projectRoot: string,
): Promise<{ readonly count: number; readonly oldest?: string }> {
  const root = resolve(projectRoot, ".pumarejo", "artifacts");
  try {
    const entries = await readdir(root, { withFileTypes: true });
    let count = 0;
    let oldest: number | undefined;
    for (const entry of entries) {
      if (!entry.name.startsWith(".quarantine-") || !entry.isDirectory()) {
        continue;
      }
      count += 1;
      const { mtimeMs } = await lstat(resolve(root, entry.name));
      oldest = oldest === undefined ? mtimeMs : Math.min(oldest, mtimeMs);
    }
    return oldest === undefined
      ? { count }
      : { count, oldest: new Date(oldest).toISOString().slice(0, 10) };
  } catch {
    return { count: 0 };
  }
}

async function residueDiagnostic(
  projectRoot: string | undefined,
  dependencies: DoctorDependencies,
): Promise<DoctorDiagnostic> {
  if (projectRoot === undefined) {
    return diagnostic(
      "residue.owned",
      "warn",
      "Owned process residue could not be inspected.",
      "Fix project detection, then inspect .pumarejo.",
    );
  }
  const sessions = resolve(projectRoot, ".pumarejo", "sessions");
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
  let artifactResidue = 0;
  let unsafeArtifactResidue = 0;
  const quarantines = await quarantineResidue(projectRoot);
  const quarantineDiagnostic = () =>
    diagnostic(
      "residue.owned",
      "warn",
      `${quarantines.count} quarantined artifact folders remain under .pumarejo/artifacts (oldest ${quarantines.oldest}).`,
      "They are removed at the next pumarejo mcp start; folders with unexpected content are kept for review.",
      {
        classification: "artifact_residue",
        evidence: {
          provenance: "artifact-root-inspection",
          confidence: "verified",
        },
      },
    );
  for (const name of ["qa-project", "regression-artifacts"] as const) {
    const artifactRoot = resolve(projectRoot, ".pumarejo", name);
    try {
      const metadata = await lstat(artifactRoot);
      if (
        metadata.isSymbolicLink() ||
        !metadata.isDirectory() ||
        (await realpath(artifactRoot)) !== artifactRoot
      ) {
        unsafeArtifactResidue += 1;
      } else {
        artifactResidue += 1;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        unsafeArtifactResidue += 1;
      }
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
    const entries = await readdir(sessions, { withFileTypes: true });
    let verifiedClosed = 0;
    let previousBoot = 0;
    let sameBoot = 0;
    let missingBoot = 0;
    let malformed = 0;
    let otherActive = 0;
    let currentBoot: WindowsBootIdentifier | undefined;
    for (const entry of entries.slice(0, CUSTODY_LEASE_MAX_COUNT)) {
      if (!/^[a-f0-9]{32}\.json$/u.test(entry.name) || !entry.isFile()) {
        malformed += 1;
        continue;
      }
      const leasePath = resolve(sessions, entry.name);
      try {
        const leaseMetadata = await lstat(leasePath);
        if (
          leaseMetadata.isSymbolicLink() ||
          !leaseMetadata.isFile() ||
          leaseMetadata.size > CUSTODY_LEASE_MAX_BYTES ||
          (await realpath(leasePath)) !== leasePath
        ) {
          malformed += 1;
          continue;
        }
        const value: unknown = JSON.parse(await readFile(leasePath, "utf8"));
        if (!validateCustodyLease(value)) {
          malformed += 1;
          continue;
        }
        if (value.version !== CUSTODY_LEASE_VERSION) {
          missingBoot += 1;
          continue;
        }
        if (value.state === "closed") {
          verifiedClosed += 1;
          continue;
        }
        if (value.platform !== "win32" || value.bootIdentifier === undefined) {
          otherActive += 1;
          continue;
        }
        currentBoot ??= await (
          dependencies.bootIdentifier ?? readWindowsBootIdentifier
        )();
        if (sameWindowsBootIdentifier(value.bootIdentifier, currentBoot)) {
          sameBoot += 1;
        } else {
          previousBoot += 1;
        }
      } catch {
        malformed += 1;
      }
    }
    malformed += Math.max(0, entries.length - CUSTODY_LEASE_MAX_COUNT);

    if (interruptedManifest) {
      return diagnostic(
        "residue.owned",
        "warn",
        "An interrupted integration journal requires recovery.",
        "Inspect the journal and complete or reverse its attributable edits.",
        { classification: "ambiguous_residue" },
      );
    }
    if (artifactResidue > 0 || unsafeArtifactResidue > 0) {
      return diagnostic(
        "residue.owned",
        "warn",
        `${artifactResidue + unsafeArtifactResidue} owned artifact roots require identity-bound cleanup.`,
        "Run the supported artifact cleanup command with an authorized manifest.",
        {
          classification:
            unsafeArtifactResidue > 0
              ? "ambiguous_residue"
              : "artifact_residue",
          evidence: {
            provenance: "artifact-root-inspection",
            confidence: unsafeArtifactResidue > 0 ? "heuristic" : "verified",
          },
        },
      );
    }
    const ambiguous = malformed + sameBoot + missingBoot + otherActive;
    if (ambiguous > 0) {
      const classification =
        malformed > 0
          ? "malformed"
          : missingBoot > 0
            ? "ambiguous_missing_boot"
            : sameBoot > 0
              ? "ambiguous_same_boot"
              : "ambiguous_residue";
      return diagnostic(
        "residue.owned",
        "warn",
        `${ambiguous} custody leases are ambiguous and were not recovered.`,
        "Inspect the evidence and use only the supported lease recovery command.",
        {
          classification,
          evidence: {
            provenance: "custody-lease-inspection",
            confidence: malformed > 0 ? "heuristic" : "verified",
          },
        },
      );
    }
    if (previousBoot > 0) {
      return diagnostic(
        "residue.owned",
        "warn",
        `${previousBoot} custody leases are proven to belong to a previous Windows boot.`,
        "Run pumarejo recover-leases --execute for this project.",
        {
          classification: "recoverable_previous_boot",
          evidence: {
            provenance: "windows-boot-identity",
            confidence: "verified",
          },
        },
      );
    }
    if (quarantines.count > 0) return quarantineDiagnostic();
    return verifiedClosed > 0
      ? diagnostic(
          "residue.owned",
          "ready",
          `${verifiedClosed} custody leases have verified semantic closure.`,
          undefined,
          {
            classification: "verified_closed",
            evidence: {
              provenance: "custody-lease-v2",
              confidence: "verified",
            },
          },
        )
      : diagnostic(
          "residue.owned",
          "ready",
          "No owned session residue exists.",
        );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (artifactResidue > 0 || unsafeArtifactResidue > 0) {
        return diagnostic(
          "residue.owned",
          "warn",
          `${artifactResidue + unsafeArtifactResidue} owned artifact roots require identity-bound cleanup.`,
          "Run the supported artifact cleanup command with an authorized manifest.",
          {
            classification:
              unsafeArtifactResidue > 0
                ? "ambiguous_residue"
                : "artifact_residue",
            evidence: {
              provenance: "artifact-root-inspection",
              confidence: unsafeArtifactResidue > 0 ? "heuristic" : "verified",
            },
          },
        );
      }
      if (!interruptedManifest && quarantines.count > 0) {
        return quarantineDiagnostic();
      }
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
      "Inspect .pumarejo without terminating unrelated processes.",
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
  let loadedConfig: LoadedProjectConfig | undefined;
  try {
    loadedConfig = await loadProjectConfig(projectPath);
    configuredPort = loadedConfig.config.webdriverPort;
    diagnostics.push(
      diagnostic(
        "config.valid",
        "ready",
        "The v1 project configuration is valid.",
      ),
    );
  } catch (error) {
    const detail = error instanceof PumarejoError ? error.detail : undefined;
    diagnostics.push(
      diagnostic(
        "config.valid",
        "error",
        detail ?? "The v1 project configuration is missing or invalid.",
        "Run init or fix .pumarejo.json.",
      ),
    );
  }
  const launchVerification =
    loadedConfig === undefined
      ? undefined
      : await readLaunchVerification(loadedConfig);

  diagnostics.push(
    ...(await integrationDiagnostics(projectRoot, project?.primaryWindowLabel)),
  );
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
  const rustReady = await dependencies.executableAvailable(
    "cargo",
    dependencies.environment,
    dependencies.platform,
  );
  diagnostics.push(
    diagnostic(
      "toolchain.rust",
      rustReady ? "ready" : "error",
      rustReady ? "Cargo is available." : "Cargo is unavailable.",
      rustReady ? undefined : "Install the stable Rust toolchain.",
    ),
  );
  const launchProfile = loadedConfig?.config.launch ?? project?.launch;
  const launchCommand =
    launchProfile !== undefined && "executablePath" in launchProfile
      ? (launchProfile.executablePath ?? launchProfile.command)
      : launchProfile?.command;
  const effectiveLaunchEnvironment =
    loadedConfig === undefined ||
    !["win32", "linux"].includes(dependencies.platform)
      ? dependencies.environment
      : resolvedLaunchEnvironment(
          dependencies.platform === "win32" ? "windows" : "linux",
          dependencies.environment,
          loadedConfig.config.launch,
        );
  const launchDetected =
    launchCommand !== undefined &&
    (await dependencies.executableAvailable(
      launchCommand,
      effectiveLaunchEnvironment,
      dependencies.platform,
    ));
  const launchVerified = launchVerification?.platform === dependencies.platform;
  const launchReady = launchDetected || launchVerified;
  const explicitlyConfigured =
    loadedConfig !== undefined &&
    (loadedConfig.config.launch.executablePath !== undefined ||
      (loadedConfig.config.launch.pathPrepend?.length ?? 0) > 0 ||
      Object.keys(loadedConfig.config.launch.environment ?? {}).length > 0);
  diagnostics.push(
    diagnostic(
      "toolchain.launch",
      launchReady ? "ready" : "error",
      launchReady
        ? "The project launch executable is available."
        : "The project launch executable is unavailable.",
      launchReady
        ? undefined
        : explicitlyConfigured
          ? "Fix launch.executablePath or install the configured executable."
          : "Install the detected project package manager or add it to the effective PATH.",
      {
        classification: launchVerified
          ? "verified"
          : launchReady
            ? explicitlyConfigured
              ? "configured"
              : "detected"
            : explicitlyConfigured
              ? "missing"
              : launchCommand === undefined
                ? "not_detected"
                : "not_on_path",
        evidence: {
          ...(launchCommand === undefined
            ? {}
            : { executable: executableBasename(launchCommand) }),
          ...(launchProfile === undefined
            ? {}
            : { arguments: safeLaunchArguments(launchProfile.args) }),
          provenance: explicitlyConfigured
            ? "project-config"
            : launchCommand === undefined
              ? "project-detection"
              : "host-path",
          confidence: launchVerified
            ? "verified"
            : explicitlyConfigured
              ? "configured"
              : "heuristic",
        },
      },
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
  const webviewDetected =
    platformReady &&
    (await dependencies.webviewAvailable(dependencies.platform));
  const webviewReady = webviewDetected || launchVerified;
  diagnostics.push(
    diagnostic(
      "platform.webview",
      webviewReady ? "ready" : "error",
      webviewReady
        ? webviewDetected
          ? "The platform WebView runtime is available."
          : "A successful Pumarejo launch verified the WebView runtime."
        : "The platform WebView runtime was not found.",
      webviewReady
        ? undefined
        : "Install WebView2 or the supported WebKitGTK runtime.",
      {
        classification: launchVerified
          ? "verified"
          : webviewDetected
            ? "detected"
            : "not_detected",
        evidence: {
          provenance: launchVerified ? "successful-launch" : "platform-probe",
          confidence: launchVerified ? "verified" : "heuristic",
        },
      },
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
  diagnostics.push(await residueDiagnostic(projectRoot, dependencies));
  return { status: overallStatus(diagnostics), diagnostics };
}

export function formatDoctorReport(report: DoctorReport): string {
  return `${report.diagnostics
    .map(
      (item) =>
        `[${item.status.toUpperCase()}] ${item.id}: ${item.summary}${
          item.classification === undefined
            ? ""
            : ` Classification: ${item.classification}.`
        }${
          item.evidence === undefined
            ? ""
            : ` Evidence: ${[
                item.evidence.executable === undefined
                  ? undefined
                  : `executable=${item.evidence.executable}`,
                item.evidence.arguments === undefined
                  ? undefined
                  : `args=${JSON.stringify(item.evidence.arguments)}`,
                item.evidence.provenance === undefined
                  ? undefined
                  : `provenance=${item.evidence.provenance}`,
                item.evidence.confidence === undefined
                  ? undefined
                  : `confidence=${item.evidence.confidence}`,
              ]
                .filter((value) => value !== undefined)
                .join(", ")}.`
        }${item.action === undefined ? "" : ` Action: ${item.action}`}`,
    )
    .join("\n")}\n`;
}
