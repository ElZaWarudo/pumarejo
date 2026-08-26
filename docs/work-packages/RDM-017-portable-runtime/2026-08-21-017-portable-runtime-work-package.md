---
title: Reconstruct safe child environments and resolve portable toolchains
status: package-review-passed
roadmap_item: RDM-017
origin_roadmap: docs/product/roadmap.md
origin_brainstorm: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-017-portable-runtime-requirements.md
origin_planning_input: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-017-portable-runtime-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-017-portable-runtime-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-017-portable-runtime
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-017-portable-runtime/state.md
units: [U34, U35, U36]
unit_alignment: complete
review_units: [RU1, RU2]
base_branch: main
pr_strategy: stacked
max_open_stack: 2
jira_policy: skip
production_posture: unknown
autonomy: high
autonomous_ledger: docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json
allowed_mutation_classes: []
open_decisions: []
applied_decisions: [DEC-2026-08-21-003, DEC-2026-08-21-004]
---

# Reconstruct safe child environments and resolve portable toolchains

## Scope

Implement two serial, bounded slices after RDM-015's internal evidence
contract is accepted:

- **RU1/U34:** reconstruct a valid Windows child environment from allowlisted
  host/profile/OS inputs, expand portable values safely, preserve Linux
  behavior, and produce sanitized host-versus-child difference categories; and
- **RU2/U35-U36:** resolve Node, npm, pnpm, Cargo, and rustc through one
  deterministic candidate model with identity/version/rejection/broken-link
  reporting, safe Windows shims, and a sanitized internal evidence adapter for
  RDM-015, with deterministic Windows/Linux fixtures.

The package is documentation/planning output in the current run. It does not
authorize product-code, test, config, commit, Jira, PR, push, reviewer, merge,
or release operations here.

## Non-goals

- Editing or assuming `src/installer/project.ts` and
  `tests/unit/project-detection.test.ts`; these isolated main-checkout edits
  remain preserved outside this package.
- Changing project detection, shared `doctor` integration (RDM-020),
  `doctor --self` (RDM-022), process custody (RDM-016), or public MCP tools.
- Arbitrary shell/PowerShell/package-script execution, install/repair/delete,
  recursive discovery, raw PATH/environment/path/argument evidence, or
  unproven symlink/junction/reparse traversal.
- Replacing RDM-015's sanitizer/ring or inventing capability/public field names.

## Autonomy Contract

- Mode: high, local artifact autonomy only.
- Agent may decide without asking: package-local U-ID/RU grouping, bounded
  reason-code wording, injected fixture shape, semantic module names, and
  equivalent read-only verification commands.
- Agent must record as assumptions: exact internal TypeScript names, the
  concrete OS environment-source adapter, and platform-only evidence deferred
  to CI.
- Agent must escalate: raw disclosure, non-fixed command execution, link/reparse
  traversal, process termination, public contract changes, `doctor` ownership,
  user-owned installer files, branch/base strategy, Jira/PR workflow, or any
  scope outside RDM-017.
- Safe fallback: if RDM-015's internal event contract is not accepted, keep
  U34/U35 design and pure tests ready but block U36 evidence wiring; never
  fabricate a public diagnostics result.
- Autonomous ledger: `docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json`.
- Allowed external mutation classes: none for this artifact-only run.

## Dependencies

- Requires the approved initiative contract, RDM-015 internal
  sanitize-before-store envelope, and Seneschal serialization of shared launch
  surfaces before implementation.
- Consumes RDM-016's process probe/ownership boundaries without owning custody.
- Feeds RDM-019 certification, RDM-022 self-doctor, and later RDM-020 doctor
  integration; none of those consumers are implemented here.
- DEC-003/004 are applied parent decisions and impose canonical public
  operation/capability vocabulary on downstream consumers; they are not new
  RDM-017 blockers.

## Production Posture

- Posture: unknown; the initiative establishes a local developer/testing tool,
  not a deployed service for this item.
- Consequence: preserve existing launch compatibility, fail closed on
  environment/path/probe uncertainty, and require Windows/Linux evidence before
  release handoff.
- Breaking existing behavior: none without explicit approval; resolver output
  and evidence are additive internal contracts.

## Plan Unit Alignment

| Plan unit | Included | Reason |
| --- | --- | --- |
| U34 | yes | Child environment reconstruction and host/child comparison are the RU1 security boundary. |
| U35 | yes | Candidate/identity/version/rejection resolution is the core RU2 capability. |
| U36 | yes | Sanitized RDM-015 projection and deterministic cross-platform proof must accompany resolver claims. |

