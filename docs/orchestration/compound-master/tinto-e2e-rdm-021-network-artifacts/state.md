---
initiative: tinto-e2e-reliability
mode: execute
status: release-ready-with-host-and-native-cleanup-gaps
artifact_status: implementation-reviewed
date: 2026-08-24
parent_orchestrator: seneschal
run_id: tinto-e2e-rdm-021-network-artifacts
interaction: brokered
canonical_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-021-network-artifacts/state.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
target_roadmap: docs/product/roadmap.md
target_roadmap_item: RDM-021
artifact_namespace: tinto-e2e-reliability/RDM-021-network-artifacts
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
worktree: C:/Users/User/Documents/personal/pumarejo/.worktrees/codex-tinto-e2e-reliability
branch: codex/tinto-e2e-reliability
base_branch: main
review_units: [RU1, RU2]
current_review_unit: complete
jira_policy: skip
production_posture: unknown
autonomy: high
executor_mode: implementation
worktree_policy: required
parallel: true
delegation: supervised
open_decisions: []
blockers:
  - Native recursive deletion cannot yet bind every descendant operation to an identity-attested handle; quarantine remains retryable and preserved.
---

# RDM-021 network and artifact hygiene state

## Root reconciliation

RDM-021's runtime integration, independent implementation review, fix loop, and
Security Sentinel review are complete. The final implementation review reported
no P0-P2 findings. The final security review passed after cleanup was changed to
report retryable failure, preserve quarantined bytes, and emit a bounded
cleanup-unavailable diagnostic when identity-bound native deletion is absent.

The remaining work in this child run is one root-owned aggregate verification
against a sealed product-input fingerprint. No commit, push, PR, Jira, merge,
or release claim exists here; those mutations remain owned by Release Marshal.

## Canonical decision and boundaries

- `DEC-2026-08-21-006` resolved `DR-021-001`: retained cleanup requires an
  explicit finite operator policy. Without one, preserve all retained data.
- No implicit deletion, new public MCP/config surface, DNS/wildcard fallback,
  process termination policy, raw URL/path/cause output, installer drift, or
  self-doctor change is authorized.
- RDM-015 owns the bounded sanitize-before-store diagnostic sink. RDM-016 owns
  process/listener identity, custody, termination, and release.

## Accepted implementation

### RU1/U30 loopback helpers

- `src/platform/loopback.ts`
- `tests/unit/loopback.test.ts`
- Reported behavior: canonical IPv4/IPv6 endpoints, bracketed IPv6 URLs,
  bounded ports, strict `build.devUrl` parsing/comparison, sanitized mismatch
  suggestions, bounded observations, ownership-unproven handling, caller abort
  propagation, and one shared deadline.
- Worker-reported focused result: 14/14 tests, typecheck, focused ESLint,
  focused Prettier, and diff check passed.
- The worker terminal is not accepted: it exceeded retry limits, ran a write
  formatter outside the manifest, and emitted invalid verification result
  shapes. Timing is recorded as failed supervision.

### RU2/U31 pure artifact helpers

- `src/artifacts/discovery.ts`
- `src/artifacts/retention.ts`
- `tests/unit/artifact-discovery.test.ts`
- `tests/unit/artifact-retention.test.ts`
- Reported behavior: exclusions before enumeration, fail-closed explicit
  fixture validation, and deterministic retention planning with no filesystem
  deletion. Absent/invalid policy preserves everything; active, malformed,
  foreign, unmanifested, and non-closed entries are preserved.
- Worker-reported focused result: 14/14 tests, typecheck, focused ESLint,
  focused Prettier, and diff check passed.
- The worker terminal is not accepted: it exceeded retry limits, ran a write
  formatter outside the manifest, and emitted invalid verification result
  shapes. Timing is recorded as failed supervision.

## Review and security evidence

- Root-focused verification passed 131 tests with 2 skips across the affected
  network, session, process, diagnostics, artifact, and runtime suites.
- Four mode-config assertions remain a known host baseline mismatch between the
  fixture Node path and this machine's `process.execPath`; they are not caused
  by RDM-021 behavior.
- Typecheck, targeted ESLint, and targeted Prettier passed.
- The artifact/security slice passed 20 tests before the final cleanup outcome
  correction; the corrected trio and all static checks then passed.
- Independent implementation review: no remaining P0-P2 findings.
- Security Sentinel: pass, with the native identity-bound recursive-deletion
  limitation retained as an explicit release-certification gap.
- Durable review records:
  - `docs/review-findings/tinto-e2e-reliability/RDM-021-network-artifacts/2026-08-24-implementation-review.md`
  - `docs/review-findings/tinto-e2e-reliability/RDM-021-network-artifacts/2026-08-24-security-review.md`

## Resolved Impact Scan

The read-only Impact Scan mapped the current runtime as IPv4/family-blind:
`src/session/endpoint.ts`, `src/platform/tracked-process.ts`,
`src/platform/types.ts`, `src/session/manager.ts`, and Windows/Linux
`providerOwner` adapters still require a reviewed additive integration if U30
is to satisfy runtime acceptance. `src/platform/mode-config.ts` currently drops
`build.devUrl`; extraction must stay at that safe parser boundary and never move
into installer code.

The originally missing runtime adapters and evidence are now implemented:
family-aware reservation/readiness/ownership, safe JSON/JSON5/TOML `devUrl`
extraction, bounded RDM-015 diagnostics, affirmative ownership for retention,
fixture canonical identity and replacement-race defenses, and quarantine-first
cleanup. Default cleanup deliberately does not claim recursive deletion; an
optional identity-attested native deleter may complete it and must prove the
path absent afterward.

## Fragile local state

- Work exists only as uncommitted/untracked content in the initiative worktree.
- The main checkout contains user-owned dirty
  `src/installer/project.ts` and `tests/unit/project-detection.test.ts`; do not
  edit, revert, stage, or absorb them.
- The initiative worktree contains many prior RDM-009/RDM-013–RDM-020 changes.
  Preserve all unrelated edits. Release Marshal alone owns staging, commits,
  push, PR, reviewer requests, and release mutations.
- Known aggregate host gaps: Windows CRLF checkout formatting, two
  CRLF-sensitive certification hashes, missing
  `Microsoft.PowerShell.Security` under Windows PowerShell, and four Node
  executable-path mismatches.

## Remaining order

1. Return the reviewed packet to Seneschal.
2. RDM-023 must preserve the native cleanup limitation unless a verified
   identity-bound adapter is added.

## Aggregate verification

- Product-input fingerprint:
  `sha256:f6c7885288ff5c67b6b225b44252ad149b3f110035ecdfd5d6e12383bd010eb6`.
- Intended base: `23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53`.
- Ordered results: `pnpm build` pass; `pnpm typecheck` pass; `pnpm lint`
  pass; `pnpm format:check` host-gap; `pnpm test` host-gap;
  `pnpm pack:check` pass.
- Formatting reports 105 CRLF-normalized checkout files, including untouched
  baseline files; focused RDM-021 formatting passed.
- Tests passed 604 with 17 skips and 7 known host/baseline failures: two
  CRLF-sensitive certification hashes, one unavailable Windows PowerShell
  Security module, and four Node executable-path mismatches.
- Result: accepted with reproducible host gaps and the explicit native cleanup
  certification limitation.
