---
title: RDM-019 complete Tinto end-to-end certification requirements
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: inherited-initiative
status: review-passed
date: 2026-08-24
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-019
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-019-certification
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-019-certification/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: []
---

# RDM-019 complete Tinto end-to-end certification requirements

## Goal Capsule

- **Objective:** Prove one complete, truthful Tinto desktop journey through
  Pumarejo's public MCP boundary, including dynamic nested-surface discovery,
  composer/send/access-mode interaction, explicit native-dialog authorization,
  effective window control, bounded diagnostics, forced client failure, and
  ownership-safe cleanup on Windows and Linux.
- **Authority:** The inherited initiative contract controls one local `stdio`
  client session, one owned application session with multiple surfaces,
  generation-scoped references, explicit dialog grants, bounded output,
  sanitize-before-store, and truthful provider outcomes.
- **Execution profile:** This artifact packet defines a future certification
  harness and evidence suite. The current nested run writes documentation only;
  it does not edit product code, tests, fixtures, configuration, Jira, Git, or
  release state.
- **Stop conditions:** Stop a claim when the Tinto checkout, toolchain,
  provider, dialog capability, surface enumeration, ownership proof, or
  evidence sanitizer cannot be verified. Record a typed provider/platform
  skip or blocked prerequisite; never replace the Tinto journey with mocked
  ports, a generic fixture, screenshots, OCR, coordinates, or arbitrary native
  automation.

## Product Contract

### Problem Frame

`tests/contract/real-usage-journey.test.ts` drives mocked domain ports and the
existing live fixture proves generic W3C behavior, but neither proves that the
public MCP surface can drive the real Tinto application from setup through
cleanup. The missing proof includes the archived-conversation journey, a
dynamic nested surface, composer and Send references, access-mode dialog
authorization, seeded diagnostic redaction, forced timeout/disconnect cleanup,
and residue evidence on both supported host families. RDM-019 closes that
evidence gap without broadening the product identity into generic desktop
automation.

### Actors

- **Certification operator:** supplies a pinned Tinto checkout/profile and
  starts the bounded public-MCP run.
- **Certification harness:** prepares an isolated disposable Tinto copy,
  verifies the launch contract, drives one owned session, and emits a
  sanitized manifest.
- **Pumarejo public MCP client:** performs initialization/status, launch,
  surface discovery/selection, observation, interaction, window/dialog,
  diagnostics, and close operations using the accepted public contracts.
- **Tinto application/provider:** supplies the real windows/WebViews, nested
  panels, composer, Send control, access selector, and supported dialog bridge.
- **Security/platform reviewer:** checks authorization, ownership, redaction,
  platform evidence, and truthful skips before certification is accepted.

### Journey Contract

The suite must execute these phases in order and retain a bounded phase result:

1. **Prepare:** resolve a pinned Tinto checkout and lockfile, create a
   disposable canonical copy, validate link/reparse safety, and verify the
   Pumarejo/Tinto launch profile without mutating the operator's checkout.
2. **Initialize and configure:** use the existing supported project
   initialization/configuration contract against the disposable copy, record
   an attributable configuration manifest, and verify the effective provider,
   capabilities, toolchain, and display/profile inputs before launching.
3. **Launch one owned session:** connect an independent MCP client over local
   `stdio`, launch exactly one Tinto application session, wait through the
   bounded lifecycle/status path, and bind every later operation to the
   session, process lease, provider nonce, and current generation.
4. **Discover and select:** enumerate the launch-time surface graph, select
   the Tinto surface containing the archived conversation, then detect and
   select any newly created supported nested window/WebView/panel. Record
   parentage, labels, dimensions, capability states, and coverage gaps; do
   not infer an unsupported surface from a screenshot.
5. **Use the real composer:** obtain fresh current-generation references for
   the archived conversation, composer, Send control, and access selector;
   focus the composer, type a fixed fixture-safe message through the public
   action contract, send it, and verify the resulting semantic mutation and
   fresh snapshot. No selector, coordinate, arbitrary script, or stale ref is
   allowed.