Grouping rationale: RU1 is independently verifiable without toolchain probes.
RU2 combines U35 and U36 because a resolver without its sanitize-before-store
projection could make unsafe evidence claims, and splitting them would create a
deferred consolidation PR. This is the coarsest reviewable two-unit chain, not
an atomicity or Jira split.

## Implementation Units

- **U34 — Child environment and differences:** allowlist-preserving Windows
  reconstruction, bounded `%VAR%` expansion, private provenance, Linux
  compatibility, and sanitized host/child categories.
- **U35 — Canonical resolver:** ordered candidates, canonical identity/file
  safety, broken-link/reparse reasons, fixed no-shell versions, safe npm/pnpm
  shims, and Node/npm/pnpm/Cargo/rustc matrix.
- **U36 — Evidence and matrix:** RDM-015 internal event adapter, ownership
  validation, sanitized bounds, and injected deterministic Windows/Linux proof.

## Review Units

| Review unit | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
| --- | --- | --- | --- | --- | --- |
| RU1 | U34 environment builder and host/child difference model. | `src/platform/launch-environment.ts`, new `src/platform/windows/` helper, focused unit tests. | `main` | skip | High Windows environment/secrets risk; target <=500 human-authored lines; preserve existing allowlist. |
| RU2 | U35 resolver plus U36 sanitized evidence adapter and platform fixtures. | New `src/platform/toolchain-resolver.ts`/evidence helper, narrow launch adapters, unit/integration/contract/platform tests. | RU1 branch after parent merge or reconciled `main` | skip | High path/probe/disclosure risk; target <=500 human-authored lines; no public MCP surface. |

## Reviewability Diagnosis

- Reviewer-experience check: passes. RU1 isolates environment trust and
  provenance; RU2 reviews resolver acceptance together with disclosure proof.
- Granularity rationale: each unit has independent verification and a clear
  risk boundary; RU2 remains integrated to avoid a resolver-only PR whose
  evidence contract is unreviewed.
- Open-stack plan: target one pending PR, hard maximum two. At the cap use
  `wait-for-parent-merge` into `main` or `collapse-to-integration-base` onto a
  refreshed base; never build a deeper stack or a mega-consolidation PR.
- Jira mapping: intentionally skipped; if a later flow enables Jira, each
  review unit maps to one standalone semantic task.
- Downstream-fix trace: none at artifact creation. A later unit must record
  `addresses finding from PR #X` when it fixes an earlier open finding.

## Files and Tests

Future implementation surfaces:

- `src/platform/launch-environment.ts` and a new RDM-017-owned helper under
  `src/platform/windows/` for allowlist/reconstruction/expansion;
- new `src/platform/toolchain-resolver.ts` and a narrow evidence adapter under
  `src/platform/`;
- narrow integration in `src/platform/windows/launch.ts` and
  `src/platform/linux/launch.ts` only where needed to consume the effective
  child environment/resolver;
- `tests/unit/windows-environment.test.ts` and
  `tests/unit/launch-environment.test.ts` for U34;
- `tests/unit/toolchain-resolver.test.ts` for U35;
- `tests/integration/toolchain-resolution.test.ts`,
  `tests/contract/toolchain-resolution.test.ts`, and
  `tests/platform/toolchain-resolution-proof.test.ts` for U36; and
- no changes to `src/installer/project.ts`,
  `tests/unit/project-detection.test.ts`, `src/installer/doctor.ts`, or shared
  live Tinto fixtures.

Literal focused checks assigned to implementation:

```text
pnpm exec vitest run tests/unit/windows-environment.test.ts tests/unit/launch-environment.test.ts
pnpm exec vitest run tests/unit/toolchain-resolver.test.ts
pnpm exec vitest run tests/integration/toolchain-resolution.test.ts
pnpm exec vitest run tests/contract/toolchain-resolution.test.ts
pnpm exec vitest run --no-file-parallelism tests/platform/toolchain-resolution-proof.test.ts
```

Root-owned aggregate checks:

```text
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack:check
```

No product tests run in this artifact-only child.

## Impact Scan

- API/contracts/bindings: no new MCP operation, public schema, auth, tenant,
  or session contract. Internal resolver/evidence types are additive and
  consumed by RDM-015/RDM-022 after acceptance.
- Consumer scan patterns: `rg "sanitizedLaunchEnvironment|resolvedLaunchEnvironment|resolveWindowsLaunch|resolveLinuxCommand|DoctorDiagnostic|toolchain|PATHEXT|CARGO_HOME|RUSTUP_HOME" src tests docs`.
- Consumers found: current launch-environment and Windows/Linux launch helpers,
  existing mode-config/doctor tests, RDM-015 internal evidence plan, and
  downstream RDM-022 resolver comparison plan.
