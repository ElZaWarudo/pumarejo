---
title: RDM-015 observability dependency and overlap map
artifact_contract: ce-plan/v1
artifact_readiness: implementation-ready
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-015
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
compound_run_id: tinto-e2e-rdm-015-observability
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-015-observability/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
---

# RDM-015 observability dependency and overlap map

## Dependency graph

```text
RDM-009 bounded observation/redaction
                 \
                  +--> U28 sanitize-before-store/ring buffers
RDM-010 lifecycle/status ----+             \
                                             +--> U29 producer adapters
RDM-013 surface/capabilities -read-only----/          |
                                                     v
                           DEC-003 + DEC-004 --> U30 bounded public query
                                                     |
                           ArtifactStore -----------> U31 explicit retention/security
                                                     |
                 +-------------------+---------------+----------------+
                 v                   v                                v
          RDM-016 custody     RDM-017 portable runtime        RDM-019 certification
                 \                   /                                ^
                  +--> RDM-021 network/artifact hygiene -------------+
```

## Upstream and sibling contracts

| Dependency | Evidence/status | RDM-015 use | Conflict/coordination rule |
| --- | --- | --- | --- |
| RDM-009 | Review-passed package/state at the observed revision. | Mandatory redaction, bounded observation, actionable-generation and no-stale-ref rules. | Consume only; do not edit RDM-009 surfaces or weaken disclosure. |
| RDM-010 | Review-passed implementation package. | Launch phases, status/last-failure projection, cancellation/cleanup transitions. | Reuse accepted phase/state vocabulary; do not create parallel lifecycle states. |
| RDM-013 | Artifact set exists but DEC-003/004 remain open. | Surface correlation and capability evidence for console/query composition. | RU2 public wiring is blocked; do not invent API names or capability vocabulary. |
| RDM-014 | Sibling planning/implementation lane. | Shares public MCP/runtime/provider seams. | Seneschal serializes `src/mcp`, provider, and shared fixtures; RDM-015 does not mutate sibling files. |
| RDM-016 | Planned dependent process-custody lane. | Consumes owned-process diagnostic evidence. | RDM-015 does not define leases, Job Objects, groups, repair, or termination. |
| RDM-017 | Planned dependent environment/toolchain lane. | May emit resolver/launch diagnostics through the sink later. | No raw environment/PATH contract; RDM-017 owns resolution semantics. |
| RDM-019 | Planned Tinto certification lane. | Consumes query evidence for failed phases, redaction, timeout, and residue. | No end-to-end fixture ownership here. |
| RDM-021 | Planned network/artifact lane. | Consumes bounded diagnostic sink and retained adapter. | RDM-021 owns cleanup/retention policy; RDM-015 does not infer deletion defaults. |
| ArtifactStore | Existing protected manifest/permission/containment implementation. | Optional sink for explicitly retained sanitized records. | Retention must remain opt-in and bounded; no raw diagnostics or new cleanup policy. |

## Plan-unit dependency matrix

| Unit | Depends on | Enables | Mutating overlap | Safe before decisions? |
| --- | --- | --- | --- | --- |
| U28 | RDM-009, RDM-010 | U29, U30, U31 | New internal observability boundary; shared error types only if additive. | Yes. |
| U29 | U28, RDM-010, RDM-013 read-only provider evidence | U30, downstream process/network/certification evidence | `src/platform/tracked-process.ts`, `src/session/`, `src/webdriver/`, `src/mcp/runtime.ts`. Serialize with RDM-014/RDM-016/RDM-017. | Yes for internal adapters; no public capability mapping. |
| U30 | U28/U29, DEC-003/004, accepted RDM-013 shape | U31, RDM-019 | `src/mcp/domain-ports.ts`, schemas, server, contracts. Serialize with all public-contract workers. | No; public wiring blocked. |
| U31 | U30, ArtifactStore, RDM-021 policy boundary, DEC-003/004 | RDM-019/RDM-021 security evidence | `src/artifacts/`, config/docs/tests. Serialize with RDM-021 retention/artifact work. | Only pure security fixtures; retained/public adapter blocked. |

