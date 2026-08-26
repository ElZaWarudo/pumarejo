---
title: Certify the complete real Tinto journey and failure evidence
status: package-review-passed
roadmap_item: RDM-019
origin_roadmap: docs/product/roadmap.md
origin_brainstorm: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-019-certification-requirements.md
origin_planning_input: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-019-certification-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-019-certification-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-019-certification
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-019-certification/state.md
units: [U37, U38, U39]
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
---

# Certify the complete real Tinto journey and failure evidence

## Scope

Implement a certification-only Tinto harness and evidence suite that:

- prepares a pinned disposable Tinto copy through the supported init/configure
  contract without mutating the operator checkout;
- launches exactly one real Tinto application session through an independent
  public MCP client over local `stdio`;
- discovers/selects dynamic nested surfaces, opens the archived conversation,
  obtains fresh composer/Send/access-selector refs, sends a fixed fixture-safe
  message, and verifies semantic postconditions;
- exercises effective window control and the explicit native-dialog path with
  an unauthorized rejection followed by an authorized one-shot grant;
- queries bounded sanitized diagnostics using a seeded secret/path/content
  corpus;
- forces a real bounded timeout or transport disconnect, proves cleanup and
  unrelated-process safety, and runs an idempotent close; and
- emits a Windows/Linux/provider matrix and explicitly retained sanitized
  artifacts with truthful non-pass skips.

This nested run produces documentation only. It does not implement product
code, product tests, shared fixtures, configuration, capabilities, Jira,
commits, branches, PRs, pushes, merges, or release operations.

## Non-goals

- Replacing the real Tinto journey with mocked domain ports, fake providers,
  generic fixtures, screenshots, OCR, coordinates, arbitrary JavaScript,
  selectors, shell/OS passthrough, or a second application session.
- Implementing RDM-013–RDM-018 contracts, changing public MCP schemas, adding
  a dialog grant permission, changing process custody, inventing diagnostic
  fields, or changing artifact-retention policy.
- Mutating a user-owned Tinto checkout or shared live fixture; all setup uses a
  disposable canonical copy and bounded temporary inputs.
- Claiming cross-platform completion when a required provider/platform row is
  skipped, blocked, or failed.
- Implicit deletion of explicitly retained artifacts; RDM-021 owns cleanup
  policy.

## Autonomy Contract

- Mode: high, local artifact autonomy only.
- Agent may decide without asking: package-local U-ID/RU grouping, stable
  harness/evidence helper names, fixed non-sensitive test inputs, equivalent
  read-only verification commands, and conventional report headings.
- Agent must record as assumptions: the exact Tinto checkout injection
  mechanism, provider/display profile names, internal helper types, and
  platform-only evidence that depends on CI hosts.
- Agent must escalate: public MCP/API changes, dialog authorization shape,
  process/tenant/ownership behavior, raw disclosure, destructive retained-data
  operations, user checkout mutation, shared fixture changes, credentials,
  branch/base strategy, Jira/PR workflow, or any scope outside RDM-019.
- Safe fallback: keep setup and pure evidence design ready; block runtime
  claims when an upstream contract or provider prerequisite is missing; never
  substitute mocks or generic automation.
- Autonomous ledger: `docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json`.
- Allowed external mutation classes: none for this artifact-only child; the
  active parent ledger does not authorize this child to ship.

## Dependencies

- Requires accepted RDM-013 surface graph and coverage contract.
- Requires accepted RDM-014 effective window and explicit Tauri dialog grant
  contract.
- Requires accepted RDM-015 sanitize-before-store diagnostics/query and
  explicit-retention boundary.
- Requires accepted RDM-016 lease, Job Object/process-group, disconnect, and
  residue proof.
- Requires accepted RDM-017 deterministic child environment/toolchain
  resolution.
- Requires accepted RDM-018 bounded sequence and generation outcome matrix.
- Requires a pinned real Tinto checkout/revision, lockfile, disposable-copy
  root, approved launch profile, resolved provider/toolchain/display, fixed
  fixture-safe inputs, seeded diagnostic corpus, and an explicit protected
  evidence root.
