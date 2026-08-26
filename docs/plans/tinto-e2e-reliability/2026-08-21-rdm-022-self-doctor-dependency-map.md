---
title: RDM-022 self-doctor dependency map
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-022
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-plan.md
compound_run_id: tinto-e2e-rdm-022-self-doctor
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-022-self-doctor/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
---

# RDM-022 self-doctor dependency map

## Dependency graph

```text
RDM-017 portable runtime / structured resolver
        |
        v
U50 CLI + bounded self-report  -----> U51 safe no-follow inspection
        |                                  |
        +-------------------------------> U52 lock/install/bin coherence
        |                                  |
        +-------------------------------> U53 host/child resolver comparison
                                           |
                                           v
                              RDM-023 release certification evidence
```

RDM-022 is a Phase 2 operational-hardening item. It depends on RDM-017 as
declared by the roadmap; it does not depend on RDM-020 or RDM-021. The parent
must reconcile any shared CLI dispatcher or helper change if those siblings
land concurrently.

## Upstream contracts

| Upstream | Required fact | Consumption boundary | If unavailable |
| --- | --- | --- | --- |
| `docs/plans/tinto-e2e-reliability/initiative-requirements.md` | Bounded/sanitized diagnostics, portable provenance, and read-only self-repair recommendation. | All units. | Stop any behavior that would imply mutation or raw disclosure; artifact planning remains valid. |
| `docs/product/roadmap.md` | RDM-017 dependency, RDM-023 downstream relationship, Phase 2 scope. | Package waves and release readiness. | Return a brokered dependency conflict; do not reorder roadmap items locally. |
| RDM-017 accepted resolver contract | Host/child candidate identity, source/version/reason, effective child environment comparison, and bounded rejection categories. | U53; manager and Node checks in U52. | U53 may report conservative `unknown` only; no healthy-child claim or release readiness. |
| Existing project doctor contract | Current `ready|warn|error` report and stable project diagnostics. | U50 additive CLI/report compatibility. | Preserve current behavior and isolate self mode rather than rewriting project doctor. |

## Ownership and overlap map

| Surface | RDM-022 ownership | Other owner / coordination |
| --- | --- | --- |
| `src/cli/parse.ts` and `src/cli/doctor.ts` | Additive `--self` parsing/dispatch only. | Shared CLI surface; Seneschal serializes with RDM-020/RDM-021 if they touch it. |
| New self-doctor engine/path helper under `src/installer/` | U50-U53 implementation and tests. | No sibling owns the new module; preserve existing installer behavior. |
| `src/installer/doctor.ts` | Read-only compatibility reference; avoid broad rewrite. | Existing project-doctor behavior and RDM-020 attribution checks remain separate. |
| `src/installer/project.ts`, `src/installer/package-manager.ts` | Consume stable metadata conventions; no unrelated detector rewrite. | RDM-017 and existing installer ownership; coordinate if resolver/detection APIs change. |
| `src/platform/launch-environment.ts` | Consume accepted child-environment contract; no algorithm rewrite. | RDM-017 owns environment reconstruction/resolution. |
| Generic discovery, `.pumarejo` artifact retention, cleanup | Out of scope. | RDM-021 and RDM-016. Self doctor inspects only bounded known installation paths. |
| Project integration attribution and whole-file drift | Out of scope. | RDM-020. Self doctor reports package/install coherence only. |
| `docs/contracts.md`, `docs/security.md`, `docs/architecture.md` | Future implementation must propose maintained-doc updates; this artifact run cannot edit them. | Parent/release owner reconciles documentation surfaces. |
| `tests/fixtures/projects/*` and shared live fixtures | Add isolated self-doctor fixtures; do not mutate shared live fixtures concurrently. | Seneschal serializes shared fixture changes. |

## Review-unit dependency waves

| Wave | Review unit | Includes | Depends on | Base | Gate |
| --- | --- | --- | --- | --- | --- |
| 1 | RU1 | U50 + U51: CLI/report boundary and no-follow path/link safety. | Initiative contract; existing doctor contract. | `main` | Focused unit/integration/contract proof, document/security review, no unresolved P0-P2. |
| 2 | RU2 | U52 + U53: lock/install/bin coherence and host/child resolver comparison. | RU1; RDM-017 accepted resolver. | RU1 branch after parent merge, or reconciled `main`. | Focused platform/contract proof, resolver compatibility, security review, no unresolved P0-P2. |
| 3 | Aggregate | RDM-022 evidence consumed by RDM-023. | RU1 and RU2 integrated. | refreshed `main` | Root gates and platform evidence. |

The stack target is two open PRs and the hard cap is three. At the cap, wait
for the parent to merge into `main` or collapse the child onto the refreshed
integration base; never create a deeper stack or a deferred mega-consolidation.

## Downstream impact

- **RDM-023:** consumes sanitized self-doctor evidence and reruns the focused
  matrix as part of final regression certification.
- **Release handoff:** no package or Jira mutation is authorized by this
  dependency map. Release Marshal receives the package only after review,
  security, and CI break-prevention gates close.
- **RDM-020/RDM-021:** no behavioral dependency. If they alter shared CLI or
  filesystem helpers, record a downstream-fix note and rerun the affected
  self-doctor contract tests.

## Blockers and safe fallback

- Current blocker for implementation: RDM-017 has not supplied a reviewed
  resolver contract in this worktree. Artifact generation is complete and the
  dependency is explicit; do not invent the contract locally.
- Safe independent work: fixture design, report-boundary tests, path-safety
  design, and document review.
- Blocked work: U53 healthy/compatible claims and any implementation that
  reimplements or guesses host/child resolver semantics.

