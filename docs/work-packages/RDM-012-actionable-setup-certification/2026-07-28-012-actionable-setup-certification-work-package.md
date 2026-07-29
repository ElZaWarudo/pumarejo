---
title: Make setup actionable and recertify real usage
status: review-passed
roadmap_item: RDM-012
origin_roadmap: docs/roadmaps/2026-07-28-001-real-usage-hardening-roadmap.md
origin_planning_input: docs/audits/2026-07-28-pumarejo-usage-feedback.md
origin_plan: docs/plans/2026-07-28-001-real-usage-hardening-delivery-plan.md
units: [U22, U23]
review_units: [RU1, RU2]
base_branch: unresolved-final-release
pr_strategy: deferred-final-release
jira_policy: optional
production_posture: hardening
autonomy: guarded
allowed_mutation_classes: []
---

# Make setup actionable and recertify real usage

## Scope

Make environment diagnostics accurate and secret-safe, generate copyable local MCP configuration, detect integration version drift, and certify all ten usage criteria through public interfaces.

## Non-goals

No automatic host-config mutation, OAuth, network endpoint, telemetry, registry publication, Jira mutation, new platform support, or release.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: diagnostic internal probes, sanitization helpers, fixture structure, and documentation layout.
- Agent must escalate: configuration schema changes, supported host list, environment precedence, or evidence containing user/application data.
- Safe fallback: report “not detected” with probe evidence and a corrective action; never state “missing” without sufficient evidence.

## Dependencies

- Requires: RDM-009, RDM-010, and RDM-011.
- Blocks: hardening release review.
- Final package in this increment.

## Implementation Units

- U22: executable/runtime/environment diagnostics, host config generation, and version alignment.
- U23: public real-usage acceptance journey, cross-platform evidence, and docs.

## Review Units

| RU  | Scope                          | Expected surfaces                                                    | Size/risk note                     |
| --- | ------------------------------ | -------------------------------------------------------------------- | ---------------------------------- |
| RU1 | Actionable setup diagnostics   | `src/installer/`, `src/cli/`, config/version modules, contract tests | Medium; local secret/path exposure |
| RU2 | Integrated usage certification | fixtures, MCP client trials, platform tests, contracts/docs          | High; cross-package regression     |

## Required Behavior

- `doctor` distinguishes missing, not detected, not on effective `PATH`, configured explicitly, and verified by successful launch.
- Human and JSON output include the resolved executable identity, sanitized command/arguments, relevant environment provenance, and precise next action without secrets.
- A versioned config may supply approved launch environment/runtime paths without shell evaluation.
- Successful launch evidence corrects or qualifies earlier WebView/runtime/package-manager heuristic warnings.
- `pumarejo mcp print-config --project …` or the accepted equivalent emits copyable `stdio` entries for explicitly supported hosts without writing their configuration.
- CLI, integration manifest, generated Tauri integration, and package/plugin versions are checked for drift.
- Structured failures cover snapshot limit, launch timeout, window selection, stale ref, no bounded action effect, and partial cleanup while preserving available evidence.
- All ten audit acceptance criteria pass through public MCP/CLI behavior with sanitized evidence.

## Files and Tests

Primary surfaces: `src/installer/doctor.ts`, `src/cli/`, `src/config/`, `src/version.ts`, integration manifest code, `README.md`, `docs/contracts.md`, `docs/compatibility.md`, and contract/integration/platform/agent tests.

Add environment fixtures for PATH/PATHEXT resolution, explicit runtime, false-negative WebView detection, sanitized secrets, spaces/non-ASCII paths, manifest/plugin drift, supported host config snapshots, and successful-launch evidence reconciliation.

## Verification Gate

| RU  | Required verification                                                                                                  | Pass signal                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| RU1 | diagnostic classification matrix, secret/path sanitization, config schema, print-config snapshots, version drift tests | Output is accurate, actionable, copyable, and contains no secrets     |
| RU2 | all ten usage criteria via independent public client; Node 22/24; Windows/Ubuntu platform runs; full `pnpm validate`   | Complete journey passes with zero owned residue and reviewed evidence |

No release evidence may include transcript text, tokens, full sensitive paths, nonces, or application secrets. Correctness and security review threshold is P0-P2.

## Acceptance Trace

- Usage criteria: all ten, with direct ownership of criterion 9 and integrated verification of 1-8 and 10.
- Existing requirements: FR-005, FR-008 through FR-023, NFR-004 through NFR-010, BR-007 through BR-010, AC-002 through AC-013.

## Branch and PR Handoff

- Deferred branch candidate: `feat/actionable-pumarejo-setup`.
- Base: resolve during the final Release Marshal handoff after RDM-009 through RDM-011 are accepted.
- Deferred PR title: **Make Pumarejo setup actionable and certify real usage**.
- Evidence location: package closeout and a new sanitized hardening evidence directory.
- Current mutation policy: no branch, commit, push, PR, merge, Jira, or publication action.
- External mutations: none.
