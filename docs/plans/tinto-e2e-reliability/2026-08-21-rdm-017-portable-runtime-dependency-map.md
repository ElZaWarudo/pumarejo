---
title: RDM-017 portable runtime dependency and overlap map
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
status: plan-review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-017
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-017-portable-runtime-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-017-portable-runtime-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-017-portable-runtime
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-017-portable-runtime/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
applied_decisions: [DEC-2026-08-21-003, DEC-2026-08-21-004]
open_decisions: []
---

# RDM-017 portable runtime dependency and overlap map

## Dependency graph

```text
RDM-015 internal sanitize-before-store/evidence envelope
                         |
                         v
             U34 child environment + host/child diff
                         |
                         v
             U35 canonical candidate resolver
                         |
                         v
             U36 sanitized evidence adapter + matrix
               /            |              \
              v             v               v
        RDM-019 Tinto   RDM-022 self-doctor  RDM-020 drift consumer
              \             |               /
               +-------- RDM-023 certification

RDM-016 process custody supplies ownership/probe boundaries only; it does not
own environment or resolver semantics.
```

## Upstream and sibling contracts

| Dependency | Evidence/status | RDM-017 use | Coordination rule |
| --- | --- | --- | --- |
| Initiative REL-008/REL-009 | Approved initiative requirements. | Allowlisted, bounded, portable, secret-safe environment/toolchain outcome. | Consume; no public contract broadening. |
| RDM-015 | Focused internal event/ring contract is planned; public composition decisions are now canonical. | Sanitized internal toolchain-resolution event and ownership validation. | Do not fork sanitizer/buffer or add a competing public diagnostics operation. |
| RDM-016 | Process custody lane owns leases, Job Objects/groups, cleanup, and process identity. | Injected bounded probes only; no process termination or repair. | Serialize only if a shared process/launch seam is changed. |
| RDM-020 | Attributed drift owns shared `doctor` integration. | No `doctor.ts` changes in this package. | RDM-020 consumes stable resolver outputs later. |
| RDM-022 | Self-doctor consumes host/child resolver comparison. | Publish the typed internal result without implementing self-doctor. | No duplicate resolver algorithm. |
| RDM-019 | Tinto certification consumes sanitized evidence. | Provide deterministic evidence and matrix inputs. | No end-to-end fixture ownership here. |
| DEC-003/004 | Parent decisions resolved: additive public operations and explicit supported/unsupported/unavailable/denied/failed states. | Compatibility constraint only; no public projection here. | Downstream consumers use canonical choices. |

## Plan-unit dependency matrix

| Unit | Requires | Produces | Blocks/feeds |
| --- | --- | --- | --- |
| U34 | Current launch allowlist/profile behavior; RDM-015 sanitizer boundary. | Effective child environment, private provenance map, sanitized host/child categories. | Blocks U35; feeds all resolver/doctor consumers. |
| U35 | U34 environment; existing bounded Windows shim/Linus command helpers. | Canonical candidate list, internal identity, version/rejection results, launch-ready internal path. | Blocks U36; feeds RDM-022/RDM-020/RDM-019. |
| U36 | U34/U35; RDM-015 internal event envelope. | Sanitized toolchain evidence and deterministic Windows/Linux proof. | Enables downstream certification/consumer sequencing. |

## Shared-surface ownership

| Surface | RDM-017 ownership | Sibling/user ownership | Coordination rule |
| --- | --- | --- | --- |
| `src/platform/launch-environment.ts` | U34 owns additive builder/provenance/diff changes. | RDM-016 may consume process environment; RDM-022 consumes result. | Serialize implementation edits; preserve current allowlist behavior. |
| `src/platform/windows/` and `src/platform/linux/` launch helpers | U35 owns only narrow resolver integration. | RDM-016 owns process custody seams. | Do not change custody/termination logic. |
| New `src/platform/toolchain-resolver.ts` and evidence helper | U35/U36 own. | No sibling currently owns these new modules. | Keep internal and bounded. |
| `src/installer/doctor.ts` | None in this package. | RDM-020 shared doctor wiring; RDM-022 self-doctor. | Consumers adapt after the resolver contract is accepted. |
| `src/installer/project.ts`, `tests/unit/project-detection.test.ts` | None. | User-owned/worker-owned isolated main-checkout edits. | Never edit, reset, or infer these files. |
| RDM-015 public MCP/schema/session surfaces | None. | RDM-013/RDM-015/Seneschal serialization. | No public operation/field edits from RDM-017. |
| Test fixtures | New isolated environment/resolver/platform fixtures only. | Shared live Tinto fixtures are root-owned. | Use injected temporary fixtures; do not alter shared live fixtures. |

## Execution waves and gates

| Wave | Review unit | Included units | Gate | Outcome |
| --- | --- | --- | --- | --- |
| 0 | Contract readiness | None | RDM-015 internal event envelope and shared revision accepted. | Implementation may be scheduled. |
| 1 | RU1 | U34 | Pure Windows/Linux environment and diff tests pass; no raw evidence. | Effective child environment is ready for resolver consumption. |
| 2 | RU2 | U35, U36 | Resolver candidate/version/rejection tests, sanitized evidence, and platform matrix pass. | Portable resolver packet is ready for consumers. |
| 3 | Seneschal aggregate | Downstream consumers | Serialized shared surfaces plus root fingerprint and RDM-023 matrix. | Release-ready only after parent reconciliation. |

## Review-stack and branch strategy

- Artifact-only work stays on the supplied integration branch
  `codex/tinto-e2e-reliability`; no planning/docs branch is created.
- Future implementation uses one semantic branch for RU1 and one dependent
  RU2 child, with a target of one pending PR and a hard cap of two.
- RU1 is independently reviewable as a Windows security/environment slice.
  RU2 keeps resolver and evidence projection together because candidate claims
  and disclosure safety must be reviewed as one capability.
- At the cap, wait for the parent merge into refreshed `main` or collapse onto
  refreshed integration base; never create a deeper stack or a consolidation PR.

## Decision and blocker posture

- DEC-2026-08-21-003 and DEC-2026-08-21-004 are applied parent decisions, not
  blockers for this internal packet.
- The only implementation sequencing gate is acceptance of RDM-015's internal
  sanitize-before-store event contract and Seneschal serialization of shared
  launch surfaces.
- The isolated main-checkout installer edits are a preserved ownership boundary,
  not a reason to modify or copy those files into this worktree.
