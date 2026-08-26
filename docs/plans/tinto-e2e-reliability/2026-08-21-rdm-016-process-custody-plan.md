---
title: RDM-016 process custody and orphan recovery implementation plan
artifact_contract: ce-plan/v1
artifact_readiness: implementation-ready
status: plan-review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-016
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-requirements.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-016-process-custody
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-016-process-custody/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
units: [U32, U33, U34]
open_decisions: []
---

# RDM-016 process custody and orphan recovery implementation plan

## Outcome

Make one Pumarejo launch a recoverable owned session rather than an in-memory
best effort: a durable lease records the exact launch identity, the platform
enforcement mechanism contains its descendants, every destructive action
revalidates ownership, and a later startup can repair only a proven orphan.
Close, cancellation, timeout, and transport loss converge idempotently or
retain a truthful retryable residue. All custody observations reach the
accepted RDM-015 adapter only after bounded sanitization.

The plan is implementation-ready for internal custody and deterministic
platform tests. Public diagnostics composition remains downstream of the
RDM-015 adapter and consumes the canonical DEC-2026-08-21-004 states and
stable codes; this plan names neither a new public operation nor a local
capability vocabulary.

## Constraints and inherited contracts

- Preserve the local `stdio` transport, one owned application session, and
  RDM-010 launch phases/status/cleanup labels. Add internal custody state only
  where existing runtime seams require it.
- Reuse the existing exact launch command hash, PID/start-time inspection,
  session nonce, provider-owner checks, endpoint authorization, and
  `CleanupStack`; strengthen them behind an internal custody boundary rather
  than making a second identity model.
- Store the launch lease under the existing project-local `.pumarejo/sessions`
  ownership root using atomic, owner-only writes. It is a narrow recovery
  record, not a retained diagnostic/artifact payload and not an RDM-021
  retention input.
- Treat PID, start time, command identity hash, and launch nonce as one
  conjunctive proof. Revalidate immediately before and after every
  termination, group escalation, listener release, and lease finalization.
- Prefer a Windows Job Object with kill-on-close semantics when the host proves
  native creation/configuration/assignment. Use the existing validated tree
  fallback only when the Job Object capability is explicitly unavailable, and
  expose the limitation only through bounded RDM-015 evidence.
- Keep POSIX process-group/session ownership explicit. TERM is followed by a
  bounded wait and identity/group revalidation before any KILL escalation.
  Loss of proof preserves residue rather than broadening the kill target.
- RDM-015 owns sanitize-before-store, ring buffers, query limits, and public
  adapter/schema. DEC-004 is canonical with the exact supported,
  unsupported, unavailable, denied, and failed states plus stable codes;
  RDM-016 emits only the adapter's accepted bounded envelope and never adds a
  local state or synonym.
- RDM-021 owns artifact/discovery/retention cleanup; RDM-016 owns only the
  process/listener custody proof needed by its consumers. Do not add generic
  filesystem deletion or retention policy.
- Production posture is `unknown`; future behavior must be additive and
  compatibility-preserving, with Windows/Linux evidence before release.

## Plan units

| Unit | Scope and deliverable | Dependencies | Primary surfaces | Focused proof |
| --- | --- | --- | --- | --- |
| U32 | Durable lease record, exact identity/nonce proof, atomic state transitions, and a narrow custody adapter interface. | RDM-010 lifecycle; existing process/session identity; RDM-015 adapter contract for evidence shape. | `src/session/process-lease.ts`, new `src/session/custody-lease.ts`, `src/session/manager.ts`, `src/platform/types.ts`, `src/artifacts/permissions.ts` only where reused; unit/integration fixtures. | Pure lease/schema/identity tests prove bounded fields, owner-only/atomic persistence, PID reuse refusal, nonce/command/start-time races, and idempotent state transitions. |
| U33 | Platform enforcement: Windows Job Object ownership plus truthful validated-tree fallback; POSIX process-group/session identity and TERM→KILL escalation. | U32; existing tracked-process adapter and Windows/Linux native seams; no public decision for internal behavior. | `src/platform/tracked-process.ts`, `src/platform/windows/process.ts` and a narrow Job Object seam, `src/platform/linux/process.ts`, `src/platform/types.ts`; unit/platform fixtures. | Scripted native adapters prove Job Object create/configure/assign/close, fallback degradation, group/session identity, grace bounds, KILL refusal on proof loss, and no replacement kill. |
| U34 | Startup orphan scan/repair, idempotent close/cancel/transport cleanup, owned listener convergence, and bounded sanitized RDM-015 evidence. | U32/U33; RDM-015 accepted adapter; RDM-010 cleanup/status; RDM-021 ownership consumer; DEC-004 for any later public projection. | `src/session/manager.ts`, `src/session/cleanup.ts`, `src/session/endpoint.ts`, `src/mcp/server.ts`, narrow evidence adapter seam, integration/platform fixtures. | Fake clock and process/port adapters prove crash recovery, active-vs-orphan discrimination, malformed/foreign preservation, bounded retries, postcondition checks, sanitized evidence, and repeated cleanup. |

