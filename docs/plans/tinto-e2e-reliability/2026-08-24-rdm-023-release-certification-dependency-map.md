---
title: RDM-023 release certification dependency and evidence map
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
status: plan-review-passed
date: 2026-08-24
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-023
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-023-release-certification-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-023-release-certification-plan.md
compound_run_id: tinto-e2e-rdm-023-release-certification
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-023-release-certification/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: []
---

# RDM-023 release certification dependency and evidence map

## Dependency closure

RDM-023 is the Wave G release-certification item. It is not executable until
the parent reconciles the following Wave E/F artifacts and their implementation
evidence on one accepted revision:

| Dependency | Consumed contract/evidence | RDM-023 use | Missing/unsafe result |
| --- | --- | --- | --- |
| RDM-019 Tinto certification | Real public-MCP journey, dialog denial/grant, timeout/disconnect, sanitization, residue manifest | Authenticity and end-to-end receipt | `blocked`; no mocked substitution |
| RDM-020 attributed drift | Owned projection evaluator and unrelated-edit tolerance | Drift regression receipt | `failed` on false positive/negative; `blocked` if receipt stale |
| RDM-021 network/artifacts | Loopback/discovery policy, explicit cleanup policy, permission/residue evidence | Network/platform and both cleanup-policy branches | `blocked` if policy unresolved; `failed` on unsafe deletion/residue |
| RDM-022 self-doctor | Bounded read-only self diagnostics and safe repair guidance | Installation health regression receipt | `failed` on mutation/leak/false negative; `blocked` if contract stale |
| RDM-017 portable runtime | Node/toolchain/environment resolver contract | Node/platform prerequisite identity and child/host evidence | Conservative `unknown`/`blocked`; no host-only pass |
| Initiative contract | REL-001–REL-016, security, retention, capability, generation invariants | Global acceptance and escalation authority | Parent broker decision required |

The dependency graph is:

```text
RDM-019 ─┐
RDM-020 ─┼─> U54 dependency closure ─┐
RDM-021 ─┤                           ├─> U56 matrix ─> U57 reducer/handoff
RDM-022 ─┘                           │
RDM-017 ───────────────> U54 ────────┘
                         U55 fixture proof ────────┘
```

## Ownership and overlap map

| Surface | RDM-023 ownership | Sibling ownership | Coordination rule |
| --- | --- | --- | --- |
| `tests/contract/real-usage-journey.test.ts` and generic platform fixtures | Consume as baseline only; never call them Tinto proof | RDM-019 owns real Tinto evidence | A generic/mock pass cannot satisfy CERT-023-008. |
| Capability generation and installer helpers | Validate through existing public generation path | RDM-020/RDM-022 own installer/doctor behavior | Do not add a second generator, alter attribution, or edit shared installer surfaces from this child. |
| `tests/fixtures/tauri-app` and project fixtures | Use disposable copies and fixture fingerprints | RDM-020/RDM-021 own their fixture contracts | No normalization or shared fixture mutation; serialize any future fixture edits. |
| Artifact retention/cleanup | Consume explicit-policy result and test preserve-without-policy | RDM-021 owns retention evaluator/policy | No implicit product default or duplicate deletion logic. |
| Self-doctor | Consume stable IDs/read-only result | RDM-022 owns self-doctor implementation | Do not duplicate resolver/path/link checks. |
| Tinto setup/journey | Consume sanitized receipt | RDM-019 owns journey harness | Do not re-run with mocks or define a parallel Tinto contract. |
| Release evidence index | Future RDM-023 output only | Parent/release owner reconciles bundle location | This child writes planning docs only; no evidence directory is edited now. |
| `docs/contracts.md`, `docs/security.md`, `docs/compatibility.md` | Reference only in artifact mode | Maintained docs may be updated by owning implementation units | Do not make shared docs edits in this run. |
| Queue, initiative, roadmap, autonomy ledger, Jira, PR/release state | None | Seneschal/Release Marshal | Never edit or mutate from this child. |

## Plan-unit dependency map

