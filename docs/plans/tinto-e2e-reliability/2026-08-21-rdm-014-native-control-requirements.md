---
title: RDM-014 truthful native control and Tauri dialog requirements
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: inherited-initiative
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-014
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-014-native-control
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-014-native-control/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: []
applied_decisions:
  DEC-2026-08-21-003: additive dedicated discovery and selection operations; existing calls remain backward compatible
  DEC-2026-08-21-004: supported, unsupported, unavailable, denied, and failed states with stable codes and bounded sanitized evidence
decisions_source: docs/plans/tinto-e2e-reliability/initiative-requirements.md#approved-decisions-and-escalation-boundaries
decisions_applied_at: 2026-08-21T12:04:48Z
---

# RDM-014 truthful native control and Tauri dialog requirements

## Goal Capsule

- **Objective:** A single owned Tauri session exposes only window actions that the active provider can execute and verify, and it can detect and explicitly accept or cancel supported Tauri dialogs without implicit native approval.
- **Authority:** The inherited initiative contract is authoritative for one session, process ownership, nonce binding, generation semantics, bounded output, and the approved launch-scoped authorization shape.
- **Execution profile:** Artifact planning only. No product code, tests, fixtures, configuration, generated capability, Jira, branch, PR, or release mutation is authorized by this artifact.
- **Stop conditions:** Stop implementation of a provider-dependent decision action if provider feasibility cannot prove a supported dialog boundary; record the canonical unsupported result and keep the action disabled. Never invent a public shape, use arbitrary operating-system automation, or act on an unowned process.

## Product Contract

### Summary

RDM-014 closes the truthful-control gap identified by the Tinto trial. It keeps the existing WebDriver and Tauri integration boundary, probes effective support in the launch-scoped session, verifies the effective window state after a requested action, and adds a capability-gated native-dialog boundary with explicit test authorization.

### Problem Frame

The current `tauri_window` path is present in the static MCP surface and maps provider failures to `UNSUPPORTED_ACTION`. That result cannot distinguish permission denial, an incompatible provider or plugin, an unimplemented operation, or a failed postcondition. The current integration has no supported Tauri-dialog detection, authorization, or audit evidence path. A visual prompt must not become an implicit approval merely because a test sequence reached it.

### Actors

- **Test operator or coding agent:** requests a bounded window operation or an authorized dialog decision through the public MCP boundary.
- **Pumarejo runtime:** owns the launch session, nonce, process identity, generation, grant state, and sanitized evidence.
- **Tauri provider/plugin:** reports capabilities and performs only supported, authenticated operations for the selected surface.
- **Application maintainer:** grants the Tauri capability in the application integration and accepts the provider support boundary.
- **Security reviewer:** verifies least authority, replay resistance, fail-closed behavior, and disclosure bounds.

### Requirements

#### Effective window control

- R1. The runtime derives window-action availability from a launch-scoped provider capability probe and does not claim support from a static tool declaration alone.
- R2. The launch path accepts an additive bounded initial window-size request when the resolved contract permits it and records the effective dimensions after launch; an absent request preserves current behavior.
- R3. Resize, maximize, and restore report success only after the provider postcondition is observed for the active window and selected surface.
- R4. Window failures preserve distinct internal evidence for permission denial, incompatible provider/plugin, unimplemented operation, and failed postcondition; their public projection uses the canonical RDM-013 vocabulary once DEC-003 and DEC-004 are resolved.
- R5. A provider that cannot execute and verify an action remains non-actionable and is reported as unsupported through the safe fallback; no WebDriver or operating-system passthrough is introduced.

#### Native Tauri dialog boundary

- R6. The runtime detects only supported Tauri dialogs exposed by an authenticated provider bridge and reports a bounded sanitized title, message, finite button set, and owning-surface correlation.
- R7. Accept and cancel require the already approved random launch-scoped grant whose allowed-action set includes the requested decision; a missing, malformed, expired, cross-session, cross-process, wrong-nonce, wrong-surface, or replayed grant fails closed.
- R8. A dialog decision binds to the current dialog instance and current session generation, consumes the permitted action at most once, and never auto-accepts or auto-cancels on timeout, sequence convenience, or provider uncertainty.
- R9. The bridge verifies the provider postcondition that the targeted dialog was resolved and records whether the requested decision was accepted, cancelled, denied, unavailable, unsupported, or failed without exposing provider handles or raw causes.

#### Ownership, evidence, and compatibility

- R10. Grant and dialog state remain bound to the one owned application session, process identity, authenticated provider nonce, active surface, and current generation; state from another launch cannot be reused.
- R11. Window and dialog outcomes produce bounded sanitized default evidence containing only stable outcome data, bounded dimensions or dialog fields, owning-surface correlation, action, duration bucket, retryability, and recovery suggestion; the grant, nonce, private port, raw provider IDs, paths, and unsanitized application content never cross the MCP boundary or default persistence path.
- R12. Existing no-surface behavior, exact current-generation references, one-session ownership, `stdio` transport, and capability composition remain compatible; a provider that cannot prove the new boundary remains truthful rather than receiving a guessed fallback.

