---
title: Expose bounded sanitized runtime evidence
status: ci-prevention-ready
roadmap_item: RDM-015
origin_roadmap: docs/product/roadmap.md
origin_brainstorm: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-requirements.md
origin_planning_input: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
compound_run_id: tinto-e2e-rdm-015-observability
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-015-observability/state.md
units: [U28, U29, U30, U31]
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

# Expose bounded sanitized runtime evidence

## Scope

Implement a bounded, sanitize-before-store observability pipeline for the one
owned Pumarejo session:

- an internal bounded event envelope and deterministic ring buffers;
- sanitized WebView console, owned stdout/stderr, invocation, launch-phase,
  and last-error producer adapters;
- a finite read-only query projection composed with the accepted RDM-013
  surface/capability contract; and
- explicit opt-in retention of bounded sanitized records through existing
  protected artifact boundaries.

The inherited RDM-013 decisions are canonical: public additions are dedicated
read-only operations and capability states are exactly `supported`,
`unsupported`, `unavailable`, `denied`, and `failed`. This package consumes
that vocabulary through the additive `tauri_diagnostics` operation.

## Non-goals

- unbounded log streaming, subscriptions, network diagnostics, raw process or
  environment output, raw arguments, full paths, PIDs, nonces, provider
  handles, stack traces, screenshots, or unredacted causes;
- arbitrary JavaScript, shell, WebDriver, Tauri-command, selector, XPath,
  coordinate, OCR, or OS passthrough;
- new lifecycle states, process custody/repair, Job Objects/process groups,
  environment/toolchain resolution, loopback/retention cleanup policy, or Tinto
  certification;
- automatic durable retention/deletion or inferred age/count/byte policy;
- changes to RDM-009, RDM-010, RDM-013, or sibling worker files;
- invention of public operation names, field names, or capability vocabulary;
- Jira, commits, staging, pushes, PRs, merge, or release. Product changes are
  limited to the declared RDM-015 implementation and verification surfaces.

## Autonomy Contract

- Mode: high, local implementation/artifact autonomy only.
- Agent may decide without asking: package-local document structure, internal
  helper/type names, deterministic event ordering and tie-breakers, pure
  sanitizer/ring-buffer decomposition, equivalent read-only inspection
  commands, and focused fixture grouping.
- Agent must record as assumptions: current RDM-009 redaction and RDM-010
  phase/status contracts remain authoritative; RDM-013 surface/capability
  decisions are consumed rather than redefined; existing `ArtifactStore`
  containment/permission checks remain the retained sink; provider/platform
  gaps may be CI-only; and retention remains explicitly opt-in.
- Agent must escalate: retention/deletion defaults, auth/ownership/session
  boundaries,
  provider support claims, branch/base strategy, Jira/PR workflow, credentials,
  production compatibility, or any sibling surface.
- Safe fallback: keep provider console evidence `unsupported` when no approved
  provider boundary exists and retain only bounded internal evidence.
- Autonomous ledger: `docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json`.
- Allowed external mutation classes: none in artifact mode; the inherited
  ledger cannot authorize worker shipping or Jira/release actions.

## Dependencies

- Requires: RDM-009 bounded observation/redaction contract; RDM-010 accepted
  lifecycle/status contract; RDM-013 canonical additive operations and
  capability vocabulary; existing protected `ArtifactStore`.
- Blocks: RDM-016 process custody evidence, RDM-017 portable runtime
  diagnostics, RDM-019 Tinto certification, and RDM-021 network/artifact
  diagnostic integration.
- Sibling coordination: central MCP schemas/runtime/domain ports, session
  state, provider adapters, config, artifact policy, and shared fixtures remain
  serialized by Seneschal; this child owns only the declared diagnostic
  adapters and query wiring.

## Production Posture

- Posture: unknown.
- Evidence: the initiative is a reliability-hardening effort; no live
  deployment posture was established for this child.
- Confidence: medium.
- Consequences for this package: additions preserve current status/error
  behavior, one-session ownership, local `stdio`, bounded serialization, and
  mandatory redaction; the new query is additive and independently bounded.
- Breaking existing behavior allowed: no.

## Plan Unit Alignment

