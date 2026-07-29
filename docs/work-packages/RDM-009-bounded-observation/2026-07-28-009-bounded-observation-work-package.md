---
title: Bound and protect semantic observation
status: ready
roadmap_item: RDM-009
origin_roadmap: docs/roadmaps/2026-07-28-001-real-usage-hardening-roadmap.md
origin_planning_input: docs/audits/2026-07-28-pumarejo-usage-feedback.md
origin_plan: docs/plans/2026-07-28-001-real-usage-hardening-delivery-plan.md
units: [U15, U16]
review_units: [RU1, RU2]
base_branch: unresolved-final-release
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

Before U15 code, record how subtree roots and continuation interact with generations and actionable refs. The accepted design must preserve exact WebDriver handles, stale-ref guarantees, deterministic containment, and FIFO snapshot/action behavior.

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
