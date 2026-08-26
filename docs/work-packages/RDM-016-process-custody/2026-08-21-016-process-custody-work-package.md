---
title: Process custody and orphan recovery
status: package-review-passed
roadmap_item: RDM-016
origin_roadmap: docs/product/roadmap.md
origin_brainstorm: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-requirements.md
origin_planning_input: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
compound_run_id: tinto-e2e-rdm-016-process-custody
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-016-process-custody/state.md
units: [U32, U33, U34]
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

# Process custody and orphan recovery

## Scope

This package turns RDM-016's current in-memory process identity checks into a
durable, ownership-safe custody boundary:

- a launch-scoped owner-only lease with exact PID/start-time/command-identity
  hash/nonce proof and crash-resumable transitions;
- Windows Job Object enforcement with a truthful validated-tree fallback;
- POSIX process-group/session ownership with bounded TERM→KILL escalation;
- idempotent close, cancellation, client-timeout, and transport-loss cleanup;
- bounded startup orphan discovery and repair with owned-listener
  postconditions; and
- sanitized bounded custody evidence through the accepted RDM-015 adapter.

The package is documentation/planning output in this current child. It does
not authorize product-code, product-test, config, shared fixture, commit,
staging, Jira, PR, push, reviewer, merge, or release changes.

## Non-goals

- Public MCP process/lease/repair operations, new public schema fields, or a
  local capability-state vocabulary. DEC-2026-08-21-004 is canonical and is
  consumed only through RDM-015.
- RDM-015 diagnostic sink/query/schema/redaction implementation; RDM-015 only
  supplies the accepted evidence adapter consumed by U34.
- RDM-010 lifecycle/status vocabulary changes, RDM-017 environment/toolchain,
  RDM-020 drift, RDM-021 artifact/discovery/retention, RDM-022 self-doctor, or
  RDM-019 certification behavior.
- Killing a PID, process group, listener, or descendant without a fresh
  conjunctive ownership proof; generic filesystem/process cleanup; remote
  process control; or a second application session.
- Product implementation or tests in artifact mode.

## Autonomy Contract

- Mode: high, local artifact autonomy only.
- Agent may decide without asking: package-local U-ID names, semantic review
  decomposition, internal lease field grouping, deterministic ordering,
  bounded test fixtures, equivalent read-only inspection commands, and
  wording that preserves inherited contracts.
- Agent must record as assumptions: existing PID/start-time/command-hash/
  nonce identity remains authoritative; `.pumarejo/sessions` is the narrow
  lease root; Job Object availability is probed rather than assumed; platform
  skips are explicit; RDM-015 adapter fields and DEC-004 public vocabulary are
  not inferred.
- Agent must escalate: public operation/schema/vocabulary changes, auth,
  tenant/ownership contract changes, destructive process/file deletion policy,
  production/rollback behavior, branch/base strategy, Jira/PR/release work,
  credentials, and scope outside RDM-016.
- Safe fallback: continue pure lease/proof design and deterministic fake
  adapters; preserve any ambiguous lease or process as retryable residue;
  return a brokered decision request when a shared contract is missing; do not
  reopen the canonical DEC-004 states locally.
- Autonomous ledger: `docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json`.
- Allowed external mutation classes: none in this child; the ledger does not
  authorize shipping from the work phase.

## Dependencies

- Requires: accepted RDM-010 launch/status/cleanup contract; accepted RDM-015
  internal custody-evidence adapter; canonical DEC-004 states/codes consumed
  through RDM-015; existing process identity, endpoint, session, and
  signal-shutdown seams.
- Blocks: RDM-019 timeout/orphan certification and RDM-021 listener/readiness
  ownership proof until the accepted custody interface is available.
- Does not own: RDM-015 sink/query/public schema, RDM-017 runtime resolution,
  RDM-020/RDM-022 installer/doctor, RDM-021 artifact policy, or RDM-023
  aggregate certification.

## Production Posture

- Posture: unknown.
- Evidence: the initiative and roadmap define a real Tinto proving journey,
  but no deployed production target or rollback policy is established for this
  child.