| Plan unit | Included in this package | Reason                                                                                                       |
| --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| U28       | yes                      | Sanitized internal envelope and deterministic ring storage are the foundation for all diagnostic sources.    |
| U29       | yes                      | Producer adapters are required to populate the sink and preserve ownership/phase/provider evidence.          |
| U30       | yes                      | Bounded query projection consumes the approved additive operation and capability vocabulary.                 |
| U31       | yes                      | Explicit retention and security/compatibility tests complete the disclosure boundary and downstream handoff. |

Grouping rationale:

- RU1 combines U28 and U29 because a sanitizer without a producer boundary
  cannot prove sanitize-before-store, and the producer tests need the same
  deterministic sink/ownership invariants. It is independently reviewable as
  an internal capability without a public API.
- RU2 combines U30 and U31 because query projection, capability mapping,
  retention, and disclosure tests are one public trust boundary. Splitting
  retention into a later micro-PR would defer the security contract into a
  hidden consolidation. RU2 remains one coherent public trust-boundary slice.

## Implementation Units

- **U28 — Sanitized bounded sink:** allowlisted internal event projection,
  sanitize-before-store, deterministic sequence/order, finite ring buffers,
  eviction/truncation evidence, and session/surface ownership checks.
- **U29 — Runtime producers:** provider-gated console adapter, owned process
  stdout/stderr chunks, invocation start/end/error projection, accepted launch
  phase history, and per-process/per-surface last-error projection.
- **U30 — Bounded query projection:** finite read-only source selection and
  limits, current session/surface validation, accepted RDM-013 capability
  outcomes, MCP framing headroom, and additive compatibility wiring after
  decisions close.
- **U31 — Explicit retention/security evidence:** memory-only default,
  protected opt-in retained records, no inferred cleanup policy, disclosure
  corpus, ownership/scope regressions, and downstream handoff evidence.

## Review Units

| Review unit | Scope                                                                                                                    | Expected changed surfaces                                                                                                                                                                                                                                | PR base                                                  | Jira issue/subtask                    | Size/risk note                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| RU1         | Internal sanitizer/ring buffers and source producers (U28-U29).                                                          | `src/observability/` (new), `src/shared/`, `src/platform/tracked-process.ts`, `src/platform/windows/`, `src/platform/linux/`, `src/webdriver/`, `src/session/`, `src/mcp/runtime.ts`, focused unit/integration/platform tests, security notes.           | `main`                                                   | skip (Jira policy explicitly skipped) | High sensitive-data/ownership risk; target <=500 human-authored lines; no public operation/schema changes.                |
| RU2         | Bounded public query, RDM-013 capability composition, explicit retention, and security/compatibility evidence (U30-U31). | `src/mcp/domain-ports.ts`, `src/mcp/schemas.ts`, `src/mcp/server.ts`, `src/mcp/runtime.ts`, narrow `src/artifacts/`/`src/config/` adapter, `docs/contracts.md`, `docs/architecture.md`, `docs/security.md`, focused contract/integration/platform tests. | RU1 branch after parent review/merge or refreshed `main` | skip (Jira policy explicitly skipped) | Public-contract/security risk; inherited decisions consumed; target <=500 human-authored lines; generated artifacts none. |

## Reviewability Diagnosis

- Reviewer-experience check: yes. RU1 is an internal, pure-and-producer slice
  with deterministic tests; RU2 is one public trust-boundary slice where query
  shape, capability outcomes, retention, and disclosure evidence can be
  reviewed and merged coherently.
- Granularity chosen because: the split follows independently reviewable risk
  and verification, not atomicity or Jira shape. Combining all units would
  force a reviewer to reason about public decisions and process/provider
  capture simultaneously; splitting RU2 would defer the retention security
  contract.
- Open-stack plan: serial chain depth 1 during RU1, at most 2 after RU2 is
  opened; at cap use `wait-for-parent-merge` or
  `collapse-to-integration-base`, never a deferred mega-consolidation PR.
- Jira mapping: Jira intentionally skipped by delegated contract; if a later
  release run changes policy, each review unit is one standalone work item.
- Downstream-fix trace: none at artifact creation.
- Failure-mode check: no deep micro-PR stack and no deferred mega-consolidation
  PR.

