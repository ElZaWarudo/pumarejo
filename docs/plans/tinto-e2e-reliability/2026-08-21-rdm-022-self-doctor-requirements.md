---
title: RDM-022 self-doctor requirements
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: inherited-initiative-contract
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-022
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
compound_run_id: tinto-e2e-rdm-022-self-doctor
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-022-self-doctor/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: []
---

# RDM-022 self-doctor requirements

## Context and inherited authority

RDM-022 closes REL-015 in the approved Tinto reliability initiative. The
existing project doctor diagnoses a consumer Tauri project, but it cannot
explain a broken Pumarejo installation or the difference between the host
resolver and the environment that a child launch would actually receive. This
item adds a separate, bounded self-diagnostic mode for the Pumarejo package.

The initiative contract is authoritative for bounded sanitized output,
portable toolchain provenance, attribution-based diagnostics, and the settled
repair rule: `doctor --self` recommends exact safe repairs but never deletes,
reinstalls, upgrades, or otherwise mutates dependencies. RDM-017 owns the
structured executable/environment resolver consumed by this item. RDM-020 owns
attributed project-integration drift, and RDM-021 owns generic discovery,
retention, and artifact-cleanup policy; this item must not reimplement those
contracts.

## Actors and outcome

- **Test operator or coding agent:** runs `pumarejo doctor --self` to learn why
  the installed CLI cannot resolve its own files, dependencies, or tools.
- **Pumarejo maintainer:** receives stable check identities and a concrete,
  safe repair suggestion without a destructive recovery attempt.
- **Security reviewer:** verifies that untrusted manifest paths, links,
  junctions, reparse points, environment values, and child output cannot escape
  the diagnostic trust boundary.

The outcome is an actionable report that distinguishes a healthy installation,
an incomplete or inconsistent installation, an unsafe path/link, and an
unavailable resolver probe while retaining enough sanitized evidence to fix the
right layer.

## Scope

`doctor --self` is an additive CLI mode. It checks the installed Pumarejo
package and its bounded dependency surface without requiring a consumer
project. It must cover:

- package entrypoint, package metadata, exported/runtime files, and bounded
  dependency resolution;
- lexical path traversal and canonical containment for every path derived from
  package metadata, including `..`, absolute paths, and malformed export/bin
  entries;
- broken symbolic links, Windows junctions, and other reparse-point-like
  filesystem objects, with no unproven link traversal;
- the selected package manager and lockfile/install coherence, including a
  bounded check of installed metadata rather than a package-manager install;
- expected package and dependency `bin` targets/postinstall-produced binaries
  by presence and safe identity only, never by running lifecycle scripts;
- Node engine compatibility and package-manager compatibility from package
  metadata plus the structured RDM-017 resolver;
- a sanitized comparison of host resolution with the resolver/environment a
  child launch would receive, including version, source, accepted/rejected
  candidate, and mismatch reason; and
- bounded, stable, human and JSON diagnostics with an exact safe repair
  suggestion for each actionable failure.

Existing `doctor [--project <path>] [--json]` behavior remains unchanged. The
self mode is selected explicitly as `doctor --self [--json]`; combining
`--self` with `--project` is invalid rather than ambiguous. The command is
read-only with respect to the package, its dependencies, the current project,
the lockfile, and the host configuration.

## Non-goals

- Automatic deletion, reinstall, upgrade, cache pruning, lockfile rewriting,
  package-manager repair, or postinstall execution.
- Project integration drift attribution (RDM-020), generic repository/artifact
  discovery and retention (RDM-021), process cleanup (RDM-016), or a second
  implementation of RDM-017's resolver algorithm.
- Running arbitrary package scripts, invoking a shell, evaluating manifest
  code, loading application code, following untrusted links, or recursively
  walking `node_modules`, a package store, or the repository.
- Reporting full absolute paths, `PATH`, environment values, command-line
  arguments, lockfile contents, dependency tree contents, secrets, or user
  application data.
- Claiming that a resolver is healthy when host/child evidence is unavailable
  or contradictory.
- Changing MCP behavior, Tauri lifecycle behavior, or the public project doctor
  contract except for the additive `--self` entry point and its documented
  report shape.

## Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| SELF-001 | The CLI exposes an explicit self-diagnostic mode while preserving the existing project mode. | `doctor --self --json` returns a self report; `doctor --project <path>` returns the existing project report; `doctor --self --project <path>` fails as invalid usage without inspection. |
| SELF-002 | Self diagnostics are strictly read-only. | A before/after tree and metadata snapshot is identical after healthy, warning, unsafe-path, malformed-manifest, and resolver-failure runs; no install, delete, rename, chmod, script, or lockfile command is issued. |
| SELF-003 | Every metadata-derived path is bounded, canonicalized, and containment-checked before access. | Traversal (`..`), absolute escape, NUL, overlong, missing-root, and malformed export/bin paths produce a stable unsafe-path diagnostic and never read outside the approved installation roots. |
| SELF-004 | Symlinks, junctions, and reparse-point-like entries are handled fail-closed. | A broken link is reported specifically; a link or junction outside an approved package-store boundary is not followed; an unclassifiable Windows reparse point is reported as unsafe/unknown; traversal remains bounded. |
| SELF-005 | Diagnostics are bounded and sanitized before formatting or serialization. | Output has stable IDs/statuses, finite diagnostic and evidence counts, capped summary/action lengths, only safe basenames/provenance/version/reason codes, and no seeded secrets, full paths, raw environment values, or arbitrary arguments. |
| SELF-006 | Dependency resolution is checked without executing application or package lifecycle code. | Required package exports/imports resolve through the approved resolver, missing or mismatched dependencies identify the dependency class and repair action, and no `preinstall`, `install`, or `postinstall` script is run. |
| SELF-007 | Lockfile and installation metadata are compared for the selected package manager. | The package-manager field, lockfile family/version, package manifest, and bounded installed metadata report coherent, missing, stale, ambiguous, or unsupported states with a specific repair suggestion; no lockfile is changed. |
| SELF-008 | Expected package and postinstall binary surfaces are diagnosed safely. | Declared package bins and bounded dependency bins are checked for presence, regular-file identity, safe link target, and platform compatibility; missing/broken/unsafe binaries are reported without executing them. |
| SELF-009 | Node and package-manager compatibility are evidence-based. | Node engine mismatch, missing package-manager executable, version mismatch, unsupported manager, and an accepted candidate each report sanitized version/source/confidence and an actionable next step. |
| SELF-010 | Host and child resolution differences are explicit. | The report compares host and RDM-017 child candidates by stable identity/version/source and emits `consistent`, `host_only`, `child_only`, `version_mismatch`, `environment_mismatch`, or `unknown` evidence without leaking full paths or environment values. |
| SELF-011 | Repair guidance is advisory and exact enough for an operator. | Every warning/error names the failing check, a safe manual repair or verification command, and whether rerunning `doctor --self` is sufficient; no guidance implies that Pumarejo performed a repair. |
| SELF-012 | The engine is deterministic and testable without a particular host installation. | Filesystem, environment, resolver, clock, process probe, and platform dependencies are injectable; fixture tests cover healthy, drifted, broken-link, reparse/unknown, traversal, and host/child mismatch cases on Windows and Linux paths. |

