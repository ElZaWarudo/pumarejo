---
title: RDM-017 implementation code review
status: passed-with-platform-note
date: 2026-08-24
run_id: tinto-e2e-rdm-017-portable-runtime
scope: RU1/RU2
---

# RDM-017 implementation code review

## Scope and intent

Reviewed the RDM-017 environment reconstruction, canonical toolchain resolver,
bounded fixed probes, safe Windows shim handling, sanitized evidence adapter,
and deterministic Windows/Linux fixtures against the approved requirements and
implementation plan. Installer/doctor consumers, public MCP schemas, project
detection, process custody, and release certification were excluded.

Review mode was local apply. The reviewer set covered correctness, testing,
security, reliability, and the local adversarial lens. No applicable
`AGENTS.md` or `CLAUDE.md` file was present. The independent cross-model pass
did not run because no attested different-provider CLI route was installed.

## Applied findings

| # | Surface | Applied correction | Reviewer |
|---|---|---|---|
| 1 | `src/platform/launch-environment.ts` | Added an additive result API that accepts the injected OS source and preserves incomplete status. | correctness |
| 2 | `src/platform/launch-environment.ts` | Empty and whitespace-only Windows minimum values now remain missing. | correctness |
| 3 | `src/platform/toolchain-resolver.ts` | Candidate tiers now retain truthful sources and bounded explicit -> child PATH -> platform-root precedence. | correctness, security |
| 4 | `src/platform/toolchain-resolver.ts` | Candidate basename and kind-specific output checks reject wrong tools. | correctness, security |
| 5 | `tests/platform/toolchain-resolution-proof.test.ts` | Platform fixtures now traverse the resolver before evidence projection. | testing |
| 6 | `tests/unit/toolchain-resolver.test.ts` | Tests now assert exact candidate precedence, source labels, roots, probes, comparisons, and shim behavior. | testing |
| 7 | `src/platform/toolchain-resolver.ts` | `.cmd` and `.bat` shims fail closed, require a fixed Node target, and validate Node plus CLI paths before probing. | security |
| 8 | `src/platform/toolchain-resolver.ts` | Removed the nonexistent `Stats.isReparsePoint` assumption; explicit reparse metadata and canonical-path changes are rejected and paths are rechecked before probing. Opaque tags remain a platform gap. | security |
| 9 | `src/platform/toolchain-resolver.ts` | Probe buffers are bounded before append; timeout and overflow wait for close or report unavailable residue. | security, reliability |

The tree was already dirty with initiative work, so these fixes remain
uncommitted for the parent Release Marshal grouping.

## Requirements completeness

- U34: met - allowlisted reconstruction, injected OS source, bounded portable
  expansion, provenance, explicit incomplete state, and value-free comparison.
- U35: met with a platform note - fixed candidate tiers, PATHEXT/Linux mode,
  path/file checks, no-shell probes, bounded outputs, safe shims, tool identity,
  and explicit rejection outcomes.
- U36: met - ownership/session validation, sanitized bounded evidence, sink
  failure isolation, and resolver-driven deterministic Windows/Linux fixtures.
- Downstream integration remains correctly deferred to RDM-020 and RDM-022;
  RDM-017 adds no public diagnostic operation.

## Verification

- Focused RDM-017 matrix after fixes: 43 passed across unit, integration,
  contract, and platform fixtures.
- Focused Windows incomplete-launch refusal: 1 passed.
- `pnpm typecheck`: pass.
- Targeted ESLint, Prettier, and `git diff --check`: pass.
- `pnpm test:contract`: 58 passed.
- `pnpm test:integration`: 71 passed, 5 fixture/provider skips.
- `pnpm test:unit`: 350 passed, 3 skipped, with the same five host/baseline
  failures: four legacy `process.execPath`/NVM fixture assumptions and one
  unavailable Windows PowerShell Security module load.

## Coverage and residual risk

- Independent post-fix validation confirmed eight safety/correctness findings
  resolved. Finding #8 is reduced but remains an explicit native-platform gap.
- Pure Node does not expose every non-symlink Windows reparse tag and cannot
  pin an executable handle through `spawn`. The implementation fails closed on
  explicit reparse metadata and canonical-path changes and narrows TOCTOU by
  immediate revalidation. A native Windows adapter remains required for a
  complete reparse-tag/handle-pinning claim.
- The default real child-process adapter is bounded and cleanup-aware, but the
  provider/platform certification matrix remains parent-owned.

---

> **Verdict:** Ready for Seneschal reconciliation with a visible Windows
> platform limitation.
>
> **Reasoning:** All actionable review findings are applied and the focused,
> contract, and integration gates pass. No release claim may state complete
> Windows reparse/handle proof until a native adapter or equivalent provider
> evidence exists.

### Actionable Findings

Actionable findings: none in the safe local Node scope. The Windows native
proof is a release-visible residual risk that requires a native adapter or
equivalent authoritative platform evidence.
