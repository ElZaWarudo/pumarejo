---
title: Diagnose Pumarejo installation health with a read-only self-doctor
status: package-ready
roadmap_item: RDM-022
origin_roadmap: docs/product/roadmap.md
origin_brainstorm: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-requirements.md
origin_planning_input: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
compound_run_id: tinto-e2e-rdm-022-self-doctor
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-022-self-doctor/state.md
units: [U50, U51, U52, U53]
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
---

# Diagnose Pumarejo installation health with a read-only self-doctor

## Scope

Add an explicit `pumarejo doctor --self [--json]` mode that diagnoses the
installed Pumarejo package and its bounded dependency surface. The mode checks
package metadata and exports, dependency resolution, lockfile/install
coherence, expected package/postinstall binaries, Node and package-manager
compatibility, safe filesystem/link boundaries, and the difference between
host and child resolver evidence. It returns stable bounded sanitized guidance
and never mutates the package, lockfile, dependencies, current project, or
host configuration.

This package is documentation/planning output in the current run. It does not
authorize product-code edits, tests that mutate fixtures, commits, Jira, PRs,
pushes, reviewers, or release actions.

## Non-goals

- Automatic delete, reinstall, upgrade, cache pruning, lockfile rewrite,
  lifecycle/postinstall execution, or any other repair operation.
- Changes to existing project doctor behavior when `--self` is absent.
- RDM-017 resolver/environment algorithm, RDM-020 attributed project drift,
  RDM-021 discovery/retention/artifact policy, or RDM-016 process custody.
- Recursive package-store/repository scans, arbitrary shell or script
  execution, raw lockfile/environment/PATH/argument output, or unproven link
  traversal.
- Product-code changes during this artifact-only run.

## Autonomy Contract

- Mode: high, local artifact autonomy only.
- Agent may decide without asking: package-local document structure, U-ID
  names, RU grouping, conservative reason-code wording, fixture naming, and
  equivalent read-only validation commands.
- Agent must record as assumptions: the exact additive report field names,
  repository conventions inferred from the current doctor report, and any
  platform-only proof deferred to CI.
- Agent must escalate: automatic repair, raw path/environment disclosure,
  following an unproven link or reparse point, lifecycle execution, changes to
  existing doctor semantics, non-additive public CLI/schema changes, RDM-017
  resolver contract changes, branch/base strategy, Jira/PR workflow,
  credentials, or scope outside RDM-022.
- Safe fallback: continue artifact review and fixture design; if RDM-017 is
  unavailable, keep U53 conservative/blocked with `unknown` evidence and do
  not invent resolver behavior.
- Autonomous ledger: `docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json`.
- Allowed external mutation classes: none for this artifact-only run; the
  inherited ledger cannot authorize worker shipping.

## Dependencies

- Requires: approved initiative contract and RDM-017's accepted structured
  host/child resolver and child-environment comparison contract before U53
  implementation claims compatibility.
- Blocks: RDM-023 release certification evidence for self-install health.
- Does not own or block RDM-020/RDM-021 behavior; shared CLI/helper changes
  require Seneschal serialization and consumer-test reconciliation.

## Production Posture

- Posture: unknown.
- Evidence: the initiative describes a local developer tool but does not
  establish a deployed production target for this item.
- Confidence: medium.
- Consequences: preserve current project-doctor and CLI compatibility, fail
  closed on filesystem safety uncertainty, and require Windows/Linux evidence
  before release handoff.
- Breaking existing behavior allowed: only with explicit approval; `--self`
  is additive and existing project mode remains unchanged.

## Plan Unit Alignment

| Plan unit | Included in this package | Reason |
| --- | --- | --- |
| U50 | yes | CLI selection, self-report envelope, output bounds, and read-only dispatch are the RU1 contract boundary. |
| U51 | yes | Path traversal, containment, symlink/junction/reparse handling, and bounded no-follow traversal form the RU1 security slice. |
| U52 | yes | Lock/install coherence and safe package/postinstall binary checks form the RU2 diagnostic capability. |
| U53 | yes | Host/child resolver comparison and Node/manager compatibility consume RU1's report and RDM-017's accepted resolver. |

