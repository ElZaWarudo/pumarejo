---
title: Serve the complete MCP workflow
status: passed
roadmap_item: RDM-007
origin_roadmap: docs/roadmaps/2026-07-23-001-tauri-agent-roadmap.md
origin_brainstorm: STRATEGY.md
origin_planning_input: docs/product-requirements.md
origin_plan: docs/plans/2026-07-23-001-feat-tauri-agent-plan.md
units: [U13]
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

# Serve the complete MCP workflow

## Scope

Replace protocol stubs with one application-scoped runtime and real handlers for all seven tools, preserving typed errors, untrusted-content boundaries, image framing, cancellation and cleanup.

## Non-goals

No new public tools, autonomous exploration, consumer installer changes, or release.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: dependency injection and handler module layout.
- Agent must record as assumptions: SDK adapter details.
- Agent must escalate: public protocol/schema changes or UI-derived instruction text.
- Safe fallback: preserve the reviewed tool contract and return a typed error.
- Autonomous ledger: none.
- Allowed external mutation classes: none.

## Dependencies

- Requires: RDM-002, RDM-003, RDM-004, RDM-005 and RDM-006 passed.
- Blocks: RDM-008.
- Wave: one RU after all hard predecessors.

## Production Posture

- Posture: prototype.
- Evidence: greenfield server.
- Confidence: high.
- Consequences for this package: implementation flexible, protocol fixed.
- Breaking existing behavior allowed: only with contract approval.

## Plan Unit Alignment

| Plan unit | Included | Reason                       |
| --------- | -------- | ---------------------------- |
| U13       | yes      | Real MCP runtime composition |

Grouping rationale: one end-to-end protocol integration slice. Estimate 400-750 human-authored lines.

## Implementation Units

- U13: complete MCP composition.

## Review Units

| Review unit | Scope                           | Expected changed surfaces   | PR base                  | Jira issue/subtask        | Size/risk note                           |
| ----------- | ------------------------------- | --------------------------- | ------------------------ | ------------------------- | ---------------------------------------- |
| RU1         | Runtime and seven real handlers | MCP runtime/tools/e2e tests | unresolved-final-release | optional standalone Tarea | 400-750 human; public/untrusted boundary |

## Reviewability Diagnosis

- Reviewer-experience check: yes; all handlers share one runtime and public contract.
- Granularity chosen because: splitting handlers would duplicate protocol/cancellation review.
- Open-stack plan: independent, no PR during implementation.
- Jira mapping: optional standalone Tarea.
- Downstream-fix trace: none.
- Failure-mode check: cohesive integration, not a mega-review.

## Files and Tests

`src/mcp/runtime.ts`, real tool handlers and independent-client end-to-end contract tests.

## Impact Scan

- Changed contract: no schema change; stubs become real domain calls.
- Consumer scan patterns: seven tool registrations/results/errors, image content, stdout/stderr, signals/cancellation.
- Consumers found: independent MCP client and agent certification.
- Contract-drift tests searched: exact tool list and schemas, every no-session path, tainted UI separation.
- Required consumer tests: complete visible/background public flow.
- Run/skipped results: 275 ordinary tests pass with 13 explicitly live-gated
  skips; the required real visible/background MCP tests pass separately on
  Windows and Ubuntu/WSL under `USER-2026-07-27-WINDOWS-WSL`.

## Verification Gate

Inherited gates for RU1: run `pnpm install --frozen-lockfile` and `pnpm build`, `pnpm typecheck`, `pnpm lint`, and the repository format check on Node 22 and Node 24; a skipped clean-install/build/format gate blocks closeout. The independent-client visible/background flow must run on Windows 11 24H2 and Ubuntu 24.04 LTS native/dedicated-VM; a host skip blocks RU1.
Every handler must enforce runtime state/ownership guards, bounded payload/image sizes and timeouts, and idempotent cancellation that closes session, process, port, temporary config, and non-retained artifacts. Exercise no-session, pre-launch, active, oversize, timeout, cancellation, signal, and tainted-content cases.

| RU  | U   | Required verification                                                                                                                     | Evidence        | Pass signal                                           |
| --- | --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------- |
| RU1 | U13 | independent-client tool list/schema, both-mode full flow, no-session errors, cancellation/signals, prompt-injection fixture, clean stdout | MCP e2e results | seven tools complete public flow with no private APIs |

## Review Gate

- Code review threshold: P0-P2; lower findings logged.

## Security Gate

No RU passes with an unresolved P0-P2 security finding. The runtime guard/cancellation matrix must prove that every public handler checks session ownership/state, applies payload/image/timeout caps, preserves structural UI-taint boundaries, and leaves no owned process, endpoint, temp config, session, or non-retained artifact after cancellation or signal.

- Run after work-review loop: required.
- Security Watch during work: enabled for public MCP input, UI taint, image/data framing and cleanup signals.
- Security Watch notes: hardened helper resolution/timeouts, authenticated
  display ownership, disconnect/signal cleanup, retriable artifact cleanup and
  symlink-safe rollback during implementation.
- Security reviewer: `krt-security-sentinel`.
- Security review result: passed with no unresolved P0-P2.
- Required security verification: no unresolved P0-P2; rerun tests/review after fixes.

## CI Break-Prevention And Escalation

- CI risk surfaces: MCP SDK behavior, stdio framing, cancellation and end-to-end timing.
- Preventive evidence: independent-client contract suite.
- If CI breaks: invoke `krt-ci-questor`.
- Escalation rule: keep RU pending with cause/owner/next action.

## Branch and PR Handoff Inputs

- Review unit: RU1 complete MCP workflow.
- Branch name: `feat/tauri-agent-mcp-runtime`.
- PR base: unresolved-final-release.
- Suggested commit grouping for this review unit: `feat(mcp): serve the complete Tauri agent workflow`.
- PR title: Serve the complete semantic Tauri workflow over MCP
- PR body bullets:
  - Connects all seven public tools to the isolated runtime.
  - Preserves typed failures, image framing and untrusted-content boundaries.
- Verification results location: work-package closeout.
- Production/deployment notes: local stdio server only.
- Autonomous mutation request: none.

## Jira Handoff Inputs

- Jira policy: optional; standalone Tarea.
- Suggested issue type: Tarea.
- Suggested subtask behavior: no parent for one unit.
- PR-to-Jira mapping: RU1 to one task.
- Jira summary: Servir el flujo completo de Tauri Agent mediante MCP
- Jira description: Conectar los siete contratos MCP con la ejecución, observación e interacción reales.
- Optional-policy fallback: Jira omitted: no context/config.

## Closeout

- Result: passed.
- Runtime: one FIFO application runtime serves exactly seven public MCP tools
  with state and ownership guards, bounded inputs, structural UI taint,
  validated image framing, cancellation and shared cleanup.
- Public proof: an independent MCP client completes launch, snapshot,
  interaction, screenshot and close in visible and background modes on both
  accepted hosts without private APIs.
- Cleanup proof: close, cancellation, disconnect and repeated signals converge
  on the owned cleanup path; failed artifact closure remains retriable and a
  pending cleanup blocks relaunch.
- Quality proof: frozen install, build, typecheck, lint, formatting, ordinary
  tests and package inspection pass on Windows Node 22/24 and Ubuntu Node 22.
- Review proof: independent correctness and Security Sentinel reviews pass
  with no unresolved P0-P2 after their findings were fixed and retested.
- Host disposition: prototype feasibility is accepted only through
  `USER-2026-07-27-WINDOWS-WSL`; native publication certification remains in
  RDM-008.
