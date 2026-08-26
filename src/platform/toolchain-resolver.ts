import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { delimiter, dirname, posix, win32 } from "node:path";

export const TOOLCHAIN_KINDS = [
  "node",
  "npm",
  "pnpm",
  "cargo",
  "rustc",
] as const;
export type ToolchainKind = (typeof TOOLCHAIN_KINDS)[number];

export type ToolchainCandidateSource =
  | "explicit"
  | "child-path"
  | "platform-root"
  | "host-path";

export type ToolchainRejectionCode =
  | "not-found"
  | "not-regular-file"
  | "not-executable"
  | "broken-link"
  | "reparse-uncertain"
  | "outside-root"
  | "unsafe-shim"
  | "wrong-tool"
  | "duplicate"
  | "probe-timeout"
  | "probe-failed"
  | "probe-invalid-output"
  | "probe-unavailable";

export type ToolchainFileKind =
  | "regular-file"
  | "directory"
  | "symbolic-link"
  | "reparse-point"
  | "missing"
  | "unknown";

export interface ToolchainFileMetadata {
  readonly kind: ToolchainFileKind;
  readonly executable?: boolean;
}

export interface ToolchainFileSystem {
  lstat(path: string): Promise<ToolchainFileMetadata>;
  realpath(path: string): Promise<string>;
  readFile(path: string, maxBytes: number): Promise<string>;
}

export interface ToolchainProbeResult {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly timedOut?: boolean;
  readonly unavailable?: boolean;
  readonly residue?: boolean;
}

export interface ToolchainProbeRunner {
  run(
    command: string,
    args: readonly string[],
    options: {
      readonly timeoutMs: number;
      readonly maxOutputBytes: number;
      readonly environment?: NodeJS.ProcessEnv;
    },
  ): Promise<ToolchainProbeResult>;
}

export interface ToolchainShimTarget {
  readonly command: string;
  readonly args: readonly string[];
}

export interface ToolchainCandidate {
  readonly kind: ToolchainKind;
  readonly source: ToolchainCandidateSource;
  readonly path: string;
  readonly basename: string;
  readonly identity: string;
  readonly fileKind: ToolchainFileKind;
  readonly accepted: boolean;
  readonly rejection?: ToolchainRejectionCode;
  readonly version?: string;
  readonly probe?: "success" | "failed" | "timeout" | "invalid" | "unavailable";
  readonly shim?: ToolchainShimTarget;
}

export type ToolchainComparisonDisposition =
  | "consistent"
  | "host_only"
  | "child_only"
  | "version_mismatch"
  | "environment_mismatch"
  | "unknown";

export interface ToolchainComparison {
  readonly disposition: ToolchainComparisonDisposition;
  readonly identity?: string;
  readonly version?: string;
}

export interface ToolchainResolution {
  readonly kind: ToolchainKind;
  readonly accepted?: ToolchainCandidate;
  readonly candidates: readonly ToolchainCandidate[];
  readonly outcome: "resolved" | "unavailable";
  readonly comparison?: ToolchainComparison;
}

export interface ToolchainResolverOptions {
  readonly platform: "windows" | "linux";
  readonly environment: NodeJS.ProcessEnv;
  readonly hostEnvironment?: NodeJS.ProcessEnv;
  readonly explicit?: Partial<
    Record<ToolchainKind, string | readonly string[] | undefined>
  >;
  readonly platformRoots?: readonly string[];
  readonly allowedRoots?: readonly string[];
  readonly fileSystem?: Partial<ToolchainFileSystem>;
  readonly probeRunner?: ToolchainProbeRunner;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly maxCandidates?: number;
  readonly maxShimBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024;
const DEFAULT_MAX_CANDIDATES = 32;
const DEFAULT_MAX_SHIM_BYTES = 64 * 1024;
const BARE_VERSION_PATTERN = /^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/u;
const LABELED_VERSION_PATTERN =
  /^(node|npm|pnpm|cargo|rustc)\s+v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?:\s+\([^\r\n)]{1,128}\))?$/iu;
