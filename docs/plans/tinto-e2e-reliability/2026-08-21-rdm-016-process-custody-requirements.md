---
title: RDM-016 process custody and orphan recovery requirements
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: inherited-initiative
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-016
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-016-process-custody
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-016-process-custody/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: []
---

# RDM-016 process custody and orphan recovery requirements

## Context and inherited authority

The initiative requires one locally owned application session whose process
tree, provider listeners, and proxy are convergent after normal close,
cancellation, client timeout, or transport loss. It also requires a bounded,
ownership-proven repair on the next MCP startup when the previous owner
crashed. RDM-016 is the roadmap item for that custody boundary; it is not a
generic process manager and it must never terminate an unowned or ambiguously
identified process.

The current implementation already carries PID, process start time, an exact
launch command hash, and a session nonce in memory; Linux sends signals to a
detached process group and Windows uses identity-checked `taskkill /T /F`.
The gap audit identifies the missing durable lease, Windows Job Object,
startup orphan recovery, and verified POSIX TERM-to-KILL convergence. This
artifact is planning input only. It authorizes no product-code, test,
configuration, Jira, branch, PR, release, or external mutation in this child.

RDM-015 is an upstream dependency for the accepted sanitized custody-evidence
adapter. DEC-2026-08-21-004 is now canonical: public evidence distinguishes
`supported`, `unsupported`, `unavailable`, `denied`, and `failed` with stable
codes and bounded sanitized evidence. RDM-016 may provide custody facts to the
RDM-015 adapter, but must not add a competing public operation, field, or
capability synonym.

## Scope

RDM-016 defines and implements the following custody behavior:

- a launch-scoped, owner-only durable lease containing bounded process,
  listener, controller, and ownership-mechanism identity;
- exact PID, start-time, command-identity hash, and launch-nonce proof before
  every destructive action, with a second proof after process-tree or port
  discovery where the platform permits it;
- Windows Job Object ownership with a truthful, explicitly degraded validated
  tree fallback when Job Objects are unavailable, and no claim of equivalent
  convergence in the fallback path;
- POSIX process-group/session ownership with bounded TERM grace, identity
  revalidation, and KILL escalation only while the original ownership proof
  remains valid;
- idempotent close, cancellation, timeout, and transport-shutdown cleanup
  that retains a retryable lease until owned processes and listeners are
  actually gone;
- bounded startup discovery and repair of leases whose controller is no
  longer alive, preserving ambiguous or foreign leases without killing them;
  and
- a bounded, sanitized custody evidence producer that feeds the accepted
  RDM-015 adapter without exposing PID, start time, command text, nonce,
  absolute path, raw cause, or provider identifiers.

## Non-goals

- A public MCP cleanup, repair, process, lease, or capability operation, or a
  new public vocabulary for supported/unsupported/denied/failed outcomes.
- Replacing RDM-015's diagnostic sink, query projection, redaction rules, or
  public adapter; RDM-016 only supplies the accepted internal producer input.
- Changing RDM-010's launch phases, status states, or existing error-envelope
  vocabulary; custody transitions are internal evidence and existing status
  integration only.
- Environment reconstruction or toolchain resolution (RDM-017), loopback and
  retained-artifact policy (RDM-021), attributed drift (RDM-020), or final
  Tinto certification (RDM-019).
- A second application session, remote process service, arbitrary shell or
  operating-system passthrough, process enumeration outside the owned lease
  root, or cleanup of a process whose ownership cannot be revalidated.
- Automatic deletion or retention policy for screenshots or diagnostics. A
  custody lease is a narrow recovery record, not an artifact-retention input;
  any broader artifact cleanup remains RDM-021's responsibility.
- Product implementation, product tests, commits, staging, Jira, PRs,
  release, or external mutation during this artifact-only child run.

## Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| CUST-016-001 | Every launched application has one launch-scoped durable lease before ownership can be advertised. | A bounded owner-only lease is atomically created under the existing project-local session root, contains a schema version and opaque launch identity, and a crash leaves enough state for the next startup to inspect without a raw command/path dump. |
| CUST-016-002 | The lease binds the child to an exact process identity and launch nonce. | PID, start time, exact launch command identity hash, and session nonce are checked as one tuple; a PID-reused process, changed command, changed start time, or nonce mismatch is never treated as owned. |
| CUST-016-003 | Destructive actions are revalidated at their boundary. | Close, cancellation, timeout, orphan repair, process-group escalation, Job Object fallback, and listener release all perform a fresh identity/ancestry/nonce check immediately before acting and refuse on uncertainty. |
| CUST-016-004 | Windows uses a Job Object when the host proves that the object can be created, configured, and assigned. | The root process is assigned before it can launch application descendants; closing the owner handle converges descendants; tests prove kill-on-close configuration and assignment failure handling without claiming success when a native operation is unavailable. |
| CUST-016-005 | Windows has a truthful fallback when Job Objects are unavailable. | The fallback uses only validated process identity/ancestry and the existing bounded tree terminator, records the degraded mechanism through RDM-015, and leaves a retryable residue when the full tree cannot be proven; it never silently reports Job Object semantics. |
| CUST-016-006 | POSIX owns a process group/session and escalates termination deterministically. | Spawn establishes a distinct group/session; TERM targets only that owned group; after a bounded grace period, KILL is attempted only if root identity, group/session identity, and nonce proof still match; loss of proof preserves the residue. |
| CUST-016-007 | Cleanup is idempotent and convergent across close paths. | Repeated close, cancellation during launch, client timeout, and transport signal share one serialized cleanup state; an already-exited owned process and an already-closed listener are harmless, while a remaining owned resource keeps the lease retryable. |
| CUST-016-008 | Startup discovers and repairs only orphaned owned leases. | Discovery is bounded, deterministic, link-safe, and scoped to the lease root; a lease whose prior controller is still alive is left alone, while a crashed controller is repaired only after the child tuple, ancestry/group/job, nonce, and owned-listener proofs pass. |
| CUST-016-009 | Repair is safe under crash, race, malformed state, and foreign ownership. | `active`, `closing`, and `recovering` leases resume idempotently; malformed, expired-by-policy-unknown, foreign, replaced, or ambiguous records are preserved and reported as retryable evidence without process termination. |
| CUST-016-010 | Owned listeners and ports are part of the convergence proof. | Provider/proxy ownership is rechecked after termination and before lease finalization; a port held by another process is never killed or declared released, and a lease is not removed while an owned listener or descendant remains. |
| CUST-016-011 | Custody evidence is bounded and sanitized before crossing into RDM-015. | The adapter emits only allowlisted platform/mechanism/phase facts, stable existing error information when proven, bounded counts/durations, retryability, and a recovery suggestion; it omits PID, start time, command text, nonce, paths, raw causes, and provider identifiers. |
| CUST-016-012 | Existing public behavior remains compatible while custody becomes stronger. | Existing launch/status/close results and RDM-010 phases remain valid when the new lease/mechanism is absent; no public operation/schema/vocabulary changes are made before RDM-015 and DEC-004 are canonical. |
| CUST-016-013 | Platform tests are deterministic and disclose host gaps. | Fake clocks, fake process inspectors, fixed identities, and scripted native adapters cover Windows Job Object/fallback, POSIX TERM/KILL, PID reuse, nonce loss, controller crash, orphan repair, port races, and idempotence; unavailable host capabilities are explicit skips, not false passes. |

## Acceptance examples

1. **Normal close:** after a successful launch, the application tree, provider
   listener, proxy, and lease converge to closed; a second close returns the
   existing idle/closed result without another termination attempt.
2. **Client timeout:** cancellation marks cleanup as in progress, closes the
   WebDriver/proxy where possible, terminates only the revalidated owned
   process group or Job Object, and leaves an explicit retryable lease if a
   listener or descendant remains.
3. **Controller crash:** the next MCP startup finds a stale controller lease,
   revalidates the child tuple and ownership mechanism, repairs the process
   and listeners, and removes the lease only after postconditions hold.
