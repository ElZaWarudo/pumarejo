---
title: RDM-016 process custody and orphan recovery dependency map
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
status: plan-review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-016
compound_run_id: tinto-e2e-rdm-016-process-custody
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-016-process-custody/state.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-plan.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: []
applied_decisions: [DEC-2026-08-21-004]
---

# RDM-016 process custody and orphan recovery dependency map

## Dependency graph

```text
RDM-010 lifecycle/status/cleanup -----------+
                                             v
existing process identity + endpoint ---> U32 durable lease/proof
                                             |
                                             v
                                  U33 Windows Job Object/fallback
                                      POSIX group/session TERM->KILL
                                             |
RDM-015 accepted custody adapter ----------> U34 recovery/convergence/evidence
DEC-2026-08-21-004 canonical states/codes --> exact mapping via RDM-015
                                             |
                    +------------------------+------------------+
                    v                                           v
          RDM-021 listener/readiness ownership             RDM-019 Tinto proof
          (consumer, never terminates)                     (aggregate consumer)
```

RDM-016 consumes the accepted RDM-010 lifecycle and RDM-015 evidence adapter.
It owns process/listener custody proof and repair only. RDM-021 consumes the
proof for loopback readiness; it must not kill or repair processes. RDM-019
consumes bounded residue/orphan evidence. DEC-004 is canonical and supplies
the exact five public states and stable codes; RDM-016 passes those facts only
through RDM-015 and does not create another public vocabulary.

## Units, review boundaries, and waves

| Wave | Review unit | Scope | Prerequisite | Base/merge rule |
| --- | --- | --- | --- | --- |
| 0 | Contract inventory | Confirm RDM-010 lifecycle, RDM-015 custody adapter, and exact canonical DEC-004 states/codes. | Parent reconciliation | No code mutation. |
| 1 | RU1 / U32+U33 | Lease/identity proof plus Windows and POSIX enforcement. | Wave 0; existing process seams | One serial semantic slice; keep lease and enforcement together because splitting them obscures the destructive boundary. |
| 2 | RU2 / U34 | Startup orphan recovery, idempotent cleanup, listener postconditions, and sanitized evidence. | RU1 and accepted RDM-015 adapter | Child of RU1 only if shared runtime files overlap; otherwise independent base after parent confirms ownership. |
| 3 | Aggregate | Cross-item listener, diagnostics, certification, and platform evidence. | RU1 + RU2 plus RDM-015/RDM-021 consumers | Parent-owned aggregate; no child release. |

RU1 and RU2 are two reviewable capability slices, not micro-PRs. RU1 owns
the identity and enforcement safety boundary; RU2 owns recovery and evidence
integration. Keep at most two open PRs in this chain, target one, and wait for
the parent merge or collapse onto refreshed `main` before extending the stack.

## Upstream, sibling, and consumer ownership

| Surface or contract | RDM-016 responsibility | Other owner/consumer | Coordination rule |
| --- | --- | --- | --- |
| `src/session/process-lease.ts`, new lease module | Exact tuple, nonce, durable state, revalidation, process/listener proof. | RDM-010 lifecycle; RDM-015 process-output producer. | Reuse existing identity and phase semantics; no parallel public state. |
| `src/session/manager.ts`, `src/session/cleanup.ts` | Integrate single-flight custody, close/cancel/timeout/repair. | RDM-010 accepted status/cleanup behavior; RDM-019 certification. | Preserve current public states/errors; serialize shared runtime edits. |
| `src/platform/tracked-process.ts` | Internal custody adapter, identity revalidation, bounded escalation. | RDM-015 process-stream producer; RDM-021 listener consumer. | RDM-015 may consume sanitized events; RDM-021 never terminates. |
| `src/platform/windows/process.ts` | Job Object preferred path and explicit validated-tree fallback. | Platform/native runtime ownership. | Keep raw CIM/native results internal; prove fallback degradation. |
| `src/platform/linux/process.ts` | Group/session proof and TERM→KILL escalation. | Platform/runtime owner. | Preserve detached launch; do not broaden signal scope after proof loss. |
| `src/session/endpoint.ts` | Owned provider/proxy listener postconditions and proof. | RDM-021 loopback family/readiness. | Return typed internal proof; no raw port/path evidence. |
| `src/mcp/server.ts` | Transport signal shutdown calls existing cleanup coordinator. | RDM-015 invocation/phase evidence; RDM-019 timeout journey. | No new MCP operation or public schema. |
| RDM-015 public adapter/query | Sanitized custody producer input only. | RDM-015 owns sink, limits, schema, and public query. | Do not invent event fields or capability states; consume accepted adapter. |
| DEC-2026-08-21-004 | Canonical public capability outcome states/codes. | RDM-013/RDM-014 decision owner; RDM-015 adapter consumer. | Use exact states through RDM-015; no local synonyms or second public projection. |
| Lease root under `.pumarejo/sessions` | Narrow lease persistence/recovery. | RDM-021 artifact/discovery/retention. | Lease records are not retained diagnostics; no generic deletion or age policy. |
| Environment/toolchain/installer/doctor | None. | RDM-017/RDM-020/RDM-022. | Never edit or claim those surfaces. |

## Contract gates

- **G-016-1 — upstream adapter:** RDM-015's accepted internal custody-evidence
  adapter is available and its sanitization/limits are authoritative. Without
  it, U32/U33 pure proof work may be reviewed, but U34 evidence integration is
  blocked.
- **G-016-2 — public decision boundary:** DEC-004 is canonical.
  Public capability evidence may proceed only through RDM-015 using the exact
  supported/unsupported/unavailable/denied/failed states and stable codes;
  internal custody remains bounded and additive.
- **G-016-3 — destructive proof:** every terminate/escalate/release path has
  a fresh PID/start/command/nonce check plus platform mechanism and listener
  postconditions. No review-passed claim without this evidence.
- **G-016-4 — crash recovery:** malformed, foreign, linked, live-controller,
  replaced, and ambiguous leases are preserved. Orphan repair is bounded and
  idempotent with a retryable state.
- **G-016-5 — platform matrix:** Windows Job Object/fallback and POSIX group
  TERM/KILL fixtures pass; host-only gaps state the exact CI command/reason.
- **G-016-6 — parent aggregate:** RDM-015/RDM-019/RDM-021 consumers reconcile
  the accepted custody proof and sanitized evidence before release handoff.

## Safe fallback and blockers

The safe local fallback is conservative identity-only proof and tests. If
RDM-015's adapter is absent, keep evidence integration pending rather than
creating a local public sink. DEC-004 is resolved in the initiative contract;
any public capability projection continues to use its exact canonical states
through RDM-015 and is not reinterpreted locally. If Job Object or process-
group proof is unavailable, preserve a bounded retryable lease/residue and
report the host limitation through RDM-015; never broaden termination to an
unowned process.

No product test or implementation runs in this artifact-only child. Future
commands and exact host skips are recorded in the plan and work package.
