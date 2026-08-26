---
title: RDM-018 bounded sequences and deterministic reference generations artifact closeout
status: implementation-review-passed-with-host-gaps
date: 2026-08-24
run_id: tinto-e2e-rdm-018-sequences-refs
roadmap_item: RDM-018
package: docs/work-packages/RDM-018-sequences-refs/2026-08-24-018-sequences-refs-work-package.md
state: docs/orchestration/compound-master/tinto-e2e-rdm-018-sequences-refs/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
---

# RDM-018 bounded sequences and deterministic reference generations artifact closeout

RDM-018 is implemented and independently reviewed. The delivery separates a
deterministic generation authority (RU1/U37) from a bounded exact-reference
sequence boundary (RU2/U38), preserving the approved continuation, capability,
timeout, disclosure, and final-snapshot semantics.

## Artifact set

- Initiative contract: `docs/plans/tinto-e2e-reliability/initiative-requirements.md`
- Roadmap: `docs/product/roadmap.md`
- Gap audit: `docs/audits/2026-08-21-tinto-gap-audit.md`
- Requirements/brainstorm input:
  `docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-requirements.md`
- Implementation plan:
  `docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-plan.md`
- Dependency/overlap map:
  `docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-dependency-map.md`
- Work package:
  `docs/work-packages/RDM-018-sequences-refs/2026-08-24-018-sequences-refs-work-package.md`
- Document review:
  `docs/review-findings/tinto-e2e-reliability/RDM-018-sequences-refs/2026-08-24-document-review.md`
- Canonical state:
  `docs/orchestration/compound-master/tinto-e2e-rdm-018-sequences-refs/state.md`

## Contract and waves

- **Generation matrix:** proven no-change preserves `g`; proven state/surface/
  focus change advances exactly once to `g+1`; uncertainty advances exactly
  once with a bounded reason and invalidates old refs. No unconditional clear or
  double numeric increment is permitted.
- **Continuation:** continuation evidence and stable semantic identifiers are
  non-actionable; a fresh actionable snapshot is required before action.
- **RU1/U37:** pure reducer, atomic reserve/compare/publish, standalone action
  integration, and focused editable typing.
- **RU2/U38:** finite count/wall-clock exact-ref sequence, FIFO, early stop,
  ordered per-step outcomes, one final stabilization snapshot, cancellation/
  timeout, additive public projection, and security/compatibility fixtures.
- **Wave 0:** reconcile RDM-009, RDM-013, and RDM-014 artifacts/shared
  revision. **Wave 1:** RU1. **Wave 2:** RU2. **Wave 3:** Seneschal aggregate
  and RDM-019 handoff.
- Review stack: serial, target one open PR and hard cap two; RU2 waits for RU1
  merge or collapses onto the refreshed integration base.

## Verification, security, and CI

- Work-package checker: expected `work package review-unit checks passed`.
- Document review: `passed` for artifact planning; no unresolved P0-P2 finding.
- Independent implementation review: closed with no P0-P2 findings after
  fixing typed-output reflection and deadline/final-stabilization edges.
- Security Sentinel: pass. Typed sequences omit the final snapshot; timeout
  uncertainty remains serialized and invalidates refs exactly once.
- Focused evidence: 155 tests plus typecheck, lint, formatting, and diff checks
  passed.
- Root aggregate fingerprint:
  `d1d018a4b609b26675525e99cefc3efc42ce894a72394df946d0add9c1f9923e`.
  Build, typecheck, lint, and pack check passed. Global format and seven suite
  cases are classified as host/baseline gaps (CRLF checkout normalization,
  unavailable Windows PowerShell Security module, and Vitest Node-path drift).
- Jira is explicitly skipped; no branch, commit, PR, reviewer, push, merge,
  release, or external mutation was performed.

## Blockers and next action

Implementation is complete. RDM-019 may consume the sequence contract, but its
full Tinto certification remains externally gated by Tinto adopting the
opt-in Pumarejo dialog broker. The Seneschal can continue with independent
RDM-020/RDM-021/RDM-022 implementation while preserving that blocker.