## Public diagnostic contract

The self report reuses the existing `ready | warn | error` overall status and
stable diagnostic envelope. Its additive self IDs are namespaced under
`self.*`; each item has a bounded `summary`, optional bounded `action`, a
classification/reason code, and sanitized evidence. Human output and JSON
output are projections of the same sanitized in-memory report. The report must
not include a raw path merely because JSON was requested.

The accepted CLI behavior is:

```text
pumarejo doctor --self [--json]
```

The command exits through the existing CLI error/report path. Invalid option
combinations remain usage errors. A diagnostic `error` is represented in the
report and does not authorize a repair operation.

The initial stable self-diagnostic ID set is:

| ID | Meaning |
| --- | --- |
| `self.package.metadata` | Package entrypoint/manifest identity and metadata shape. |
| `self.installation.paths` | Bounded package/export/bin path inspection and containment. |
| `self.installation.links` | Symlink, junction, reparse, and broken-target classification. |
| `self.dependencies.resolution` | Declared export/import and bounded dependency resolution. |
| `self.installation.lockfile` | Package-manager lockfile/install coherence. |
| `self.installation.binaries` | Package/dependency bin and postinstall artifact presence/identity. |
| `self.toolchain.node` | Node engine compatibility. |
| `self.toolchain.package-manager` | Selected manager availability/version/source. |
| `self.toolchain.host-child` | Host versus child resolver/environment comparison. |
| `self.report.bounds` | Truncation or unavailable evidence caused by diagnostic limits. |

Implementations may add a namespaced ID only with a contract review; they must
not rename or repurpose these IDs. The report applies these initial bounds
before formatting or JSON serialization: at most 32 diagnostics, 512 Unicode
characters per summary/action, 64 characters per reason/code, 128 characters
per manager/version/source field, 16 evidence fields per diagnostic, 256
filesystem entries, depth 8, 1 MiB per inspected file, 8 MiB total inspected
bytes, and 5 seconds per external resolver/process probe. A limit emits
`self.report.bounds` with a safe count/reason rather than raw truncated data.

## Security and compatibility invariants

- The self mode never calls `init`, `remove`, an install command, a package
  lifecycle script, or a generic shell.
- Lexical containment is checked before canonicalization, and canonical
  containment is checked after resolving each approved link target. A path that
  cannot be proved safe is not traversed.
- Link, junction, and reparse handling is no-follow by default. Expected
  package-manager links are accepted only with explicit resolver provenance and
  a bounded target boundary; otherwise they remain an advisory/unsafe finding,
  not an implicit traversal permission.
- All host and child environment comparison happens on allowlisted keys and
  normalized metadata. Values, credentials, full PATH entries, and executable
  paths do not cross the report boundary.
- Diagnostic text and package metadata are untrusted data. They cannot change
  the check set, action authority, output limits, or trust boundary.
- Existing project-doctor and CLI contracts remain compatible when `--self` is
  absent.

## Verification contract

Future implementation must provide these focused checks:

```text
pnpm exec vitest run tests/unit/self-doctor.test.ts tests/unit/self-doctor-paths.test.ts
pnpm exec vitest run tests/integration/self-doctor.test.ts
pnpm exec vitest run tests/contract/self-doctor.test.ts
pnpm exec vitest run tests/platform/self-doctor-proof.test.ts
```

The package must also pass the root gates `pnpm build`, `pnpm typecheck`,
`pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm pack:check`. Windows
proof must exercise junction/reparse classification and child-environment
comparison; Linux proof must exercise symlink/no-follow and permission/path
containment behavior. No product tests are run during this artifact-only run.

## Dependency and escalation boundary

- RDM-017 must publish an accepted structured resolver contract for host and
  child candidates, normalized source/version/reason fields, and sanitized
  environment-difference categories. RDM-022 consumes that contract.
- RDM-020 and RDM-021 remain separate owners. If their implementation changes
  the shared doctor dispatcher or path/exclusion helpers, Seneschal must
  serialize the changes and reconcile the consumer tests; RDM-022 does not
  absorb those changes.
- Any proposal to auto-repair, expose raw path/environment evidence, follow an
  unproven link, run a lifecycle script, change existing doctor semantics, or
  make a new public field non-additive is outside this item and must return to
  the brokered decision path.