## Files and Tests

Implementation surfaces changed by this run:

- `src/observability/` internal sink, sanitizer, record and retention adapter;
- `src/platform/tracked-process.ts`, `src/platform/windows/`,
  `src/platform/linux/` bounded process-stream producers;
- `src/webdriver/` provider-gated console evidence;
- `src/session/` launch phase/last-error ownership hooks;
- `src/mcp/runtime.ts`, `src/mcp/domain-ports.ts`, `src/mcp/schemas.ts`, and
  `src/mcp/server.ts` bounded `tauri_diagnostics` query composition;
- narrow `src/artifacts/`/`src/config/` integration only after explicit
  retention policy and sibling coordination;
- `docs/contracts.md`, `docs/architecture.md`, `docs/security.md`; and
- focused `tests/unit`, `tests/integration`, `tests/contract`, and
  `tests/platform` fixtures for redaction, bounds, ordering, ownership,
  capability gaps, framing, retention, and compatibility.

## Impact Scan

- Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/tenant/ownership/test fixtures: additive public MCP query schema/result, runtime/domain port, error projection, process-stream adapter, session/surface scoping, and diagnostic fixtures. No auth/tenant contract change is authorized.
- Consumer scan patterns: `tauri_status`, `lastFailure`, `phase`, `LaunchPhase`, `PumarejoDomainPorts`, `PumarejoRuntime`, `tracked-process`, `WebDriverClient`, `ErrorEnvelope`, `retainArtifacts`, `ArtifactStore`, `src/mcp/schemas.ts`, and `docs/contracts.md`.
- Consumers found: `src/mcp/runtime.ts`, `src/mcp/server.ts`, `src/mcp/domain-ports.ts`, `src/session/manager.ts`, `src/session/state.ts`, `src/platform/tracked-process.ts`, Windows/Linux process adapters, `src/webdriver/client.ts`, `src/shared/errors.ts`, `src/artifacts/store.ts`, and unit/integration/contract/platform tests.
- Contract-drift tests searched: MCP tool-list/schema assertions, status/phase fixtures, error envelope code lists, provider capability/error normalization, process ownership tests, artifact retention/manifest tests, public framing limits, and seeded redaction fixtures.
- Required consumer tests: `pnpm test:unit`, `pnpm test:integration`, `pnpm test:contract`; platform/provider commands when host permits; root aggregate remains Seneschal-owned.
- Consumer tests run/skipped: focused sink/runtime/contract tests pass;
  integration and contract suites pass. The full unit command has five
  host/sibling failures and two skips, all named in child state. Platform and
  provider matrix evidence remains root-owned.

## Verification Gate

- Mechanical package check must pass:

  `python C:\Users\User\.agents\skills\krt-compound-master\scripts\check_work_package.py docs/work-packages/RDM-015-observability/2026-08-21-015-bounded-runtime-observability-work-package.md`

- RU1: `tests/unit/diagnostics.test.ts`, tracked-process/runtime tests, and
  focused producer wiring pass.
- RU2: MCP schema/dispatch, framing, capability, ownership, and retention
  tests pass through `tests/contract/mcp-server.test.ts` and runtime fixtures.
- Surface-aware evidence: deterministic ring bounds and redaction for the
  internal sink; producer ownership and phase/error evidence for session,
  process, and provider seams; bounded MCP framing and accepted RDM-013 states
  for public projection; protected memory-only/opt-in retention evidence for
  artifacts.
- Production posture evidence: unknown; additive compatibility,
  rollback/no-retention-default proof, Windows/Linux provider gaps, and root
  aggregate evidence remain required before release handoff.

## Review Gate

- Code review threshold: P0-P2.
- Findings below threshold: log unless the parent marks them blocking.
- Artifact document review is non-interactive and durable at
  `docs/review-findings/tinto-e2e-reliability/RDM-015-observability/2026-08-21-document-review.md`.

## Security Gate

- Run after work-review loop: required because the package handles secrets,
  sensitive application content, process output, provider data, public MCP
  output, and optional durable retention.
- Security Watch during work: enabled; inspect trust boundaries, redaction
  order, ownership/session/surface binding, provider capability fallback,
  process stream attribution, MCP framing, and artifact permissions.
