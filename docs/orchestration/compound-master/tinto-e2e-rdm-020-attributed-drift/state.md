---
initiative: tinto-e2e-reliability
mode: execute
status: implementation-review-passed-with-host-gaps
artifact_status: implemented
date: 2026-08-24
parent_orchestrator: seneschal
run_id: tinto-e2e-rdm-020-attributed-drift
interaction: brokered
canonical_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-020-attributed-drift/state.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
target_roadmap: docs/product/roadmap.md
target_roadmap_item: RDM-020
artifact_namespace: tinto-e2e-reliability/RDM-020-attributed-drift
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
dependency: RDM-017
worktree: C:/Users/User/Documents/personal/pumarejo/.worktrees/codex-tinto-e2e-reliability
branch: codex/tinto-e2e-reliability
base_branch: main
review_units: [RU1, RU2]
current_review_unit: complete
jira_policy: skip
production_posture: hardening
autonomy: guarded
executor_mode: implementation
worktree_policy: required
parallel: false
delegation: supervised
open_decisions: []
blockers: []
---

# RDM-020 attributed drift compound state

## Current phase

- Phase: implementation, independent review, security gate, and aggregate
  reconciliation.
- Result: `implementation-review-passed-with-host-gaps`.
- RDM-020 is implemented. The remaining aggregate failures are reproducible
  checkout/host conditions and are not attributed to this review unit.

## Implemented contract

- `doctor` evaluates Pumarejo-owned semantic projections for the Rust wrapper,
  Cargo dependency/features, ignore marker, isolated capability, and owned
  config coupling fields.
- Full-file hashes are secondary evidence. Unrelated edits remain ready and
  report the hash difference without being mislabeled as integration drift.
- Missing, duplicated, malformed, forged, or unsafe owned content fails closed.
- Capability and config JSON reject duplicate keys before parsing; the
  capability must match the initialized window and exact ordered permission set.
- Rust attribution and removal inspect executable occurrences rather than
  matching wrapper text inside comments or string literals.
- Diagnosis remains read-only. Removal retains its existing conservative
  full-hash safety boundary; changing removal policy was outside RDM-020.

## Review and security

- Independent review found and closed two classes of P1 issue: comment/string
  confusion in Rust removal and duplicate-key JSON ambiguity.
- A follow-up caught textual replacement of the first wrapper occurrence; the
  final implementation replaces the exact executable occurrence.
- Final independent review: no remaining P0-P2 finding.
- Security Sentinel: pass. Safe reads, exact ownership and permission checks,
  duplicate-key rejection, non-authoritative hashes, sanitized diagnostics, and
  no automatic repair preserve the intended authority boundary.
- The RU1 Luna xhigh worker edited before its mandatory live checkpoint. Its
  terminal was rejected and recorded as a contract violation.
- The RU2 Luna worker returned an invalid terminal status and exceeded its
  verification retry limit. Its terminal was rejected; retained tests/docs were
  accepted only after root inspection and verification.

## Verification

- Focused RDM-020 regression: 54/54 passed.
- `pnpm test:integration`: 89 passed, 5 skipped.
- `pnpm test:contract`: 66/66 passed.
- `pnpm test:unit`: RDM-020 tests pass; aggregate unit execution retains five
  host failures described below.
- `pnpm typecheck`, focused ESLint, focused Prettier, and `git diff --check`:
  passed.
- Aggregate fingerprint:
  `e3f4bf28be2b9b5d4d25dbe1d33ca45fd13e9a8d6829c4e53a42959a613886bb`.
- Aggregate `pnpm build`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm pack:check`: passed.
- Aggregate `pnpm format:check`: host-baseline failure because the Windows
  checkout uses CRLF while untouched base files are formatted as LF.
- Aggregate `pnpm test`: 562 passed, 17 skipped, 7 host/baseline failures: two
  CRLF-sensitive certification hashes, one unavailable
  `Microsoft.PowerShell.Security` module under `powershell.exe`, and four
  Vitest runtime/host Node path mismatches.

## Owned implementation files

- `src/installer/attributed-drift.ts`
- `src/installer/doctor.ts`
- `src/installer/rust.ts`
- `tests/unit/attributed-drift.test.ts`
- `tests/integration/doctor.test.ts`
- `tests/integration/remove.test.ts`
- `docs/contracts.md`
- `docs/security.md`
- `docs/review-findings/tinto-e2e-reliability/RDM-020-attributed-drift/2026-08-24-implementation-review.md`

## Handoff

- RDM-020 has no open product decision or blocker.
- RDM-023 may consume this result as implemented-with-host-gaps evidence.
- Release Marshal exclusively owns staging, commits, push, PR, reviewers, and
  release mutations; none were performed here.