6. **Control the window:** request the bounded initial dimensions and at least
   one supported resize/maximize/restore action. Verify each effective
   postcondition and retain the provider outcome. If a provider cannot prove
   an action, record `unsupported`, `unavailable`, `denied`, or `failed`
   according to the canonical vocabulary and do not call it a pass.
7. **Authorize access-mode change:** open the access selector, observe the
   supported Tauri dialog through the explicit provider boundary, and first
   attempt a decision without the allowed-action grant. Prove denial and that
   the dialog remains unresolved. Then issue a fresh launch-scoped grant for
   exactly one allowed action, perform the requested accept or cancel, verify
   the dialog postcondition, and prove the grant cannot be replayed or reused
   for another dialog/session/surface.
8. **Inspect bounded diagnostics:** query the accepted read-only diagnostics
   surface for launch phases, invocation outcome, console/process evidence,
   and last failure where supported. The harness seeds a non-production corpus
   containing credential-like strings, tokens, sensitive paths, marked
   application content, provider identifiers, and nested causes; retained
   output must prove those values were removed before storage/serialization.
9. **Force a client failure:** run the real Tinto session with a deterministic
   fixture-controlled delay or provider wait that exceeds the client deadline,
   then simulate client timeout or transport disconnect. The test must
   recover with the same ownership contract, report the failed phase and
   retryability, leave unrelated processes untouched, and converge to zero
   owned descendants/listeners or an exact bounded retryable residue.
10. **Close and audit:** close idempotently through the public boundary, verify
    no owned process, process group/Job Object, listener, runtime directory,
    or disposable copy remains beyond the declared retention policy, and
    publish only sanitized evidence with a complete manifest.

### Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| CERT-001 | The certification uses the real Tinto application and public MCP contract. | A pinned Tinto checkout and independent MCP client drive the journey; no mocked domain ports, in-memory fake provider, generic fixture, screenshot-only assertion, or arbitrary desktop automation is used. |
| CERT-002 | Setup is deterministic and isolated. | A disposable canonical Tinto copy, lockfile/toolchain fingerprint, launch profile, fixed inputs, provider mode, display mode, and evidence root are recorded without mutating the operator checkout. |
| CERT-003 | One owned session spans initialization, launch, dynamic surfaces, interaction, diagnostics, failure, and cleanup. | Session/process/nonce/generation ownership remains bound throughout; a second application session is rejected. |
| CERT-004 | Dynamic nested surfaces are discovered and selected explicitly. | The archived conversation and any newly created supported nested window/WebView/panel appear with parentage and current-generation actionable refs; unsupported coverage is named rather than invented. |
| CERT-005 | The composer journey is semantically actionable. | Fresh refs for composer, Send, and access selector are obtained; bounded typing and Send produce the expected semantic mutation and fresh post-action snapshot. |
| CERT-006 | Window behavior is evidence-backed. | Initial dimensions and supported resize/maximize/restore actions report verified effective postconditions; provider gaps are typed truthful skips/outcomes, never success by assumption. |
| CERT-007 | Native dialog decisions require explicit authorization. | An unauthorized accept/cancel is denied with no choice made; an exact one-shot launch-scoped grant authorizes one decision, verifies the postcondition, and fails closed on replay or scope mismatch. |
| CERT-008 | Diagnostics are bounded and sanitized before retention. | Seeded secrets, credentials, paths, sensitive content, provider IDs, arguments, and causes are absent from memory exports, MCP output, and retained artifacts while phase/code/retry/recovery evidence remains useful. |
| CERT-009 | Client timeout and transport loss are real failure paths. | A real Tinto action exceeds a bounded client deadline or disconnects; the session reports the failed phase, converges cleanup safely, and leaves unrelated processes/listeners intact. |
| CERT-010 | Lifecycle cleanup is proved on both host families. | Windows and Linux evidence verifies zero owned descendants, owned ports/listeners, process groups/Job Objects, and runtime residue after normal close, timeout, and disconnect, or names exact retryable residue with ownership proof. |
| CERT-011 | Provider/platform gaps are truthful and auditable. | Every skipped capability or host gate includes a stable reason, prerequisite, observed provider/platform identity, and consequence; a skip never increments the pass count or produces an overall-complete claim. |
| CERT-012 | Retained evidence is bounded and safe. | Explicit opt-in writes sanitized JSON/manifest records under the protected artifact root with count/byte limits, no implicit deletion, and no raw Tinto transcript, environment, path, nonce, credential, or unredacted screenshot. |
| CERT-013 | Regression compatibility remains visible. | Existing public tools, exact-reference/generation behavior, capability composition, rustfmt compatibility, and package validation remain covered by the root aggregate gates after certification evidence is added. |

