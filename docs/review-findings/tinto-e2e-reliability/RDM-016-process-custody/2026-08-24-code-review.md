---
title: RDM-016 implementation code review
status: passed-with-platform-note
date: 2026-08-24
run_id: tinto-e2e-rdm-016-process-custody
scope: RU1/RU2
---

# RDM-016 implementation code review

## Scope and intent

Reviewed the RDM-016 process custody diff against the implementation-ready
plan, limited to internal lease persistence, tracked-process custody, Linux
group/session handling, Windows Job Object/fallback seam, session cleanup and
recovery, endpoint listener postconditions, and the accepted diagnostic
adapter callback. Public MCP schemas, installer/vendor/dialog bridge,
environment resolution, and artifact policy were excluded.

## Findings

No P0-P2 correctness or compatibility findings.

Advisory platform note (P3): the default Node Windows adapter cannot hold a
native Job Object handle without a host bridge. It therefore reports the
capability as unavailable and uses the validated-tree fallback. The seam is
injectable and tested (`tests/unit/windows-custody.test.ts`), and no claim of
Job Object enforcement is emitted unless `probe()` and `attach()` succeed.
Parent Windows evidence must continue to run the authoritative provider gate
before any release claim.

## Requirements completeness

- U32: met — bounded owner-only lease records, atomic replacement, strict
  validation, conjunctive identity proof, monotonic transitions, and tests.
- U33: met — injectable Job Object path, truthful Windows fallback, POSIX
  process-group/session TERM->grace->revalidate->KILL, and tests.
- U34: met — bounded startup scan/claim, dead-controller recovery, idempotent
  cleanup, listener checks, nonce reattachment on Linux, and sanitized
  evidence adapter wiring.
- Public contract preservation: met — no MCP operation/schema/capability
  vocabulary changes.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`: pass.
- Focused custody/session/platform Vitest set: 42 passed, 1 Windows symlink
  test skipped because the current host denies unprivileged symlink creation.
- `pnpm lint`: pass.
- `pnpm test:integration`: 67 passed, 5 skipped fixture/provider gates.
- `pnpm test:contract`: 49 passed.
- `pnpm test:platform:structural`: 12 passed, 5 host skips.
- `pnpm test:platform:windows` and `pnpm test:platform:linux`: blocked by
  the repository gate requiring `PUMAREJO_RUN_PROVIDER=1`; no provider run
  was authorized or available in this child.
- `pnpm test:unit`: 325 passed, 3 skipped, 5 pre-existing environment/sibling
  failures in Windows shim resolution and PowerShell ACL module loading.
- `pnpm format:check`: pre-existing repository-wide baseline failure (123
  files), while all RDM-016 files were formatted and targeted ESLint passed.

## Verdict

Ready for the parent security gate and Seneschal aggregate reconciliation;
not a release or merge approval. The Windows/Linux authoritative provider
matrix remains a parent-owned prerequisite.