## Key technical decisions

### KTD-016-1 — Lease identity is a conjunctive proof

The durable record stores the exact launch identity needed for revalidation:
opaque launch ID, process PID, process start time, command identity hash,
launch/session nonce, controller identity, provider/proxy ownership facts, and
the platform ownership mechanism. Raw command lines, full paths, and identity
values are internal only. A command hash is the existing `launchCommandHash`
of the exact non-shell argv and is not a substitute for checking start time or
nonce.

At each destructive boundary, the adapter obtains a fresh inspection and
requires all applicable tuple, ancestry/group/session/job, nonce, and listener
facts. A missing fact is not treated as a match. A postcondition inspection is
required before the lease can move to closed and be removed.

### KTD-016-2 — Lease transitions are crash-resumable and idempotent

Lease state is an internal monotonic state machine: `active` → `closing` or
`recovering` → `closed`, with a bounded `retryable` state when proof or a
postcondition fails. State writes use a temporary owner-only file plus atomic
rename, with bounded record bytes and no raw causes. A startup scan treats an
unfinished state as resumable only after the same ownership proof; it never
assumes that a `closing` marker authorizes termination.

Cleanup is single-flight per session. Repeated calls reuse the in-flight
operation or re-read the lease. Already-exited owned children, already-closed
proxies, and already-released listeners are successful no-ops; a foreign
listener or replacement process is not a no-op and keeps the lease.

### KTD-016-3 — Platform enforcement is capability-probed and truthful

On Windows, create and configure a Job Object before publishing the launch as
owned, assign the root child, and keep the handle in the runtime. Kill-on-close
is the preferred crash boundary. A host that cannot provide the native Job
Object operation may use the existing identity-checked tree terminator, but
the lease records the degraded mechanism and cleanup reports only what was
proven. If ancestry or descendant completeness cannot be established, the
fallback stops and leaves retryable residue.

On POSIX, spawn as a distinct process-group/session owner and record the group
and session identity internally. Send TERM to the owned group, wait a bounded
grace period, then revalidate root identity, group/session membership, and
nonce before sending KILL. Never send a broad `kill(-pid)` after the root has
been replaced or ownership has become ambiguous.

### KTD-016-4 — Recovery is local, bounded, and ownership-first

Startup scans only the known lease root, in stable lexical launch order, with
finite lease count, bytes, and wall time. It checks controller liveness first:
live controller leases are not touched. For a dead controller, it validates
the child tuple, nonce proof, ancestry/group/job identity, and provider/proxy
listener ownership before attempting repair. A malformed, foreign, linked,
replaced, or unprovable lease is retained with a bounded sanitized evidence
record and does not block unrelated safe startup work beyond the budget.

### KTD-016-5 — Evidence is an adapter, not a public contract

Custody producers normalize only allowlisted mechanism, platform, phase,
stable existing error facts, duration buckets, resource counts/presence,
retryability, and recovery guidance into the RDM-015 accepted internal adapter.
Sanitization and size checks happen before buffer insertion. The producer never
passes PID, start time, command text, raw nonce, full path, raw process output,
provider port identity, ancestry rows, or error causes. Public operation and
capability fields use the canonical DEC-004 states only through RDM-015.

## High-level design

