import { isAbsolute, relative, resolve, sep } from "node:path";

export const DEFAULT_DISCOVERY_EXCLUSIONS = [
  ".git",
  ".worktrees",
  ".pumarejo",
  "node_modules",
  "target",
] as const;

export type DiscoveryPathKind = "file" | "directory" | "other" | "missing";

export interface DiscoveryExclusionPolicy {
  /** The root from which relative entry names are evaluated. */
  readonly root?: string;
  /** Canonical or normalized roots owned by the runtime/artifact store. */
  readonly ownedRoots?: readonly string[];
  /** Additional directory names owned by the caller. */
  readonly names?: readonly string[];
  readonly platform?: NodeJS.Platform;
}

export interface ExplicitFixtureFacts {
  readonly requestedPath: string;
  readonly allowedRoot: string;
  readonly canonicalRoot: string;
  readonly canonicalPath: string;
  readonly kind: DiscoveryPathKind;
  readonly isSymbolicLink: boolean;
  /** Parent components must also be proven regular, non-linked directories. */
  readonly parentIsSymbolicLink?: boolean;
  /** Optional normalized/repeated observations used to bind path identity. */
  readonly normalizedRequestedPath?: string;
  readonly revalidatedRequestedPath?: string;
  /** True only when the final lstat/realpath observation was repeated. */
  readonly revalidated: boolean;
  /** Optional second canonical observation used to model replacement races. */
  readonly revalidatedCanonicalPath?: string;
  readonly platform?: NodeJS.Platform;
}

export type ExplicitFixtureRejection =
  | "invalid-path"
  | "outside-allowed-root"
  | "canonical-escape"
  | "linked"
  | "replacement-race"
  | "not-revalidated"
  | "missing"
  | "not-regular";

export type ExplicitFixtureValidation =
  | {
      readonly accepted: true;
      readonly normalizedPath: string;
      readonly canonicalPath: string;
      readonly kind: Exclude<DiscoveryPathKind, "other" | "missing">;
    }
  | {
      readonly accepted: false;
      readonly reason: ExplicitFixtureRejection;
    };

function pathKey(value: string, platform?: NodeJS.Platform): string {
  return platform === "win32" ? value.toLowerCase() : value;
}

function contained(
  root: string,
  candidate: string,
  platform?: NodeJS.Platform,
): boolean {
  const rootKey = pathKey(resolve(root), platform);
  const candidateKey = pathKey(resolve(candidate), platform);
  const difference = relative(rootKey, candidateKey);
  return (
    difference === "" ||
    (difference !== ".." &&
      !difference.startsWith(`..${sep}`) &&
      !isAbsolute(difference))
  );
}

function pathSegments(root: string, candidate: string): readonly string[] {
  const difference = relative(resolve(root), resolve(candidate));
  return difference.split(sep).filter(Boolean);
}

/**
 * Returns whether a path must be excluded before the caller opens or queues it.
 * This is deliberately only a predicate: it never traverses, follows, or
 * deletes a path.
 */
export function shouldExcludeBeforeEnumeration(
  candidatePath: string,
  policy: DiscoveryExclusionPolicy = {},
): boolean {
  let candidate: string;
  try {
    candidate = resolve(candidatePath);
  } catch {
    return true;
  }

  const names = [
    ...DEFAULT_DISCOVERY_EXCLUSIONS,
    ...(policy.names ?? []),
  ].filter((name) => name.length > 0);
  const keys = new Set(
    names.map((name) => pathKey(name.replace(/[\\/]+$/u, ""), policy.platform)),
  );
  if (policy.root !== undefined) {
    for (const segment of pathSegments(policy.root, candidate)) {
      if (keys.has(pathKey(segment, policy.platform))) return true;
    }
  } else {
    const segments = candidate.split(/[\\/]+/u).filter(Boolean);
    if (
      segments.some((segment) => keys.has(pathKey(segment, policy.platform)))
    ) {
      return true;
    }
  }

  for (const ownedRoot of policy.ownedRoots ?? []) {
    try {
      if (contained(ownedRoot, candidate, policy.platform)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** Alias suitable for callers that describe the operation as a directory test. */
export const isExcludedDirectory = shouldExcludeBeforeEnumeration;

/**
 * Validate an explicit fixture using already-observed filesystem facts.
 * Callers must obtain these facts with lstat/realpath immediately before the
 * read; this pure helper intentionally has no filesystem side effects.
 */
export function validateExplicitFixture(
  facts: ExplicitFixtureFacts,
): ExplicitFixtureValidation {
  let normalizedPath: string;
  try {
    normalizedPath = resolve(facts.requestedPath);
    if (!contained(facts.allowedRoot, normalizedPath, facts.platform)) {
      return { accepted: false, reason: "outside-allowed-root" };
    }
    if (
      !contained(facts.allowedRoot, facts.canonicalRoot, facts.platform) ||
      !contained(facts.canonicalRoot, facts.canonicalPath, facts.platform)
    ) {
      return { accepted: false, reason: "canonical-escape" };
    }
  } catch {
    return { accepted: false, reason: "invalid-path" };
  }

  if (facts.isSymbolicLink) return { accepted: false, reason: "linked" };
  if (facts.parentIsSymbolicLink === true) {
    return { accepted: false, reason: "linked" };
  }
  if (!facts.revalidated) {
    return { accepted: false, reason: "not-revalidated" };
  }
  if (!samePath(normalizedPath, facts.canonicalPath, facts.platform)) {
    return { accepted: false, reason: "replacement-race" };
  }
  if (
    facts.normalizedRequestedPath !== undefined &&
    !samePath(normalizedPath, facts.normalizedRequestedPath, facts.platform)
  ) {
    return { accepted: false, reason: "replacement-race" };
  }
  if (
    facts.revalidatedRequestedPath !== undefined &&
    !samePath(normalizedPath, facts.revalidatedRequestedPath, facts.platform)
  ) {
    return { accepted: false, reason: "replacement-race" };
  }
  if (
    facts.revalidatedCanonicalPath !== undefined &&
    !samePath(
      facts.canonicalPath,
      facts.revalidatedCanonicalPath,
      facts.platform,
    )
  ) {
    return { accepted: false, reason: "replacement-race" };
  }
  if (facts.kind === "missing") return { accepted: false, reason: "missing" };
  if (facts.kind === "other") {
    return { accepted: false, reason: "not-regular" };
  }
  return {
    accepted: true,
    normalizedPath,
    canonicalPath: resolve(facts.canonicalPath),
    kind: facts.kind,
  };
}

function samePath(
  left: string,
  right: string,
  platform?: NodeJS.Platform,
): boolean {
  return pathKey(resolve(left), platform) === pathKey(resolve(right), platform);
}

/**
 * A compact entry-level helper for an enumerator: apply the exclusion before
 * opening a directory or queueing its children.
 */
export function filterDiscoveryEntries<T extends { readonly path: string }>(
  entries: readonly T[],
  policy: DiscoveryExclusionPolicy = {},
): readonly T[] {
  return entries.filter(
    (entry) => !shouldExcludeBeforeEnumeration(entry.path, policy),
  );
}
