---
title: Final regression and release certification evidence
status: review-passed
artifact_status: artifacts-ready
roadmap_item: RDM-023
origin_roadmap: docs/product/roadmap.md
origin_brainstorm: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-023-release-certification-requirements.md
origin_planning_input: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-023-release-certification-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-023-release-certification-plan.md
origin_dependency_map: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-023-release-certification-dependency-map.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-023-release-certification
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-023-release-certification/state.md
units: [U54, U55, U56, U57]
unit_alignment: complete
review_units: [RU1]
base_branch: main
pr_strategy: independent
max_open_stack: n/a
jira_policy: skip
production_posture: unknown
autonomy: high
autonomous_ledger: docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json
allowed_mutation_classes: []
---

# Final regression and release certification evidence

## Scope

Define and later execute the final evidence-only regression slice after
RDM-019–RDM-022. The slice validates capability composition, real generated
Cargo/rustfmt idempotence, formatting baseline, Node 22/24 package gates,
Windows/Linux platform suites, package/pack smoke, real Tinto evidence,
security review, truthful unsupported-provider outcomes, explicit-policy
artifact cleanup, self-doctor, and attributed drift. It emits a bounded,
sanitized, fingerprinted matrix and a Release Marshal readiness packet.

This current run produces planning artifacts only. It authorizes no product
code/test/fixture/config edits, evidence writes, release mutation, Jira, PR,
commit, branch, push, merge, publication, or reviewer request.

## Non-goals

- Reimplementing RDM-019 Tinto, RDM-020 drift, RDM-021 artifact policy, or
  RDM-022 self-doctor.
- Changing public MCP, capability, process ownership, dialog authorization,
  toolchain, generation, retention, or cleanup contracts.
- Treating a mocked/generic fixture as Tinto evidence or a screenshot as an
  actionable proof.
- Adding implicit retained-artifact deletion or cleaning unowned residue.
- Invoking `krt-release-marshal`; the nested child returns its packet to
  Seneschal for wave reconciliation.

## Autonomy Contract

- Mode: high for reversible artifact-local writes only.
- Agent may decide without asking: canonical lane IDs, stable internal reason
  names, disposable fixture layout, sorted fingerprint serialization, and
  equivalent read-only verification commands that preserve this contract.
- Agent must record as assumptions: support-lane requiredness derived from the
  reconciled compatibility/workflow docs, exact generation CLI discovered by
  the future implementation worker, and environment-specific provider IDs.
- Agent must escalate: any new support promise, capability/public contract,
  authorization, cleanup/deletion default, security exception, branch/base,
  Jira/PR/release workflow, credentials, or scope change.
- Safe fallback: record the affected row as `blocked` or truthful `skipped`,
  preserve safe independent document work, and return a brokered decision
  request instead of inferring a pass.
- Autonomous ledger: `docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json`.
- Allowed external mutation classes: none; this child is validation-only and
  shipping is disabled.

## Dependencies

- Requires review-passed and reconciled RDM-019 Tinto evidence, RDM-020
  attributed-drift evidence, RDM-021 network/artifact-policy evidence, and
  RDM-022 self-doctor evidence, plus the accepted RDM-017 resolver contract.
- Requires the initiative contract's explicit retained-artifact policy and the
  source revision/fingerprint used by the parent wave.
- Blocks final release readiness until all required rows pass and security
  review has no blocking finding.
- Does not own or modify any dependency artifact, shared queue, ledger,
  initiative, roadmap, product file, test fixture, or evidence directory.

## Production Posture

- Posture: unknown.
- Evidence: no production deployment or publication target is established in
  this child; repository compatibility and release documents are the evidence
  source.
- Confidence: medium.
- Consequences: preserve all existing behavior, require additive regression
  proof, require platform/security evidence, and do not infer rollback or
  publication authorization.
- Breaking existing behavior allowed: no, unless the parent records an
  explicit approved decision outside this artifact-only run.

## Plan Unit Alignment

| Plan unit | Included in this package | Reason |
| --- | --- | --- |
| U54 | yes | Dependency closure, lane identity, receipt validation, and canonical fingerprints are the release gate's foundation. |
| U55 | yes | Capability and real Cargo/rustfmt proof are the explicit regression gap and have a distinct security/compatibility risk. |
| U56 | yes | Matrix execution composes format, Node, platform, package, Tinto, security, cleanup, self-doctor, and drift receipts. |
| U57 | yes | A single reducer and handoff packet prevents a pass from being inferred across missing or skipped rows. |

Grouping rationale:

- One review unit is the coarsest independently useful evidence slice: the
  reducer cannot be reviewed without seeing the fixture and lane contracts,
  and splitting each environment into micro-PRs would create a deep evidence
  stack rather than independent value.
- The future implementation may split commits by fixture, matrix runner, and
  evidence reducer while keeping one reviewer-facing certification unit. Large
  generated evidence is fingerprinted and reviewed as data, not as an opaque
  source dump.

