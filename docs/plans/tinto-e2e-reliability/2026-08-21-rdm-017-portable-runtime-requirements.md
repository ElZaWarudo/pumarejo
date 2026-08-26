---
title: RDM-017 portable runtime and toolchain resolution requirements
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: inherited-initiative-contract
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-017
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-017-portable-runtime
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-017-portable-runtime/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: []
applied_decisions: [DEC-2026-08-21-003, DEC-2026-08-21-004]
---

# RDM-017 portable runtime and toolchain resolution requirements

## Context and inherited authority

RDM-017 closes the REL-008 and REL-009 gaps identified by the Tinto trial. A
launch can currently receive an allowlisted environment, but Windows values
are not reconstructed when the host process omits essential variables,
portable `%VAR%` paths are not expanded with provenance, and the diagnostic
surface has no canonical candidate list, executable identity, version,
rejection reason, or broken-link result. The existing Windows launcher parses a
bounded package-manager shim and the Linux launcher searches bounded command
directories, but each path is resolved locally rather than through one
deterministic evidence model.

The initiative contract remains authoritative for one local `stdio` MCP
session, one owned application session, bounded output, sanitize-before-
boundary rules, no arbitrary shell or operating-system passthrough, and
portable toolchain evidence. RDM-015 supplies the internal
sanitize-before-store evidence contract. RDM-017 may emit an internal
toolchain-resolution event through that contract, but it must not create a
public diagnostics operation or public capability vocabulary.

DEC-2026-08-21-003 (additive public operation/schema composition) and
DEC-2026-08-21-004 (supported/unsupported/unavailable/denied/failed capability
states with stable codes and bounded sanitized evidence) are now canonical
parent decisions. RDM-017 still has no public MCP projection, so it consumes
the decisions only as compatibility constraints; downstream public consumers
must use the canonical operation and vocabulary rather than inventing local
synonyms.

This artifact is planning input only. It authorizes no product-code, test,
configuration, Jira, branch, commit, PR, release, or external mutation change
in the current artifact-only run.

## Actors and outcome

- **Platform maintainer:** needs the same launch request to resolve on Windows
  and Linux without depending on an accidental parent-process environment.
- **Test operator or coding agent:** needs an actionable, bounded explanation
  of which runtime candidate was accepted or rejected and why.
- **Security reviewer:** must prove credentials, raw environment values, full
  paths, arguments, unsafe links, and arbitrary command output do not cross the
  diagnostic evidence boundary.
- **RDM-015/RDM-019/RDM-022 maintainers:** consume stable internal evidence and
  host-versus-child outcomes without inheriting platform-specific path leaks or
  a second resolver contract.

The outcome is a valid minimum child environment plus a canonical, deterministic
resolver result for Node, npm, pnpm, Cargo, and rustc. The result retains every
candidate's bounded identity, source, version observation, acceptance or
rejection code, and broken-link status while exposing only sanitized evidence.

## Scope

RDM-017 covers two closely coupled capabilities:

1. **Safe child-environment reconstruction.** Preserve the existing platform
   allowlist and launch-profile precedence, reconstruct a bounded Windows
   minimum from injected operating-system sources when the host snapshot is
   incomplete, normalize Windows key casing, expand approved portable path
   variables with finite recursion, and retain source/provenance internally.
   Compare host and effective child environments by sanitized difference
   categories without exposing values.
2. **Canonical executable resolution.** Enumerate a fixed, ordered candidate
   list for Node, npm, pnpm, Cargo, and rustc from explicit project settings,
   the effective child `PATH`, the host `PATH` comparison, and documented
   platform toolchain roots. Validate canonical file identity and executable
   kind, parse only the existing bounded Windows shim grammar, run fixed
   no-shell version probes with strict time/output limits, and return explicit
   rejection/broken-link reasons instead of falling through to a guessed
   success.

RDM-017 also defines an internal adapter that sends only the sanitized
candidate summary and host/child difference categories to RDM-015's bounded
evidence sink. The actual RDM-015 public query remains outside this scope.