Grouping rationale:

- RU1 combines U50 and U51 because the public self-report boundary and
  no-follow path safety must be reviewed as one trust-boundary slice; splitting
  them would make output claims impossible to assess without a deeper stack.
- RU2 combines U52 and U53 because coherence/bin evidence and resolver
  compatibility are both installation-health evidence consumed through the
  same bounded report. They have separate tests but share the accepted RU1
  report contract.
- Two stacked review units are the coarsest independently verifiable slices
  that separate filesystem/public-boundary risk from dependency/resolver risk.

## Implementation Units

- **U50 — CLI/report boundary:** additive `--self` parser/dispatcher, stable
  self diagnostic IDs, bounded report and human/JSON projections, and injected
  read-only dependencies.
- **U51 — Safe installation inspection:** lexical/canonical containment,
  metadata-derived path validation, no-follow traversal, broken-link and
  junction/reparse classification, finite budgets, and conservative unknown
  results.
- **U52 — Coherence and binaries:** package/lock/install metadata checks,
  bounded dependency/export resolution, package/dependency bin target checks,
  and postinstall evidence without script execution.
- **U53 — Resolver comparison:** RDM-017 host/child evidence adapter, Node
  engine and package-manager compatibility, normalized mismatch categories,
  timeouts, and sanitized source/version/rejection evidence.

## Review Units

| Review unit | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
| --- | --- | --- | --- | --- | --- |
| RU1 | Additive self-doctor CLI/report boundary plus safe bounded no-follow installation inspection. | `src/cli/parse.ts`, `src/cli/doctor.ts`, new RDM-022 self-doctor/path modules, unit/integration/contract tests, and maintained contract/security/architecture docs only when implementation proves the additive semantics. | `main` | skip (explicit `jira-policy:skip`) | High filesystem/public-output risk; target <=500 human-authored lines; no generated artifacts; project doctor behavior must remain unchanged. |
| RU2 | Lock/install coherence, package/postinstall binary checks, Node/manager compatibility, and RDM-017 host/child resolver comparison. | RDM-022 self-doctor modules, resolver adapter seam, unit/integration/contract/platform tests, and maintained docs only when behavior is proven. | RU1 branch after parent merge, or reconciled `main` | skip (explicit `jira-policy:skip`) | High resolver/install-boundary risk; target <=500 human-authored lines; must not fork RDM-017 or execute lifecycle scripts. |

## Reviewability Diagnosis

- Reviewer-experience check: yes. RU1 is a coherent safety/report contract
  slice; RU2 is a coherent installation-health evidence slice. Each can be
  verified independently after its predecessor without a deep mental stack.
- Granularity chosen because: the split separates path/public-boundary risk
  from dependency/resolver compatibility risk, not atomicity or Jira shape.
- Open-stack plan: target <=2 and hard max 3. At the cap, wait for
  `wait-for-parent-merge` into `main` or collapse-to-integration-base onto a
  refreshed `main`; never accumulate a deeper stack.
- Jira mapping: Jira is intentionally skipped; if a later release flow enables
  Jira, each single-review-unit PR maps to one standalone semantic task.
- Downstream-fix trace: none at artifact creation. A later unit must record
  `addresses finding from PR #X` if it fixes an earlier open review finding.
- Failure-mode check: passes; this is neither a micro-PR chain nor a deferred
  mega-consolidation.

## Files and Tests

Future implementation surfaces:

- `src/cli/parse.ts` and `src/cli/doctor.ts` for the additive self-mode
  selection and dispatch;
- new RDM-022-owned modules under `src/installer/` for self-reporting,
  safe-path inspection, bounded manifest/lock checks, and resolver comparison;
- `tests/unit/self-doctor.test.ts` and
  `tests/unit/self-doctor-paths.test.ts` for deterministic engine/path cases;
- `tests/integration/self-doctor.test.ts` for CLI output and unchanged-tree
  proof;
- `tests/contract/self-doctor.test.ts` for stable CLI/report and redaction
  contract cases;
- `tests/platform/self-doctor-proof.test.ts` for Windows junction/reparse and
  Linux symlink/no-follow evidence; and
