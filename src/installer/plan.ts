import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { generateProjectConfig } from "../config/generate.js";
import { planCapabilityEdit, capabilityMatchesWindow } from "./capabilities.js";
import { cargoIntegrationAttribution, planCargoEdit } from "./cargo.js";
import {
  contentHash,
  createIntegrationManifest,
  INTEGRATION_MANIFEST_RELATIVE_PATH,
  parseCanonicalIntegrationManifest,
  serializeIntegrationManifest,
  type IntegrationChangeKind,
  type IntegrationManifest,
} from "./manifest.js";
import { IntegrationPlanError } from "./plan-error.js";
import { detectTauriProject } from "./project.js";
import { planRustEdit, rustBuilderOccurrences } from "./rust.js";
import {
  applyWrites,
  type ApplyWritesOptions,
  type WritableChange,
} from "./write.js";

const MAX_EDITABLE_BYTES = 1024 * 1024;
export const IGNORE_BLOCK = `# <pumarejo:begin>
/.pumarejo/
# <pumarejo:end>
`;

export { IntegrationPlanError } from "./plan-error.js";

export interface PlannedIntegrationChange extends WritableChange {
  readonly kind: IntegrationChangeKind;
  readonly attribution: readonly string[];
  readonly afterContent: string;
  readonly afterHash: string;
}

export interface PlannedFileWrite extends WritableChange {
  readonly afterContent: string;
  readonly afterHash: string;
}

export interface IntegrationPlan {
  readonly projectRoot: string;
  readonly status: "planned" | "already-integrated";
  readonly changes: readonly PlannedIntegrationChange[];
  readonly manifestChange: PlannedFileWrite | null;
  readonly finalManifestChange: PlannedFileWrite | null;
}

export interface IntegrationResult {
  readonly status: "planned" | "applied" | "already-integrated";
  readonly changes: readonly Pick<
    PlannedIntegrationChange,
    "relativePath" | "kind" | "beforeHash" | "afterHash"
  >[];
}

function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

export async function readSafeFile(
  projectRoot: string,
  absolutePath: string,
  required: boolean,
): Promise<string | null> {
  if (!isInside(projectRoot, absolutePath)) {
    throw new IntegrationPlanError("UNSAFE_TARGET");
  }
  try {
    const metadata = await lstat(absolutePath);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      metadata.size > MAX_EDITABLE_BYTES ||
      (await realpath(absolutePath)) !== absolutePath
    ) {
      throw new IntegrationPlanError("UNSAFE_TARGET");
    }
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !required) {
      return null;
    }
    throw error;
  }
}

function change(
  projectRoot: string,
  relativePath: string,
  kind: IntegrationChangeKind,
  beforeContent: string | null,
  afterContent: string,
  attribution: readonly string[],
): PlannedIntegrationChange {
  return {
    absolutePath: resolve(projectRoot, relativePath),
    relativePath: relativePath.replaceAll("\\", "/"),
    kind,
    attribution,
    beforeContent,
    beforeHash: beforeContent === null ? null : contentHash(beforeContent),
    afterContent,
    afterHash: contentHash(afterContent),
  };
}

async function existingIntegration(
  projectRoot: string,
): Promise<IntegrationPlan | undefined> {
  const manifestPath = resolve(projectRoot, INTEGRATION_MANIFEST_RELATIVE_PATH);
  const source = await readSafeFile(projectRoot, manifestPath, false);
  if (source === null) {
    try {
      const directory = resolve(projectRoot, ".pumarejo");
      const metadata = await lstat(directory);
      if (metadata.isDirectory()) {
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    return undefined;
  }

  try {
    const manifest = parseCanonicalIntegrationManifest(source);
    if (manifest.state !== "applied") {
      throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
    }
    validateAppliedManifest(manifest);
    for (const entry of manifest.changes) {
      const path = resolve(projectRoot, entry.relativePath);
      if (!isInside(projectRoot, path)) {
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      }
      const current = await readSafeFile(projectRoot, path, true);
      if (current === null || contentHash(current) !== entry.afterHash) {
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      }
    }
    return {
      projectRoot,
      status: "already-integrated",
      changes: [],
      manifestChange: null,
      finalManifestChange: null,
    };
  } catch (error) {
    if (error instanceof IntegrationPlanError) {
      throw error;
    }
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED", {
      cause: error,
    });
  }
}

