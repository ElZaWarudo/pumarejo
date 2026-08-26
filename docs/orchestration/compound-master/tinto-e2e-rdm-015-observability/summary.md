---
run_id: tinto-e2e-rdm-015-observability
status: ci-prevention-ready
roadmap_item: RDM-015
package: docs/work-packages/RDM-015-observability/2026-08-21-015-bounded-runtime-observability-work-package.md
state: docs/orchestration/compound-master/tinto-e2e-rdm-015-observability/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
---

# RDM-015 bounded observability implementation closeout

RDM-015 is implemented through RU1/RU2 on the supplied integration branch.
The runtime now owns a sanitize-before-store diagnostic sink with deterministic
count/byte ring eviction, bounded process/invocation/phase/last-error evidence,
an explicit `tauri_diagnostics` additive query, truthful five-state capability
outcomes, memory-only default, and explicit bounded retention opt-in.

## Owned implementation

- `src/observability/diagnostics.ts`: allowlisted sanitized records, bounded
  fields, deterministic IDs/order, ring count/byte eviction, capability map,
  latest-error projection, close clearing, and explicit retention sink.
- `src/platform/types.ts`, `src/platform/tracked-process.ts`,
  `src/session/manager.ts`: owned stdout/stderr producer callback while
  preserving the existing bounded internal process tail.
- `src/mcp/runtime.ts`: launch phase/process/invocation/error producers,
  active-session and surface ownership checks, additive query, and memory
  cleanup on close.
- `src/mcp/schemas.ts`, `src/mcp/domain-ports.ts`, `src/mcp/server.ts`,
  `src/mcp/tools/index.ts`, `src/mcp/index.ts`: strict additive MCP schema,
  dispatch, descriptions, and exports.
- `tests/unit/diagnostics.test.ts`, `tests/unit/mcp-runtime.test.ts`,
  `tests/contract/mcp-server.test.ts`: redaction, eviction, capability,
  retention, ownership, close, schema, dispatch, and compatibility coverage.
- `docs/contracts.md`, `docs/architecture.md`, `docs/security.md`: public
  contract, boundary, and disclosure documentation.

Console capture is deliberately `unsupported` because this run found no
approved provider console boundary. No arbitrary script or raw provider route
was introduced. Foreign surface queries return `denied` capabilities with no
records. Existing RDM-009/RDM-013/RDM-014 changes and artifacts were preserved.

## Verification evidence

| Command                                                                                                                                                                                       | Result                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `python C:\Users\User\.agents\skills\krt-compound-master\scripts\check_work_package.py docs/work-packages/RDM-015-observability/2026-08-21-015-bounded-runtime-observability-work-package.md` | `work package review-unit checks passed`                          |
| `pnpm exec vitest run tests/unit/tracked-process.test.ts tests/unit/diagnostics.test.ts tests/unit/mcp-runtime.test.ts tests/contract/mcp-server.test.ts`                                     | 4 files, 61 passed                                                |
| Focused natural journey (same command plus `tests/contract/real-usage-journey.test.ts`)                                                                                                       | 5 files, 67 passed                                                |
| `pnpm exec tsc -p tsconfig.json --noEmit`                                                                                                                                                     | passed                                                            |
| `pnpm build`                                                                                                                                                                                  | passed                                                            |
| `pnpm lint`                                                                                                                                                                                   | passed                                                            |
| `pnpm test:integration`                                                                                                                                                                       | 6 passed files, 4 skipped files; 67 passed tests, 5 skipped tests |
| `pnpm test:contract`                                                                                                                                                                          | 5 files, 49 passed tests                                          |
| `pnpm test:unit`                                                                                                                                                                              | 20 passed files, 2 failed files; 317 passed, 5 failed, 2 skipped  |

The five full-unit failures are pre-existing host/sibling conditions, not
RDM-015 failures: `artifact-permissions.test.ts` cannot autoload Windows
`Get-Acl`; four `mode-config.test.ts` cases expect
`C:\\nvm4w\\nodejs\\node.exe`, while this host resolves
`C:\\ProgramData\\nvm\\v24.13.0\\node.exe`. These remain parent/root CI
follow-up items. No RDM-015-focused test failed.

## Review and handoff

- Focused report-only code review: [2026-08-24-code-review.md](../../../review-findings/tinto-e2e-reliability/RDM-015-observability/2026-08-24-code-review.md), no P0-P2 findings.
- Focused security review: [2026-08-24-security-review.md](../../../review-findings/tinto-e2e-reliability/RDM-015-observability/2026-08-24-security-review.md), sanitize-before-store, bounds, ownership, capability fallback, memory-only close, and explicit retention passed; console gap remains explicit.
- Canonical state: [state.md](state.md).

No commit, staging, push, PR, Jira, release, or sibling reconciliation was
performed. Parent Seneschal owns aggregate CI/platform evidence, review of the
shared dirty worktree, and any later shipping decision.