- Confidence: medium.
- Consequences: preserve existing public launch/status/close compatibility,
  fail closed on identity uncertainty, and require Windows/Linux evidence plus
  parent aggregate checks before any release claim.
- Breaking existing behavior allowed: only with explicit approval; internal
  custody strengthening is additive and no public contract is changed here.

## Plan Unit Alignment

| Plan unit | Included in this package | Reason |
| --- | --- | --- |
| U32 | yes | Durable lease, identity tuple/nonce proof, atomic transitions, and the internal adapter boundary are the shared foundation. |
| U33 | yes | Windows Job Object/fallback and POSIX group/session enforcement are the destructive custody boundary that must be reviewed with U32. |
| U34 | yes | Orphan recovery, idempotent convergence, listener postconditions, and RDM-015 evidence complete the roadmap item after U32/U33. |

Grouping rationale:

- RU1 groups U32 and U33 because a lease without platform enforcement or an
  enforcement mechanism without the lease proof cannot be independently
  trusted at a destructive boundary. The slice has pure tests and native
  adapter fixtures independent of the public MCP surface.
- RU2 contains U34 because recovery, close-path idempotence, listener
  postconditions, and sanitized evidence share the same state transition and
  must not be deferred to a broad consolidation PR.
- This is a two-unit serial chain chosen for reviewer comprehension and
  independent verification, not for atomicity or Jira shape.

## Implementation Units

- **U32 — Durable lease and identity proof:** define a bounded owner-only
  lease under `.pumarejo/sessions`, atomic state transitions, PID/start-time/
  command-hash/nonce tuple validation, controller identity, and internal
  process/listener/mechanism proof results. Add no public operation.
- **U33 — Platform enforcement:** use a Windows Job Object when the host proves
  creation/configuration/assignment; otherwise use an explicitly degraded
  validated-tree fallback. On POSIX own a process group/session and perform
  TERM→grace→revalidate→KILL only with unchanged proof.
- **U34 — Recovery and sanitized convergence:** scan bounded leases on startup,
  distinguish live versus crashed controllers, repair only proven orphans,
  unify close/cancel/timeout/transport cleanup, verify listeners before lease
  removal, and send bounded sanitized events through RDM-015.

## Review Units

| Review unit | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
| --- | --- | --- | --- | --- | --- |
| RU1 | U32 durable lease/identity plus U33 Windows/POSIX enforcement | Internal session/process types, tracked-process/platform adapters, focused unit/platform fixtures | `main` | skip | High-risk destructive boundary; target <=500 human-authored lines; keep raw native output internal and do not add MCP schema. |
| RU2 | U34 startup repair, cleanup convergence, listener postconditions, RDM-015 evidence | Session manager/cleanup/server signal seam, endpoint ownership adapter, focused integration/platform/security fixtures | RU1 after parent reconciliation | skip | Dependent lifecycle slice; independently verifiable with fake clocks/adapters; no public vocabulary or retention policy. |

## Reviewability Diagnosis

- Reviewer-experience check: yes. RU1 establishes one understandable identity
  and enforcement boundary; RU2 consumes it for recovery and evidence. Each
  has focused deterministic tests and a clear predecessor.
- Granularity chosen because: separating Windows/POSIX mechanisms from lease
  proof would hide the authorization boundary; separating recovery from
  evidence would defer the only evidence of residue. The two slices are the
  coarsest independently reviewable capabilities.
- Open-stack plan: target one, hard max two. RU1 starts from `main`; RU2 may
  stack only when shared runtime files overlap. At the cap, wait for
  `wait-for-parent-merge` into `main` or use `collapse-to-integration-base`
  after parent reconciliation; never accumulate a deeper chain.
- Jira mapping: intentionally skipped. If a later release flow enables Jira,
  each single-review-unit PR maps to one standalone semantic task.
- Downstream-fix trace: none at artifact creation. A later unit must record
  `addresses finding from PR #X` if it fixes an earlier open review finding.
- Failure-mode check: passes; this is neither a micro-PR stack nor a deferred
  mega-consolidation PR.

## Files and Tests

Expected future implementation surfaces (not modified in this child):

- `src/session/process-lease.ts`, `src/session/custody-lease.ts`,
  `src/session/manager.ts`, `src/session/cleanup.ts`
