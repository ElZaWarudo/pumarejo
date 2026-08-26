---
title: Bound and protect semantic observation
status: review-passed
roadmap_item: RDM-009
origin_roadmap: docs/roadmaps/2026-07-28-001-real-usage-hardening-roadmap.md
origin_planning_input: docs/audits/2026-07-28-pumarejo-usage-feedback.md
origin_plan: docs/plans/2026-07-28-001-real-usage-hardening-delivery-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
compound_run_id: tinto-e2e-rdm-009-observation
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-009-observation/state.md
units: [U15, U16]
review_units: [RU1, RU2]
base_branch: main
pr_strategy: deferred-final-release
jira_policy: optional
production_posture: hardening
autonomy: guarded
allowed_mutation_classes: []
---

# Bound and protect semantic observation

## Scope

Replace hard-failing snapshot size boundaries with a deterministic bounded observation contract, conservative disclosure controls, explicit truncation/continuation metadata, faithful ARIA state/relationships, and partial evidence when semantic extraction cannot complete.

## Non-goals

No OCR, closed shadow-root support, arbitrary selectors, heuristic ref lookup, application-specific secret classifier, weakening of mandatory redaction, or release.

## Contract Decision Gate

Resolved by `DEC-2026-08-21-001` in the inherited initiative contract: continuation pages are non-actionable evidence. Interaction requires a separately refreshed actionable snapshot with a new generation. Subtree roots remain exact current-generation WebDriver handles, and every successful capture replaces the actionable ref table atomically.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: internal traversal, accounting, and filter implementation after the public contract is accepted.
- Agent must escalate: ref/generation semantics, default disclosure changes, new error codes, or any redaction weakening.
- Safe fallback: return a valid smaller non-sensitive snapshot with explicit truncation; never return extra content to avoid truncation.

## Dependencies

- Requires: completed RDM-005 and RDM-007.
- Blocks: RDM-011 and RDM-012.
- Package order: first hardening package.

## Implementation Units

- U15: bounded subtree/filter/continuation snapshot protocol.
- U16: disclosure policy, ARIA fidelity, and partial-evidence recovery.

## Review Units

| RU  | Scope                                      | Expected surfaces                                            | Size/risk note                         |
| --- | ------------------------------------------ | ------------------------------------------------------------ | -------------------------------------- |
| RU1 | Bounded snapshot contract and traversal    | `src/observation/`, MCP schemas/runtime, unit/contract tests | High; generation and payload risk      |
| RU2 | Redaction, ARIA, and evidence preservation | browser collector, errors/results, fixtures/security tests   | High; sensitive-data and fidelity risk |

## Required Behavior

- `rootRef`/subtree, `maxNodes`, `maxDepth`, `maxTextLength`, visibility, role/name/type filtering, and optional bulky-field omission are strict and bounded.
- Default limits are conservative and always produce truncation metadata when reached.
- Continuation never authorizes stale, fabricated, selector-derived, or geometry-derived actions.
- Mandatory password and `data-pumarejo-sensitive` protections cannot be disabled.
- Transcript-, path-, token-, and file-like fields can be conservatively omitted or redacted before leaving the WebView.
- `pressed`, `selected`, `current`, `checked`, `expanded`, `invalid`, `required`, `labelledBy`, `describedBy`, `controls`, and `owns` have source/unknown behavior defined and tested.
- Valid window, generation, focus, screenshot metadata, and a structured cause survive partial semantic failure when available.

## Files and Tests

Primary surfaces: `src/observation/`, `src/mcp/schemas.ts`, `src/mcp/runtime.ts`, `src/mcp/server.ts`, `src/shared/errors.ts`, `docs/contracts.md`, and focused unit/integration/contract fixtures.

Add fixtures for more than 10,000 candidate nodes, individual text above current bounds, deep trees, long accessible names, open shadow roots, sensitive naming chains, every requested ARIA state, broken relationship targets, and cancellation during collection.

## Verification Gate

| RU  | Required verification                                                                                                                    | Pass signal                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| RU1 | schema/contract tests; node/depth/text/filter/subtree/continuation matrix; concurrent snapshot/action tests; transport-safe payload case | Every case returns a valid bounded response or typed cancellation; refs remain exact        |
| RU2 | redaction leakage corpus; ARIA real-component fixtures; screenshot-plus-semantic-failure case; security review                           | No protected data leaves the WebView and all applicable semantics/evidence remain available |

Run the repository quality gate on Node 22 and 24. No RU passes with unresolved P0-P2 correctness or security findings.

## Reviewability Diagnosis