## Implementation Units

- **U54:** dependency closure, lane requiredness, canonical sanitized records,
  receipt validation, and per-lane/bundle SHA-256 fingerprints.
- **U55:** capability JSON/TOML composition and malformed/unsafe/duplicate
  fixture matrix; real generated Cargo fixture and two-pass rustfmt proof.
- **U56:** formatting baseline, Node 22/24 package lanes, Windows/Linux suites,
  package/pack smoke, real Tinto receipt, security receipt, explicit-policy
  cleanup branches, self-doctor, and attributed-drift regression receipts.
- **U57:** deterministic blocking reducer, evidence bundle/index, readiness
  checklist, advisory/skip report, and Release Marshal context.

## Review Units

| Review unit | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
| --- | --- | --- | --- | --- | --- |
| RU1 | Integrated release-certification matrix, real Cargo fixture proof, sanitized evidence reducer, and release-readiness packet. | Future `tests/release/`, focused contract/integration/platform fixtures, disposable Cargo fixture harness, and approved release-evidence index; current child changes docs only. | `main` at reconciled dependency revision | skip (explicit Jira policy) | Standard evidence slice; target <=500 authored lines; generated evidence is bounded/fingerprinted; high security/release risk. |

## Reviewability Diagnosis

- Reviewer-experience check: yes. One unit tells one coherent story—prove the
  release matrix and reduce it to a truthful readiness result—without requiring
  a reviewer to reconstruct results across many environment PRs.
- Granularity chosen because: the fixtures, reducer, and release bundle have
  independent risk but no independently mergeable product value; a split would
  make evidence ordering and fingerprint provenance harder to review.
- Open-stack plan: independent PR, no stack; if the parent later needs a
  stacked implementation branch, cap at two open PRs and wait for parent merge
  or collapse onto the refreshed integration base.
- Jira mapping: Jira intentionally skipped by the delegated contract.
- Downstream-fix trace: none at artifact creation.
- Failure-mode check: no deep micro-PR stack and no deferred mega-consolidation
  PR; future generated evidence remains bounded and separately fingerprinted.

## Files and Tests

Future implementation surfaces (not edited in this child):

- `tests/release/release-safety.test.ts` and certification-specific release
  assertions;
- existing contract/integration/platform suites listed in the plan;
- disposable copies of `tests/fixtures/tauri-app` and relevant project
  fixtures, never shared fixture normalization;
- real generated Cargo fixture and rustfmt hash manifest;
- sanitized release evidence index under the parent-approved evidence root.

Future literal commands:

```text
pnpm exec vitest run tests/release/release-safety.test.ts
pnpm exec vitest run tests/contract/cli.test.ts tests/contract/exports.test.ts tests/contract/package.test.ts tests/contract/mcp-server.test.ts tests/contract/real-usage-journey.test.ts
pnpm exec vitest run tests/integration/doctor.test.ts tests/integration/artifact-store.test.ts tests/integration/init.test.ts tests/integration/remove.test.ts tests/integration/session-cleanup.test.ts tests/integration/surface-graph.test.ts
pnpm test:agent
pnpm test:platform:structural
pnpm test:platform:windows
pnpm test:platform:linux
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack:check
pnpm validate
```

No product or platform tests run during this artifact-only child.

## Impact Scan

- Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/
  tenant/ownership/test fixtures: none in this child; future release checks
  consume existing contracts and must fail if they drift.
- Consumer scan patterns: `rg "capabilit|Cargo|cargo fmt|rustfmt|format:check|pack:check|Tinto|tinto|doctor|drift|retain|cleanup|provider|unsupported|node" src tests docs package.json`.
- Consumers found: capability/installer generation, package exports/CLI,
  platform gates, Tinto receipt, artifact policy, self-doctor diagnostics, and
  drift evaluator contracts described by RDM-019–RDM-022.
- Contract-drift tests searched: capability identifiers/windows/permissions,
  wildcard and duplicate rejection, generated Rust markers, package allowlist,
  provider outcome vocabulary, stable doctor IDs, explicit cleanup policy,
  Tinto no-mock/auth/residue requirements, and attribution precedence.
- Required consumer tests: all future commands under Files and Tests plus the
  real Cargo fixture proof and security review.
- Consumer tests run/skipped: skipped intentionally; this run edits no product
  or test files and cannot claim implementation evidence.

## Verification Gate

- Artifact gate now: package checker must report
  `work package review-unit checks passed`; `git diff --check` must be clean on
  the seven owned paths.
- Future implementation gate: all focused commands, real Cargo two-pass
  idempotence, required Node/platform rows, package smoke, Tinto receipt,
  self-doctor/drift/cleanup receipts, and security review pass.