- `src/platform/types.ts`, `src/platform/tracked-process.ts`,
  `src/platform/windows/process.ts`, narrow Windows Job Object adapter,
  `src/platform/linux/process.ts`
- `src/session/endpoint.ts`, `src/mcp/server.ts`, and the narrow RDM-015
  custody-evidence adapter seam
- `tests/unit/process-lease.test.ts`, `tests/unit/process-custody.test.ts`,
  existing tracked/session/Windows process unit tests, integration cleanup and
  runtime fixtures, and structural platform fixtures

Focused future commands:

```text
pnpm exec vitest run tests/unit/process-lease.test.ts tests/unit/process-custody.test.ts
pnpm exec vitest run tests/unit/tracked-process.test.ts tests/unit/session-manager.test.ts tests/unit/windows-process.test.ts
pnpm exec vitest run tests/integration/session-cleanup.test.ts tests/integration/mcp-runtime-fixture.test.ts
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:platform:structural
pnpm test:platform:windows
pnpm test:platform:linux
```

The first command is a future focused command and is expected to remain
unavailable until the implementation lane creates its named tests.

## Impact Scan

- Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/
  tenant/ownership/test fixtures: future implementation changes internal
  process/session ownership helpers, native platform adapters, cleanup state,
  listener proof, and custody test fixtures; no public MCP contract is
  authorized in this package.
- Consumer scan patterns: `ProcessAdapter`, `ProcessIdentity`,
  `terminateProcessLease`, `CleanupStack`, `SessionManager`,
  `providerOwner`, `terminateTree`, `serveMcpOverStdio`, RDM-015 custody
  adapter references, and `.pumarejo/sessions` lease consumers.
- Consumers found: `src/session/manager.ts`,
  `src/session/process-lease.ts`, `src/session/cleanup.ts`,
  `src/session/endpoint.ts`, `src/platform/tracked-process.ts`,
  `src/platform/windows/process.ts`, `src/platform/linux/process.ts`,
  `src/mcp/server.ts`, and existing session/platform integration fixtures.
  RDM-015, RDM-019, and RDM-021 are downstream consumers through the parent
  reconciliation contract; no sibling files are owned by this package.
- Contract-drift tests searched: session state/error snapshots, cleanup labels,
  process identity/PID-reuse tests, nonce authorization tests, provider-owner
  tests, existing `session-cleanup`, `mcp-runtime`, `tracked-process`,
  `windows-process`, and platform ownership fixtures.
- Required consumer tests: the focused commands above, followed by the
  parent-owned aggregate Windows/Linux and certification matrix.
- Consumer tests run/skipped: skipped intentionally in `mode:artifacts`; no
  product files or tests may be changed by this child. The implementation lane
  must record literal results and CI-only host gaps.

## Verification Gate

- Future focused unit proof: lease schema/atomicity, identity tuple and nonce
  races, Job Object/fallback behavior, POSIX group escalation, controller
  crash/orphan repair, idempotent close, listener postconditions, and
  sanitize-before-store adapter bounds.
- Future natural suites: `pnpm test:unit`, `pnpm test:integration`, and
  `pnpm test:contract`.
- Future platform suites: `pnpm test:platform:structural`,
  `pnpm test:platform:windows`, and `pnpm test:platform:linux`; every host
  skip must name the missing native capability or runner condition.
- Surface-aware evidence: identity/ownership proof for process and listeners;
  Windows Job Object and fallback limitation; POSIX group/session TERM/KILL;
  owner-only atomic lease persistence; cleanup/recovery idempotence; bounded
  sanitized RDM-015 evidence; and unchanged public RDM-010 behavior.
- Production posture evidence: posture unknown, so release requires additive
  compatibility, platform proof, timeout/transport-loss evidence, and parent
  aggregate verification before any residue-zero claim.

## Review Gate

- Code review threshold: `P0-P2`.
- Findings below threshold: log unless the parent marks them blocking; any
  finding affecting ownership, process termination, nonce proof, disclosure,
  or public compatibility is blocking regardless of local convenience.

## Security Gate

- Run after work-review loop: required because process termination, leases,
  native handles/groups, local paths, nonces, and sanitized diagnostics are
  security-sensitive destructive boundaries.
