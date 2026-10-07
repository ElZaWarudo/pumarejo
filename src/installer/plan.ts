import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { generateProjectConfig } from "../config/generate.js";
import {
  AGENT_PERMISSIONS,
  planCapabilityEdit,
  capabilityMatchesWindow,
} from "./capabilities.js";
import {
  cargoIntegrationAttribution,
  cargoPluginIntegration,
  CARGO_DEPENDENCY_ATTRIBUTION,
  CARGO_DEPENDENCY_PATH_ATTRIBUTION,
  CARGO_EOL_CRLF_ATTRIBUTION,
  CARGO_EOL_LF_ATTRIBUTION,
  CARGO_FEATURE_CREATED_ATTRIBUTION,
  CARGO_FEATURE_VALUE_ATTRIBUTION,
  isSupportedProviderVersion,
  normalizeCargoEol,
  planCargoEdit,
} from "./cargo.js";
import {
  contentHash,
  createIntegrationManifest,
  INTEGRATION_MANIFEST_RELATIVE_PATH,
  parseCanonicalIntegrationManifest,
  serializeIntegrationManifest,
  validateProviderManifestEntries,
  type IntegrationChangeKind,
  type IntegrationManifest,
  type IntegrationManifestChange,
} from "./manifest.js";
import {
  PROVIDER_CARGO_PATH,
  PROVIDER_KIND,
  PROVIDER_STAGED_ROOT,
  providerAttribution,
  readProviderBundle,
  validateProviderStaging,
} from "./provider-source.js";
import { IGNORE_BLOCK } from "./ignore.js";
import { IntegrationPlanError } from "./plan-error.js";
import { TAURI_WEBDRIVER_PLUGIN_VERSION, VERSION } from "../version.js";
import { detectTauriProject } from "./project.js";
import { planRustEdit, rustBuilderOccurrences } from "./rust.js";
import { evaluateAttributedEntry } from "./attributed-drift.js";
import {
  applyWrites,
  type ApplyWritesOptions,
  type WritableChange,
} from "./write.js";

