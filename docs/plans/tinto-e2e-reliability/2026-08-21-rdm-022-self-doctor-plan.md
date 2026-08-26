---
title: RDM-022 self-doctor implementation plan
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-022
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-requirements.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
compound_run_id: tinto-e2e-rdm-022-self-doctor
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-022-self-doctor/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
units: [U50, U51, U52, U53]
open_decisions: []
---

# RDM-022 self-doctor implementation plan

## Outcome

Add a read-only `pumarejo doctor --self` mode that explains broken or
incoherent Pumarejo installations without changing them. The implementation
uses a bounded self-doctor engine, no-follow path inspection, manager-specific
install/lock checks, safe binary presence checks, and an RDM-017-backed host vs
child resolver comparison. Existing project doctor behavior remains unchanged
when `--self` is absent.

The plan is implementation-ready. Its only external dependency is the accepted
RDM-017 resolver contract; until that contract is available, U53 can expose a
typed `unknown`/`resolver-not-available` result but must not claim a healthy
child environment.

## Constraints and inherited contracts

- Preserve the approved no-delete/no-reinstall/no-upgrade rule for
  `doctor --self`; all repair guidance is advisory.
- Preserve `doctor --project <path>` and existing diagnostic IDs/statuses.
- Reuse the current bounded diagnostic/report conventions and the sanitized
  launch-environment policy; do not expose full paths, PATH values, arguments,
  lockfile content, or environment values.
- Consume RDM-017's structured resolver and host/child environment evidence;
  do not fork a second toolchain resolver.
- Inspect only known package metadata, expected exports/bin targets, bounded
  installed metadata, and resolver candidates. Do not recursively scan a
  package store or run package scripts.
- Treat links/junctions/reparse points as a security boundary. A target that
  cannot be proved safe is not traversed.
- Keep implementation and test paths under the RDM-022 ownership map; shared
  dispatcher or resolver files require serial reconciliation by the parent.

## Implementation units

| Unit | Scope and deliverable | Dependencies | Primary surfaces | Focused proof |
| --- | --- | --- | --- | --- |
| U50 | Add explicit `--self` parsing/dispatch and a stable bounded self-report envelope. Keep project doctor dispatch unchanged and project/self option combinations unambiguous. | Approved SELF-001/SELF-005 contract; existing CLI/report conventions. | `src/cli/parse.ts`, `src/cli/doctor.ts`, `src/installer/self-doctor.ts`, `src/shared/` only for additive types if needed. | CLI parsing/usage matrix, stable human/JSON projection, output-bound and read-only orchestration tests. |
| U51 | Implement safe bounded installation inspection: approved roots, lexical/canonical containment, no-follow links, broken-link classification, junction/reparse/unknown handling, and finite traversal. | U50; current config/path safety helpers; platform test seams. | `src/installer/self-doctor-paths.ts` or equivalent RDM-022-owned module, `src/installer/self-doctor.ts`. | Traversal/absolute/NUL/overlong paths, outside targets, broken symlinks, junctions, unknown reparse entries, link races, and unchanged-tree fixtures. |
| U52 | Add package/lock/install coherence and postinstall-binary checks without script execution. Verify package metadata, selected manager/lock family, installed metadata, expected package/dependency bin targets, and safe target identity. | U50/U51; package-manager metadata conventions; no RDM-020/021 ownership claims. | RDM-022 self-doctor modules, bounded manifest/lock readers, `tests/unit`, `tests/integration`, `tests/contract`, fixtures. | Healthy and stale lock/install cases, missing/ambiguous manager, missing/broken/unsafe bins, lifecycle non-execution, and sanitized repair guidance. |
| U53 | Consume RDM-017 structured host/child resolver evidence and report normalized compatibility differences, Node engine result, manager version/source/rejection reason, and conservative unavailable state. | U50; accepted RDM-017 resolver contract and launch-environment comparison. | `src/installer/self-doctor.ts`, resolver adapter seam only; no RDM-017 algorithm edits. | Host-only/child-only/version mismatch/environment mismatch/consistent/unknown matrix on Windows and Linux, with path/env redaction and resolver timeout handling. |

## Technical design

### U50 — CLI and report boundary

