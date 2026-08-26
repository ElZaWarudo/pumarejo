---
title: RDM-016 process custody implementation closeout
status: implementation-review-passed-with-platform-gaps
date: 2026-08-24
run_id: tinto-e2e-rdm-016-process-custody
roadmap_item: RDM-016
package: docs/work-packages/RDM-016-process-custody/2026-08-21-016-process-custody-work-package.md
state: docs/orchestration/compound-master/tinto-e2e-rdm-016-process-custody/state.md
---

# RDM-016 process custody implementation closeout

RDM-016 RU1/RU2 implementation is complete in the delegated process-custody,
session, and platform surfaces. The implementation preserves the existing
public MCP contract and adds no installer, vendor/dialog bridge, RDM-017
resolver, or artifacts-policy changes.

## Implementation

- Durable owner-only leases use bounded, schema-checked, regular-file storage,
  atomic replacement, guarded transitions, exclusive recovery claims, and
  idempotent close/remove behavior.
- Custody proof requires a fresh PID/start identity, command hash, nonce, and
  platform-specific system/group/session evidence. Ambiguous or incomplete
  trees are retained and never killed.
- POSIX custody uses the validated process group/session with bounded TERM,
  revalidation, then KILL escalation. Linux nonce proof reads the live
  `/proc/<pid>/environ` value.
- Windows prefers an injectable Job Object adapter when available. This Node
  environment has no native host bridge, so the default is the explicitly
  reported `windows_validated_tree` fallback with validated parent-tree
  evidence and `taskkill /T /F`; it does not claim Job Object enforcement.
- Startup recovery claims only dead-controller leases, revalidates the full
  tuple, converges listeners/process descendants, and retains replaced or
  ambiguous residue as retryable. Custody diagnostics are sanitized before
  being sent to the existing RDM-015 diagnostic sink.

## Artifacts

- Requirements: `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-requirements.md`
- Plan: `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-plan.md`
- Dependency map: `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-dependency-map.md`
- Work package: `docs/work-packages/RDM-016-process-custody/2026-08-21-016-process-custody-work-package.md`
- Document review: `docs/review-findings/tinto-e2e-reliability/RDM-016-process-custody/2026-08-21-document-review.md`
- Canonical state: `docs/orchestration/compound-master/tinto-e2e-rdm-016-process-custody/state.md`

## Changed surfaces

- New: `src/session/custody-lease.ts` and focused lease/custody/recovery/
  Windows tests.
- Updated: `src/platform/types.ts`, `src/platform/tracked-process.ts`,
  `src/platform/linux/process.ts`, `src/platform/windows/process.ts`,
  `src/session/process-lease.ts`, `src/session/endpoint.ts`,
  `src/session/manager.ts`, and `src/mcp/runtime.ts`.
- Added scoped code/security review records under
  `docs/review-findings/tinto-e2e-reliability/RDM-016-process-custody/`.

## Verification

- Work-package validator: passed.
- TypeScript (`pnpm exec tsc -p tsconfig.json --noEmit`): passed.
- Focused lint and repository lint: passed.
- Focused RDM-016/session/platform suite: **42 passed, 1 skipped** (Windows
  symlink privilege).
- Integration suite: **67 passed, 5 skipped** (provider/fixture gates).
- Contract suite: build plus **49 passed**.
- Platform structural suite: **12 passed, 5 skipped**.
- Provider-gated Windows and Linux platform suites: blocked before execution;
  repository requires `PUMAREJO_RUN_PROVIDER=1`.
- Full unit suite: **325 passed, 3 skipped, 5 pre-existing/sibling failures**
  (machine-specific Windows shim expectation and unavailable PowerShell ACL
  module), with no RDM-016 failure.
- Repository-wide format check remains baseline-red (123 files); all touched
  RDM-016 files were individually formatted and pass targeted lint.
- `git diff --check`: passed.

## Review and handoff

Code review found no P0-P2 correctness or compatibility findings. Security
review found no P0-P2 findings; it verified owner-only storage, tuple proof,
bounded escalation, recovery claims, listener postconditions, and
sanitize-before-store evidence. The remaining P3 platform note is the lack of
a native Windows Job Object host bridge in this environment; the fallback is
truthful and tested, but the authoritative provider matrix remains a parent
gate before any release claim.

No commit, push, PR, Jira mutation, merge, or release action was performed.
The parent agent should reconcile this state with sibling RDM-015/RDM-019/RDM-
021 work and run the provider-enabled platform matrix/aggregate CI before
making a final shipping decision.