- Blocks downstream RDM-023 release certification; informs RDM-020–RDM-022
  reconciliation but does not implement them.

## Production Posture

- Posture: unknown.
- Evidence: inherited initiative describes a local developer/testing tool;
  no deployment or production-user data evidence is present.
- Confidence: high for artifact scope; runtime/platform feasibility remains an
  implementation gate.
- Consequences: additive compatibility only, no migration/deployment, and
  exact evidence is required before any release handoff.
- Breaking existing behavior allowed: no, unless the owning parent explicitly
  approves a contract change.

## Plan Unit Alignment

| Plan unit | Included | Reason |
| --- | --- | --- |
| U37 | yes | Real Tinto setup and successful public journey are the first independently reviewable trust boundary. |
| U38 | yes | Forced timeout/disconnect, diagnostics, and cleanup prove failure safety on the already-owned real session. |
| U39 | yes | Platform/provider matrix and bounded retained artifacts are needed to make the end-to-end claim truthful and reviewable. |

Grouping rationale: RU1 contains U37 because a real public journey, setup
manifest, dynamic surface selection, window evidence, and dialog authorization
must be understood together by a reviewer. RU2 contains U38/U39 because
failure, cleanup, diagnostic disclosure, provider skips, and retained evidence
are one claim about trustworthy certification; splitting them would defer
ownership/sanitization proof into a consolidation PR. This is the coarsest
independently reviewable two-unit chain, not an atomicity or Jira split.

## Implementation Units

- **U37 — Deterministic real-Tinto setup and success journey:** disposable
  canonical copy, init/configure manifest, one owned public-MCP launch,
  dynamic nested-surface discovery/selection, archived conversation,
  composer/Send, window postconditions, and dialog denial then grant.
- **U38 — Forced failure, diagnostics, and cleanup:** real fixture-controlled
  delay, client timeout/transport disconnect, bounded sanitized diagnostics,
  unrelated-process negative control, ownership-safe convergence, and
  idempotent close.
- **U39 — Matrix and retained evidence:** Windows/Linux/provider rows, stable
  truthful skips, sanitized bounded manifest/report, permissions/containment,
  and final evidence disposition.

## Review Units

| Review unit | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
| --- | --- | --- | --- | --- | --- |
| RU1 | U37 real Tinto setup and public success journey. | New `tests/support/tinto-harness.ts`, `tests/support/tinto-config.ts`, `tests/integration/tinto-harness.test.ts`, `tests/contract/tinto-public-journey.test.ts`. | `main` | skip | High trust-boundary/provider risk; target <=500 human-authored lines; no shared fixture or product code; no generated artifact. |
| RU2 | U38 forced failure/cleanup plus U39 matrix/evidence. | New failure/evidence helpers, contract/platform tests, and sanitized `docs/evidence/rdm-019/README.md`; no product/shared-state files. | RU1 branch after parent merge or reconciled `main` | skip | High ownership/disclosure/platform risk; target <=500 human-authored lines; report/docs remain with evidence so claims are reviewable together. |

## Reviewability Diagnosis

- Reviewer-experience check: passes. RU1 is a self-contained real-use proof;
  RU2 is a self-contained failure/disclosure/platform proof over the same
  harness contract, without a three-plus PR stack.
- Granularity chosen because: each unit has independent evidence and a clear
  reviewer risk boundary; combining all setup, failure, and matrix work would
  obscure whether a false pass came from the harness or cleanup path.
- Open-stack plan: target one pending PR, hard maximum two; at the cap use
  `wait-for-parent-merge` into `main` or `collapse-to-integration-base` onto a
  refreshed base. Never deepen the chain or create a deferred mega-PR.
- Jira mapping: intentionally skipped; if later enabled, each review unit maps
  to one standalone semantic task.
- Downstream-fix trace: none at artifact creation; a later unit must record
  `addresses finding from PR #X` if it fixes a finding from an earlier open PR.