const MAX_EDITABLE_BYTES = 1024 * 1024;
export { IGNORE_BLOCK, LEGACY_IGNORE_BLOCK } from "./ignore.js";

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
  /** Complete read set for a current-provider reconciliation, including unchanged inputs. */
  readonly reconciliation?: {
    readonly inputs: readonly {
      readonly relativePath: string;
      readonly hash: string;
    }[];
    readonly providerHashes: readonly string[];
    readonly providerEntries: readonly IntegrationManifestChange[];
  };
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
  windowLabel: string,
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
    const providerEntries = manifest.changes.filter(
      (entry) => entry.kind === PROVIDER_KIND,
    );
    const currentVersion =
      manifest.version === 2 &&
      manifest.pumarejoVersion === VERSION &&
      manifest.pluginVersion === TAURI_WEBDRIVER_PLUGIN_VERSION &&
      providerEntries.length === 46;
    const currentByPath = new Map<string, string>();
    for (const entry of manifest.changes) {
      const path = resolve(projectRoot, entry.relativePath);
      if (!isInside(projectRoot, path)) {
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      }
      const current = await readSafeFile(projectRoot, path, true);
      const hashSource =
        current !== null && entry.kind === "cargo"
          ? normalizeCargoEol(current, entry.attribution)
          : current;
      if (
        current === null ||
        hashSource === null ||
        (contentHash(hashSource) !== entry.afterHash &&
          !(
            currentVersion &&
            ["rust", "cargo", "ignore"].includes(entry.kind) &&
            evaluateAttributedEntry(entry, current, {
              expectedWindow: windowLabel,
            }).owned === "intact"
          ))
      ) {
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      }
      if (
        currentVersion &&
        entry.kind !== PROVIDER_KIND &&
        evaluateAttributedEntry(entry, current, { expectedWindow: windowLabel })
          .owned !== "intact"
      ) {
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      }
      currentByPath.set(entry.relativePath, current);
    }
    if (providerEntries.length > 0) {
      await validateProviderStaging(projectRoot, providerEntries, {
        reconcileLineEndings: currentVersion,
      });
    } else {
      const providerRoot = resolve(projectRoot, PROVIDER_STAGED_ROOT);
      try {
        const metadata = await lstat(providerRoot);
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
          throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
        }
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      } catch (error) {
        if (
          error instanceof IntegrationPlanError ||
          (error as NodeJS.ErrnoException).code !== "ENOENT"
        ) {
          throw error;
        }
      }
    }
    if (currentVersion) {
      const bundle = await readProviderBundle();
      const providerChanges = bundle.flatMap((entry) => {
        const path = `${PROVIDER_STAGED_ROOT}/${entry.sourceRelativePath}`;
        const current = currentByPath.get(path)!;
        return current === entry.content
          ? []
          : [
              change(projectRoot, path, PROVIDER_KIND, current, entry.content, [
                providerAttribution(entry.sourceRelativePath),
              ]),
            ];
      });
      const reconciliation = {
        inputs: [
          {
            relativePath: INTEGRATION_MANIFEST_RELATIVE_PATH,
            hash: contentHash(source),
          },
          ...Array.from(currentByPath, ([relativePath, content]) => ({
            relativePath,
            hash: contentHash(content),
          })),
        ],
        providerHashes: bundle.map((entry) => entry.afterHash),
        providerEntries,
      };
      if (providerChanges.length === 0) {
        return {
          projectRoot,
          status: "already-integrated",
          changes: [],
          manifestChange: null,
          finalManifestChange: null,
          reconciliation,
        };
      }
      const manifestChanges = manifest.changes.map((entry) => {
        const updated = providerChanges.find(
          (item) => item.relativePath === entry.relativePath,
        );
        return updated === undefined
          ? entry
          : { ...entry, afterHash: updated.afterHash };
      });
      const applying = serializeIntegrationManifest(
        createIntegrationManifest(manifestChanges, "applying"),
      );
      const applied = serializeIntegrationManifest(
        createIntegrationManifest(manifestChanges, "applied"),
      );
      return {
        projectRoot,
        status: "planned",
        changes: providerChanges,
        reconciliation,
        manifestChange: change(
          projectRoot,
          INTEGRATION_MANIFEST_RELATIVE_PATH,
          "config",
          source,
          applying,
          ["reconcile:provider-line-endings"],
        ),
        finalManifestChange: change(
          projectRoot,
          INTEGRATION_MANIFEST_RELATIVE_PATH,
          "config",
          applying,
          applied,
          ["state:integration-manifest:applied"],
        ),
      };
    }
    if (!currentVersion) {
      const cargoEntry = manifest.changes.find(
        (entry) => entry.kind === "cargo",
      );
      const cargoSource =
        cargoEntry === undefined
          ? null
          : (currentByPath.get(cargoEntry.relativePath) ?? null);
      const nextCargo =
        cargoSource === null
          ? null
          : planCargoEdit(cargoSource, {
              allowLegacyExternalDependency: true,
              allowExistingProviderPath: true,
            });
      const cargoChange =
        cargoEntry !== undefined &&
        cargoSource !== null &&
        nextCargo !== cargoSource
          ? change(
              projectRoot,
              cargoEntry.relativePath,
              "cargo",
              cargoSource,
              nextCargo!,
              [
                ...new Set([
                  ...cargoEntry.attribution,
                  "dependency:tauri-plugin-wdio-webdriver:optional",
                ]),
              ],
            )
          : undefined;
      if (nextCargo !== null) {
        const installed = cargoPluginIntegration(nextCargo);
        if (
          !installed.registered ||
          !isSupportedProviderVersion(installed.version) ||
          installed.path !== PROVIDER_CARGO_PATH
        ) {
          throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
        }
      }
      const capabilityEntry = manifest.changes.find(
        (entry) => entry.kind === "capability",
      );
      if (capabilityEntry === undefined) {
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      }
      const currentCapability =
        currentByPath.get(capabilityEntry.relativePath) ?? "";
      const nextCapability = planCapabilityEdit(
        currentCapability,
        "json",
        windowLabel,
      );
      const capabilityChange =
        currentCapability === nextCapability
          ? undefined
          : change(
              projectRoot,
              capabilityEntry.relativePath,
              "capability",
              currentCapability,
              nextCapability,
              [
                capabilityEntry.attribution[0]!,
                ...AGENT_PERMISSIONS.map(
                  (permission) => `permission:${permission}`,
                ),
              ],
            );
      const providerBundle =
        providerEntries.length === 0 ? await readProviderBundle() : [];
      const providerChanges = providerBundle.map((entry) =>
        change(
          projectRoot,
          `${PROVIDER_STAGED_ROOT}/${entry.sourceRelativePath}`,
          PROVIDER_KIND,
          null,
          entry.content,
          [providerAttribution(entry.sourceRelativePath)],
        ),
      );
      const manifestChanges: IntegrationManifestChange[] = manifest.changes.map(
        (entry) =>
          entry === cargoEntry && cargoChange !== undefined
            ? {
                ...entry,
                afterHash: cargoChange.afterHash,
                attribution: cargoChange.attribution,
              }
            : entry === capabilityEntry
              ? {
                  ...entry,
                  afterHash:
                    capabilityChange?.afterHash ?? capabilityEntry.afterHash,
                  attribution: [
                    capabilityEntry.attribution[0]!,
                    ...AGENT_PERMISSIONS.map(
                      (permission) => `permission:${permission}`,
                    ),
                  ],
                }
              : entry,
      );
      manifestChanges.push(
        ...providerChanges.map(
          ({ relativePath, kind, beforeHash, afterHash, attribution }) => ({
            relativePath,
            kind,
            beforeHash,
            afterHash,
            attribution,
          }),
        ),
      );
      const applyingSource = serializeIntegrationManifest(
        createIntegrationManifest(manifestChanges, "applying"),
      );
      const appliedSource = serializeIntegrationManifest(
        createIntegrationManifest(manifestChanges, "applied"),
      );
      return {
        projectRoot,
        status: "planned",
        changes: [
          ...(cargoChange === undefined ? [] : [cargoChange]),
          ...(capabilityChange === undefined ? [] : [capabilityChange]),
          ...providerChanges,
        ],
        manifestChange: change(
          projectRoot,
          INTEGRATION_MANIFEST_RELATIVE_PATH,
          "config",
          source,
          applyingSource,
          ["upgrade:integration-manifest:v2"],
        ),
        finalManifestChange: change(
          projectRoot,
          INTEGRATION_MANIFEST_RELATIVE_PATH,
          "config",
          applyingSource,
          appliedSource,
          ["state:integration-manifest:applied"],
        ),
      };
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
  const expectedPermissions =
    manifest.version === 1 ? ["wdio-webdriver:default"] : AGENT_PERMISSIONS;
  if (
    capabilityAttribution?.length !== 1 + expectedPermissions.length ||
    !/^derived-from:src-tauri\/capabilities\/[^/]+\.(?:json|toml)$/u.test(
      capabilityAttribution[0] ?? "",
    ) ||
    !expectedPermissions.every(
      (permission, index) =>
        capabilityAttribution[index + 1] === `permission:${permission}`,
    )
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
  const providerEntries = manifest.changes.filter(
    (entry) => entry.kind === PROVIDER_KIND,
  );
  const providerPaths = new Set(
    providerEntries.map((entry) => entry.relativePath),
  );
  if (
    rustEntries.length !== 1 ||
    cargoEntries.length > 1 ||
    providerEntries.some(
      (entry) => !entry.relativePath.startsWith(`${PROVIDER_STAGED_ROOT}/`),
    ) ||
    providerPaths.size !== providerEntries.length ||
    manifest.changes.length !== 4 + cargoEntries.length + providerEntries.length
  ) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  try {
    validateProviderManifestEntries(manifest.changes);
  } catch (error) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED", {
      cause: error,
    });
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
      CARGO_DEPENDENCY_ATTRIBUTION,
      CARGO_DEPENDENCY_PATH_ATTRIBUTION,
      CARGO_FEATURE_CREATED_ATTRIBUTION,
      CARGO_FEATURE_VALUE_ATTRIBUTION,
      CARGO_EOL_LF_ATTRIBUTION,
      CARGO_EOL_CRLF_ATTRIBUTION,
    ]);
    const dependencyEntries = cargoAttribution.filter(
      (value) =>
        value === CARGO_DEPENDENCY_ATTRIBUTION ||
        value === CARGO_DEPENDENCY_PATH_ATTRIBUTION,
    );
    const featureEntries = cargoAttribution.filter((value) =>
      value.startsWith("feature:pumarejo:"),
    );
    const eolEntries = cargoAttribution.filter((value) =>
      value.startsWith("eol:cargo:"),
    );
    if (
      cargoAttribution.length < 1 ||
      cargoAttribution.length > 3 ||
      new Set(cargoAttribution).size !== cargoAttribution.length ||
      cargoAttribution.some((value) => !allowed.has(value)) ||
      dependencyEntries.length !== 1 ||
      featureEntries.length > 1 ||
      eolEntries.length > 1
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
  const existing = await existingIntegration(
    detected.projectRoot,
    detected.primaryWindowLabel,
  );
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
  const providerBundle = await readProviderBundle();
  const providerChanges = providerBundle.map((entry) =>
    change(
      detected.projectRoot,
      `${PROVIDER_STAGED_ROOT}/${entry.sourceRelativePath}`,
      PROVIDER_KIND,
      null,
      entry.content,
      [providerAttribution(entry.sourceRelativePath)],
    ),
  );
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
      planCapabilityEdit(
        capability.source,
        capability.format,
        detected.primaryWindowLabel,
      ),
      [
        `derived-from:${capability.relativePath}`,
        ...AGENT_PERMISSIONS.map((permission) => `permission:${permission}`),
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
    ...providerChanges,
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
  const expectedInputs = new Map(
    plan.reconciliation?.inputs.map((entry) => [
      entry.relativePath,
      entry.hash,
    ]),
  );
  const verifyReconciliation = async () => {
    if (plan.reconciliation === undefined) return;
    for (const [path, expected] of expectedInputs) {
      const current = await readSafeFile(
        plan.projectRoot,
        resolve(plan.projectRoot, path),
        true,
      );
      if (current === null || contentHash(current) !== expected) {
        throw new IntegrationPlanError("PROJECT_CHANGED");
      }
    }
    await validateProviderStaging(
      plan.projectRoot,
      plan.reconciliation.providerEntries,
      { reconcileLineEndings: true },
    );
    const bundle = await readProviderBundle();
    if (
      bundle.some(
        (entry, index) =>
          entry.afterHash !== plan.reconciliation!.providerHashes[index],
      )
    ) {
      throw new IntegrationPlanError("PROJECT_CHANGED");
    }
  };
  await verifyReconciliation();
  if (plan.status === "already-integrated") {
    return { status: "already-integrated", changes: [] };
  }
  if (plan.manifestChange === null || plan.finalManifestChange === null) {
    throw new IntegrationPlanError("WRITE_FAILED");
  }
  const writes = [
    plan.manifestChange,
    ...plan.changes,
    plan.finalManifestChange,
  ];
  await applyWrites(plan.projectRoot, writes, {
    beforeWrite: async (index) => {
      await writeOptions.beforeWrite?.(index);
      if (index > 0 && plan.reconciliation !== undefined) {
        const previous = writes[index - 1];
        expectedInputs.set(previous.relativePath, previous.afterHash);
      }
      await verifyReconciliation();
    },
  });
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