- Security Watch notes: artifact design requires sanitize-before-store tests,
  no raw causes/paths/arguments, no arbitrary script for console capture,
  wrong-session/surface rejection, and explicit retention-only persistence.
- Security reviewer: `krt-security-sentinel` (focused implementation gate),
  with direct evidence-based fallback if unavailable.
- Security review result: implementation gate passed for the changed slice;
  provider-native console support remains explicitly unsupported until a
  provider boundary is proven. Durable report:
  `docs/review-findings/tinto-e2e-reliability/RDM-015-observability/2026-08-24-security-review.md`.
- Required security verification: seeded secret/path/content/argument/cause
  corpus, malformed provider output, provider capability gap, ownership loss,
  wrong-session/surface query, MCP framing, memory-only close, and protected
  retained-byte tests.

## CI Break-Prevention And Escalation

- CI risk surfaces: TypeScript build/typecheck/lint, public MCP schema and
  serialization, runtime/session/provider adapters, Windows/Linux process
  streams, artifact permissions/retention, and security fixtures.
- Preventive evidence: focused RU1/RU2 tests (61/61), `pnpm typecheck`,
  `pnpm build`, `pnpm lint`, `pnpm test:integration` (67 passed, 5 skipped),
  and `pnpm test:contract` (49 passed) pass. The full unit command reports
  317 passed, 5 failed, and 2 skipped across 22 files; all five failures are
  host/sibling failures documented in state. Node 22/24 and live
  Windows/Linux provider matrix remain CI/root evidence.
- If CI breaks: invoke `krt-ci-questor` with the failing run/check context; do
  not bypass or broaden checks in Compound Master.
- Escalation rule: retain a release-follow-up blocker until the failure has a
  cause, owner, exact next action, and no user-approved bypass.

## Branch and PR Handoff Inputs

- Review unit: RU1/RU2 — Internal bounded diagnostic sink/producers and the
  additive bounded query/retention boundary.
- Branch name: `codex/tinto-e2e-reliability` (supplied isolated integration
  branch; no branch mutation or release operation performed).
- Branch/docs rule: the first executable review unit carries these planning
  artifacts on the same semantic branch; no separate planning/docs branch.
- PR base: `main` at the supplied revision; RU2 is based on the refreshed RU1
  integration base after parent review/merge or collapse-to-base.
- Suggested commit grouping (parent/release owner only; not executed here):
  - `feat(observability): add sanitized bounded diagnostic sink` — internal
    record/sanitizer/ring modules and deterministic unit/security tests.
  - `feat(observability): capture owned runtime evidence` — process/provider/
    invocation/phase producers and focused integration/platform tests.
  - `feat(observability): expose bounded diagnostic evidence` — public query
    projection, accepted capability mapping, retention adapter, contracts, and
    contract/security tests.
- PR title: Add bounded sanitized runtime evidence.
- PR body bullets:
  - Keep diagnostic evidence bounded and sanitized before storage.
  - Preserve owned-session/surface attribution and truthful provider gaps.
  - Persist diagnostic records only with an explicit bounded retention opt-in.
- Verification results location: child state and package closeout, then the
  root aggregate evidence path selected by Seneschal.
- Production/deployment notes: preserve no-retention default, additive public
  compatibility, protected artifact containment, and explicit Windows/Linux
  provider gaps.
- Autonomous mutation request: none; worker shipping is disabled and external
  mutations remain owned by `krt-release-marshal` after parent reconciliation.

## Jira Handoff Inputs

- Jira policy: skip.
- Suggested issue type: none; Jira lookup and mutation are intentionally
  omitted by the delegated contract.
- Suggested subtask behavior: none.
- PR-to-Jira mapping: not applicable under explicit `jira-policy:skip`.
- Jira summary: not applicable.
- Jira description: not applicable.
- Optional-policy fallback: not applicable; Jira is intentionally skipped.

## Decision gates

- **DEC-2026-08-21-003:** resolved by the inherited contract; diagnostics use
  the additive `tauri_diagnostics` read-only operation.
- **DEC-2026-08-21-004:** resolved by the inherited contract; source outcomes
  use the explicit five-state capability vocabulary with stable bounded codes.