const WINDOWS_EXTENSIONS = [".COM", ".EXE", ".BAT", ".CMD"] as const;
const TOOL_NAMES: Record<ToolchainKind, string> = {
  node: "node",
  npm: "npm",
  pnpm: "pnpm",
  cargo: "cargo",
  rustc: "rustc",
};
const SAFE_SHIM_PATH = /^(?:[A-Za-z]:[\\/]|[\\/])/u;
const SHIM_DYNAMIC = /(?:\|\||&&|[<>|]|powershell|cmd(?:\.exe)?\s*\/c)/iu;

function pathApi(platform: "windows" | "linux"): typeof posix {
  return platform === "windows" ? win32 : posix;
}

function defaultFileSystem(): ToolchainFileSystem {
  return {
    lstat: async (path) => {
      try {
        const stats = await lstat(path);
        if (stats.isSymbolicLink()) return { kind: "symbolic-link" };
        if (stats.isDirectory()) return { kind: "directory" };
        if (stats.isFile()) {
          return {
            kind: "regular-file",
            executable: (stats.mode & 0o111) !== 0,
          };
        }
        return { kind: "unknown" };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") return { kind: "missing" };
        return { kind: "unknown" };
      }
    },
    realpath,
    readFile: async (path, maxBytes) => {
      const content = await readFile(path);
      if (content.byteLength > maxBytes) throw new Error("oversized shim");
      return content.toString("utf8");
    },
  };
}

