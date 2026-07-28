---
title: Provide semantic component interactions
status: complete
roadmap_item: RDM-006
origin_roadmap: docs/roadmaps/2026-07-23-001-pumarejo-roadmap.md
origin_brainstorm: STRATEGY.md
origin_planning_input: docs/product-requirements.md
origin_plan: docs/plans/2026-07-23-001-feat-pumarejo-plan.md
units: [U12]
unit_alignment: complete
review_units: [RU1]
base_branch: unresolved-final-release
pr_strategy: independent
max_open_stack: n/a
jira_policy: optional
production_posture: prototype
autonomy: guarded
autonomous_ledger: none
allowed_mutation_classes: []
---

# Provide semantic component interactions

## Scope

Implement click, clear/type and supported key actions against current generation-scoped WebDriver handles, with semantic identity revalidation and stable recovery errors.

## Non-goals

No OS input, selector/text/geometry re-query, arbitrary script, unsupported surfaces, or release.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: internal validators and supported-key mapping that matches the public contract.
- Agent must record as assumptions: provider-specific error normalization.
- Agent must escalate: new action types, fallback automation, or weaker stale-target identity.
- Safe fallback: typed failure and request a new snapshot.
- Autonomous ledger: none.
- Allowed external mutation classes: none.

## Dependencies

- Requires: RDM-004 and RDM-005 passed.
- Blocks: RDM-007 and RDM-008.
- Wave: one RU after both predecessors.

## Production Posture

- Posture: prototype.
- Evidence: greenfield interaction layer.
- Confidence: high.
- Consequences for this package: API pre-release, but wrong-target prevention is mandatory.
- Breaking existing behavior allowed: only with contract approval.

## Plan Unit Alignment

| Plan unit | Included | Reason                        |
| --------- | -------- | ----------------------------- |
| U12       | yes      | Exact semantic action surface |

Grouping rationale: one cohesive mutation boundary. Estimate 350-650 human-authored lines, no generated files.

## Implementation Units

- U12: semantic click, type and key actions.

## Review Units

| Review unit | Scope                   | Expected changed surfaces    | PR base                  | Jira issue/subtask        | Size/risk note                   |
| ----------- | ----------------------- | ---------------------------- | ------------------------ | ------------------------- | -------------------------------- |
| RU1         | Reference-based actions | `src/interaction/` and tests | unresolved-final-release | optional standalone Task | 350-650 human; wrong-target risk |

## Reviewability Diagnosis

- Reviewer-experience check: yes; one mutation contract.
- Granularity chosen because: action validation and WebDriver commands must be reviewed together.
- Open-stack plan: independent, no PR during implementation.
- Jira mapping: optional standalone Task.
- Downstream-fix trace: none.
- Failure-mode check: no micro-split.

## Files and Tests

`src/interaction/` plus unit and fixture integration tests for click, input types, keys, focus, stale identity and every error class.

## Impact Scan

- Changed contract: interaction semantics and stable errors.
- Consumer scan patterns: refs, fingerprint fields, action result, error codes, supported keys.
- Consumers found: MCP runtime and certification.
- Contract-drift tests searched: exact errors, no heuristic lookup, no OS input.
- Required consumer tests: fixture flows and later MCP end-to-end.
- Run/skipped results: complete; see RU1 Closeout.

## Verification Gate

Inherited gates for RU1: run `pnpm install --frozen-lockfile` and `pnpm build`, `pnpm typecheck`, `pnpm lint`, and the repository format check on Node 22 and Node 24; a skipped clean-install/build/format gate blocks closeout. The action/focus/OS-input matrix must also run on Windows 11 24H2 and Ubuntu 24.04 LTS native/dedicated-VM; a host skip blocks RU1.

| RU  | U   | Required verification                                                                                                                                    | Evidence                 | Pass signal                                 |
| --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------- |
| RU1 | U12 | click/type/key fixture matrix, focus, attached-node semantic mutation, virtualized reuse, hidden/disabled/incompatible targets, OS-input instrumentation | unit/integration results | correct target or stable typed failure only |

## Review Gate

- Code review threshold: P0-P2; lower findings logged.

## Security Gate