## Non-goals

- Editing or relying on user-owned changes in `src/installer/project.ts` or
  `tests/unit/project-detection.test.ts`; those surfaces remain isolated in
  the main checkout and are not part of this worktree's baseline.
- Changing project detection, package-manager manifest selection, attributed
  integration drift (RDM-020), or the `doctor --self` consumer (RDM-022).
- Replacing RDM-015's sanitizer/ring-buffer contract or adding a competing
  diagnostic store, public MCP tool, public schema, or capability vocabulary.
- Executing arbitrary shell, PowerShell, package scripts, Tauri commands, or
  user-provided commands. Fixed platform probes use `shell: false` and a
  bounded allowlisted executable/argument pair only.
- Installing, upgrading, repairing, deleting, or mutating runtimes, package
  managers, symlinks, junctions, PATH values, registries, lockfiles, or
  projects.
- Recursive filesystem discovery, following unproven links/reparse points,
  exposing full PATH/environment values, or including raw executable paths,
  arguments, stderr, or nested causes in evidence.
- Resolving WebView/provider dependencies, process custody/Job Objects, public
  surface behavior, or cross-platform end-to-end certification.

## Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| ENV-001 | The child environment is derived from an explicit allowlist and stable precedence. | Windows and Linux child maps preserve approved runtime/display/toolchain keys, apply profile overrides and internal ownership overlays in the documented order, and exclude seeded secret keys. |
| ENV-002 | Windows can reconstruct a valid minimum environment from operating-system sources without trusting arbitrary input. | Missing essential keys such as `SystemRoot`, `ComSpec`, `PATHEXT`, `Path`, `TEMP`/`TMP`, and user/toolchain roots are filled only from an injected OS source or fixed safe default; absent or conflicting sources produce an incomplete/unknown result rather than invented values. |
| ENV-003 | Portable path values expand deterministically and safely. | `%VAR%` expansion is case-insensitive on Windows, bounded by pass/length/NUL limits, retains source provenance internally, and reports unresolved, cyclic, overlong, or unsafe values as rejection evidence. Linux path separators and existing display behavior remain unchanged. |
| ENV-004 | Host-versus-child differences are truthful and sanitized. | The comparison reports stable categories such as `missing-in-child`, `added-to-child`, `changed`, `path-order-changed`, and `portable-expanded` without serializing raw values, full paths, credentials, or PATH entries. |
| TOOL-001 | Candidate enumeration has a canonical order and complete bounded outcome list. | For each required tool, the result lists candidates from explicit config, effective child PATH, host comparison, and documented platform roots in deterministic precedence order, deduplicates canonical identities, and retains accepted plus rejected candidates. |
| TOOL-002 | Candidate identity and file safety are verified before acceptance. | A candidate records a bounded basename/file-kind identity and an internal canonical identity; missing files, broken links, symlinks/junctions/reparse points that cannot be proven safe, non-files, wrong extensions, and outside-root targets have distinct rejection codes. |
| TOOL-003 | Versions are observed through bounded fixed probes or trusted package metadata. | Node, npm, pnpm, Cargo, and rustc report normalized version or an explicit unreadable/timeout/invalid-output reason; no shell, lifecycle script, arbitrary arguments, or unbounded stdout/stderr is used. |
| TOOL-004 | Windows package-manager shims resolve without a shell. | Supported npm/pnpm `.cmd` shims use the existing finite quoted-token/variable grammar and produce a concrete Node-plus-CLI launch; dynamic, malformed, unresolved, oversized, or wrong-tool shims remain rejected with their reason. |
| TOOL-005 | Linux and Windows use one semantic resolver contract while respecting platform differences. | Injected Windows and Linux fixtures produce the same normalized candidate/reason schema, while PATH delimiter, PATHEXT, executable mode, symlink, and standard toolchain-root behavior remain platform-correct. |
| EVID-001 | Toolchain evidence enters RDM-015 only after sanitization and ownership validation. | The internal event contains bounded tool identity, source, version, outcome, rejection code, and host/child categories; it contains no raw environment, PATH, full executable path, arguments, process output, or error cause, and ownership loss drops or bounds the event. |
| TEST-001 | Resolver behavior is deterministic and independently testable on Windows and Linux. | Pure builder, candidate, version, rejection, broken-link, and host/child comparison tests use injected filesystem/process/environment seams; platform fixtures cover Windows and Linux without depending on whichever tools happen to be installed on the test host. |