function defaultProbeRunner(): ToolchainProbeRunner {
  return {
    run: async (command, args, options) =>
      await new Promise<ToolchainProbeResult>((resolveResult) => {
        const child = spawn(command, [...args], {
          shell: false,
          windowsHide: true,
          env: options.environment,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout: Uint8Array<ArrayBufferLike> = new Uint8Array();
        let stderr: Uint8Array<ArrayBufferLike> = new Uint8Array();
        let settled = false;
        let terminationReason: "timeout" | "overflow" | undefined;
        let timeoutTimer: NodeJS.Timeout | undefined;
        let cleanupTimer: NodeJS.Timeout | undefined;
        const cleanupGraceMs = Math.min(
          Math.max(options.timeoutMs, 100),
          1_000,
        );
        const removeDataListeners = (): void => {
          child.stdout?.removeAllListeners("data");
          child.stderr?.removeAllListeners("data");
        };
        const finish = (result: ToolchainProbeResult): void => {
          if (settled) return;
          settled = true;
          if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
          if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
          removeDataListeners();
          resolveResult({
            stdout: Buffer.from(stdout).toString("utf8"),
            stderr: Buffer.from(stderr).toString("utf8"),
            ...result,
          });
        };
        const requestTermination = (reason: "timeout" | "overflow"): void => {
          if (settled || terminationReason !== undefined) return;
          terminationReason = reason;
          child.kill();
          cleanupTimer = setTimeout(
            () =>
              finish({
                unavailable: true,
                residue: true,
                ...(reason === "timeout" ? { timedOut: true } : {}),
              }),
            cleanupGraceMs,
          );
        };
        const appendBounded = (
          current: Uint8Array,
          other: Uint8Array,
          chunk: Buffer | string,
        ): Uint8Array => {
          const incoming = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk, "utf8");
          const remaining = Math.max(
            options.maxOutputBytes - current.length - other.length,
            0,
          );
          if (incoming.length > remaining) requestTermination("overflow");
          if (remaining === 0) return current;
          return Buffer.concat([current, incoming.subarray(0, remaining)]);
        };
        timeoutTimer = setTimeout(
          () => requestTermination("timeout"),
          options.timeoutMs,
        );
        child.stdout?.on("data", (chunk: Buffer | string) => {
          stdout = appendBounded(stdout, stderr, chunk);
        });
        child.stderr?.on("data", (chunk: Buffer | string) => {
          stderr = appendBounded(stderr, stdout, chunk);
        });
        child.once("error", () => finish({ unavailable: true, exitCode: -1 }));
        child.once("close", (exitCode) => {
          if (terminationReason === "timeout") finish({ timedOut: true });
          else if (terminationReason === "overflow") {
            finish({ unavailable: true });
          } else finish({ exitCode: exitCode ?? -1 });
        });
      }),
  };
}

function inside(
  root: string,
  candidate: string,
  platform: "windows" | "linux",
): boolean {
  const api = pathApi(platform);
  const comparedRoot = platform === "windows" ? root.toLowerCase() : root;
  const comparedCandidate =
    platform === "windows" ? candidate.toLowerCase() : candidate;
  const difference = api.relative(comparedRoot, comparedCandidate);
  return (
    difference === "" ||
    (!difference.startsWith(`..${api.sep}`) &&
      difference !== ".." &&
      !api.isAbsolute(difference))
  );
}

function canonicalIdentity(
  path: string,
  platform: "windows" | "linux",
): string {
  const normalized = pathApi(platform)
    .resolve(path)
    .replace(/[\\/]+/gu, "/");
  return platform === "windows" ? normalized.toLowerCase() : normalized;
}

function safeIdentity(path: string, platform: "windows" | "linux"): string {
  return createHash("sha256")
    .update(canonicalIdentity(path, platform))
    .digest("hex")
    .slice(0, 16);
}

function windowsExtensions(environment: NodeJS.ProcessEnv): readonly string[] {
  const configuredValue = pathValue(environment, "PATHEXT");
  if (configuredValue === undefined) return WINDOWS_EXTENSIONS;
  const configured = configuredValue
    .split(";")
    .map((extension) => extension.trim().toUpperCase())
    .filter((extension) =>
      WINDOWS_EXTENSIONS.includes(
        extension as (typeof WINDOWS_EXTENSIONS)[number],
      ),
    );
  return [...new Set(configured)];
}

function candidateNames(
  kind: ToolchainKind,
  platform: "windows" | "linux",
  environment: NodeJS.ProcessEnv,
): readonly string[] {
  const base = TOOL_NAMES[kind];
  return platform === "windows"
    ? windowsExtensions(environment).map(
        (extension) => `${base}${extension.toLowerCase()}`,
      )
    : [base];
}

function pathValue(
  environment: NodeJS.ProcessEnv,
  key: string,
): string | undefined {
  const found = Object.keys(environment).find(
    (candidate) => candidate.toUpperCase() === key,
  );
  return found === undefined ? undefined : environment[found];
}

function explicitValues(
  value: string | readonly string[] | undefined,
): readonly string[] {
  return value === undefined ? [] : typeof value === "string" ? [value] : value;
}

function commandCandidates(
  kind: ToolchainKind,
  platform: "windows" | "linux",
  directory: string,
  environment: NodeJS.ProcessEnv,
): readonly string[] {
  return candidateNames(kind, platform, environment).map((name) =>
    pathApi(platform).join(directory, name),
  );
}

function hasExpectedCandidateName(
  kind: ToolchainKind,
  candidate: string,
  platform: "windows" | "linux",
): boolean {
  const basename = pathApi(platform).basename(candidate);
  if (platform === "linux") return basename === TOOL_NAMES[kind];
  const lower = basename.toLowerCase();
  const base = TOOL_NAMES[kind].toLowerCase();
  if (lower === base) return true;
  return WINDOWS_EXTENSIONS.some(
    (extension) => lower === `${base}${extension.toLowerCase()}`,
  );
}

function parseShim(
  source: string,
  shimPath: string,
  kind: ToolchainKind,
): ToolchainShimTarget | undefined {
  if (source.includes("\0") || SHIM_DYNAMIC.test(source)) return undefined;
  const directory = win32.dirname(shimPath);
  const variables = new Map<string, string>([
    ["dp0", `${directory}${win32.sep}`],
  ]);
  for (const line of source.split(/\r?\n/u)) {
    const match = /^\s*SET\s+"?([A-Za-z_][A-Za-z0-9_]*)=(.*?)"?\s*$/iu.exec(
      line,
    );
    if (match !== null) variables.set(match[1]!.toLowerCase(), match[2]!);
  }
  const expand = (token: string): string => {
    let result = token.replaceAll("%~dp0", `${directory}${win32.sep}`);
    for (let pass = 0; pass < 8; pass += 1) {
      const next = result.replace(
        /%([A-Za-z_][A-Za-z0-9_]*)%/gu,
        (match, name) => {
          return variables.get(String(name).toLowerCase()) ?? match;
        },
      );
      if (next === result) break;
      result = next;
    }
    return result;
  };
  const tokens = [...source.matchAll(/"([^"\r\n]+)"/gu)].map((match) =>
    expand(match[1]!),
  );
  const scripts = tokens.filter((token) => /\.(?:cjs|mjs|js)$/iu.test(token));
  const cli = scripts.find((token) => {
    const lower = win32.basename(token).toLowerCase();
    return lower.includes(kind) || lower.includes("corepack");
  });
  if (cli === undefined || !SAFE_SHIM_PATH.test(cli) || /%[^%]+%/u.test(cli))
    return undefined;
  const node = tokens.find((token) =>
    /(?:^|[\\/])node(?:\.exe)?$/iu.test(token),
  );
  if (node === undefined || !SAFE_SHIM_PATH.test(node)) return undefined;
  return { command: node, args: [cli] };
}