- Explicitly excluded: project detection files owned by user/worker changes,
  shared `doctor.ts` integration owned by RDM-020, and RDM-016 custody modules.
- Contract-drift tests searched: current allowlist/profile, Windows shim,
  Linux command, doctor toolchain, and redaction tests. New resolver tests must
  prove existing launch behavior remains compatible.
- Required consumer tests: focused commands above plus root aggregate and
  parent-owned RDM-015/RDM-019 fingerprints.
- Consumer tests run/skipped: skipped because no product implementation is
  authorized in `mode:artifacts`.

## Verification Gate

- U34 passes deterministic Windows/Linux environment and diff tests, including
  missing-source, expansion, secret, case, and no-mutation cases.
- U35 passes candidate order/dedupe, identity/file-kind, broken-link/reparse,
  shim, version, timeout, and required-tool matrix cases.
- U36 passes sanitized evidence, owner/session mismatch, host/child outcome,
  bound, and equivalent Windows/Linux fixture cases.
- Aggregate commands pass after Seneschal serializes shared launch edits.
- Any unavailable platform proof records exact host reason and owner; no local
  artifact-only command is described as a product pass.

## Review Gate

- Code review threshold: P0-P2; future implementation only, no code review in
  this artifact-only phase.
- Document review: requirements, plan, dependency map, and package reviewed
  inline for coherence, feasibility, security, scope, acceptance, and overlap.
  Durable findings are at `docs/review-findings/tinto-e2e-reliability/RDM-017-portable-runtime/2026-08-21-document-review.md`.

## Security Gate

- Required in future implementation because environment values, filesystem
  links, executable probes, and diagnostic evidence cross trust boundaries.
- Security Watch: sanitize before RDM-015 storage; no arbitrary shell/probe;
  no unproven link/reparse traversal; no raw path/PATH/env/args/causes;
  ownership/session validation before evidence.
- Security reviewer: `krt-security-sentinel` at implementation gate.
- Artifact design result: acceptable with required implementation evidence;
  formal implementation Security Sentinel remains pending.

## CI Break-Prevention And Escalation

- Risk surfaces: Windows environment reconstruction, portable expansion,
  PATH/PATHEXT and shims, Linux executable mode, version probes, redaction,
  launch compatibility, and platform fixture availability.
- Preventive evidence: focused command literals, root gates, and deterministic
  injected seams are named above; product tests are intentionally skipped now.
- If CI breaks, invoke `krt-ci-questor` with the run/check context; do not poll
  CI from Compound Master and do not bypass a red check.

## Branch and PR Handoff Inputs

- Review unit: RU1 first, then RU2 after parent merge/reconciliation.
- Branch name: `feat/portable-runtime-resolution`.
- Branch/docs rule: implementation carries related maintained contract/security
  wording only when behavior is proven; no planning/docs-only branch.
- PR base: `main` for RU1; RU1 integration base for RU2 after merge or explicit
  retarget reconciliation.
- Suggested commit grouping:
  - `feat(runtime): reconstruct portable child environments` — U34 and focused
    proof;
  - `feat(runtime): resolve portable toolchains safely` — U35/U36 and focused
    cross-platform proof.
- PR title: Reconstruct child environments and resolve portable toolchains.
- PR body bullets:
  - Reconstructs allowlisted Windows child environments with bounded portable
    expansion and sanitized host/child differences.
  - Resolves Node/npm/pnpm/Cargo/rustc with candidate identity/version/reason
    evidence and safe no-shell probes.
  - Preserves launch compatibility and keeps full paths, PATH, values,
    arguments, and causes out of RDM-015 evidence.
  - Includes deterministic Windows/Linux fixtures and calls out any CI-only
    platform gap.
- Verification results location: implementation branch evidence and closeout;
  artifact run evidence is checker/review only.
- Production/deployment notes: posture unknown; no deployment/migration.
- Autonomous mutation request: none; release mutations remain disabled and
  owned by `krt-release-marshal` after parent reconciliation.

## Jira Handoff Inputs

- Jira policy: skip.
- Suggested issue type/subtask: none; no Jira lookup or mutation authorized.
- PR-to-Jira mapping: not applicable under explicit skip.
- Optional-policy fallback: not applicable; Jira intentionally omitted.

## Decision and readiness

- DEC-003/004 are resolved canonical parent decisions; this package does not
  reopen them and has no new product decision request.
- Implementation readiness is conditional only on RDM-015 internal event
  contract acceptance and shared-launch serialization.
- Safe fallback if that gate is absent: keep U34/U35 pure designs/tests
  schedulable, defer U36 evidence wiring, and do not add public fields.
