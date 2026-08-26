---
title: RDM-018 bounded sequences and deterministic reference generations requirements
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
status: review-passed
date: 2026-08-24
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-018
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-018-sequences-refs
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-018-sequences-refs/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: []
---

# RDM-018 bounded sequences and deterministic reference generations

## Context and inherited authority

RDM-018 makes the efficient-interaction contract safe for the one owned
application session. The initiative contract is authoritative for local
`stdio`, one owned session with multiple surfaces, exact opaque
current-generation references, bounded output, explicit native-dialog
authorization, and fail-closed cleanup. This item consumes the accepted
RDM-009 observation/reference contract, the RDM-013 surface graph and
capability matrix, and the RDM-014 effective-control/dialog outcomes. It does
not reopen any of those contracts or provide a second automation boundary.

Continuation pages are evidence only. A continuation payload, partial page, or
stable semantic identifier is never accepted as an action target; an operator
must obtain a separately refreshed actionable snapshot before supplying a ref.
The RDM-013 operation matrix remains exactly `supported`, `unsupported`,
`unavailable`, `denied`, and `failed`, with stable codes and bounded sanitized
evidence.

## Scope

RDM-018 defines and implements, as one serialized interaction boundary:

- a deterministic outcome-to-generation table for every action and snapshot
  refresh path;
- an additive bounded sequence operation over exact current-generation refs;
- finite action-count and wall-clock budgets, with bounded per-step outcomes;
- strict early-stop behavior whenever a step advances or may have advanced the
  generation;
- one final bounded stabilization and fresh actionable snapshot at the end of
  a sequence, with no intermediate snapshot payloads;
- focused typing that proves the exact current target is editable before
  clearing or typing; and
- cancellation, timeout, ownership, surface, disclosure, and compatibility
  evidence for the public boundary.

The sequence operation is additive and does not replace existing click, type,
key, pointer, scroll, select, snapshot, window, or close operations. Native
Tauri dialog decisions and window capability actions remain explicit RDM-014
operations; a sequence cannot implicitly accept, cancel, or authorize a
native dialog.

## Non-goals

- selector, XPath, CSS, text-search, role-search, coordinate, OCR, arbitrary
  JavaScript, shell, WebDriver, Tauri-command, or operating-system input
  passthrough;
- using stable semantic identifiers, continuation evidence, or geometry as
  action authority;
- automatic ref rebinding, implicit retries, stale-ref recovery by lookup, or
  continuing a sequence after its ref generation changes;
- unbounded action lists, waits, text, result arrays, provider output, or
  snapshot payloads;
- implicit native dialog authorization or sequence-owned dialog grants;
- changes to RDM-009 continuation/redaction rules, RDM-013 surface discovery
  and capability vocabulary, RDM-014 provider/dialog authorization, process
  custody, diagnostics retention, or Tinto certification;
- Jira, commits, branches, PRs, reviewer requests, release, product code,
  product tests, configuration, or sibling/shared state in this artifact run.

## Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| SEQ-001 | An additive sequence operation accepts a strict finite list of exact-ref actions and wait steps. | The schema rejects unknown fields, empty refs, continuation/stable IDs, selectors, unsupported action kinds, and over-budget lists before dispatch. Existing tools remain compatible. |
| SEQ-002 | Sequence count and wall-clock budgets are enforced before and during execution. | `maxSteps` is an integer in `1..32` (default `8`) and `timeoutMs` is an integer in `1..30_000` (default `10_000`); no step starts after either budget is exhausted. |
| SEQ-003 | Steps execute FIFO through the same session/surface serialization boundary as individual actions. | Concurrent sequence and individual-action calls cannot interleave; each step validates session, active surface, and expected generation immediately before dispatch. |
| SEQ-004 | A sequence stops as soon as an outcome advances or may have advanced the generation. | Remaining steps are returned as bounded `not_run` outcomes with a stable reason; no stale ref is retried or remapped. |
| SEQ-005 | Every sequence returns at most one final stabilization snapshot after the last attempted step. | No intermediate snapshot payloads are emitted; the final result contains a fresh actionable snapshot only when publication succeeds, and its generation matches the matrix. |
| SEQ-006 | Focused typing is fail-closed and exact-reference based. | The target must be current, attached, enabled, control-kind, and proven editable before clear/type; read-only, hidden, wrong-kind, stale, or wrong-surface refs dispatch nothing. |
| SEQ-007 | Generation behavior follows the exact outcome matrix below. | Proven no-change preserves `g`; proven state/surface change advances to `g+1`; uncertainty advances to `g+1` with a bounded reason and invalidates old refs. No unconditional clear or double increment remains. |
| SEQ-008 | Cancellation and timeout behavior distinguishes pre-dispatch no-change from post-dispatch uncertainty. | Abort/deadline before dispatch preserves `g`; cancellation, provider timeout, transport loss, or final-refresh failure after dispatch advances once, stops, and reports bounded evidence. |
| SEQ-009 | Each step outcome is finite, ordered, and sanitized. | Results use a bounded status (`completed`, `rejected`, `not_run`, `timed_out`, or `cancelled`), stable reason/effect codes, step index, and bounded timing; input text, opaque handles, nonces, paths, causes, and raw provider data never echo. |
| SEQ-010 | Sequence capability is truthful and composed from effective RDM-013/RDM-014 provider evidence. | Unsupported, unavailable, denied, or failed providers cannot advertise or execute sequence actions; no local capability synonym is introduced. |
| SEQ-011 | Session and surface ownership are preserved for every exact ref. | A ref from another session, surface graph, generation, or continuation page is rejected without dispatch; an identity mismatch that proves state/surface change advances and invalidates the table. |
| SEQ-012 | Sequence lifecycle is bounded under client cancellation and owned cleanup. | Caller cancellation/transport loss follows the existing runtime/custody cleanup contract; the sequence never starts a new session, kills unrelated processes, or leaves an unbounded in-flight wait. |

## Exact generation outcome matrix

Let `g` be the current actionable generation before a step. “Preserve” means
the current reference table remains available only when the row says that no
state/surface change was proven. “Invalidate” means no ref from `g` may be
used. An advancing row increments exactly once; the final snapshot publication
must populate that already-reserved generation rather than incrementing again.

| Outcome fact | Dispatch/evidence | Generation | Ref table | Sequence behavior |
| --- | --- | --- | --- | --- |
| Pre-dispatch validation rejects an input and current target/session/surface identity is unchanged. | No provider dispatch; no-change proven. | `g` | Preserve. | Return `rejected`; continue only if the caller explicitly supplied a sequence policy that allows a rejected no-change step; default sequence policy stops on rejection. |
| Unknown ref, continuation ref, wrong session, or stable identity hint is supplied, with no evidence that the current owned surface changed. | No provider dispatch; no-change proven for the owned session. | `g` | Preserve current table; supplied target remains unusable. | Return `rejected`; stop by default. |
| Target identity is detached/changed or the active surface changed before dispatch. | No provider dispatch; state/surface change proven. | `g+1` | Invalidate old refs; no automatic lookup. | Return `rejected` with `stale_reference`/`surface_changed`; stop and stabilize once. |
| Provider explicitly proves a no-op or a rejected operation with no effect, and comparable stabilization proves window, surface, semantic, and focus state unchanged. | Dispatch may have been attempted, but no-change is proven. | `g` | Preserve. | Return `completed` or `rejected` with `no_observable_change`; continue only with refs still bound to `g`. |
| Provider postcondition proves a state, focus, semantic, window, or surface change. | Dispatch succeeded; change proven. | `g+1` | Invalidate `g`; publish fresh refs only through the final snapshot at `g+1`. | Return the step outcome and stop; remaining steps are `not_run`. |
| Provider reports a pre-dispatch failure with an explicit no-effect proof. | No mutation; no-change proven. | `g` | Preserve. | Return `rejected`/`failed` with stable bounded code; default sequence stops. |
| Provider timeout, transport loss, cancellation after dispatch, missing postcondition, or any result that cannot prove no-change. | Effect uncertain. | `g+1` | Invalidate `g`; publish only a successful final snapshot at `g+1`. | Return `timed_out`, `cancelled`, or `failed` with `uncertain_effect` reason; stop immediately. |
| Final stabilization or required fresh snapshot fails after any attempted step. | Current final state cannot be proven. | Current reserved generation, advanced once if not already advanced. | Invalidate old refs; no stale snapshot is returned as actionable. | Return bounded failure/timeout; no remaining step runs. |
| Final stabilization proves a change after prior no-change steps. | Fresh comparison proves state/surface change. | `g+1` | Atomically replace with fresh refs at `g+1`. | Return `completed` with `state_changed`; sequence ends. |