## Shared surface ownership

The following surfaces are expected implementation overlaps, not artifact-run
ownership. Seneschal must reserve them before any worker mutates them:

| Surface | Current owner/consumer | RDM-015 future role | Required coordination |
| --- | --- | --- | --- |
| `src/mcp/domain-ports.ts` | Public runtime contract | Query port after decisions. | Additive only; rebase after RDM-013/RDM-014 decisions. |
| `src/mcp/schemas.ts` and `src/mcp/server.ts` | Public tool schemas/registration | Finite query schema/registration. | Exact operation/fields deferred; contract tests in RU2. |
| `src/mcp/runtime.ts` | FIFO, status, operation orchestration | Producer hooks and query projection. | Preserve status/close behavior and serialize with lifecycle/custody. |
| `src/session/manager.ts` and `src/session/state.ts` | Launch and ownership state | Phase/last-error event producers. | Consume accepted lifecycle state; no new public states or custody policy. |
| `src/platform/tracked-process.ts`, Windows/Linux process adapters | Owned process spawn/output | Bounded stdout/stderr producer. | Keep process identity private; no RDM-016 cleanup changes. |
| `src/webdriver/client.ts` and provider fixtures | Authenticated provider boundary | Capability-gated console source. | No arbitrary script; provider result maps through RDM-013. |
| `src/shared/errors.ts` | Stable error envelopes | Projected error evidence. | Add no public error codes without brokered approval. |
| `src/artifacts/` and `src/config/` | Protected screenshot retention/config | Optional sanitized diagnostic sink. | Existing explicit `retainArtifacts` only; RDM-021 owns cleanup policy. |
| `docs/contracts.md`, `docs/security.md`, `docs/architecture.md` | Public/operator contracts | Explain query/disclosure/ownership once canonical. | Keep docs with the functional RU2 review; no planning-only branch. |
| Unit/integration/contract/platform fixtures | Shared test matrix | Sink/producers/public/retention evidence. | Avoid concurrent edits; root owns aggregate certification. |

## Execution waves and gates

| Wave | Review unit | Included units | Gate | Outcome |
| --- | --- | --- | --- | --- |
| 0 | Decision/feasibility | None | DEC-003/004 canonical; provider console feasibility recorded. | Public implementation may be scheduled. |
| 1 | RU1 | U28, U29 | Pure sink and producer/security tests pass; no public API required. | Internal sanitized evidence is ready for projection. |
| 2 | RU2 | U30, U31 | Decisions canonical; public contract, retention, MCP framing, security tests pass. | Query/retention slice is review-ready. |
| 3 | Seneschal aggregate | Downstream consumers | Root fingerprint, cross-platform and certification gate. | Release-ready packet only after parent reconciliation. |

## Review-stack and branch strategy

- Supplied branch: `codex/tinto-e2e-reliability`, base `main` at
  `23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53`.
- Artifact-only changes remain on the supplied integration branch; no planning
  branch is created.
- Future implementation uses one semantic branch carrying related planning
  artifacts and two review units in one serial chain. Target open stack is one
  pending PR; hard cap is two. At the cap, wait for parent merge or collapse
  onto refreshed `main`.
- RU1 is independently reviewable because it is internal sanitizer/storage and
  producer evidence. RU2 is kept integrated because public query, capability
  mapping, retention, and disclosure tests share the same boundary; splitting
  them would defer the security contract into a consolidation PR.

## Critical blockers

1. DEC-2026-08-21-003 is open and blocks exact public query/API composition.
2. DEC-2026-08-21-004 is open and blocks public capability-state projection.
3. Provider console feasibility is a read-only prerequisite for claiming a
   supported console source; unsupported provider contexts remain truthful
   gaps.
4. Public MCP/runtime/schema files overlap sibling lanes and require Seneschal
   serialization even after decisions close.

Safe progress is limited to internal architecture, read-only provider
inspection, sanitizer/ring tests, and producer fixtures that do not name a
public operation or capability state.