## Security and compatibility invariants

- The trust path is operating-system/profile inputs -> allowlisted child
  environment -> canonical resolver -> sanitize-before-store -> optional
  RDM-015 evidence. Raw input never bypasses the sanitizer.
- Child execution may retain a necessary path value internally, but evidence
  never contains full paths, PATH entries, environment values, credentials,
  arguments, command output, or nested causes.
- A candidate is accepted only after canonical identity, file kind, ownership
  boundary, and version evidence are sufficient. Uncertainty is a typed
  rejection/unknown result, not success.
- Existing `sanitizedLaunchEnvironment`, profile overrides, Windows shim
  safety, Linux display handling, local `stdio`, and approved launch commands
  remain compatible unless a separate decision explicitly changes them.
- Resolver diagnostics cannot authorize a launch, select a surface, widen a
  capability, or bypass RDM-016 process ownership.
- DEC-2026-08-21-003/004 are canonical parent constraints for downstream
  public consumers. This item adds no public operation or field.

## Acceptance and verification contract

Future implementation must prove:

- Windows environment reconstruction with missing/overridden OS values,
  case-insensitive keys, `%VAR%` chains, unresolved/cyclic/overlong values,
  denylisted credentials, and deterministic provenance categories;
- Linux environment parity, delimiter preservation, display overlays, and no
  regression of the existing allowlist behavior;
- candidate order/deduplication, explicit-vs-PATH precedence, canonical
  identity, broken symlink/junction/reparse refusal, wrong-file rejection, and
  retained rejection reasons;
- Node/npm/pnpm/Cargo/rustc version success, non-zero, timeout, malformed
  output, and incompatible-version cases;
- safe npm/pnpm Windows shims versus malformed/dynamic/wrong-tool shims;
- host-only, child-only, version mismatch, environment mismatch, consistent,
  and unavailable resolver comparisons with no raw path/environment leakage;
- RDM-015 event sanitization before storage, ownership/session binding, bounded
  event limits, and safe behavior when the evidence sink is unavailable; and
- Windows and Linux fixture matrices producing stable normalized outcomes.

Focused future commands are assigned in the work package. No product tests
run during this artifact-only child.

## Ownership and dependency boundary

- **RDM-015:** supplies the accepted internal event envelope, sanitizer,
  bounded ring, and ownership checks. RDM-017 consumes it and does not edit
  RDM-015 artifacts or invent public query semantics.
- **RDM-016:** owns process leases, Job Objects/groups, cleanup, and process
  identity. RDM-017 uses injected process probes only and does not terminate or
  repair processes.
- **RDM-020:** owns attributed integration drift and shared `doctor` wiring.
  RDM-017 does not modify `src/installer/doctor.ts` as part of this package.
- **RDM-022:** consumes this resolver for self-doctor host/child comparison;
  it must not fork the resolver algorithm.
- **RDM-019:** consumes sanitized evidence for Tinto certification and owns
  end-to-end proof.
- **User/worker-owned installer surfaces:** `src/installer/project.ts` and
  `tests/unit/project-detection.test.ts` are excluded, not read as behavior
  authority, and must not be reset, edited, or assumed.

Any proposal to change a public MCP contract, expose a raw path/environment,
follow an unproven link, execute a non-fixed command, alter process ownership,
or absorb one of the excluded sibling surfaces returns to the brokered parent
as a decision request.