Successful standalone observation remains an observation boundary owned by
RDM-009. This matrix governs action/sequence outcome publication: a
comparison-only stabilization may prove no-change without replacing the
actionable table, while an advancing outcome reserves one new generation and
publishes at most one replacement table. A partial or continuation observation
is never returned as actionable evidence.

## Public sequence result shape (contract sketch)

The additive operation is referred to as `tauri_sequence` in this item. Exact
wire names must be reconciled against the accepted RDM-013/014 schemas before
implementation, but the following facts are binding:

- input has one starting `generation`, a finite `steps` array, `maxSteps`, and
  `timeoutMs`; every target step carries an exact opaque `ref` and no stable
  identity substitute;
- supported step kinds are `click`, `type`, `pressKey`, `pointer`, `scroll`,
  `selectOption`, and bounded `wait`; native dialog decisions and window
  capability actions are excluded;
- each step result carries its index, bounded status, effect/reason code,
  elapsed time, and whether it dispatched; it does not carry raw input text,
  provider handles, causes, credentials, or unbounded application output;
- the result carries `startedGeneration`, `endingGeneration`, `stoppedEarly`,
  `stopReason`, and at most one `snapshotAfter`; any returned snapshot is
  current-generation actionable evidence, never a continuation page; and
- a sequence cannot claim success when the final snapshot is missing after an
  uncertain or advancing step.

## Security and compatibility invariants

- Exact W3C handles are resolved from the current owned table; no action-time
  lookup, selector, text, coordinate, OCR, or stable-ID fallback exists.
- The sequence executor is inside the existing serialized snapshot/action FIFO.
  It cannot bypass active-session, active-surface, generation, provider, or
  ownership checks.
- Capability and native-dialog authorization are inherited from RDM-013/014;
  a sequence is never an implicit authorization channel.
- Input text is treated as untrusted/sensitive application data and is not
  echoed in outcomes. All result fields are bounded before MCP serialization.
- Cancellation and timeout evidence is typed and bounded. Cleanup remains
  owned by the existing runtime/process-custody boundary and affects only the
  current owned session.
- Existing individual interaction/snapshot/window/close tools remain
  backward-compatible when the sequence operation is absent.

## Verification contract

Future implementation must run focused checks in this order:

```text
pnpm test:unit -- interaction reference sequence
pnpm test:contract
pnpm test:integration
pnpm test:platform:windows
pnpm test:platform:linux   # when host/provider permits it
```

Required cases include the complete matrix above, exact ref/session/surface
binding, continuation rejection, no-op generation preservation, one-change
single increment, uncertain increment-with-reason, final snapshot success and
failure, early stop and `not_run` ordering, count/deadline limits, wait bounds,
editable typing, concurrent FIFO serialization, caller cancellation, transport
loss, output redaction, MCP framing, and existing-tool compatibility. The
Seneschal/root owns aggregate `pnpm build`, `pnpm typecheck`, `pnpm lint`,
`pnpm format:check`, `pnpm test`, and `pnpm pack:check` evidence.

No product command is run in this artifact-only child.

## Definition of done

- The exact matrix is implemented as a pure, unit-tested outcome reducer and
  used by standalone actions and the sequence executor; no unconditional clear
  or inconsistent numeric advance remains.
- Continuation evidence and stable identifiers are non-actionable, and every
  executed sequence step is bound to one current session/surface/generation.
- Count and wall-clock budgets, early stop, bounded per-step outcomes, one
  final stabilization snapshot, cancellation, and timeout behavior are proven.
- Focused typing proves editability before clear/type and never uses a
  selector/search/OS-input fallback.
- Public result fields are additive, finite, sanitized, and compatible with
  the accepted RDM-013 capability matrix and RDM-014 native-control boundary.
- Focused correctness/security tests pass; platform gaps are explicit; no
  unresolved P0-P2 finding remains.
- Product implementation waits until RDM-009, RDM-013, and RDM-014 artifacts
  and shared revisions are reconciled by Seneschal.