- Failure-mode check: this is neither a micro-PR stack nor a deferred
  consolidation; RU2 keeps ownership, redaction, and matrix proof together.

## Files and Tests

Future implementation owns only these new/isolated surfaces:

- `tests/support/tinto-config.ts`, `tests/support/tinto-harness.ts`,
  `tests/support/tinto-failure-scenarios.ts`, and
  `tests/support/tinto-evidence.ts` for deterministic disposable setup,
  public-client orchestration, real delay/disconnect, and sanitized manifest;
- `tests/integration/tinto-harness.test.ts` and
  `tests/contract/tinto-public-journey.test.ts` for U37;
- `tests/contract/tinto-diagnostics.test.ts` and
  `tests/integration/tinto-failure-cleanup.test.ts` for U38;
- `tests/platform/tinto-certification.test.ts`,
  `tests/platform/tinto-failure-matrix.test.ts`, and
  `tests/support/tinto-evidence.test.ts` for U39; and
- `docs/evidence/rdm-019/README.md` for the sanitized, reproducible evidence
  disposition. The current artifact run does not create this future evidence
  directory or any test file.

Literal future focused checks:

```text
pnpm exec vitest run tests/integration/tinto-harness.test.ts
pnpm exec vitest run tests/contract/tinto-public-journey.test.ts
pnpm exec vitest run tests/contract/tinto-diagnostics.test.ts tests/integration/tinto-failure-cleanup.test.ts
pnpm exec vitest run --no-file-parallelism tests/platform/tinto-certification.test.ts tests/platform/tinto-failure-matrix.test.ts
pnpm exec vitest run tests/support/tinto-evidence.test.ts
pnpm validate
```

Windows and Linux platform invocations intentionally use the same test files;
the approved real Tinto/provider/display profile selects the host. A missing
provider/host must emit its exact sanitized skip and cannot be reported as a
product pass. Root-owned aggregate checks remain:

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

- Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/
  tenant/ownership/test fixtures: future certification test harness consumes
  public MCP and custody/diagnostic contracts; it adds no product API. New
  certification fixture/config and evidence schemas are test-local and
  attributable to this package.
- Consumer scan patterns: `rg -n "createPumarejoRuntime|createMcpServer|tauri_launch|tauri_status|surfaceDiscover|surfaceSelect|tauri_window|dialog|diagnostic|ownedResources|cleanupPending|providerRunEnabled|real-usage" src tests docs`.
- Consumers found: existing generic live public journey,
  mocked `real-usage-journey`, RDM-013–RDM-018 plans/packages/states, and the
  inherited initiative/gap audit. Existing shared MCP/session/provider
  surfaces are explicitly read-only inputs.
- Contract-drift tests searched: public MCP tool/schema allowlists, current
  generation/stale-ref tests, dialog grant/denial, window capability states,
  bounded diagnostics/redaction, process custody/residue, platform launch,
  artifact permissions/containment, and package validation.
- Required consumer tests: focused commands above plus root aggregate and
  parent RDM-023 fingerprint after all upstream contracts are reconciled.
- Consumer tests run/skipped: skipped by authority; no product/test/config
  edits are allowed in `mode:artifacts`. The work-package checker and
  documentation checks are the only local verification in this child.

## Verification Gate

- `check_work_package.py` must pass this package before implementation.
- Future RU1 must prove real Tinto setup/launch, no mocks, dynamic surfaces,
  fresh composer/Send refs, window postconditions, dialog denial then grant,
  and one-session ownership.
- Future RU2 must prove seeded redaction before store/serialization,
  deterministic real timeout/disconnect, unrelated-process safety, residue
  convergence, Windows/Linux rows, truthful skip/non-pass semantics, and
  bounded protected artifacts.
- Surface-aware evidence must identify MCP/public boundary, session/process/
  surface/generation binding, provider capabilities, diagnostics, custody,
  artifact root, and host disposition separately.
- Unknown-production posture requires compatibility, no destructive retained
  deletion, explicit platform evidence, and no release claim from local-only
  smoke output.

## Review Gate