### Acceptance Examples

- **AE1 — Real setup:** Given a pinned Tinto project and valid toolchain, the
  harness creates an isolated copy, applies only the supported attributable
  configuration, and launches the actual app through one owned session.
- **AE2 — Surface discovery:** Given a conversation that creates a supported
  nested panel, the graph reports its parent, label, dimensions, and
  capability state; a provider that cannot enumerate it yields a coverage gap
  and a provider-gated result, not a fabricated node.
- **AE3 — Composer and Send:** Given an archived conversation, the current
  semantic snapshot returns fresh refs for the composer and Send control;
  bounded type/send changes the conversation and returns new refs.
- **AE4 — Dialog denial then grant:** Given an access-mode dialog, a decision
  without the exact grant is denied while the dialog remains open; a fresh
  authorized one-shot grant resolves only the named action and cannot be
  replayed.
- **AE5 — Sanitized diagnostics:** Given seeded token/path/content strings in
  real Tinto/provider output, diagnostic evidence preserves phase and stable
  error facts but contains none of the seeded values at any retained boundary.
- **AE6 — Timeout/disconnect cleanup:** Given a real delayed Tinto operation,
  the client deadline or transport loss produces bounded failure evidence and
  leaves no owned descendant or listener after convergence; an unrelated
  sibling process remains running.
- **AE7 — Platform truth:** Given Windows and Linux provider runs, each emits
  a platform evidence record. An unavailable provider/toolchain/display emits
  a named skip and the overall report remains incomplete until the required
  gate is satisfied.

### Success Criteria

1. One real Tinto public-MCP run completes setup, launch, dynamic surface
   selection, archived-conversation composer/Send interaction, access-mode
   authorization, window verification, diagnostics, close, and residue audit.
2. Unauthorized native decisions, stale references, wrong-session evidence,
   and unsupported provider capabilities fail closed.
3. Forced timeout/disconnect evidence identifies the failed phase and proves
   ownership-safe convergence without affecting an unrelated process.
4. Windows and Linux evidence is reproducible from deterministic setup and
   either passes or records an exact non-pass skip; no provider-gated skip is
   silently normalized to success.
5. Retained artifacts are sanitized, bounded, permission-protected, and
   attributable to the run without exposing authority material or local paths.

### Invariants

- The journey uses one owned Tinto application session and one local public MCP
  client; nested surfaces do not authorize additional app sessions.
- Every interaction uses an exact current-generation reference or the approved
  capability-gated dialog bridge; visual evidence never authorizes action.
- Native dialog acceptance/cancellation is never implicit, timeout-driven, or
  replayable.
- Provider and platform uncertainty yields a typed bounded outcome/skip and
  cannot become a pass by fallback.
- Sanitization happens before in-memory storage and before any retained
  artifact is created; artifacts never carry raw secrets, paths, env/PATH,
  nonces, PIDs, provider handles, arguments, or causes.
- Cleanup terminates or repairs only revalidated owned resources and leaves an
  unrelated process/listener untouched.
- Retained artifacts are opt-in and bounded; absent explicit policy, no
  retained data is deleted implicitly.

## Scope Boundaries

### Included

- A deterministic Tinto certification harness and disposable setup contract.
- Public-MCP success journey through real Tinto surfaces and controls.
- Explicit dynamic-surface discovery/selection, window postconditions, native
  dialog denial/authorization, bounded diagnostics, timeout/disconnect, and
  cleanup evidence.
- Windows/Linux evidence collection, provider/platform skip reporting, and
  sanitized retained artifact manifest.
- Focused certification integration/contract/platform test plans and exact
  verification commands for a future implementation wave.