4. **PID reuse:** a stale lease points at a new process with the same PID but a
   different start time, command identity, or nonce; recovery refuses to kill
   it and retains bounded diagnostic evidence.
5. **Windows degraded host:** Job Object setup is unavailable; cleanup uses
   the validated-tree fallback, records that limitation through RDM-015, and
   reports retryable residue rather than claiming zero descendants without
   proof.
6. **POSIX escalation race:** TERM is sent to the owned group, the root is
   replaced during grace, and KILL is refused because the proof changed; the
   lease remains for a later bounded repair.

## Security and compatibility invariants

- Only the exact current launch tuple and ownership mechanism authorize
  termination. PID, start time, command identity, and nonce are conjunctive;
  no single field is sufficient.
- Lease files and any raw nonce needed for revalidation stay in an owner-only
  internal boundary. They never enter MCP output, RDM-015 evidence, logs, or
  public schemas. The evidence adapter uses bounded safe projections only.
- A Job Object or process group is an enforcement mechanism, not proof by
  itself. Identity, ancestry/session membership, and listener ownership are
  revalidated before termination and after convergence.
- A failed or uncertain check fails closed. It may preserve a retryable lease
  and residue; it may not kill a replacement process, follow a link, or infer
  ownership from a port alone.
- Cleanup is bounded and single-flight per owned session. Startup repair is
  bounded by lease count, bytes, and wall time so a malformed project cannot
  stall the MCP transport indefinitely.
- RDM-015 remains the sole bounded/sanitized evidence boundary. DEC-004's
  canonical supported/unsupported/unavailable/denied/failed states and stable
  codes are consumed through RDM-015 and are not reinterpreted by RDM-016.
- Existing one-session, local `stdio`, current-generation interaction, and
  RDM-010 lifecycle contracts remain intact; no concurrent independent
  application session is introduced.

## Dependency and ownership boundary

- **Requires:** RDM-010 launch/status/cleanup contract; RDM-015's accepted
  internal custody-evidence adapter and public compatibility boundary;
  existing `src/platform/types.ts`, tracked-process identity, session manager,
  endpoint ownership, and signal-shutdown seams.
- **Public contract dependency:** DEC-2026-08-21-004 is canonical. RDM-016
  supplies only bounded custody facts and uses the exact five accepted states
  and stable codes through RDM-015; it does not create local synonyms or a
  second public projection.
- **Enables:** RDM-019 forced timeout/orphan evidence and RDM-021 loopback
  ownership/readiness checks.
- **Consumers:** RDM-015 consumes sanitized custody events; RDM-021 consumes
  ownership/listener proof and never terminates or repairs; RDM-019 consumes
  final residue evidence.
- **Excluded sibling surfaces:** RDM-015 owns diagnostic sink/query/schema;
  RDM-017 owns environment/toolchain; RDM-020 owns drift/installer markers;
  RDM-021 owns artifact/discovery/retention policy; RDM-022 owns self-doctor;
  RDM-023 owns aggregate certification. Shared runtime/session/platform files
  require Seneschal serialization before implementation.

## Determinism and verification expectations

Future implementation must provide focused evidence for:

- bounded lease schema validation, atomic write/recovery, owner-only
  permissions, deterministic ordering, and malformed/foreign/link fixtures;
- identity tuple and nonce checks, PID reuse, command changes, start-time
  races, ancestry changes, listener ownership changes, and post-action proof;
- Windows Job Object create/configure/assign/close and truthful fallback
  adapters, including native API unavailable/access-denied cases;
- POSIX group/session establishment, TERM grace, KILL escalation, process
  replacement during grace, and group-membership loss;
- close/cancel/timeout/signal idempotence, startup orphan repair, bounded
  retryable residue, and owned port convergence; and
- sanitize-before-store custody events, RDM-015 adapter framing, no raw
  identity/path/nonce disclosure, and public compatibility without DEC-004.

The implementation lane should run the focused unit and integration tests,
the structural platform tests, and the parent-owned Windows/Linux and
aggregate gates recorded in the work package. No product verification runs in
this artifact-only child.