- maintained docs (`docs/contracts.md`, `docs/security.md`,
  `docs/architecture.md`) only as a behavior-backed implementation follow-up,
  not as a planning-only branch.

Literal focused checks assigned to implementation:

```text
pnpm exec vitest run tests/unit/self-doctor.test.ts tests/unit/self-doctor-paths.test.ts
pnpm exec vitest run tests/integration/self-doctor.test.ts
pnpm exec vitest run tests/contract/self-doctor.test.ts
pnpm exec vitest run tests/platform/self-doctor-proof.test.ts
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

No product tests are run during this artifact-only phase.

The stable initial self IDs are `self.package.metadata`,
`self.installation.paths`, `self.installation.links`,
`self.dependencies.resolution`, `self.installation.lockfile`,
`self.installation.binaries`, `self.toolchain.node`,
`self.toolchain.package-manager`, `self.toolchain.host-child`, and
`self.report.bounds`. The implementation must enforce these pre-serialization
bounds: 32 diagnostics; 512 Unicode characters per summary/action; 64 per
reason/code; 128 per manager/version/source; 16 evidence fields per item; 256
filesystem entries; depth 8; 1 MiB per file; 8 MiB total inspected bytes; and
5 seconds per resolver/process probe.

## Impact Scan

- Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/
  tenant/ownership/test fixtures: planned additive CLI `--self` and self
  report IDs/fields; no MCP, tenant, or session contract change. RDM-017
  resolver input/output is consumed, not redefined.
- Consumer scan patterns: `rg "doctor|DoctorReport|DoctorDiagnostic|parseCliArgs|packageManager|launchEnvironment|realpath|lstat|symlink|junction|reparse|postinstall|bin" src tests docs`.
- Consumers found: `src/cli/parse.ts`, `src/cli/doctor.ts`,
  `src/installer/doctor.ts`, `src/installer/project.ts`,
  `src/installer/package-manager.ts`, `src/platform/launch-environment.ts`,
  current doctor integration/contract tests, and maintained CLI/security docs.
- Contract-drift tests searched: existing CLI usage/help, doctor human/JSON
  formatting, project doctor diagnostic IDs, package-manager fixtures,
  read-only project detection, link rejection, launch-environment allowlist,
  and package/export contract tests.
- Required consumer tests: the four focused commands above plus all root-owned
  aggregate commands; RDM-017 resolver contract tests must be included in the
  aggregate fingerprint.
- Consumer tests run/skipped: skipped because no product implementation is
  authorized in `mode:artifacts`; this is an explicit implementation/CI gate,
  not a pass claim.

## Verification Gate

- Commands/outcomes that must pass after implementation: focused unit,
  integration, contract, and platform commands above, followed by root
  `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`,
  and `pnpm pack:check`.
- Surface-aware evidence:
  - CLI/report: parser matrix and human/JSON parity prove additive behavior and
    bounded sanitized fields.
  - Read-only filesystem: unchanged-tree snapshots and injected write/process
    spies prove no mutation or lifecycle execution.
  - Path safety: Windows/Linux fixtures prove containment, no-follow links,
    broken-link diagnostics, junction/reparse uncertainty, and bounded scans.
  - Install coherence: manager/lock/install/bin fixtures prove exact reason
    codes and safe manual guidance.
  - Resolver: host/child comparison matrix proves mismatch categories,
    timeout/unknown behavior, and no path/environment leakage.
  - Docs/orchestration: package checker and document review; no product files
    are changed in this run.
- Production posture evidence: posture unknown, so release requires additive
  CLI compatibility, Windows/Linux safety evidence, and explicit CI-only gaps.

## Review Gate

- Code review threshold: P0-P2 (future implementation; no code review in this
  artifact-only phase).
- Findings below threshold: record as advisory; never use them to relax
  no-follow, output-bound, or no-repair invariants.
- Document review result: requirements, plan, dependency map, and package were
  reviewed inline for coherence, feasibility, security, scope, acceptance, and
  overlap. Findings and coverage are recorded in
  `docs/review-findings/tinto-e2e-reliability/RDM-022-self-doctor/2026-08-21-document-review.md`.

## Security Gate

- Run after work-review loop: required because the package reads filesystem
  metadata, crosses host/child resolver boundaries, handles links/reparse
  points, and emits diagnostic output.
- Security Watch during work: enabled for future execution; artifact review
  records design-time notes only and performs no intrusive scan.
- Security Watch notes: fail closed on traversal/containment uncertainty; do
  not follow unknown link/reparse targets; sanitize before persistence/output;
  never run lifecycle scripts; do not treat host-only resolution as child
  compatibility.
- Security reviewer: `krt-security-sentinel` (future execution gate).
- Security review result: pending/blocked until implementation and RDM-017
  contract; no product security claim is made by this artifact run.
- Required security verification: seeded path/secret corpus, unchanged-tree
  proof, junction/reparse/symlink fixtures, process/script non-execution spies,
  bounded-output assertions, and host/child resolver redaction tests.

## CI Break-Prevention And Escalation

- CI risk surfaces: CLI option compatibility, strict report bounds, filesystem
  path/link handling, package-manager fixtures, postinstall/bin checks,
  resolver adapter, Windows reparse behavior, and maintained docs.
- Preventive evidence: focused command literals and root gates are named above;
  no product tests ran in artifact mode; platform-only behavior remains a
  required CI/evidence gate.
- If CI breaks: invoke `krt-ci-questor` with the PR/run/check context; do not
  poll checks in Compound Master.
- Escalation rule: retain a release-follow-up blocker until the CI incident has
  cause, owner, and next action; never bypass a red check.

## Branch and PR Handoff Inputs

- Review unit: RU1 — additive self-doctor CLI/report boundary and safe no-follow
  installation inspection.
- Branch name: `feat/read-only-self-doctor`.
- Branch/docs rule: RU1 carries the related maintained CLI/security contract
  docs with the semantic implementation only when behavior is proven; RU2
  carries resolver/coherence docs with its implementation. Do not create a
  planning/docs-only branch.
- PR base: `main` for RU1; RU1 integration base for RU2 after parent merge or
  explicit retarget reconciliation.
- Suggested commit grouping for this review unit:
  - `feat(doctor): add bounded read-only self diagnostics` — CLI mode,
    self-report engine, safe path inspection, and focused tests as one
    filesystem/public-boundary capability slice.
  - `docs(doctor): document advisory self-diagnostic contract` — only
    maintained contract/security/architecture text proven by the behavior.
- PR title: Add bounded read-only self diagnostics.
- PR body bullets:
  - Adds explicit `doctor --self` diagnostics for package/install health.
  - Preserves project-doctor behavior and performs no automatic repair,
    lifecycle execution, or dependency mutation.
  - Fails closed on traversal/link/reparse uncertainty and bounds/sanitizes
    host/child resolver evidence.
  - Includes focused Windows/Linux and aggregate verification evidence, with
    any CI-only gap called out.
- Verification results location: implementation branch's sanitized test
  evidence and package closeout; artifact run evidence is checker/review only.
- Production/deployment notes: posture unknown; no deployment or migration is
  planned; release requires compatibility and platform safety evidence.
- Autonomous mutation request: none; external mutation remains owned by
  `krt-release-marshal` after parent reconciliation.

## Jira Handoff Inputs

- Jira policy: skip.
- Suggested issue type: none; no Jira lookup or mutation is authorized.
- Suggested subtask behavior: none.
- PR-to-Jira mapping: not applicable under explicit `jira-policy:skip`.
- Jira summary: not applicable.
- Jira description: not applicable.
- Optional-policy fallback: not applicable; Jira is intentionally skipped and
  must not be queried or mutated by this run.

## Decision and blocker gates

- No new product decision is opened: the explicit `--self` entry point and
  read-only advisory repair rule are inherited/approved scope.
- Implementation blocker: RDM-017's structured resolver contract must be
  review-passed before U53 can claim child compatibility; U53 may only return
  conservative `unknown` while that dependency is absent.
- Any proposed automatic repair, raw disclosure, unproven traversal,
  lifecycle execution, public-contract removal, or sibling-surface mutation
  returns to the brokered parent decision path.