### Deferred to Follow-Up Work

- Product implementation of RDM-013 through RDM-018 contracts; this item
  consumes their accepted outputs and does not redefine them.
- RDM-020 attributed drift, RDM-021 network/discovery/retention policy, and
  RDM-022 self-doctor implementation; certification may consume their accepted
  diagnostics but does not own their code or policy.
- RDM-023 final release matrix and aggregate certification after all Phase 2
  hardening items reconcile.

### Outside this product's identity

- Mocked domain ports or fake providers as evidence of Tinto behavior.
- Generic desktop automation, coordinates, OCR, image matching, arbitrary
  JavaScript, selectors/XPath, shell/OS passthrough, or a second app session.
- Mutating a user's Tinto checkout, writing unbounded raw logs, retaining raw
  screenshots/transcripts, or deleting retained artifacts implicitly.

## Dependencies and Prerequisites

| Dependency | Required state | Certification use |
| --- | --- | --- |
| RDM-013 surface graph | Accepted discovery/selection and coverage contract | Enumerate/select dynamic windows, WebViews, iframes, panels, and gap truth. |
| RDM-014 native control | Accepted effective window outcomes and dialog grant bridge | Window postconditions and authorized/rejected access-mode decision. |
| RDM-015 observability | Accepted sanitize-before-store producers/query/retention boundary | Bounded phase, console/process/invocation/error evidence and seeded redaction. |
| RDM-016 process custody | Accepted lease, Job Object/process-group, disconnect, and residue proof | Normal/timeout/disconnect cleanup and unrelated-process safety. |
| RDM-017 portable runtime | Accepted child environment/toolchain resolver | Deterministic Tinto launch prerequisites and host/child evidence. |
| RDM-018 sequences/refs | Accepted bounded sequence and generation outcome matrix | Atomic composer/send journey, final stabilization, stale/uncertain behavior. |

Required setup inputs are a pinned Tinto revision and lockfile, an isolated
disposable copy, an approved Pumarejo launch profile, resolved toolchain and
provider identities, an explicit display mode on Linux, bounded fixture-safe
message/access-mode values, a seeded diagnostic corpus, and an opt-in
protected evidence root. The harness must fail before launch if any input is
missing, linked/reparse-unsafe, unowned, or not reproducible.

## Platform and Provider Disposition

The implementation must run the same semantic journey on Windows and Linux,
with platform-specific launch/display/custody adapters supplied by RDM-016/017.
The result matrix has separate rows for each host, provider, and capability:

- `passed`: evidence and postcondition satisfy the requirement;
- `skipped`: a named provider/platform prerequisite is unavailable or
  incompatible; include observed identity, stable reason, and exact rerun
  prerequisite;
- `failed`: the prerequisite was present but the behavior or postcondition
  failed; include bounded diagnostics and cleanup result; and
- `blocked`: the contract/dependency was not accepted, so no runtime claim was
  attempted.

Only required platform rows marked `passed` may contribute to an overall
complete certification. A truthful `skipped` row is retained for diagnosis but
cannot be used to claim cross-platform success.

## Sources

- `docs/plans/tinto-e2e-reliability/initiative-requirements.md` (REL-001–REL-016,
  Tinto journey, invariants, explicit dialog grant, and retention policy).
- `docs/product/roadmap.md` (RDM-019 outcome, dependency order, and Wave E).
- `docs/audits/2026-08-21-tinto-gap-audit.md` (missing real Tinto public-MCP,
  dialog-denial, diagnostic-redaction, forced-failure, and residue evidence).
- `tests/platform/public-journey.test.ts` (existing live public-client pattern;
  generic fixture only, not sufficient Tinto evidence).
- `tests/contract/real-usage-journey.test.ts` (existing mocked-port pattern;
  explicitly excluded as certification evidence).
- RDM-013–RDM-018 focused requirements/plans/packages and child states (owned
  upstream contracts and verification boundaries).

## Product Contract Preservation

Product Contract unchanged. This focused artifact adds certification evidence
requirements within the inherited RDM-019 scope and does not alter REL-001–
REL-016, settled decisions, non-goals, authorization rules, or retention
policy.


