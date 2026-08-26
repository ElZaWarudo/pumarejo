---
title: RDM-021 loopback diagnostics and artifact hygiene dependency map
status: reviewed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-021
compound_run_id: tinto-e2e-rdm-021-network-artifacts
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-021-network-artifacts/state.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-021-network-artifacts-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-021-network-artifacts-plan.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
---

# RDM-021 loopback diagnostics and artifact hygiene dependency map

## Dependency graph

```text
RDM-015 bounded sanitized diagnostics -----------+
                                                   v
RDM-016 process/listener custody -------------> U30 loopback + devUrl evidence
                                                   |
Existing ArtifactStore manifest/permissions ----> U31 exclusions + retention
                                                   |
                         U30 RU1 + U31 RU2 ------+----> RDM-023 certification
                                                   |
                    RDM-020 drift / RDM-022 self-doctor reconcile
```

RDM-015 and RDM-016 are prerequisites from the roadmap. RDM-021 may write
adapter-local tests and planning artifacts before those packages are implemented,
but its execution gate must verify the accepted interfaces rather than guessing
their public fields. RDM-023 consumes both sanitized network evidence and
artifact-cleanup/residue evidence.

## Review units and waves

| Wave | Review unit | Scope | Prerequisite | Base/merge rule |
| --- | --- | --- | --- | --- |
| 0 | Contract inventory | Confirm RDM-015 sink, RDM-016 ownership proof, and the minimal Tauri-config extraction handoff; broker DR-021-001. | Parent reconciliation | No code mutation. |
| 1 | RU1 / U30 | Family-aware loopback model, reservation/readiness, devUrl comparison, stable correction, bounded evidence adapter. | RDM-015 + RDM-016 contracts | Independent semantic branch from `main`; serialize shared platform/config edits. |
| 2 | RU2 / U31 | Default exclusions, explicit fixtures, retention evaluator, artifact cleanup/link safety/permissions, bounded evidence. | Existing artifact invariants + RDM-015 sink; DR-021-001 for implicit activation | Independent semantic branch from `main`, or retarget only after parent reconciliation if shared fixtures/config overlap. |
| 3 | Aggregate | Windows/Linux and root checks; reconcile RDM-020/RDM-022/RDM-023 overlap. | RU1 + RU2 review evidence | Parent-owned aggregate; no child release. |

RU1 and RU2 are two independent review slices chosen for reviewer comprehension
and independently testable risk. They are not micro-PRs and do not defer a
large documentation or cleanup consolidation. If shared config or fixture
changes require a stack, keep it at two open PRs and wait for parent merge into
`main` before retargeting the second unit.

## Sibling ownership and protected surfaces

| Surface | RDM-021 responsibility | Sibling responsibility | Coordination rule |
| --- | --- | --- | --- |
| `src/session/endpoint.ts`, `src/platform/tracked-process.ts` | Loopback family reservation/readiness adapter and deterministic observations. | RDM-016 process custody, lease, ancestry, PID/start-time/port ownership. | RDM-021 consumes custody results; no process termination or lease mutation. |
| Tauri config/devUrl extraction | Read-only bounded comparison input and diagnostic classification. | RDM-020 attributed drift and RDM-022 self-doctor own installer/doctor changes. | Parent assigns one integrator for the minimal extraction field; do not refactor installer/self-doctor. |
| `src/artifacts/store.ts` | Retention evaluator, policy-to-delete plan, manifest revalidation, and bounded cleanup evidence. | Existing store owns PNG validation, atomic writes, recovery; RDM-016 owns process cleanup. | Preserve existing manifest schema where possible; no generic cleanup or process repair. |
| `src/artifacts/permissions.ts` | Reuse/enforce owner-only permission seam. | No sibling should weaken artifact permissions. | Keep current SID/DACL and POSIX modes; test before content writes. |
| `src/config` | Explicit policy input only if brokered/accepted. | Central config is serialized across roadmap items. | Do not add implicit defaults until DR-021-001 is canonical. |
| RDM-015 public diagnostics | Provide sanitized network/artifact event records. | RDM-015 owns buffers, query limits, and public schema. | No duplicate tool, raw cause, URL, path, or environment output. |
| `.gitignore`, installer markers, self-doctor | None. | RDM-020/RDM-022. | Never edit or claim ownership of those sibling surfaces. |
| Shared swarm queue/blockers/revision, autonomy ledger | None. | Seneschal/root. | Read-only only; parent reconciles status and revisions. |

## Contract and verification gates

- **G-021-1:** RDM-015 and RDM-016 accepted interfaces are present and the
  minimal extraction ownership is assigned; otherwise execution is blocked.
- **G-021-2:** `DR-021-001` is canonical before wiring automatic retained
  deletion. Pure evaluator and tests may proceed with explicit policy input.
- **G-021-3:** Impact Scan lists all readiness/config/artifact consumers and
  contract-drift tests before code review.
- **G-021-4:** Unit and natural integration tests pass for both families,
  exclusions, retention ordering, link safety, permissions, and sanitized
  evidence; host-specific gaps are explicit.
- **G-021-5:** Security review passes for loopback exposure, ownership,
  deletion containment, link races, permission enforcement, and output bounds.
- **G-021-6:** Parent aggregate runs root build/typecheck/lint/format/full test/
  pack checks and reconciles RDM-020/RDM-022/RDM-023.

Product tests are intentionally not run in this artifact-only phase. The exact
future commands are recorded in the implementation plan and work package.

## Decisions and safe fallback

`DR-021-001` is a brokered destructive-persistence decision: should retained
artifact cleanup be automatically enabled with a product-wide default age/count/
byte policy, or only be available with an explicit operator policy? The
recommendation is explicit policy first; with no canonical answer, preserve
retained artifacts and continue only the pure evaluator, validation, and
evidence work. No RDM-021 code may delete retained artifacts merely because a
new internal helper exists.

