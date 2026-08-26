---
title: RDM-014 truthful native control and Tauri dialog document review
date: 2026-08-21
roadmap_item: RDM-014
compound_run_id: tinto-e2e-rdm-014-native-control
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-014-native-control/state.md
review_mode: non-interactive
review_role: ce-doc-review
security_role: krt-security-sentinel-design-gate
artifact_readiness: package-ready
status: package-review-passed
applied_decisions:
  DEC-2026-08-21-003: additive dedicated discovery and selection operations; existing calls remain backward compatible
  DEC-2026-08-21-004: supported, unsupported, unavailable, denied, and failed states with stable codes and bounded sanitized evidence
decisions_source: docs/plans/tinto-e2e-reliability/initiative-requirements.md#approved-decisions-and-escalation-boundaries
decisions_applied_at: 2026-08-21T12:04:48Z
---

# RDM-014 truthful native control and Tauri dialog document review

## Review Scope and Coverage

Reviewed the focused requirements, implementation plan, dependency map, and work package as one RDM-014 artifact set:

- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-014-native-control-requirements.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-014-native-control-plan.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-014-native-control-dependency-map.md`
- `docs/work-packages/RDM-014-native-control/2026-08-21-014-native-control-work-package.md`

The non-interactive review applied coherence, feasibility, product, adversarial/provider, and security-design lenses. It used a serial inline lane because this nested artifact run has high local autonomy, shipping disabled, no external mutation authority, and a strict no-product-code scope. No mutating or reviewer subagent was dispatched.

The review inspected the inherited initiative and roadmap, the gap audit, canonical resolved DEC-003/DEC-004 records, current window/client/interaction/session/MCP/capability seams, and the vendored WebDriver alert implementation without editing any sibling or shared file.

## Review Result

**Artifact gates passed with the applied public contract and one implementation provider-feasibility verification requirement.** The packet maps REL-004/REL-005 to two reviewable units, preserves the approved random launch-scoped allowed-action grant and bounded sanitized default evidence, binds native decisions to one owned session/process/nonce/surface/generation, and refuses arbitrary native automation. It is implementation-ready for execution handoff; provider feasibility determines supported versus unsupported runtime evidence and is not a product blocker.

The plan is `artifact_readiness: implementation-ready`: DEC-003 and DEC-004 are applied from the canonical initiative contract. RU1 and RU2 may use the additive dedicated public operations and canonical state matrix; implementation must still run the provider fixture and record supported or unsupported Tauri-dialog truth.

## Evidence Inspected

- Initiative contract REL-004/REL-005, one-session and disclosure invariants, approved grant shape, and non-goals: `docs/plans/tinto-e2e-reliability/initiative-requirements.md`.
- Roadmap RDM-014 outcome/dependency and Wave B serialization: `docs/product/roadmap.md`.
- Existing truthful-window/native-dialog gaps and recommended decomposition: `docs/audits/2026-08-21-tinto-gap-audit.md`.
- Canonical resolved decision records and RDM-014 ownership: `docs/swarm/blockers.yaml` and `docs/swarm/queue-state.yaml`.
- Current window action and fallback behavior: `src/webdriver/client.ts`, `src/interaction/engine.ts`, `src/mcp/schemas.ts`, `src/mcp/runtime.ts`, and `src/mcp/tools/index.ts`.
- Existing capability composition and exact permission behavior: `src/installer/capabilities.ts` and capability integration fixtures.
- Existing provider alert state/routes: `vendor/tauri-plugin-wdio-webdriver/src/platform/alert_state.rs`, `vendor/tauri-plugin-wdio-webdriver/src/server/handlers/alert.rs`, and provider endpoint allowlists.

## Findings and Routing

| ID | Severity | Finding | Route | Resolution or required evidence |
| --- | --- | --- | --- | --- |
| DR-014-001 | P1 public-contract gate | RDM-014 must consume the canonical public surface-operation shape. | Resolved by applied DEC-003; no local blocker remains. | Additive dedicated discovery and selection operations preserve existing calls; requirements, plan, map, and package cite the canonical answer. |
| DR-014-002 | P1 public-vocabulary gate | Window/dialog outcomes must consume the canonical RDM-013 capability vocabulary. | Resolved by applied DEC-004; no local blocker remains. | Use `supported`, `unsupported`, `unavailable`, `denied`, and `failed` with stable codes and bounded sanitized evidence; no competing enum/error vocabulary. |
| DR-014-003 | P1 provider/security gate | The vendored WebDriver alert API proves browser-alert plumbing, not that a Tauri dialog plugin can expose bounded metadata and a decision postcondition. | Required provider-feasibility and security verification before RU2 execution. | Plan requires a supported provider fixture for dialog source, finite metadata, authenticated accept/cancel, postcondition, unsupported result, and no arbitrary fallback. |
| DR-014-004 | P1 authorization note | The grant's approved shape is inherited, but its public transport and private storage/consumption seam must be specified without exposing authority material. | Required implementation/security verification; do not resolve in this artifact run. | Package binds grant to launch/session/process/nonce/surface/generation/action/dialog instance, consumes once, keeps it private, and requires redaction/replay tests. Parent must broker any public transport choice. |
| DR-014-005 | P2 compatibility note | Initial dimensions are a new additive input if exposed; its field shape follows the applied additive public contract. | Verification requirement within U32; no planning blocker. | Requirements preserve absent-input behavior. Plan reuses existing dimension bounds and requires additive schema/compatibility tests. |
| DR-014-006 | P2 generation note | Dialog-instance and generation binding must align with RDM-018's accepted uncertainty/stale-reference matrix. | Downstream verification input; no current rewrite needed. | U33 binds to current generation and keeps failed/uncertain actions pending with no automatic decision; RDM-018 consumes the effect without treating grant consumption as reference freshness. |

No open finding requires another artifact rewrite before parent handoff. DR-014-001 and DR-014-002 are closed by the applied canonical decisions. DR-014-003 through DR-014-006 remain required implementation or downstream verification inputs and must not be silently downgraded.

## Security and Public-Contract Gate Summary

- **Trust boundary:** local `stdio` MCP to one owned runtime/session to an authenticated loopback provider; no network service, wildcard binding, or OS input is introduced.
- **Authorization:** Tauri application capability and the approved random launch-scoped allowed-action grant are independent requirements. Missing or mismatched grant fails closed. No timeout or sequence convenience decides a dialog.
- **Ownership:** process identity, launch nonce, provider session, active surface, generation, and dialog instance are checked before a decision. RDM-014 never repairs or terminates unowned resources.
- **Disclosure:** window and dialog records are bounded sanitized summaries. Grant material, nonce, private provider IDs, paths, raw causes, raw URLs, and unsanitized application content remain outside MCP and default evidence.
- **Provider truth:** browser-alert endpoints are not treated as Tauri-dialog support without fixture evidence. Unsupported or unavailable providers remain non-actionable.
- **Compatibility:** existing static window input, no-surface behavior, exact references, capability composition, and one-session lifecycle remain protected; any new public field uses the applied additive contract.

## Mechanical Verification

```text
python <compound-master-skill-dir>/scripts/check_work_package.py docs/work-packages/RDM-014-native-control/2026-08-21-014-native-control-work-package.md
```

Result: `work package review-unit checks passed`.

`git diff --check` on the owned artifact paths produced no whitespace errors. A generated-fixture warning from the checker was resolved in RU1 by documenting that generated capability fixtures are mechanical permission-composition evidence kept with the review unit.

Product tests were intentionally not run. This is `mode:artifacts`, and the delegated scope forbids product-code, product-test, configuration, and generated-output edits. Future implementation must run the literal focused commands in the work package and the parent-owned aggregate gate.

## Review Handoff

- **Artifact status:** package-ready for Seneschal reconciliation; DEC-003/004 are applied and provider feasibility is recorded as an implementation verification requirement.
- **Implementation status:** U32/U33 execution is ready under the applied public contract. The provider fixture must determine supported versus unsupported dialog action truth before claiming support.
- **Security status:** design gate acceptable with required implementation tests; formal implementation security review remains pending.
- **No sibling/shared files were modified.** No Jira lookup or mutation, commit, branch operation, PR, reviewer request, merge, release, or product test action was performed.