```text
launch request
    |
    v
identity + owner-only lease (active)
    |
    +--> Windows: Job Object (preferred) / validated-tree fallback
    |
    +--> POSIX: owned process group/session
    |
    v
RDM-010 lifecycle + CleanupStack
    |
    +--> close/cancel/timeout/transport loss
    |       revalidate -> terminate -> wait -> revalidate listeners
    |       -> closed lease OR retryable lease/evidence
    |
next MCP startup
    |
    +--> bounded lease scan -> controller liveness -> ownership proof
            -> orphan repair -> postconditions -> remove lease or retain
    |
sanitized custody adapter --> accepted RDM-015 bounded sink/query boundary
```

The lease root and session files are checked for canonical containment and
regular-file identity before read/write/rename. Lease payloads have finite
field lengths and no arbitrary extension keys. A lock/owner marker prevents a
live controller and startup repair from acting on the same lease; a stale
marker is evidence to inspect, not permission to kill.

## Detailed design by unit

### U32 — durable lease and identity proof

1. Define an internal lease schema with a version, opaque launch ID, controller
   identity, child identity tuple, listener ownership facts, ownership
   mechanism, lifecycle state, and bounded timestamps. Keep the session nonce
   only in the owner-only internal lease if required to prove ownership; never
   serialize it through diagnostics or MCP.
2. Add pure encode/decode/validate functions that reject unknown or oversized
   fields, invalid numeric ranges, path/link ambiguity, malformed state, and
   mismatched launch IDs. Use stable deterministic field order and atomic
   temporary-file replacement with owner-only permissions.
3. Replace ad hoc process-lease termination checks with a shared revalidation
   function that combines the existing `processIdentityMatches` tuple with
   nonce, ancestry/group/session/job, and provider/proxy ownership as supplied
   by the platform adapter. The function returns an internal proof result,
   never raw inspection output.
4. Add transition helpers that make `active`, `closing`, `recovering`,
   `retryable`, and `closed` changes idempotent and crash-resumable. Remove a
   lease only after postconditions are verified; preserve it on any uncertain
   or foreign state.

### U33 — platform enforcement

1. Extend the `ProcessAdapter` seam with internal custody operations rather
   than adding a public MCP port. The adapter must expose mechanism capability,
   group/job identity, bounded inspection, and terminate/escalate operations.
2. Windows: probe Job Object availability, create/configure before child
   assignment, assign the root child, and close the handle on converged cleanup
   or controller teardown. Keep the existing CIM identity/ancestry checks as
   an independent proof. If native capability is absent, use the existing
   validated tree terminator only under the explicit fallback path and record
   the degraded outcome through RDM-015.
3. POSIX: preserve non-shell detached launch while making group/session
   ownership observable. Record group/session IDs internally, send TERM to the
   exact group, wait using an injectable clock, then revalidate before KILL.
   Refuse escalation when the root start time, command hash, nonce, group, or
   session differs.
4. Keep all native command/API output local. Existing Windows PowerShell/CIM
   and Linux `/proc`/`ss` adapters may return typed internal results, but no
   raw command text, full path, PID, or ancestry table crosses RDM-015.

### U34 — recovery, convergence, and evidence

1. Add a startup recovery coordinator invoked before accepting a new launch.
   Scan only the lease root with finite count/bytes/time, skip links and
   non-regular lease files, sort by opaque launch ID, and leave a live
   controller untouched.
2. For a dead controller, mark the lease recovering atomically, rerun the full
   child/nonce/ancestry/mechanism/listener proof, then call the same cleanup
   primitive as normal close. Repair is bounded per lease and globally; a
   failed postcondition keeps `retryable` state for a later startup.
3. Integrate the single-flight cleanup with launch cancellation, client
   timeout, MCP `SIGINT`/`SIGTERM`, transport close, and existing `CleanupStack`
   order. Preserve RDM-010 public states and existing error compatibility.
4. Recheck provider/proxy listeners after process termination and before lease
   removal. A listener owned by another process is retained and never killed;
   an owned listener that disappears is a successful postcondition.
5. Adapt custody events to RDM-015 after sanitization. Add no public tool or
   capability state before DEC-004. Events after ownership loss are dropped or
   represented by a bounded ownership failure, never attributed to a later
   session.
6. Add deterministic unit, integration, and structural platform fixtures for
   every acceptance example, including repeated cleanup and startup repair.

## Dependency and execution waves

1. **Wave 0 — adapter gate:** confirm RDM-010 lifecycle seams and the reviewed
   RDM-015 custody-evidence adapter. Confirm the canonical DEC-004 states and
   stable codes are consumed through that adapter without local synonyms. If
   RDM-015's adapter contract is not accepted, U34 evidence integration is
   blocked; U32/U33 pure proof work may remain local.