- Surface-aware evidence: capability fixtures prove authority/composition;
  Cargo fixture proves generated Rust formatting; package checks prove exports
  and tarball boundary; Tinto receipts prove public-MCP authenticity and
  ownership; hardening receipts prove policy compatibility; matrix records
  every platform/provider skip/failure.
- Production posture evidence: unknown posture requires additive
  compatibility proof, sanitized Windows/Linux evidence, zero unexplained
  owned residue, and explicit Release Marshal reconciliation.

## Review Gate

- Code review threshold: P0-P2 for future implementation; no code review is
  performed in this artifact-only child.
- Findings below threshold: record as advisory and never use them to relax
  capability, formatter, sanitizer, ownership, or cleanup gates.
- Document review: coherence, feasibility, scope, release-evidence, security,
  and adversarial lenses must pass with no unresolved artifact blocker.

## Security Gate

- Run after the future work-review loop: required because the package tests
  capability authority, generated code, filesystem/link safety, process
  ownership, dialog evidence, sanitization, and explicit cleanup.
- Security Watch during work: enabled for future execution; this child records
  design-time notes only and performs no intrusive scan.
- Security Watch notes: fail closed on malformed/unsafe capability files,
  duplicate IDs, formatter mismatch, stale ownership, raw diagnostic leakage,
  unowned cleanup targets, and provider/environment uncertainty.
- Security reviewer: `krt-security-sentinel` (or approved fallback if absent).
- Security review result: design-pass/pending future implementation evidence.
- Required security verification: seeded secret/path corpus; unauthorized
  dialog and grant-scope receipt; generated capability authority diff; unsafe
  link/reparse cases; unrelated-process preservation; explicit-policy cleanup
  and no-policy preservation; sanitized fingerprint recomputation.

## CI Break-Prevention And Escalation

- CI risk surfaces: generated Rust/Cargo formatter, capability composition and
  parsing, platform/provider gates, Node matrix, package allowlist, Tinto
  evidence authenticity, artifact cleanup, self-doctor, drift attribution,
  sanitizer output, and aggregate command ordering.
- Preventive evidence: literal focused commands and root aggregate commands
  are recorded per lane; no product CI pass is claimed in artifact mode.
- If CI breaks: invoke `krt-ci-questor` with the run/job/step context and keep
  a release-follow-up blocker until cause, owner, and next action are recorded.
- Escalation rule: no red check bypass, retry inflation, skip relabeling, or
  release readiness claim without a reconciled decision.

## Branch and PR Handoff Inputs

- Review unit: RU1 — integrated final regression and release certification
  evidence.
- Branch name: `feat/release-certification-matrix` (future implementation;
  this child remains on the supplied documentation branch).
- Branch/docs rule: the first executable unit carries related planning and
  maintained evidence documentation on its semantic implementation branch; do
  not ship a dedicated planning/docs branch.
- PR base: `main` at the reconciled RDM-019–RDM-022 implementation revision.
- Suggested commit grouping for the future review unit:
  - `test(release): certify capability and generated Rust regressions` —
    capability fixtures, real Cargo fixture, and rustfmt evidence.
  - `test(release): record supported matrix and truthful skips` — Node,
    Windows/Linux, package, Tinto, hardening receipts, and reducer.
  - `docs(release): publish sanitized readiness evidence` — only the
    parent-approved evidence index and operator guidance proven by the checks.
- PR title: Finalize release certification matrix.
- PR body bullets:
  - Verifies capability composition and real generated Rust rustfmt idempotence.
  - Runs supported Node, Windows/Linux, package, Tinto, and hardening evidence
    with typed pass/fail/skip/block outcomes.
  - Preserves explicit-policy artifact cleanup and keeps evidence sanitized and
    fingerprinted.
  - Leaves release mutation and publication to Release Marshal.
- Verification results location: parent-approved sanitized release evidence
  index and child closeout; this artifact run records only planning checks.
- Production/deployment notes: posture unknown; no deployment or publication
  mutation is planned.
- Autonomous mutation request: none; ledger path is inherited for audit context
  but `allowed_mutation_classes: []` and shipping remain disabled.

## Jira Handoff Inputs

- Jira policy: skip.
- Suggested issue type/subtask: none; no Jira lookup or mutation is authorized.
- PR-to-Jira mapping: not applicable under explicit `jira-policy:skip`.

## Acceptance Trace

- Initiative requirement: REL-016, plus REL-004–REL-015 evidence consumed from
  the upstream packages.
- Roadmap acceptance: capability composition and rustfmt-idempotent generation
  survive the complete supported matrix.
- Gap audit closure: the missing real Cargo formatter fixture and fragmented
  full validation matrix are represented as blocking evidence gates.

## Release Readiness

This package is ready for Seneschal reconciliation after checker and document
review. It is not itself release-ready: implementation evidence, required
platform rows, security review, and RDM-019–RDM-022 dependency receipts remain
future gates. A future child may return a Release Marshal-ready packet only
when the reducer returns `ready`; this child must not invoke Release Marshal.