export function validateAppliedManifest(manifest: IntegrationManifest): void {
  const entries = new Map(
    manifest.changes.map((entry) => [entry.relativePath, entry]),
  );
  if (entries.size !== manifest.changes.length) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }

  const required = [
    [".pumarejo/agent-capability.json", "capability"],
    [".gitignore", "ignore"],
    [".pumarejo.json", "config"],
  ] as const;
  for (const [path, kind] of required) {
    if (entries.get(path)?.kind !== kind) {
      throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
    }
  }
  const exactAttribution = (
    entry: IntegrationManifest["changes"][number] | undefined,
    expected: readonly string[],
  ): boolean =>
    entry !== undefined &&
    entry.attribution.length === expected.length &&
    entry.attribution.every((value, index) => value === expected[index]);
  if (
    !exactAttribution(entries.get(".gitignore"), [
      "marker:<pumarejo:begin>",
      "ignore:/.pumarejo/",
    ]) ||
    !exactAttribution(entries.get(".pumarejo.json"), ["created:.pumarejo.json"])
  ) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  const capabilityAttribution = entries.get(
    ".pumarejo/agent-capability.json",
  )?.attribution;
  if (
    capabilityAttribution?.length !== 2 ||
    !/^derived-from:src-tauri\/capabilities\/[^/]+\.(?:json|toml)$/u.test(
      capabilityAttribution[0] ?? "",
    ) ||
    capabilityAttribution[1] !== "permission:wdio-webdriver:default"
  ) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }

  const rustEntries = manifest.changes.filter(
    (entry) =>
      entry.kind === "rust" &&
      /^src-tauri\/src\/(?:lib|main)\.rs$/u.test(entry.relativePath),
  );
  const cargoEntries = manifest.changes.filter(
    (entry) =>
      entry.kind === "cargo" && entry.relativePath === "src-tauri/Cargo.toml",
  );
  if (
    rustEntries.length !== 1 ||
    cargoEntries.length > 1 ||
    manifest.changes.length !== 4 + cargoEntries.length
  ) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  if (
    !exactAttribution(rustEntries[0], [
      "marker:<pumarejo:begin>",
      "wrapper:pumarejo_builder",
    ])
  ) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  if (cargoEntries.length === 1) {
    const cargoAttribution = cargoEntries[0].attribution;
    const allowed = new Set([
      "dependency:tauri-plugin-wdio-webdriver:optional",
      "feature:pumarejo:created:dep:tauri-plugin-wdio-webdriver",
      "feature:pumarejo:value:dep:tauri-plugin-wdio-webdriver",
    ]);
    const featureEntries = cargoAttribution.filter((value) =>
      value.startsWith("feature:pumarejo:"),
    );
    if (
      cargoAttribution.length < 1 ||
      cargoAttribution.length > 2 ||
      new Set(cargoAttribution).size !== cargoAttribution.length ||
      cargoAttribution.some((value) => !allowed.has(value)) ||
      featureEntries.length > 1
    ) {
      throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
    }
  }
}

async function selectRustSource(
  projectRoot: string,
  tauriDirectory: string,
): Promise<{ readonly relativePath: string; readonly source: string }> {
  const candidates = ["src/lib.rs", "src/main.rs"];
  const matches: Array<{ relativePath: string; source: string }> = [];
  for (const relativePath of candidates) {
    const source = await readSafeFile(
      projectRoot,
      resolve(tauriDirectory, relativePath),
      false,
    );
    if (source !== null && rustBuilderOccurrences(source) > 0) {
      matches.push({
        relativePath: `src-tauri/${relativePath}`,
        source,
      });
    }
  }
  if (matches.length !== 1 || rustBuilderOccurrences(matches[0].source) !== 1) {
    throw new IntegrationPlanError("RUST_LAYOUT_AMBIGUOUS");
  }
  return matches[0];
}

async function selectCapability(
  projectRoot: string,
  tauriDirectory: string,
  windowLabel: string,
): Promise<{
  readonly relativePath: string;
  readonly source: string;
  readonly format: "json" | "toml";
}> {
  const directory = join(tauriDirectory, "capabilities");
  let entries;
  try {
    const metadata = await lstat(directory);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isDirectory() ||
      (await realpath(directory)) !== directory
    ) {
      throw new IntegrationPlanError("UNSAFE_TARGET");
    }
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof IntegrationPlanError) {
      throw error;
    }
    throw new IntegrationPlanError("CAPABILITY_AMBIGUOUS", { cause: error });
  }

  const matches: Array<{
    relativePath: string;
    source: string;
    format: "json" | "toml";
  }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:json|toml)$/u.test(entry.name)) {
      continue;
    }
    const format = entry.name.endsWith(".toml") ? "toml" : "json";
    const relativePath = `src-tauri/capabilities/${entry.name}`;
    const source = await readSafeFile(
      projectRoot,
      resolve(projectRoot, relativePath),
      true,
    );
    if (
      source !== null &&
      capabilityMatchesWindow(source, format, windowLabel)
    ) {
      matches.push({ relativePath, source, format });
    }
  }
  if (matches.length !== 1) {
    throw new IntegrationPlanError("CAPABILITY_AMBIGUOUS");
  }
  return matches[0];
}

function reportChanges(plan: IntegrationPlan): IntegrationResult["changes"] {
  return plan.changes.map(({ relativePath, kind, beforeHash, afterHash }) => ({
    relativePath,
    kind,
    beforeHash,
    afterHash,
  }));
}

