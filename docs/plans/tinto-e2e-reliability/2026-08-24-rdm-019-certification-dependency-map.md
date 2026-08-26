---
title: RDM-019 complete Tinto certification dependency and overlap map
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
status: plan-review-passed
date: 2026-08-24
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-019
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-019-certification-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-019-certification-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-019-certification
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-019-certification/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
applied_decisions: []
open_decisions: []
---

# RDM-019 complete Tinto certification dependency and overlap map

## Dependency graph

```text
RDM-013 surface graph ───────────────┐
                                     v
RDM-014 native control ────────> U37/RU1 real Tinto success journey
RDM-017 portable runtime ────────┘          |
                                             v
RDM-015 diagnostics ───────────────> U38/RU2 forced failure + cleanup
RDM-016 process custody ────────────┘          |
                                             v
RDM-018 sequences/refs ────────────> U39/RU2 platform matrix + evidence
                                             |
                                             v
                                RDM-020/RDM-021 -> RDM-023 aggregate
```

RDM-013 through RDM-018 are consumed contracts, not implementation surfaces
for this child. U37 and U38 are sequenced because the failure path reuses the
real harness/session ownership established by the success path. U39 stays
with RU2 so provider skips, artifact disclosure, and cleanup evidence cannot
be reviewed as disconnected claims.

## Upstream and sibling contracts

| Dependency | Required evidence/status | RDM-019 use | Coordination rule |
| --- | --- | --- | --- |
| RDM-013 | Surface enumeration, parentage, selection, coverage gaps, canonical capability states | Discover/select archived conversation and dynamic nested surfaces | Consume accepted public schema; no local operation or state synonym. |
| RDM-014 | Effective window actions and launch-scoped dialog grant/postcondition | Window proof and access-mode dialog denial/authorization | Provider unsupported remains non-pass; no generic native fallback. |
| RDM-015 | Sanitize-before-store producers/query and explicit retention boundary | Phase/diagnostic evidence, seeded redaction, retained artifact projection | Consume bounded internal/public result; do not create a second diagnostics sink. |
| RDM-016 | Lease/identity, Job Object/process-group, disconnect, residue/repair proof | Normal, timeout, and disconnect cleanup; unrelated-process negative control | Never terminate or repair from harness code; use ownership API only. |
| RDM-017 | Child environment/toolchain resolver and provenance categories | Tinto init/config/launch determinism and host/child disposition | Do not expose raw environment/path; fail setup on unresolved required tool. |
| RDM-018 | Bounded sequences, focused editable typing, generation outcome matrix | Composer/Send atomicity and fresh refs after every mutation | No selector/geometry fallback; preserve uncertain/rejected generation rules. |
| Initiative REL-001–016 | One session, explicit auth, bounded sanitized artifacts, cross-platform criteria | Overall success and stop conditions | Canonical contract wins over local convenience. |

## Plan-unit dependency matrix

| Unit | Requires | Produces | Feeds/blocks |
| --- | --- | --- | --- |
| U37 | RDM-013/014/017/018; accepted RDM-015 evidence query; pinned Tinto/toolchain/provider | Disposable setup manifest, one-session public journey evidence, surface/window/dialog outcomes | Enables U38/U39; consumed by Seneschal aggregate. |
| U38 | U37; RDM-015 diagnostics; RDM-016 custody; RDM-017 runtime; RDM-018 timeout/generation semantics | Forced timeout/disconnect evidence, sanitized diagnostics, cleanup/residue proof | Blocks final U39 pass if cleanup/disclosure is incomplete. |
| U39 | U37/U38; Windows/Linux provider/display/toolchain matrix; explicit artifact retention | Platform matrix, truthful skip rows, bounded retained manifest/report | Feeds RDM-023 and parent release readiness; never closes a skipped required row. |

## Shared-surface ownership

| Surface | RDM-019 ownership | Sibling/parent ownership | Rule |
| --- | --- | --- | --- |
| `src/mcp/server.ts`, `src/mcp/schemas.ts`, `src/mcp/domain-ports.ts`, `src/mcp/runtime.ts` | Consumer calls only | RDM-013–RDM-018 and Seneschal serialization | Read accepted contracts; no edits in this child. |
| `src/session/manager.ts`, platform custody/launch | Consumer probes only | RDM-016/RDM-017 | Use ownership/effective environment APIs; no process control implementation. |
| Capability manifests/generated Tauri integration | Capability observation only | RDM-014/application maintainer | Do not add grant permissions or rewrite Tinto capabilities. |
| Existing generic fixture/public journey | Read-only comparison | Existing baseline/root | Mocked `real-usage` and generic fixture tests cannot satisfy RDM-019. |
| Disposable Tinto copy and certification support | New RDM-019 harness paths | Tinto checkout owner and parent | Resolve canonical roots, preserve source checkout, own only disposal/artifacts. |
| Retained artifact root/evidence docs | Sanitized bounded projection | RDM-015 sink; RDM-021 cleanup | Explicit opt-in; no implicit deletion or raw payload. |
| Queue, ledger, initiative contract, roadmap | Read-only inherited inputs | Seneschal/root | Never update shared state from this child. |

## Review-unit and wave map

| Wave | Review unit | Units | Gate | Outcome |
| --- | --- | --- | --- | --- |
| 0 | Dependency readiness | None | RDM-013–RDM-018 accepted contracts, provider feasibility, and readable shared revision | Certification implementation may be scheduled; otherwise blocked before runtime. |
| 1 | RU1 | U37 | Real Tinto setup and public journey pass with fresh refs, window/dialog postconditions, and no mock provider | Success journey is independently reviewable. |
| 2 | RU2 | U38/U39 | Forced failure cleanup, sanitized diagnostics, Windows/Linux matrix, explicit skip semantics, and bounded artifacts | RDM-019 evidence packet ready for parent reconciliation. |
| 3 | Parent aggregate | RDM-019 plus RDM-020–RDM-023 | Root fingerprint and full regression/pack validation | Release readiness only after parent and Release Marshal gates. |

## Reviewability and branch strategy

- Artifact planning stays on `codex/tinto-e2e-reliability`; no planning/docs
  branch or release mutation is created.
- Future implementation uses one semantic branch for RU1 and one dependent RU2
  branch only after parent merge/reconciliation. Target one pending PR, hard
  maximum two; at the cap wait for parent merge or collapse onto refreshed
  `main` rather than deepen the stack.
- RU1 isolates the reviewer-visible real-use journey and harness trust
  boundary. RU2 combines failure, cleanup, platform matrix, and evidence
  because splitting them would defer the disclosure/ownership proof into a
  mega-consolidation and make each failure claim hard to review independently.
- Jira is intentionally skipped. If a later parent enables Jira, each review
  unit remains one semantic task; no parent with one child is invented.

## Decision and blocker posture

- No product decisions are open in this child. Inherited settled decisions for
  one session, exact refs, explicit dialog grants, bounded diagnostics, and
  retention policy remain binding.
- Implementation prerequisites, not local product decisions, are acceptance of
  RDM-013–RDM-018 contracts, a pinned real Tinto checkout/profile, and
  provider/platform feasibility. If absent, preserve U37–U39 plans and return
  a brokered blocker; do not downgrade to mocks.
- A provider-gated skip is valid evidence of unsupported capability but cannot
  satisfy the required cross-platform complete certification. Parent must keep
  the run incomplete until the required row passes or the contract is
  explicitly revised by the owning authority.