function parseVersion(
  kind: ToolchainKind,
  output: string | undefined,
  maxOutputBytes: number,
): { readonly version?: string; readonly wrongTool: boolean } {
  if (
    output === undefined ||
    Buffer.byteLength(output, "utf8") > maxOutputBytes
  ) {
    return { wrongTool: false };
  }
  const trimmed = output.trim();
  const labeled = LABELED_VERSION_PATTERN.exec(trimmed);
  if (labeled !== null) {
    return labeled[1]!.toLowerCase() === kind
      ? { version: labeled[2], wrongTool: false }
      : { wrongTool: true };
  }
  const bare = BARE_VERSION_PATTERN.exec(trimmed)?.[1];
  if (kind === "node") {
    return trimmed.startsWith("v") && bare !== undefined
      ? { version: bare, wrongTool: false }
      : { wrongTool: bare !== undefined };
  }
  if (kind === "npm" || kind === "pnpm") {
    return { version: bare, wrongTool: false };
  }
  return { wrongTool: bare !== undefined };
}

function rejectionCandidate(
  kind: ToolchainKind,
  source: ToolchainCandidateSource,
  path: string,
  rejection: ToolchainRejectionCode,
  fileKind: ToolchainFileKind = "unknown",
  platform: "windows" | "linux" = "windows",
): ToolchainCandidate {
  return {
    kind,
    source,
    path,
    basename: pathApi(platform).basename(path),
    identity: safeIdentity(path, platform),
    fileKind,
    accepted: false,
    rejection,
  };
}

interface ValidatedToolchainPath {
  readonly canonical: string;
  readonly metadata: ToolchainFileMetadata;
}

async function validateToolchainPath(
  path: string,
  options: {
    readonly platform: "windows" | "linux";
    readonly fileSystem: ToolchainFileSystem;
    readonly allowedRoots: readonly string[];
    readonly requireExecutable: boolean;
  },
): Promise<
  | { readonly validated: ValidatedToolchainPath }
  | {
      readonly rejection: ToolchainRejectionCode;
      readonly path: string;
      readonly fileKind: ToolchainFileKind;
    }