- Run after work-review loop: required.
- Security Watch during work: enabled for wrong-target actions, input handling and OS-input fallback.
- Security Watch notes: exact-handle identity drift, stale-table reuse and
  snapshot/action concurrency were reviewed and fixed before closeout.
- Security reviewer: `krt-security-sentinel`.
- Security review result: passed with no unresolved P0-P2.
- Required security verification: no unresolved P0-P2; rerun focused tests/review after fixes.

## CI Break-Prevention And Escalation

- CI risk surfaces: WebDriver action timing and fixture focus behavior.
- Preventive evidence: deterministic semantic identity and fixture tests.
- If CI breaks: invoke `krt-ci-questor`.
- Escalation rule: keep RU pending with cause/owner/next action.

## RU1 Closeout

- Status: `review-passed`.
- Unit: U12.
- Changed surfaces: exact-handle semantic identity revalidation, click,
  clear/type and supported WebDriver key actions, stable target errors,
  generation refresh and a shared FIFO observation/interaction coordinator.
- Wrong-target boundary: actions resolve only the W3C element handle captured
  for the current generation. Kind, role, accessible name, input type and
  ownership context are recomputed on that exact handle before mutation.
  Detached, malformed or changed identity invalidates the complete reference
  table and returns `STALE_ELEMENT_REF`; no selector, text, geometry or
  operating-system input fallback exists.
- Concurrency and failure boundary: snapshots and actions share one
  `SnapshotEngine` FIFO. Resolve, identity validation, mutation and post-action
  refresh form one exclusive operation, so a concurrent observation cannot
  replace refs mid-action. Provider, partial type and refresh failures leave
  old references unusable.
- Verification:
  - Node 22.23.1 and Node 24.12.0 each pass frozen install, build, typecheck,
    lint, formatting and the full ordinary suite: 260 tests passed with eleven
    intentionally gated live tests skipped.
  - Fifty-two focused interaction, snapshot and browser-identity tests pass on
    Windows. The same final sources pass 45 interaction/coordinator tests plus
    the seven-case browser identity suite on Ubuntu 24.04 WSL2/WSLg under
    exception `USER-2026-07-27-WINDOWS-WSL`.
  - The final owned Windows Tauri fixture passes type, clear, Enter submission,
    native focus, click, in-place semantic mutation rejection, Escape delivery
    to the document body when no control is focused, and exact-handle
    `ELEMENT_DISABLED`/`ELEMENT_HIDDEN` failures. The healthy existing WSL
    provider evidence passes exact semantic type, key and click through a
    temporary WebDriver session; no unrelated graphical process was stopped.
  - Structural instrumentation scans the complete interaction layer and
    rejects OS-input libraries/APIs and selector, element-id, text or geometry
    lookup fallbacks.
- Impact Scan: internal observation scheduling changes from coalesced
  observations to strict FIFO generations so the public invalidation contract
  is linearizable. The documented action result shapes, supported keys and
  stable error set are unchanged. Public MCP session wiring remains assigned to
  U13/RDM-007.
- Correctness review: passed with no unresolved P0-P2 after fixes for stale
  table reuse and the snapshot/action generation race.
- Security review: passed with no unresolved P0-P2 after the same stale and
  cross-engine concurrency fixes. Input bounds, private identity stripping and
  the no-desktop-fallback boundary remain intact.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent roadmap item: RDM-007 / RU1.

## Branch and PR Handoff Inputs

- Review unit: RU1 semantic interactions.
- Branch name: `feat/tauri-component-interactions`.
- PR base: unresolved-final-release.
- Suggested commit grouping for this review unit: `feat(interaction): operate current Tauri components safely`.
- PR title: Operate current Tauri components through semantic references
- PR body bullets:
  - Adds click, type and key actions through exact WebDriver handles.
  - Rejects stale or incompatible targets without desktop fallback.
- Verification results location: work-package closeout.
- Production/deployment notes: none.
- Autonomous mutation request: none.

## Jira Handoff Inputs

- Jira policy: optional; standalone Task.
- Suggested issue type: Task.
- Suggested subtask behavior: no parent for one unit.
- PR-to-Jira mapping: RU1 to one task.
- Jira summary: Interact with Tauri components through semantic references
- Jira description: Implement clicking, typing, and key presses without system input or heuristic selection.
- Optional-policy fallback: Jira omitted: no context/config.