| Unit | Depends on | Enables | Main risk | Gate |
| --- | --- | --- | --- | --- |
| U54 | RDM-019–RDM-022, RDM-017, shared revision | U55/U56/U57 | stale/copied receipts or wrong policy | all required receipts and hashes current |
| U55 | U54, RDM-020 capability/generation contract | U57 | generated Rust proof is fake or formatter unavailable | real Cargo fixture, two hashes equal, `--check` clean |
| U56 | U54; U55 for aggregate release matrix | U57 | skip/failure conflation and cross-platform gaps | every required row has typed result |
| U57 | U54–U56, security review | parent release handoff | bundle claims readiness without blockers | reducer returns `ready` only for complete green matrix |

## Evidence graph

| Evidence node | Source | Sanitized fields | Fingerprint |
| --- | --- | --- | --- |
| Dependency receipt set | RDM-019–RDM-022 states/reviews/packages | status, revision, artifact IDs, review result, receipt path | `dependency_receipts_sha256` |
| Capability fixture set | JSON/TOML fixtures and generated capability projections | case ID, expected/observed status, authority classification | `capability_fixtures_sha256` |
| Generated Rust set | disposable Cargo fixture | relative generated-file labels, byte hashes, formatter status | `generated_rust_sha256` |
| Command manifest | Node/platform lane commands | command IDs, exit/status, versions, redaction counters | `commands_sha256` |
| Tinto receipt | RDM-019 sanitized manifest | phase/status, public-MCP authenticity, dialog/timeout/cleanup outcomes | `tinto_receipt_sha256` |
| Cleanup-policy receipt | RDM-021 explicit policy branches | policy present/absent, scope, action/result, residue | `artifact_policy_sha256` |
| Self-doctor receipt | RDM-022 stable diagnostics | IDs/statuses, read-only proof, safe guidance | `self_doctor_sha256` |
| Drift receipt | RDM-020 attribution matrix | owned/unowned case, expected/observed status | `drift_sha256` |
| Final sanitized index | U57 reducer | matrix, blockers, advisories, reruns, all prior fingerprints | `bundle_sha256` |

## Release-wave ordering

1. **Wave 0 — parent reconciliation:** confirm all dependency states and the
   explicit-policy cleanup decision; do not execute runtime claims while any
   required receipt is stale or missing.
2. **Wave 1 — U54:** build the lane inventory and canonical evidence schema.
3. **Wave 2 — U55:** run capability/Cargo proof in disposable fixtures.
4. **Wave 3 — U56:** run Node, formatting, package, platform, Tinto, security,
   self-doctor, drift, and cleanup-policy evidence. The parent may serialize
   host lanes; no deep stack is needed.
5. **Wave 4 — U57:** recompute fingerprints, apply the reducer, and return a
   release-ready or blocked packet to Seneschal. Only the parent may invoke
   Release Marshal after sibling reconciliation.

## Skip/failure decision table

| Observation | Classification | Release effect |
| --- | --- | --- |
| Required Node/platform lane cannot start | `blocked` | Blocks release; name missing tool/env and rerun. |
| Optional provider/display unavailable before claim | `skipped` | Preserve as non-pass evidence; overall not ready. |
| Provider starts but required operation is unsupported | `failed`/typed `unsupported` | Blocks affected required row; no fallback. |
| Assertion/postcondition, sanitizer, cleanup, or formatter fails | `failed` | Blocks release. |
| Dependency receipt stale/malformed | `blocked` | Blocks all dependent claims. |
| No explicit artifact policy | `passed` only when preserve/no-delete branch is proven | Never delete implicitly; policy branch remains required. |
| Explicit policy selects unowned/ambiguous path | `failed` | Security and release blocker. |
| Advisory Linux Node lane absent from current support contract | `skipped` | Record coverage gap; cannot claim 2x2 matrix. |

## Shared-state safety

This child may write only its seven assigned artifact paths. The parent owns
cross-run queue reconciliation and shared revisions. Any discovered conflict
in an inherited decision, public contract, provider support promise, branch
base, or retention behavior becomes a brokered decision request with the
affected unit paused; safe document-local work may continue.