> {
  let metadata: ToolchainFileMetadata;
  try {
    metadata = await options.fileSystem.lstat(path);
  } catch {
    return { rejection: "probe-unavailable", path, fileKind: "unknown" };
  }
  if (metadata.kind !== "regular-file") {
    const rejection: ToolchainRejectionCode =
      metadata.kind === "symbolic-link"
        ? "broken-link"
        : metadata.kind === "reparse-point"
          ? "reparse-uncertain"
          : metadata.kind === "directory"
            ? "not-regular-file"
            : metadata.kind === "missing"
              ? "not-found"
              : "probe-unavailable";
    return { rejection, path, fileKind: metadata.kind };
  }
  if (
    options.platform === "linux" &&
    options.requireExecutable &&
    metadata.executable !== true
  ) {
    return {
      rejection: "not-executable",
      path,
      fileKind: metadata.kind,
    };
  }
  let canonical: string;
  try {
    canonical = await options.fileSystem.realpath(path);
  } catch {
    return { rejection: "broken-link", path, fileKind: metadata.kind };
  }
  if (
    options.allowedRoots.length > 0 &&
    !options.allowedRoots.some((root) =>
      inside(
        pathApi(options.platform).resolve(root),
        pathApi(options.platform).resolve(canonical),
        options.platform,
      ),
    )
  ) {
    return {
      rejection: "outside-root",
      path: canonical,
      fileKind: metadata.kind,
    };
  }
  if (
    options.platform === "windows" &&
    canonicalIdentity(path, options.platform) !==
      canonicalIdentity(canonical, options.platform)
  ) {
    return {
      rejection: "reparse-uncertain",
      path: canonical,
      fileKind: "reparse-point",
    };
  }
  return { validated: { canonical, metadata } };
}

async function stillSameToolchainPath(
  expected: ValidatedToolchainPath,
  options: {
    readonly platform: "windows" | "linux";
    readonly fileSystem: ToolchainFileSystem;
    readonly allowedRoots: readonly string[];
    readonly requireExecutable: boolean;
  },
): Promise<boolean> {
  const checked = await validateToolchainPath(expected.canonical, options);
  return (
    "validated" in checked &&
    canonicalIdentity(checked.validated.canonical, options.platform) ===
      canonicalIdentity(expected.canonical, options.platform)
  );
}

function executionIdentity(
  paths: readonly string[],
  platform: "windows" | "linux",
): string {
  const digest = createHash("sha256");
  for (const path of paths) {
    digest.update(canonicalIdentity(path, platform));
    digest.update("\0");
  }
  return digest.digest("hex").slice(0, 16);
}

