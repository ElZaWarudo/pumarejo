---
run_id: tinto-e2e-rdm-015-observability
roadmap_item: RDM-015
review: ce-code-review
mode: report-only
threshold: P0-P2
status: passed
date: 2026-08-24
---

# RDM-015 focused code review

## Scope and intent

This review covers the RDM-015 delta only: the diagnostic store and sanitizer,
owned process-output callback, session/runtime producers, additive MCP schema
and dispatch, focused tests, and the three declared contract/security docs.
Existing dirty RDM-009/RDM-013/RDM-014 changes were treated as out of scope.

The review checked the requested invariants: sanitize-before-store, finite
count/byte bounds with deterministic oldest-first eviction, stable capability
states, current-session/surface ownership, additive compatibility, memory-only
close behavior, explicit retention, and absence of raw causes, paths, secrets,
arguments, or unbounded streams.

## Findings

No P0, P1, or P2 finding was identified in the changed slice.

The implementation is additive: `tauri_diagnostics` is a dedicated read-only
operation, while the existing status, launch, interaction, and close paths keep
their prior contracts. `DiagnosticStore` rejects mismatched sessions before
sanitization/storage, validates allowlisted fields, redacts secret/path
patterns, bounds fields, and evicts records by count and UTF-8 byte budget with
stable sequence IDs. Runtime queries reject foreign surfaces with `denied`
capabilities and no records. Closing the active runtime clears the diagnostic
store; retention requires an explicit sink and enabled flag.

The console source is intentionally represented as `unsupported` because no
approved provider console boundary exists. No arbitrary script or raw provider
endpoint was added. The tracked-process callback feeds the diagnostic store
before the existing bounded internal tail, preserving prior process custody
behavior.

## Verification

- Focused slice: 4 files, 61 passed tests.
- Focused natural journey: 5 files, 67 passed tests.
- TypeScript no-emit check, build, and lint passed.
- Contract suite: 5 files, 49 passed tests.
- Integration suite: 6 passed files, 4 skipped files; 67 passed tests and 5
  skipped tests.

The full unit command retained five host/sibling failures (Windows `Get-Acl`
autoload and four npm-shim path expectations) documented in canonical state;
none is in the RDM-015-focused slice.

## Verdict

`passed` for the P0-P2 threshold. Parent Seneschal should perform the aggregate
dirty-worktree reconciliation and root-owned platform/provider matrix before
any release decision.