- Reviewer-experience check: yes. RU1 keeps bounded traversal, generation/ref handling, and public schema behavior together so the exact-handle safety contract can be reviewed and verified as one capability; RU2 isolates disclosure, ARIA, and partial-evidence security/fidelity concerns.
- Granularity chosen because: the two units have distinct risk domains and focused verification, while each unit remains independently understandable and mergeable.
- Open-stack plan: independent serial review units, target depth 1 and hard maximum 3; no stacked chain is opened by this worker.
- Jira mapping: Jira intentionally skipped for this run by the delegated contract.
- Downstream-fix trace: none.
- Failure-mode check: no deep micro-PR stack and no deferred mega-consolidation PR.

## Branch and PR Handoff Inputs

- Review unit: RU1/RU2, serially, with the semantic implementation branch `codex/tinto-e2e-reliability` already supplied by Seneschal.
- Branch name: `feat/bounded-semantic-snapshots` remains the deferred release candidate; this worker performs implementation-only work on the supplied branch.
- PR base: `main` at the supplied intended revision; final release base remains Release Marshal/Seneschal-owned.
- Suggested commit grouping for this review unit: Release Marshal to derive semantic conventional commits from the changed observation, schema, contract, and focused-test surfaces; this worker will not commit or stage.
- PR title: `Return bounded protected semantic snapshots`.
- PR body bullets:
  - Return bounded semantic evidence with deterministic truncation and fresh exact references.
  - Preserve mandatory redaction and applicable ARIA semantics through partial extraction.
- Verification results location: child state and package closeout.
- Production/deployment notes: preserve the existing public MCP contract and fail closed on sensitive disclosure or stale references.
- Autonomous mutation request: none; no branch push, PR, reviewer, Jira, merge, or release mutation.

## Impact Scan

- Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/tenant/ownership/test fixtures: observation payload/schema and public `tauri_snapshot` behavior; no auth or tenant surface.
- Consumer scan patterns: `tauri_snapshot`, `SnapshotRequest`, `SemanticSnapshot`, `truncation`, `relationships`, `ref`.
- Consumers found: `src/mcp/runtime.ts`, `src/mcp/server.ts`, `src/interaction/engine.ts`, focused unit/integration/contract/platform tests, and `docs/contracts.md`.
- Contract-drift tests searched: MCP tool schema assertions, raw snapshot schema fixtures, generation/stale-ref tests, truncation and redaction fixtures, semantic interaction comparisons.
- Required consumer tests: `pnpm test:unit`, `pnpm test:contract`, `pnpm test:integration` (focused during this run; wave aggregate owned by Seneschal/root).
- Consumer tests run/skipped: `pnpm test:unit` ran with 5 unrelated Windows environment failures; all 16 observation/runtime unit files passed, `pnpm test:contract` passed (42 tests), and `pnpm test:integration` passed (66 tests, 5 provider-gated skips). The wave aggregate remains Seneschal/root-owned.

## Security Gate

- Run after work-review loop: required because this unit changes a public observation boundary and sensitive-data disclosure behavior.
- Security Watch during work: enabled; read-only checks cover mandatory redaction, relationship tainting, bounded browser serialization, exact current-generation handles, and provider handle recovery.
- Security Watch notes: no P0-P2 findings. Mandatory sensitive-name/value redaction, relationship tainting, bounded browser output, exact current-generation handles, and provider-handle recovery were inspected and exercised by focused tests.
- Security reviewer: `krt-security-sentinel` or direct evidence-based fallback.
- Security review result: pass (direct evidence-based sentinel gate).
- Required security verification: redaction leakage corpus, adversarial bounded payload, sensitive naming chains, stale/ref-generation checks, and partial extraction evidence.

## CI Break-Prevention And Escalation

- CI risk surfaces: TypeScript build/typecheck, browser bundle, unit/contract/integration tests, public schema/docs drift, and security/redaction fixtures.
- Preventive evidence: `pnpm build` passed; `pnpm typecheck` and `pnpm lint` passed; focused RU1/RU2 tests passed; `pnpm test:contract` and `pnpm test:integration` passed. `pnpm format:check` remains a repository baseline gap (154 pre-existing files reported), and Node 22/24 matrix evidence is CI-only here.
- If CI breaks: invoke `krt-ci-questor` with the failing workflow/job context; do not bypass or widen checks.
- Escalation rule: leave a release-follow-up blocker until cause, owner, and next action are known.

## Acceptance Trace

- Usage criteria: 1, 2, and 8.
- Existing requirements: FR-014 through FR-018, NFR-009, NFR-010, BR-002, BR-010, AC-006 through AC-006b.

## Branch and PR Handoff

- Deferred branch candidate: `feat/bounded-semantic-snapshots`.
- Base: resolve during the final Release Marshal handoff.
- Deferred PR title: **Return bounded protected semantic snapshots**.
- Evidence location: package closeout plus focused test output.
- Current mutation policy: no branch, commit, push, PR, merge, Jira, or publication action.
- External mutations: none.