async function resolveCandidate(
  kind: ToolchainKind,
  source: ToolchainCandidateSource,
  path: string,
  options: Required<
    Pick<
      ToolchainResolverOptions,
      "platform" | "timeoutMs" | "maxOutputBytes" | "maxShimBytes"
    >
  > & {
    readonly fileSystem: ToolchainFileSystem;
    readonly probeRunner: ToolchainProbeRunner;
    readonly allowedRoots: readonly string[];
    readonly environment: NodeJS.ProcessEnv;
  },
): Promise<ToolchainCandidate> {
  if (!hasExpectedCandidateName(kind, path, options.platform)) {
    return rejectionCandidate(
      kind,
      source,
      path,
      "wrong-tool",
      "unknown",
      options.platform,
    );
  }
  const initial = await validateToolchainPath(path, {
    platform: options.platform,
    fileSystem: options.fileSystem,
    allowedRoots: options.allowedRoots,
    requireExecutable: true,
  });
  if (!("validated" in initial)) {
    return rejectionCandidate(
      kind,
      source,
      initial.path,
      initial.rejection,
      initial.fileKind,
      options.platform,
    );
  }
  const { canonical, metadata } = initial.validated;
  let shim: ToolchainShimTarget | undefined;
  if (
    options.platform === "windows" &&
    [".cmd", ".bat"].includes(
      pathApi(options.platform).extname(canonical).toLowerCase(),
    )
  ) {
    try {
      shim = parseShim(
        await options.fileSystem.readFile(canonical, options.maxShimBytes),
        canonical,
        kind,
      );
    } catch {
      shim = undefined;
    }
    if (shim === undefined) {
      return rejectionCandidate(
        kind,
        source,
        canonical,
        "unsafe-shim",
        metadata.kind,
        options.platform,
      );
    }
  }
  let validatedCommand: ValidatedToolchainPath | undefined;
  let validatedCli: ValidatedToolchainPath | undefined;
  if (shim !== undefined) {
    const command = await validateToolchainPath(shim.command, {
      platform: options.platform,
      fileSystem: options.fileSystem,
      allowedRoots: options.allowedRoots,
      requireExecutable: true,
    });
    const cliPath = shim.args[0];
    const cli =
      cliPath === undefined
        ? undefined
        : await validateToolchainPath(cliPath, {
            platform: options.platform,
            fileSystem: options.fileSystem,
            allowedRoots: options.allowedRoots,
            requireExecutable: false,
          });
    if (
      !("validated" in command) ||
      cli === undefined ||
      !("validated" in cli)
    ) {
      const rejected = !("validated" in command)
        ? command
        : cli !== undefined && !("validated" in cli)
          ? cli
          : undefined;
      return rejectionCandidate(
        kind,
        source,
        rejected?.path ?? canonical,
        rejected?.rejection ?? "unsafe-shim",
        rejected?.fileKind ?? metadata.kind,
        options.platform,
      );
    }
    validatedCommand = command.validated;
    validatedCli = cli.validated;
    shim = {
      command: validatedCommand.canonical,
      args: [validatedCli.canonical],
    };
  }
  const pathsToRevalidate = [
    ...(shim === undefined ? [initial.validated] : []),
    ...(validatedCommand === undefined ? [] : [validatedCommand]),
    ...(validatedCli === undefined ? [] : [validatedCli]),
  ];
  const stable = await Promise.all(
    pathsToRevalidate.map(
      async (candidate, index) =>
        await stillSameToolchainPath(candidate, {
          platform: options.platform,
          fileSystem: options.fileSystem,
          allowedRoots: options.allowedRoots,
          requireExecutable: shim === undefined || index === 0,
        }),
    ),
  );
  if (stable.some((value) => !value)) {
    return rejectionCandidate(
      kind,
      source,
      canonical,
      "reparse-uncertain",
      metadata.kind,
      options.platform,
    );
  }
  const probeCommand = shim?.command ?? canonical;
  const probeArgs =
    shim === undefined ? ["--version"] : [...shim.args, "--version"];
  const probe = await options.probeRunner.run(probeCommand, probeArgs, {
    timeoutMs: options.timeoutMs,
    maxOutputBytes: options.maxOutputBytes,
    environment: options.environment,
  });
  if (probe.unavailable === true || probe.residue === true) {
    return {
      ...rejectionCandidate(
        kind,
        source,
        canonical,
        "probe-unavailable",
        metadata.kind,
        options.platform,
      ),
      probe: "unavailable",
    };
  }
  if (probe.timedOut === true) {
    return {
      ...rejectionCandidate(
        kind,
        source,
        canonical,
        "probe-timeout",
        metadata.kind,
        options.platform,
      ),
      probe: "timeout",
    };
  }
  if (probe.exitCode !== 0 || probe.exitCode === undefined) {
    return {
      ...rejectionCandidate(
        kind,
        source,
        canonical,
        "probe-failed",
        metadata.kind,
        options.platform,
      ),
      probe: "failed",
    };
  }
  const parsed = parseVersion(kind, probe.stdout, options.maxOutputBytes);
  if (parsed.wrongTool) {
    return {
      ...rejectionCandidate(
        kind,
        source,
        canonical,
        "wrong-tool",
        metadata.kind,
        options.platform,
      ),
      probe: "invalid",
    };
  }
  if (parsed.version === undefined) {
    return {
      ...rejectionCandidate(
        kind,
        source,
        canonical,
        "probe-invalid-output",
        metadata.kind,
        options.platform,
      ),
      probe: "invalid",
    };
  }
  return {
    kind,
    source,
    path: canonical,
    basename: pathApi(options.platform).basename(canonical),
    identity: executionIdentity(
      shim === undefined ? [canonical] : [probeCommand, ...shim.args],
      options.platform,
    ),
    fileKind: metadata.kind,
    accepted: true,
    version: parsed.version,
    probe: "success",
    ...(shim === undefined ? {} : { shim }),
  };
}

