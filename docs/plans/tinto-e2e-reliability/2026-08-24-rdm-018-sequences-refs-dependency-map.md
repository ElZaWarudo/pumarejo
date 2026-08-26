---
title: RDM-018 bounded sequences and reference-generation dependency map
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
status: review-passed
date: 2026-08-24
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-018
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-plan.md
compound_run_id: tinto-e2e-rdm-018-sequences-refs
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-018-sequences-refs/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
---

# RDM-018 bounded sequences and reference-generation dependency map

## Dependency boundary

RDM-018 is Wave D in the initiative roadmap. Its implementation must be
serialized after the accepted RDM-009 observation contract and after RDM-013
and RDM-014 publish their reconciled surface/capability and effective-control
contracts. This child owns only its artifact namespace and records overlap for
Seneschal; it does not edit upstream or sibling files.

| Dependency | Required fact | Owner | RDM-018 use | Gate |
| --- | --- | --- | --- | --- |
| RDM-009 | Continuation evidence is non-actionable; a fresh actionable snapshot is required before an action; opaque refs are exact/current-generation. | RDM-009 child | Sequence input validation and final snapshot publication. | Block implementation until package/state and shared revision reconcile. |
| RDM-013 | Surface discovery/selection is additive; active surface and graph identity bind refs; capability states are `supported`, `unsupported`, `unavailable`, `denied`, `failed`. | RDM-013 child | Per-step active-surface/generation checks and truthful sequence capability projection. | Consume canonical accepted fields and operation states; no local synonym. |
| RDM-014 | Window/native dialog support is effective/probed; native dialog decisions require explicit capability and authorization. | RDM-014 child | Sequence excludes implicit dialog/window authorization and consumes typed effect evidence where applicable. | No sequence implementation before provider/control contract is reconciled. |
| RDM-015 | Optional bounded sanitize-before-store diagnostic sink. | RDM-015 child | Sequence may emit bounded invocation/step evidence through its accepted sink; no direct raw diagnostic path. | Downstream integration only; not a Wave 0 blocker. |
| RDM-019 | Public Tinto journey and forced-failure certification. | Future child | Consumes final sequence contract for proving journey and timeout/authorization cases. | RDM-018 must hand off focused evidence; RDM-019 owns end-to-end proof. |

## Ownership and overlap map

| Surface | RDM-018 ownership | Sibling owner/constraint | Coordination rule |
| --- | --- | --- | --- |
| `src/interaction/` | U37 generation reducer integration; U38 sequence executor. | No sibling owns these new sequence modules; standalone action engine is shared with RDM-014. | RU1 first; provider/control changes from RDM-014 must be reconciled before editing shared action paths. |
| `src/observation/refs.ts` and `src/observation/snapshot.ts` | Atomic reserve/compare-only/publish seam needed for exact generation matrix. | RDM-009 owns observation/reference contract; RDM-013 may own surface context. | RDM-018 proposes only additive/local matrix seam after upstream contract acceptance; Seneschal serializes edits. |
| `src/mcp/schemas.ts`, `src/mcp/domain-ports.ts`, `src/mcp/runtime.ts`, `src/mcp/server.ts`, `src/mcp/tools/index.ts` | Additive sequence schema/port/runtime dispatch. | RDM-013/014/015 share public schema/runtime seams. | RU2 waits for refreshed integration base and accepted sibling public contracts. |
| `src/session/` and active surface state | Per-step session/surface/generation validation only. | RDM-013 owns surface graph; RDM-014 owns effective control; RDM-016 owns process custody. | No new session/process ownership model; consume existing guards. |
| `tests/unit/`, `tests/contract/`, `tests/integration/`, `tests/platform/` | Focused matrix/sequence/security/compatibility fixtures. | RDM-019 owns public Tinto certification fixtures. | Keep RDM-018 fixtures reusable and deterministic; do not claim full Tinto proof. |
| `docs/contracts.md`, `docs/architecture.md`, `docs/security.md`, `docs/compatibility.md` | Update only proven sequence/generation behavior in RU2. | Siblings may own adjacent public/provider documentation. | Include only accepted fields and preserve upstream vocabulary; no planning-only doc branch. |

## Plan-unit to review-unit map

| Review unit | Plan units | Independent value | Dependency | Expected stack |
| --- | --- | --- | --- | --- |
| RU1 — deterministic generation and exact actions | U37 | Makes standalone actions safe and supplies the only generation publication contract for sequences. | RDM-009, RDM-013, RDM-014 reconciliation. | Parent, one open PR. |
| RU2 — bounded sequence boundary and focused typing projection | U38 | Adds the finite public sequence capability with early stop/final snapshot proof on U37. | RU1 refreshed base; accepted RDM-013/014 public/provider contracts. | Child, total stack target one/hard cap two. |

## Execution waves

```text
Wave 0: reconcile RDM-009 + RDM-013 + RDM-014 shared artifacts/revision
  |
Wave 1: RU1 / U37 generation reducer + exact standalone action semantics
  |
Wave 2: RU2 / U38 bounded sequence + focused typing + additive MCP projection
  |
Wave 3: Seneschal aggregate + RDM-015 evidence integration + RDM-019 handoff
```

No parallel mutating worker is safe in this package. U37 and U38 share the
central session/generation/MCP seams; RDM-013/014 own adjacent contracts. At
the stack cap, wait for the parent merge into `main` or collapse the pending
child onto the refreshed integration base. Never create a planning/docs-only
branch or defer required docs into an unreferenced consolidation.

## Generation and sequence invariants

For current generation `g`:

- proven no-change (including a pre-dispatch no-effect proof) keeps `g` and
  current refs;
- proven state/surface/focus change advances exactly once to `g+1`, invalidates
  `g`, and lets one final snapshot publish refs at `g+1`;
- uncertainty (post-dispatch timeout/cancel/transport loss/missing
  postcondition/final-refresh failure) advances exactly once with a bounded
  reason and invalidates `g`;
- a stale/detached identity that proves surface/state drift is an advancing
  outcome; an unknown/continuation/wrong-session target without drift proof is
  a no-dispatch rejection and does not mutate the table;
- no sequence step runs after an advancing/uncertain result; remaining steps
  are ordered `not_run` outcomes; and
- the final stabilization snapshot is emitted at most once and is actionable
  only if it belongs to the current owned session/surface and reserved
  generation.

The complete row-level matrix is authoritative in the requirements artifact:
`docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-requirements.md#exact-generation-outcome-matrix`.

## Verification and reconciliation gates

- Before RU1: verify RDM-009/013/014 artifacts are present, reviewed, and
  readable from one approved shared revision; confirm no sibling worker owns
  the exact files in the current lane.
- RU1 gate: exhaustive reducer tests, exact-one increment assertions, stale and
  continuation rejection, and focused editable typing pass; no product public
  sequence schema is required yet.
- RU2 gate: strict schema/bounds, serial FIFO, early-stop/not-run ordering,
  single final snapshot, cancellation/timeout, capability states, redaction,
  and existing-tool compatibility pass.
- Parent gate: run the root aggregate fingerprint and reconcile RDM-015/019
  evidence; the child does not run aggregate commands in artifact mode.
- Security gate: require review of exact ref/session/surface binding,
  uncertainty invalidation, text/output redaction, no implicit native dialog
  authorization, cancellation, and no unrelated process cleanup.

No code/test/config operation is authorized until the upstream reconciliation
gate is closed by Seneschal.