### Acceptance Examples

- AE1. **Effective window probe:** Given one owned session and a provider that can read and mutate the selected window, launch records the effective initial dimensions, a resize returns the observed dimensions, and a subsequent snapshot remains scoped to the same session and surface.
- AE2. **Denied window capability:** Given a provider or generated capability missing the required window permission, capability metadata does not claim the action and an attempted call fails closed with bounded denial evidence.
- AE3. **Failed window postcondition:** Given a provider that reports dispatch success but does not reach the requested dimensions before the bounded deadline, the result is a failed postcondition and is not reported as successful support.
- AE4. **Dialog detection without authorization:** Given a supported Tauri dialog, detection returns only bounded sanitized metadata; an accept or cancel request without the allowed-action grant is denied and the dialog remains unresolved.
- AE5. **Authorized one-shot decision:** Given a dialog and a grant bound to the current launch, current surface, and requested action, the decision resolves the dialog and records bounded evidence. Reusing the grant, changing the action, switching the session, or changing the dialog instance fails closed.
- AE6. **Unsupported provider:** Given a provider that cannot expose the supported Tauri dialog boundary or cannot verify a window action, the runtime reports unsupported/unavailable truth and performs no arbitrary native input.

### Success Criteria

1. Tinto window sizing and access-mode confirmation are driven only through a proved provider boundary within one owned session.
2. Unsupported and failed window operations are not advertised or reported as successful, and their bounded evidence identifies the reason category.
3. Native dialog decisions require the approved launch-scoped grant and leave an auditable sanitized session record without leaking authority material.
4. Cross-session, wrong-process, wrong-nonce, wrong-surface, wrong-generation, and replay attempts fail closed.
5. Existing capability composition, no-surface compatibility, exact-reference behavior, and ownership invariants remain protected by focused contract, integration, and platform evidence.

### Invariants

- Only the authenticated provider bridge or exact current-generation WebDriver references may cause state changes.
- Native dialog detection never implies authorization, and no timeout path chooses a button.
- The grant names permitted actions, is random and launch-scoped, is private to the owning session, and is consumed at most once per dialog action.
- Evidence is sanitized before storage or serialization and is bounded by the existing diagnostic and artifact policies.
- Provider uncertainty advances or preserves state only according to the accepted generation contract; it never authorizes a stale or unverified action.

### Scope Boundaries

#### Included

- Effective capability probing and typed internal outcomes for resize, maximize, restore, and initial dimensions.
- Supported Tauri dialog detection, finite sanitized metadata, explicit accept/cancel, grant validation, postcondition verification, and bounded evidence.
- Additive integration with the existing provider, session, interaction, MCP, capability, compatibility, and security seams after the canonical public decisions are available.

#### Deferred to Follow-Up Work

- RDM-018 owns bounded sequences and the complete generation outcome matrix that consumes this window/dialog contract.
- RDM-019 owns the complete public Tinto journey, forced timeout, rejected authorization case, and cross-platform residue proof.
- RDM-015 owns the shared diagnostic sink and public evidence query; RDM-014 supplies bounded producer records without creating a competing observability surface.

#### Outside this product's identity

- Arbitrary operating-system dialogs, menus, screen-coordinate input, OCR, generic desktop automation, shell commands, arbitrary JavaScript, arbitrary WebDriver routes, and implicit approval.

### Dependencies and Applied Decisions

- RDM-013 is the required upstream surface foundation. **DEC-2026-08-21-003** (DEC-003) is resolved as additive dedicated discovery and selection operations; existing snapshot and window calls remain backward compatible.
- **DEC-2026-08-21-004** (DEC-004) is resolved as the `supported`, `unsupported`, `unavailable`, `denied`, and `failed` state matrix with stable codes and bounded sanitized evidence. RDM-014 consumes that vocabulary and defines no competing one.
- Provider feasibility must establish during implementation that the selected Tauri plugin/runtime can expose dialog presence, bounded metadata, and a decision postcondition through the authenticated bridge. If not, the implementation records the canonical unsupported detection result and disables decision actions; this is a verification outcome, not a product-planning blocker.

### Sources

- `docs/plans/tinto-e2e-reliability/initiative-requirements.md` (REL-004, REL-005, security invariants, approved grant shape, and non-goals).
- `docs/product/roadmap.md` (RDM-014 outcome, dependency, and Wave B serialization rule).
- `docs/audits/2026-08-21-tinto-gap-audit.md` (current truthful-window and native-dialog gaps and recommended decomposition).
- `docs/swarm/blockers.yaml` (canonical resolved DEC-003 and DEC-004 records and RDM-014 ownership).
- `src/webdriver/client.ts`, `src/interaction/engine.ts`, `src/mcp/schemas.ts`, `src/mcp/runtime.ts`, `src/installer/capabilities.ts`, and `vendor/tauri-plugin-wdio-webdriver/src/server/handlers/alert.rs` (read-only implementation evidence).