interface ToolchainCandidatePath {
  readonly path: string;
  readonly source: ToolchainCandidateSource;
}

function pathDirectories(
  environment: NodeJS.ProcessEnv,
  platform: "windows" | "linux",
): readonly string[] {
  return (pathValue(environment, "PATH") ?? "")
    .split(platform === "windows" ? ";" : delimiter)
    .filter(Boolean);
}

function explicitCandidatePaths(
  kind: ToolchainKind,
  options: ToolchainResolverOptions,
  sourceEnvironment: NodeJS.ProcessEnv,
): readonly ToolchainCandidatePath[] {
  const configured = explicitValues(options.explicit?.[kind]);
  return configured.flatMap((value) =>
    pathApi(options.platform).isAbsolute(value)
      ? [{ path: value, source: "explicit" as const }]
      : pathDirectories(sourceEnvironment, options.platform).map(
          (directory) => ({
            path: pathApi(options.platform).join(directory, value),
            source: "explicit" as const,
          }),
        ),
  );
}

function environmentCandidatePaths(
  kind: ToolchainKind,
  options: ToolchainResolverOptions,
  sourceEnvironment: NodeJS.ProcessEnv,
  source: "child-path" | "host-path",
): readonly ToolchainCandidatePath[] {
  return pathDirectories(sourceEnvironment, options.platform).flatMap(
    (directory) =>
      commandCandidates(
        kind,
        options.platform,
        directory,
        sourceEnvironment,
      ).map((path) => ({ path, source })),
  );
}

function platformCandidatePaths(
  kind: ToolchainKind,
  options: ToolchainResolverOptions,
  sourceEnvironment: NodeJS.ProcessEnv,
): readonly ToolchainCandidatePath[] {
  return (options.platformRoots ?? []).flatMap((directory) =>
    commandCandidates(kind, options.platform, directory, sourceEnvironment).map(
      (path) => ({ path, source: "platform-root" as const }),
    ),
  );
}

function boundedCandidatePaths(
  tiers: readonly (readonly ToolchainCandidatePath[])[],
  maxCandidates: number,
): readonly ToolchainCandidatePath[] {
  const active = tiers
    .map((tier, index) => ({ tier, index }))
    .filter(({ tier }) => tier.length > 0);
  const quotas = tiers.map(() => 0);
  let remaining = maxCandidates;
  for (const { index } of active) {
    if (remaining === 0) break;
    quotas[index] = 1;
    remaining -= 1;
  }
  while (remaining > 0) {
    let allocated = false;
    for (const { tier, index } of active) {
      if (remaining === 0) break;
      if (quotas[index]! >= tier.length) continue;
      quotas[index] = quotas[index]! + 1;
      remaining -= 1;
      allocated = true;
    }
    if (!allocated) break;
  }
  return tiers.flatMap((tier, index) => tier.slice(0, quotas[index]));
}