- Code review threshold: P0-P2; future implementation only.
- Document review: requirements, plan, dependency map, and package reviewed
  non-interactively by coherence, feasibility, product, design, security,
  scope, and adversarial lenses. Durable findings are at
  `docs/review-findings/tinto-e2e-reliability/RDM-019-certification/2026-08-24-document-review.md`.
- Findings below threshold remain logged as implementation guidance and do not
  block this artifact closeout.

## Security Gate

- Run after work-review loop: required in future implementation because native
  authorization, secrets/PII-like seeded data, process ownership, public MCP
  contracts, filesystem/artifact retention, and external provider boundaries
  are exercised.
- Security Watch during work: enabled; no raw Tinto content/path/env/provider
  identifiers, no mock evidence, no unowned cleanup, no implicit dialog choice,
  and no implicit retention deletion.
- Security reviewer: `krt-security-sentinel` at implementation; design review
  was performed inline for this artifact packet.
- Security review result: design pass with implementation verification
  required; formal implementation gate pending.
- Required security verification: seeded disclosure corpus at the
  sanitize-before-store boundary, grant denial/replay/scope tests, ownership
  and unrelated-process cleanup proof, canonical-root/link checks, artifact
  permission/containment/bounds, and provider-gated skip assertions.

## CI Break-Prevention And Escalation

- CI risk surfaces: real Tinto/provider availability, Windows/Linux displays,
  toolchain resolution, public MCP schema compatibility, generation ordering,
  native dialog grants, process cleanup, redaction, artifact permissions, and
  platform test duration.
- Preventive evidence: literal focused commands, deterministic disposable
  profiles, pinned Tinto revision, fixed failure delay, injected clock/deadline
  seam at the client boundary, explicit skip matrix, and root aggregate
  commands above. Product checks are intentionally skipped now.
- If CI breaks: invoke `krt-ci-questor` with the run/check context; do not poll
  or bypass platform checks in Compound Master.
- Escalation rule: retain a release-follow-up blocker until the CI incident
  has cause, owner, and a focused verification result.

## Branch and PR Handoff Inputs

- Review unit: RU1 — real Tinto setup and successful public journey first;
  RU2 — forced failure, cleanup, matrix, and evidence second.
- Branch name: `feat/tinto-public-certification`.
- Branch/docs rule: future implementation carries the maintained evidence
  contract with the semantic branch; no planning/docs-only branch is created.
- PR base: `main` for RU1; RU1 integration base for RU2 after parent merge or
  explicit retarget reconciliation.
- Suggested commit grouping for RU1:
  - `test(tinto): certify the real public journey` — disposable setup,
    public-client journey, focused contract/integration evidence — one logical
    success-path review unit.
- Suggested commit grouping for RU2:
  - `test(tinto): certify failure cleanup and platform evidence` — forced
    timeout/disconnect, diagnostics, matrix, sanitized manifest/report — one
    logical failure/disclosure review unit.
- PR title: Certify the real Tinto public journey and failure cleanup.
- PR body bullets:
  - Drives the pinned real Tinto checkout through one public MCP-owned session
    with dynamic surface, composer/Send, window, and dialog evidence.
  - Proves unauthorized dialog rejection, exact one-shot grant use, seeded
    diagnostic redaction, forced timeout/disconnect, and ownership-safe cleanup.
  - Reports Windows/Linux/provider rows truthfully and retains only bounded
    sanitized artifacts; skipped rows cannot claim complete certification.
- Verification results location: implementation branch evidence and
  `docs/evidence/rdm-019/README.md`; current artifact run has checker/review
  evidence only.
- Production/deployment notes: posture unknown; no deployment/migration or
  retained-data deletion.
- Autonomous mutation request: none; ledger path is retained for parent
  context but allowed mutation classes for this child are empty.

## Jira Handoff Inputs

- Jira policy: skip.
- Suggested issue type/subtask: none; no Jira lookup, creation, backlink, or
  transition is authorized.
- PR-to-Jira mapping: not applicable under explicit skip.
- Optional-policy fallback: not applicable; Jira intentionally omitted.