export async function planIntegration(
  projectPath: string,
): Promise<IntegrationPlan> {
  const detected = await detectTauriProject(projectPath);
  const existing = await existingIntegration(detected.projectRoot);
  if (existing !== undefined) {
    return existing;
  }

  const cargoSource = await readSafeFile(
    detected.projectRoot,
    detected.cargoManifestPath,
    true,
  );
  if (cargoSource === null) {
    throw new IntegrationPlanError("CARGO_MANIFEST_INVALID");
  }
  const rust = await selectRustSource(
    detected.projectRoot,
    detected.tauriDirectory,
  );
  const capability = await selectCapability(
    detected.projectRoot,
    detected.tauriDirectory,
    detected.primaryWindowLabel,
  );
  const ignorePath = resolve(detected.projectRoot, ".gitignore");
  const existingIgnore = await readSafeFile(
    detected.projectRoot,
    ignorePath,
    false,
  );
  const ignoreSource = existingIgnore ?? "";
  if (
    ignoreSource.includes("<pumarejo:begin>") ||
    ignoreSource.includes("<pumarejo:end>")
  ) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }

  const ignoreSeparator =
    ignoreSource.length === 0 || ignoreSource.endsWith("\n") ? "" : "\n";
  const existingConfig = await readSafeFile(
    detected.projectRoot,
    resolve(detected.projectRoot, ".pumarejo.json"),
    false,
  );
  if (existingConfig !== null) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  const configSource = `${JSON.stringify(generateProjectConfig(detected), null, 2)}\n`;
  const cargoAttribution = cargoIntegrationAttribution(cargoSource);
  const changes = [
    change(
      detected.projectRoot,
      "src-tauri/Cargo.toml",
      "cargo",
      cargoSource,
      planCargoEdit(cargoSource),
      cargoAttribution,
    ),
    change(
      detected.projectRoot,
      rust.relativePath,
      "rust",
      rust.source,
      planRustEdit(rust.source),
      ["marker:<pumarejo:begin>", "wrapper:pumarejo_builder"],
    ),
    change(
      detected.projectRoot,
      ".pumarejo/agent-capability.json",
      "capability",
      null,
      planCapabilityEdit(capability.source, capability.format),
      [
        `derived-from:${capability.relativePath}`,
        "permission:wdio-webdriver:default",
      ],
    ),
    change(
      detected.projectRoot,
      ".gitignore",
      "ignore",
      existingIgnore,
      `${ignoreSource}${ignoreSeparator}${IGNORE_BLOCK}`,
      ["marker:<pumarejo:begin>", "ignore:/.pumarejo/"],
    ),
    change(
      detected.projectRoot,
      ".pumarejo.json",
      "config",
      null,
      configSource,
      ["created:.pumarejo.json"],
    ),
  ].filter(
    (plannedChange) => plannedChange.beforeHash !== plannedChange.afterHash,
  ) satisfies PlannedIntegrationChange[];

  const manifestChanges = changes.map(
    ({ relativePath, kind, beforeHash, afterHash, attribution }) => ({
      relativePath,
      kind,
      beforeHash,
      afterHash,
      attribution,
    }),
  );
  const applyingManifest = createIntegrationManifest(
    manifestChanges,
    "applying",
  );
  const appliedManifest = createIntegrationManifest(manifestChanges, "applied");
  const manifestSource = serializeIntegrationManifest(applyingManifest);
  const finalManifestSource = serializeIntegrationManifest(appliedManifest);
  const manifestChange = change(
    detected.projectRoot,
    INTEGRATION_MANIFEST_RELATIVE_PATH,
    "config",
    null,
    manifestSource,
    ["created:integration-manifest.json"],
  );
  const finalManifestChange = change(
    detected.projectRoot,
    INTEGRATION_MANIFEST_RELATIVE_PATH,
    "config",
    manifestSource,
    finalManifestSource,
    ["state:integration-manifest:applied"],
  );

  return {
    projectRoot: detected.projectRoot,
    status: "planned",
    changes,
    manifestChange,
    finalManifestChange,
  };
}

export async function applyIntegrationPlan(
  plan: IntegrationPlan,
  writeOptions: ApplyWritesOptions = {},
): Promise<IntegrationResult> {
  if (plan.status === "already-integrated") {
    return { status: "already-integrated", changes: [] };
  }
  if (plan.manifestChange === null || plan.finalManifestChange === null) {
    throw new IntegrationPlanError("WRITE_FAILED");
  }
  await applyWrites(
    plan.projectRoot,
    [plan.manifestChange, ...plan.changes, plan.finalManifestChange],
    writeOptions,
  );
  return { status: "applied", changes: reportChanges(plan) };
}

export async function initializeProject(
  projectPath: string,
  options: { readonly dryRun?: boolean } = {},
): Promise<IntegrationResult> {
  const plan = await planIntegration(projectPath);
  if (plan.status === "already-integrated") {
    return { status: "already-integrated", changes: [] };
  }
  if (options.dryRun === true) {
    return { status: "planned", changes: reportChanges(plan) };
  }
  return applyIntegrationPlan(plan);
}