async function resolveOne(
  kind: ToolchainKind,
  options: ToolchainResolverOptions,
  sourceEnvironment: NodeJS.ProcessEnv,
  source: ToolchainCandidateSource,
): Promise<ToolchainResolution> {
  const fileSystem = { ...defaultFileSystem(), ...options.fileSystem };
  const probeRunner = options.probeRunner ?? defaultProbeRunner();
  const maxCandidates = Math.min(
    Math.max(Math.trunc(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES), 1),
    128,
  );
  const roots = options.allowedRoots ?? [];
  const candidates: ToolchainCandidate[] = [];
  const seen = new Set<string>();
  const paths = boundedCandidatePaths(
    source === "child-path"
      ? [
          explicitCandidatePaths(kind, options, sourceEnvironment),
          environmentCandidatePaths(
            kind,
            options,
            sourceEnvironment,
            "child-path",
          ),
          platformCandidatePaths(kind, options, sourceEnvironment),
        ]
      : [
          environmentCandidatePaths(
            kind,
            options,
            sourceEnvironment,
            "host-path",
          ),
        ],
    maxCandidates,
  );
  for (const candidatePath of paths) {
    const key = canonicalIdentity(candidatePath.path, options.platform);
    if (seen.has(key)) {
      candidates.push(
        rejectionCandidate(
          kind,
          candidatePath.source,
          candidatePath.path,
          "duplicate",
          "unknown",
          options.platform,
        ),
      );
      continue;
    }
    seen.add(key);
    candidates.push(
      await resolveCandidate(kind, candidatePath.source, candidatePath.path, {
        platform: options.platform,
        timeoutMs: Math.min(
          Math.max(Math.trunc(options.timeoutMs ?? DEFAULT_TIMEOUT_MS), 1),
          60_000,
        ),
        maxOutputBytes: Math.min(
          Math.max(
            Math.trunc(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES),
            128,
          ),
          64 * 1024,
        ),
        maxShimBytes: Math.min(
          Math.max(
            Math.trunc(options.maxShimBytes ?? DEFAULT_MAX_SHIM_BYTES),
            256,
          ),
          256 * 1024,
        ),
        fileSystem,
        probeRunner,
        allowedRoots: roots,
        environment: sourceEnvironment,
      }),
    );
  }
  const accepted = candidates.find((candidate) => candidate.accepted);
  return {
    kind,
    ...(accepted === undefined ? {} : { accepted }),
    candidates,
    outcome: accepted === undefined ? "unavailable" : "resolved",
  };
}

function compareOne(
  host: ToolchainResolution | undefined,
  child: ToolchainResolution,
): ToolchainComparison {
  const hostCandidate = host?.accepted;
  const childCandidate = child.accepted;
  if (hostCandidate === undefined && childCandidate === undefined) {
    return { disposition: "unknown" };
  }
  if (hostCandidate === undefined)
    return {
      disposition: "child_only",
      identity: childCandidate?.identity,
      version: childCandidate?.version,
    };
  if (childCandidate === undefined)
    return {
      disposition: "host_only",
      identity: hostCandidate.identity,
      version: hostCandidate.version,
    };
  if (hostCandidate.identity !== childCandidate.identity) {
    return hostCandidate.version === childCandidate.version
      ? {
          disposition: "environment_mismatch",
          identity: childCandidate.identity,
          version: childCandidate.version,
        }
      : {
          disposition: "version_mismatch",
          identity: childCandidate.identity,
          version: childCandidate.version,
        };
  }
  return hostCandidate.version === childCandidate.version
    ? {
        disposition: "consistent",
        identity: childCandidate.identity,
        version: childCandidate.version,
      }
    : {
        disposition: "version_mismatch",
        identity: childCandidate.identity,
        version: childCandidate.version,
      };
}

export async function resolveToolchain(
  kind: ToolchainKind,
  options: ToolchainResolverOptions,
): Promise<ToolchainResolution> {
  const child = await resolveOne(
    kind,
    options,
    options.environment,
    "child-path",
  );
  if (options.hostEnvironment === undefined) return child;
  const host = await resolveOne(
    kind,
    {
      ...options,
      hostEnvironment: undefined,
      explicit: undefined,
      platformRoots: undefined,
    },
    options.hostEnvironment,
    "host-path",
  );
  return { ...child, comparison: compareOne(host, child) };
}

export async function resolveToolchains(
  options: ToolchainResolverOptions,
): Promise<Readonly<Record<ToolchainKind, ToolchainResolution>>> {
  const entries = await Promise.all(
    TOOLCHAIN_KINDS.map(
      async (kind) => [kind, await resolveToolchain(kind, options)] as const,
    ),
  );
  return Object.fromEntries(entries) as Readonly<
    Record<ToolchainKind, ToolchainResolution>
  >;
}

export const resolvePortableToolchains = resolveToolchains;