- Security Watch during work: enabled for RU1/RU2; inspect identity races,
  group/job scope, crash recovery, link/path containment, and evidence leaks.
- Security Watch notes: never terminate on PID alone; never treat Job Object or
  group membership as sufficient without the launch tuple; never expose raw
  identity/cause/path/nonce; preserve ambiguous residue.
- Security reviewer: `krt-security-sentinel` (future implementation gate),
  with the current artifact review carrying the design/security findings.
- Security review result: pending implementation; design gate acceptable with
  required tests and fail-closed fallbacks.
- Required security verification: deterministic PID-reuse/nonce-loss tests,
  native capability-unavailable tests, owner-only lease/link-race fixtures,
  bounded RDM-015 disclosure corpus, and Windows/Linux platform evidence.

## CI Break-Prevention And Escalation

- CI risk surfaces: process lifecycle, native platform adapters, signal/job
  semantics, session state, listener ownership, persistence/permissions,
  sanitized evidence, and shared fixtures.
- Preventive evidence: focused unit/integration/structural platform commands
  plus parent aggregate `build`, `typecheck`, `lint`, `format:check`, full
  `test`, and `pack:check` gates.
- If CI breaks: invoke `krt-ci-questor` with the PR/run/check context; do not
  poll checks in Compound Master.
- Escalation rule: retain a release-follow-up blocker until the CI incident
  has a cause, owner, and next action; never bypass a red native/security
  check or claim fallback equivalence without evidence.

## Branch and PR Handoff Inputs

- Review unit: RU1 first, then RU2 after RU1 and parent dependency checks.
- Branch name: `feat/process-custody-recovery` (future semantic branch; no
  roadmap/package/review IDs in public branch text).
- Branch/docs rule: the first executable review unit carries its related
  planning artifacts on the semantic implementation branch; this current
  artifact-only child remains on `codex/tinto-e2e-reliability` and does not
  create a planning/docs branch.
- PR base: `main` for RU1; RU1 branch or refreshed `main` for RU2 only after
  parent reconciliation and stack-cap check.
- Suggested commit grouping for this review unit:
  - `feat(process): persist and revalidate launch custody` - U32 lease,
    identity proof, and focused tests - one logical ownership boundary.
  - `feat(platform): contain owned process descendants` - U33 native adapters,
    fallback/group escalation, and platform fixtures - one platform boundary.
  - `feat(session): recover orphaned owned launches` - U34 recovery,
    idempotent cleanup, listener postconditions, evidence adapter, and tests -
    one lifecycle/recovery boundary.
- PR title: `feat: make owned process cleanup recoverable`
- PR body bullets:
  - Persist and revalidate one launch-scoped ownership lease.
  - Use Job Object or a truthful validated fallback on Windows and bounded
    TERM→KILL group ownership on POSIX.
  - Repair only proven orphaned sessions and retain ambiguous residue.
  - Feed bounded sanitized custody evidence through RDM-015 without new public
    vocabulary.
- Verification results location: implementation branch evidence and the
  parent-reconciled Compound state; current child records checker/review only.
- Production/deployment notes: posture unknown; no migration or deployment is
  planned. Lease compatibility, crash recovery, and native platform proof are
  required before release.
- Autonomous mutation request: none; shipping remains disabled and any later
  external mutation belongs to `krt-release-marshal` after parent reconciliation.

## Jira Handoff Inputs

- Jira policy: skip.
- Suggested issue type: Tarea (only if a later release contract enables Jira).
- Suggested subtask behavior: not applicable in this child; do not create or
  mutate Jira.
- PR-to-Jira mapping: if later enabled, one standalone semantic task per
  single-review-unit PR; no parent with a single child.
- Jira summary: `Hacer recuperable y seguro el cierre de procesos propios`.
- Jira description: `Persistir la identidad de cada lanzamiento, validar la propiedad antes de terminar procesos, converger el cierre en Windows y Linux y reparar de forma acotada los lanzamientos huérfanos sin exponer datos sensibles.`
- Skip rationale: Jira was explicitly skipped by the delegated contract; no
  provider lookup, creation, backlink, or transition is authorized.
