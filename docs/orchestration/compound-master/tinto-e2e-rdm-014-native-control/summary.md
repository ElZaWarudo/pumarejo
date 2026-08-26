---
title: RDM-014 truthful native control and Tauri dialog compound summary
date: 2026-08-21
run_id: tinto-e2e-rdm-014-native-control
status: completed
artifact_readiness: implementation-complete
applied_decisions:
  DEC-2026-08-21-003: additive dedicated discovery and selection operations; existing calls remain backward compatible
  DEC-2026-08-21-004: supported, unsupported, unavailable, denied, and failed states with stable codes and bounded sanitized evidence
decisions_source: docs/plans/tinto-e2e-reliability/initiative-requirements.md#approved-decisions-and-escalation-boundaries
decisions_applied_at: 2026-08-21T12:04:48Z
open_decisions:
  - public_dialog_transport_and_operation_name
state_path: docs/orchestration/compound-master/tinto-e2e-rdm-014-native-control/state.md
---

# RDM-014 truthful native control and Tauri dialog compound summary

## Outcome

RDM-014 execution is complete for truthful effective window control and the private capability-gated Tauri dialog bridge. The implementation applies the canonical capability-state matrix, preserves one owned session, launch/process/nonce/surface/generation binding, a random launch-scoped allowed-action grant bound to the detected dialog instance, explicit accept/cancel only, bounded sanitized evidence, and provider-unsupported truth. Public MCP dialog operation naming/authorization transport remains an explicit parent decision gate.

## Artifacts

- Roadmap reused: `docs/product/roadmap.md`.
- Initiative contract reused: `docs/plans/tinto-e2e-reliability/initiative-requirements.md`.
- Requirements: `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-014-native-control-requirements.md`.
- Plan: `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-014-native-control-plan.md`.
- Dependency map: `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-014-native-control-dependency-map.md`.
- Work package: `docs/work-packages/RDM-014-native-control/2026-08-21-014-native-control-work-package.md`.
- Document review: `docs/review-findings/tinto-e2e-reliability/RDM-014-native-control/2026-08-21-document-review.md`.
- Canonical state: `docs/orchestration/compound-master/tinto-e2e-rdm-014-native-control/state.md`.

## Units and waves

- RU1/U32: effective provider capability probes, bounded initial/effective sizing, window postconditions, typed private outcomes, and compatibility proof.
- RU2/U33: provider feasibility, supported Tauri dialog metadata, grant validation and one-shot consumption, explicit accept/cancel, postcondition, replay resistance, and sanitized evidence.
- Wave 0: applied canonical RDM-013 contract; provider feasibility verification input.
- Wave 1: RU1/U32 window/control slice with additive public mapping.
- Wave 2: RU2/U33 native dialog/security slice; unsupported provider evidence is a valid implementation result.
- Wave 3: parent aggregate verification and RDM-018/RDM-019 reconciliation.

## Branch and review strategy

- Worktree/branch: `C:\Users\User\Documents\personal\pumarejo\.worktrees\codex-tinto-e2e-reliability` / `codex/tinto-e2e-reliability`.
- Future executable branch: `feat/truthful-native-control`; no planning/docs-only branch.
- Two stacked review units, target/hard cap 2. RU2 waits for RU1 parent merge or an explicitly retargeted integration base.
- Jira: intentionally skipped. No Jira key, issue, transition, PR, reviewer, commit, push, merge, or release was created.

## Review, security, and CI

- Work-package checker: passed with `work package review-unit checks passed`.
- `git diff --check` on owned artifacts: passed.
- Document review: `package-review-passed`; DR-014-001/002 are closed by applied decisions and DR-014-003 through DR-014-006 remain implementation/downstream verification inputs.
- Security review: focused implementation review found no P0/P1; bounded metadata, authenticated routes, grant binding, instance replacement, replay/one-shot, unsupported provider, and postcondition tests passed.
- Product tests: focused RU1/RU2/runtime unit tests passed 5 files and 81 tests; `pnpm test:contract` passed 5 files and 49 tests; `pnpm test:integration` passed 6 files and 67 tests with 4 provider/fixture files and 5 tests skipped.
- Full unit result: 21 files, 311 passed, 2 skipped, 5 failed on pre-existing host assumptions (`Get-Acl` module unavailable and `C:\nvm4w` fixture path mismatch). No RDM-014 test failed.
- Build and typecheck passed; targeted ESLint passed. Platform provider tests remain truthfully skipped where the vendored provider lacks the dedicated boundary.
- Impact Scan: complete in the work package. Public MCP/session/provider/capability and shared fixtures are serialized with RDM-013/RDM-015/RDM-018.

## Blockers

- Applied DEC-2026-08-21-003 (DEC-003): additive dedicated discovery and selection operations; existing calls remain backward compatible.
- Applied DEC-2026-08-21-004 (DEC-004): `supported`, `unsupported`, `unavailable`, `denied`, and `failed` states with stable codes and bounded sanitized evidence.
- Provider feasibility is unsupported for the current vendored provider; this is recorded truth, not a support claim or fallback authorization. A future supported fixture must prove detection, finite metadata, authenticated explicit accept/cancel, and postcondition.
- Parent decision required: select the public MCP dialog operation name and authorization transport before projecting the private runtime seam.

## Next action

Parent/Seneschal should reconcile the public dialog operation contract, retain the unsupported-provider and skipped-platform evidence, and carry this implementation into aggregate RDM-018/RDM-019 certification.

Exact resume invocation:

```text
Use krt-compound-master with mode:resume package:docs/work-packages/RDM-014-native-control/2026-08-21-014-native-control-work-package.md review-unit:RU1 jira-policy:skip parallel:false orchestrator:seneschal run-id:tinto-e2e-rdm-014-native-control state-path:docs/orchestration/compound-master/tinto-e2e-rdm-014-native-control/state.md initiative-contract:docs/plans/tinto-e2e-reliability/initiative-requirements.md interaction:brokered autonomy:high autonomous-ledger:docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json
```

Exact execute invocation:

```text
Use krt-compound-master with mode:execute package:docs/work-packages/RDM-014-native-control/2026-08-21-014-native-control-work-package.md review-unit:RU1 jira-policy:skip parallel:false orchestrator:seneschal run-id:tinto-e2e-rdm-014-native-control state-path:docs/orchestration/compound-master/tinto-e2e-rdm-014-native-control/state.md initiative-contract:docs/plans/tinto-e2e-reliability/initiative-requirements.md interaction:brokered autonomy:high autonomous-ledger:docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json
```