2. **Wave 1 — RU1/U32-U33:** implement the internal lease/identity boundary
   and platform enforcement with fake native adapters. No public MCP/schema
   edits. Review this slice as one safety boundary because lease proof and
   enforcement cannot be independently trusted when split across stacked PRs.
3. **Wave 2 — RU2/U34:** integrate bounded orphan recovery, idempotent cleanup,
   listener postconditions, and sanitized evidence. It depends on RU1 and the
   accepted RDM-015 adapter; any public capability mapping uses only the
   canonical DEC-004 states and stable codes.
4. **Wave 3 — parent aggregate:** Seneschal reconciles RDM-015/RDM-017/
   RDM-019/RDM-021 consumers, runs Windows/Linux and aggregate commands, and
   checks that no sibling changes were overwritten. This child never invokes
   release or Jira.

## Verification contract

Future execution must run the narrowest affected tests first, then the natural
suite and parent-owned platform/aggregate gates:

```text
pnpm exec vitest run tests/unit/process-lease.test.ts tests/unit/process-custody.test.ts
pnpm exec vitest run tests/unit/tracked-process.test.ts tests/unit/session-manager.test.ts tests/unit/windows-process.test.ts
pnpm exec vitest run tests/integration/session-cleanup.test.ts tests/integration/mcp-runtime-fixture.test.ts
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:platform:structural
pnpm test:platform:windows
pnpm test:platform:linux
```

The first command names future focused files and is expected to be skipped
until implementation creates them. Platform commands are host-gated and must
record a concrete skip reason. Parent owns the CI-equivalent aggregate build,
typecheck, lint, format, full test, and pack checks.

Surface-aware evidence required before review-passed:

- custody/identity: tuple, nonce, ancestry, listener and postcondition proof;
- Windows: Job Object preferred path and explicitly degraded fallback;
- POSIX: group/session ownership and TERM/KILL race behavior;
- persistence: bounded owner-only lease writes, link/replace refusal, and
  crash-resumable transitions;
- cleanup: close/cancel/timeout/signal idempotence and bounded orphan repair;
- observability: sanitize-before-store RDM-015 adapter evidence with no raw
  identity/path/nonce/cause disclosure; and
- compatibility: existing RDM-010 statuses/errors and no public DEC-004 drift.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| PID reuse or command replacement causes an unrelated process kill. | Require PID, start time, command hash, nonce, and applicable ancestry/mechanism proof at every destructive boundary; refuse on any mismatch. |
| Job Object or process-group proof is mistaken for complete ownership. | Keep mechanism evidence separate from identity proof; revalidate before and after action; retain residue when descendant completeness is unknown. |
| Startup repair races a live controller. | Persist controller identity, use an atomic recovery transition/owner marker, and skip leases whose controller still matches. |
| Malformed/link lease state creates a filesystem escape. | Canonical root/regular-file/link checks, bounded parsing, owner-only permissions, and atomic writes; no traversal or generic cleanup. |
| Custody evidence leaks secrets or new public vocabulary. | Sanitize before adapter insertion; whitelist bounded safe facts; keep RDM-015 and DEC-004 as the only public-boundary authorities. |
| Shared runtime/session files overlap siblings. | Seneschal serializes implementation ownership; this package documents paths and consumers but does not mutate sibling surfaces in artifact mode. |

## Definition of done

- Every CUST-016 requirement has a mapped unit and deterministic acceptance
  fixture, including Windows fallback and POSIX escalation refusal.
- Lease creation, revalidation, cleanup, recovery, and postcondition checks
  are implemented behind existing internal runtime seams with no public
  operation/schema/vocabulary invention.
- RDM-015 adapter evidence is sanitized and bounded before storage; DEC-004
  remains a parent dependency for any public state projection.
- Focused unit/integration/platform tests and natural suites pass, or each
  host-only gap is named with a CI owner and command. Parent aggregate evidence
  covers cross-item consumers before release readiness.
- No abandoned experimental custody path, unsafe fallback, raw identity dump,
  or dead lease fixture remains in the implementation diff.
- Formal code/security review, parent reconciliation, and release handoff are
  still required; artifact generation alone is not release approval.


