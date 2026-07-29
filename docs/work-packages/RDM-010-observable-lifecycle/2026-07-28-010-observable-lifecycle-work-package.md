---
title: Make long-running sessions observable and recoverable
status: review-passed
roadmap_item: RDM-010
origin_roadmap: docs/roadmaps/2026-07-28-001-real-usage-hardening-roadmap.md
origin_planning_input: docs/audits/2026-07-28-pumarejo-usage-feedback.md
origin_plan: docs/plans/2026-07-28-001-real-usage-hardening-delivery-plan.md
units: [U17, U18]
review_units: [RU1, RU2]
base_branch: unresolved-final-release
pr_strategy: deferred-final-release
jira_policy: optional
production_posture: hardening
autonomy: guarded
allowed_mutation_classes: []
---

# Make long-running sessions observable and recoverable

## Scope

Expose staged launch progress and compact session diagnostics, then make cancellation and repeated cleanup converge safely with resource-specific outcomes.

## Non-goals

No daemon, network transport, concurrent sessions, unowned process termination, hidden shell invocation, log streaming platform, or release.

## Contract Decision Gate

Before U17 code, select the consultable launch representation supported by the pinned MCP SDK and independent clients. It must retain local `stdio`, one owned session, cancellation, bounded results, and a documented fallback for clients with short request timeouts.

Decision accepted 2026-07-28: `tauri_launch` waits up to 5000 ms by default
and may return `launching`; the standard, read-only `tauri_status` tool is the
polling contract. `tauri_close` cancels pending launch. Experimental MCP Tasks
are not required.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: internal progress events, cleanup result aggregation, and retry scheduling after the public model is accepted.
- Agent must escalate: new public tools/resources, state names, timeout semantics, or weaker process identity checks.
- Safe fallback: preserve ownership, report the exact pending/failed resource, and allow another close attempt.

## Dependencies

- Requires: completed RDM-004 and RDM-007.
- Blocks: RDM-012.
- May be implemented independently of RDM-009 if MCP schema overlap is coordinated.

## Implementation Units

- U17: launch progress, recommended timeout, and compact consultable status.
- U18: cancellation-safe, resource-specific, retryable cleanup.

## Review Units

| RU  | Scope                                | Expected surfaces                                        | Size/risk note                    |
| --- | ------------------------------------ | -------------------------------------------------------- | --------------------------------- |
| RU1 | Progress and status contract         | `src/session/`, `src/mcp/`, contract/client tests        | Medium-high; client compatibility |
| RU2 | Cancellation and cleanup convergence | `src/session/`, `src/platform/`, artifacts/runtime tests | High; process ownership           |

## Required Behavior

- Launch stages cover command resolution, build/compile wait, process start, provider/WebDriver readiness, window selection, and first snapshot.
- Status is compact and excludes application content by default.
- Status may report owned PID, selected window, effective private/proxy endpoint state, generation, last action, and pending cleanup without leaking nonce/secrets.
- Close distinguishes closing, already closed, driver unavailable, and process cleanup failure.
- Cleanup steps remain individually retryable; one failed step does not make all future close attempts terminal.
- Controlled process-tree fallback revalidates the complete ownership lease before termination.
- Cancel during launch, snapshot, click, or transport shutdown followed by repeated close reaches `idle` or returns an exact residue list and recovery action.

## Files and Tests

Primary surfaces: `src/session/`, `src/platform/`, `src/mcp/`, `src/artifacts/`, `src/webdriver/`, `src/shared/errors.ts`, `docs/architecture.md`, and lifecycle/contract/platform tests.

Exercise two-minute simulated launch, client request timeout, signal cancellation at every stage, driver deletion failure, proxy/port/config/artifact/process cleanup failures, PID reuse, repeated close, concurrent close, disconnect, and server shutdown.

## Verification Gate

| RU  | Required verification                                                                | Pass signal                                                                             |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| RU1 | independent MCP client progress/status/timeout matrix and sanitized payload review   | Slow launch remains observable and consultable without protocol corruption              |
| RU2 | exhaustive state/cleanup fault injection plus Windows and Ubuntu owned-process tests | Repeated cleanup terminates only owned resources and converges or reports exact residue |

Run the repository quality gate on Node 22 and 24. Security review is mandatory for process, endpoint, environment, and diagnostic data; no unresolved P0-P2.

## Acceptance Trace

- Usage criteria: 3 and 4.
- Existing requirements: FR-009 through FR-013, NFR-004, NFR-006, BR-001, BR-003 through BR-005, BR-009, AC-007.

## Branch and PR Handoff

- Deferred branch candidate: `feat/observable-runtime-lifecycle`.
- Base: resolve during the final Release Marshal handoff.
- Deferred PR title: **Make long-running Pumarejo sessions observable and recoverable**.
- Evidence location: package closeout plus fault-injection/platform results.
- Current mutation policy: no branch, commit, push, PR, merge, Jira, or publication action.
- External mutations: none.

## Implementation Closeout

- Status: `review-passed` on 2026-07-28.
- U17 exposes the accepted bounded `tauri_launch` pending result and the
  read-only `tauri_status` polling contract without changing the local `stdio`
  transport or single-owned-session model.
- U18 makes launch and action cancellation observable, coalesces concurrent
  close calls, rejects launch during close, preserves failed cleanup entries
  for retry, and publishes only the finite cleanup residue vocabulary.
- Simplification review removed duplicate session state, typed cleanup labels,
  and closed launch/artifact and cancellation/status failure paths. Reuse
  review found no additional abstraction worth introducing.
- Validation: TypeScript typecheck and scoped ESLint passed; the complete
  unit/contract suite passed with 233 tests and 1 documented skip. The three
  package-contract tests were rerun with the required explicit pnpm CLI and
  all passed.
- Deferred evidence: authoritative Node 22/24 and Windows/Ubuntu live
  process-tree matrices remain part of final release certification; no release
  or external mutation was authorized here.