1. Extend the CLI invocation model with a boolean self mode and a parser rule
   that rejects `--self` with `--project`. Keep `--json` valid in either doctor
   mode and preserve current defaults for every other command.
2. Dispatch self mode to an isolated engine (`src/installer/self-doctor.ts` or
   a same-scope module) rather than adding self-specific branches throughout
   the project doctor. The engine receives injected platform, filesystem,
   resolver, process, clock, and environment dependencies.
3. Define additive self diagnostic IDs and a bounded report type. The report
   includes only stable reason/classification codes, sanitized executable
   basenames, manager names, versions, source labels, finite counts, and
   operator-safe actions. Apply limits before both human formatting and JSON
   serialization; do not sanitize only at the final formatter.
4. Keep overall status and CLI error routing compatible. A report with an
   `error` diagnostic is still a truthful report; it never triggers a repair or
   process exit path that could be mistaken for automatic remediation.

The stable initial IDs are `self.package.metadata`,
`self.installation.paths`, `self.installation.links`,
`self.dependencies.resolution`, `self.installation.lockfile`,
`self.installation.binaries`, `self.toolchain.node`,
`self.toolchain.package-manager`, `self.toolchain.host-child`, and
`self.report.bounds`. Apply these limits before either formatter: 32
diagnostics; 512 Unicode characters per summary/action; 64 characters per
reason/code; 128 characters per manager/version/source; 16 evidence fields per
diagnostic; 256 filesystem entries; depth 8; 1 MiB per inspected file; 8 MiB
total inspected bytes; and 5 seconds per resolver/process probe. A limit is a
bounded `self.report.bounds` result, never raw truncation.

### U51 — Safe installation graph inspection

1. Determine the approved inspection root from the actual installed package
   entrypoint and resolver provenance. Reject a root that is missing, outside
   the expected package boundary, or itself an unverified link; report the
   reason without attempting a broad search.
2. Normalize every metadata-derived relative path and reject absolute paths,
   `..` escapes, NULs, overlong values, and path separators that cross the
   declared platform boundary. Check lexical containment before access and
   canonical containment after every permitted target resolution.
3. Inspect only a fixed list of package metadata, exports, bin entries,
   dependency manifests, lock metadata, and resolver-selected candidates.
   Enforce the fixed depth-8, 256-entry, 1 MiB-file, 8 MiB-total, and bounded
   elapsed-time budgets above.
4. Use `lstat`/no-follow semantics for each path segment. Classify a broken
   symlink separately; classify junction/reparse entries with the platform
   adapter; if Windows metadata cannot prove the object is safe, return an
   unknown/unsafe diagnostic and stop that branch. Expected package-manager
   links require explicit bounded provenance and never grant recursive access.
5. If a path changes between inspection steps, prefer `unknown` and preserve
   the no-follow boundary. Never turn a failed safety proof into a best-effort
   read.

### U52 — Coherence and binary checks

1. Parse package metadata and the selected manager's lockfile with size and
   shape limits. Determine the manager from the package metadata/resolver, then
   verify its expected lockfile family and bounded installed metadata. Report
   absent, ambiguous, unsupported, stale, and coherent states separately.
2. Resolve only declared package exports/imports and a bounded set of
   dependency manifests. Do not import application code or execute lifecycle
   scripts. A missing transitive dependency is evidence for a repair
   recommendation, not permission to install it.
3. Inspect package and bounded dependency `bin` declarations. Confirm each
   target exists, is the expected file kind, and has a safe link target under
   the approved boundary. On Windows, include supported executable/shim
   identity; on Linux, include regular-file/executable metadata without
   running it.
4. Treat `postinstall` as metadata evidence only. Report a missing artifact or
   unsafe script-owned target, but never execute `preinstall`, `install`, or
   `postinstall` as part of diagnosis.
5. Emit repair commands as fixed, sanitized text (for example, inspect the
   selected manager's frozen install manually) and explicitly state that the
   doctor did not run them.

### U53 — Host/child resolver comparison

1. Request the accepted RDM-017 resolver result for the host and the effective
   child launch environment. The adapter consumes structured candidate
   identity, basename, version, source, confidence, acceptance/rejection
   reason, and bounded environment-difference categories.
2. Normalize comparison keys so full paths and environment values never reach
   the report. Classify results as `consistent`, `host_only`, `child_only`,
   `version_mismatch`, `environment_mismatch`, or `unknown`.
3. Check the package's Node engine range and package-manager declaration against
   the host resolver result. A version/source mismatch is actionable; a probe
   timeout or unavailable RDM-017 result is `unknown`, not success.
4. Bound resolver execution by time and result count. Preserve stable rejection
   codes and a safe repair suggestion while dropping raw subprocess stderr,
   command-line arguments, PATH entries, and executable paths.

## Dependency and execution waves

1. **Wave 0 — prerequisite contract:** RDM-017 publishes and review-passes the
   structured resolver/child-environment contract. Read-only self-doctor
   fixture design may proceed before that gate.
2. **Wave 1 — RU1 / U50-U51:** implement the additive CLI/report boundary and
   no-follow safe installation inspection. This is one reviewable security
   slice because output bounds and path safety must be reviewed together.
3. **Wave 2 — RU2 / U52-U53:** implement coherence/bin checks and host/child
   resolver comparison against the accepted RU1 report boundary and RDM-017
   contract. Keep the stack shallow and do not modify RDM-017's resolver.
4. **Wave 3 — aggregate:** run the focused unit/integration/contract/platform
   checks and root gates. RDM-023 consumes the resulting evidence; it does not
   belong in this package.

No parallel mutable implementation is safe for U50-U53 because CLI dispatch,
self-report bounds, and the resolver adapter are tightly coupled. RDM-020 and
RDM-021 may be planned in parallel, but any shared dispatcher/helper changes
must be serialized by Seneschal.

## Verification and acceptance matrix

| Surface | Required evidence |
| --- | --- |
| CLI compatibility | Existing project doctor tests pass; new parsing proves `--self`, `--json`, default project mode, and invalid self/project combinations. |
| Read-only guarantee | Fixture tree snapshot before/after each diagnostic case; injected process runner asserts no install/delete/rename/chmod/script call. |
| Path/link safety | Unit and platform fixtures prove traversal rejection, canonical containment, broken symlink reporting, junction/reparse no-follow, finite budgets, and conservative race/unknown behavior. |
| Dependency/install coherence | Fixtures cover manager/lock mismatch, absent metadata, stale install, missing transitive dependency, and healthy install without recursive scanning. |
| Postinstall/bin surface | Fixture package manifests with `bin` and lifecycle metadata prove presence/identity checks and zero lifecycle execution. |
| Host/child resolver | Injected RDM-017 results cover all six comparison outcomes and sanitized version/source/rejection evidence on Windows and Linux. |
| Output safety | Seeded secret/path/argument corpus proves human and JSON reports contain no full paths, PATH values, credentials, lockfile text, or arbitrary child output; limits are enforced before serialization. |
| Aggregate compatibility | `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm pack:check` pass after focused checks. |

## Risks and mitigations

- **Package-manager links look unsafe:** accept only links with explicit bounded
  provenance; classify unknown targets instead of following them recursively.
- **Resolver implementation drifts from RDM-017:** depend on a versioned typed
  adapter and contract tests; block U53 claims until the dependency is accepted.
- **Diagnostics leak local secrets or paths:** sanitize at source, cap before
  storage/serialization, and test seeded values in both output modes.
- **Self mode accidentally shares project mutation paths:** keep a distinct
  engine and injected read-only process interface; assert zero writes in tests.
- **Shared installer files collide with RDM-020/RDM-021:** isolate new modules,
  record overlap in the work package, and require parent reconciliation for any
  shared dispatcher/helper edit.

## Definition of done

- U50-U53 are implemented on their designated semantic branch after RDM-017's
  resolver contract is accepted.
- `doctor --self` is read-only, bounded, sanitized, and emits exact advisory
  repair guidance for all required failure classes.
- Path traversal and symlink/junction/reparse cases fail closed and are covered
  by Windows/Linux fixtures.
- Host/child resolver comparison is explicit and conservative when unavailable.
- Focused and aggregate verification commands pass; any platform-only gap is
  recorded with owner and CI evidence before release handoff.
- Security review has no unresolved P0-P2 finding for filesystem, output, or
  resolver-boundary behavior.
