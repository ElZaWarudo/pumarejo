---
title: Establish package and public contracts
status: review-passed
roadmap_item: RDM-002
origin_roadmap: docs/roadmaps/2026-07-23-001-tauri-agent-roadmap.md
origin_brainstorm: STRATEGY.md
origin_planning_input: docs/product-requirements.md
origin_plan: docs/plans/2026-07-23-001-feat-tauri-agent-plan.md
units: [U2, U3]
unit_alignment: complete
review_units: [RU1, RU2]
base_branch: unresolved-final-release
pr_strategy: independent
max_open_stack: n/a
jira_policy: optional
production_posture: prototype
autonomy: guarded
autonomous_ledger: none
allowed_mutation_classes: []
---

# Establish package and public contracts

## Scope

Turn the proof harness into the publishable strict ESM package, config/error/result contracts and CLI, then expose exactly seven schema-final MCP tools through stubbed domain ports.

## Non-goals

No consumer mutation, live WebDriver runtime, real handlers, or release.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: internal module boundaries and equivalent test helpers.
- Agent must record as assumptions: exact dependency pins and Node compatibility adjustments.
- Agent must escalate: public schema/tool changes or dependency choices that weaken supported Node lines/security.
- Safe fallback: keep later runtime stubbed and preserve reviewed contracts.
- Autonomous ledger: none.
- Allowed external mutation classes: none.

## Dependencies

- Requires: RDM-001/RU1 passed.
- Blocks: RDM-003 through RDM-008.
- Waves: RU1 after RDM-001; RU2 after RU1.

## Production Posture

- Posture: prototype.
- Evidence: greenfield package.
- Confidence: high.
- Consequences for this package: internal layout is flexible; public contracts are strict.
- Breaking existing behavior allowed: only with product-contract approval.

## Plan Unit Alignment

| Plan unit | Included | Reason |
|---|---|---|
| U2 | yes | Package/config/error foundation |
| U3 | yes | Early public MCP skeleton |

Grouping rationale: two independent questions—package contracts and protocol exposure. Estimated RU1 400-750 human lines; RU2 300-600; no generated files; 50-100 doc lines.

## Implementation Units

- U2: package foundation and shared contracts.
- U3: early MCP protocol skeleton.

## Review Units

| Review unit | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
|---|---|---|---|---|---|
| RU1 | ESM package, config, errors, CLI | build/config/shared/CLI/tests | unresolved-final-release | optional Tarea | 400-750 human; public contract |
| RU2 | Seven-tool MCP skeleton | MCP schemas/ports/stubs/contract tests | unresolved-final-release | optional Tarea | 300-600 human; public protocol |

## Reviewability Diagnosis

- Reviewer-experience check: yes; RU1 can verify package import/CLI/config, RU2 can verify protocol independently.
- Granularity chosen because: MCP framing should not obscure package/config review.
- Open-stack plan: serial local work, independent final handoff.
- Jira mapping: optional standalone Tarea per RU.
- Downstream-fix trace: none.
- Failure-mode check: no micro-stack or mega-review.

## Files and Tests

RU1 changes `src/config/`, `src/shared/`, `src/cli/`, root build config and package tests. RU2 changes `src/mcp/` and contract tests.

## Impact Scan

- Changed contract: config v1, error envelope, exports/bin and seven MCP schemas.
- Consumer scan patterns: tool names, `schemaVersion`, error codes, `{tauriConfig}`, stdout writes.
- Consumers found: tests and later packages.
- Contract-drift tests searched: exact tool list, strict config schemas, error union, exports and packed files.
- Required consumer tests: independent MCP client and CLI/package import tests.
- Run/skipped results: RU1 and RU2 passed on Node 22.23.1 and Node 24.12.0.

## Verification Gate

Security-sensitive contract invariants are mandatory: canonicalize `--project` inside the trusted project root; derive the application command only from the project-approved launch profile; spawn with argv and no shell interpolation; reject symlink/escape paths and executable MCP overrides; cap and validate payloads; and keep stdout protocol-clean. Cover shell metacharacters, traversal, symlink, malformed config, and packed-tarball cases.

| RU | U | Required verification | Evidence | Pass signal |
|---|---|---|---|---|
| RU1 | U2 | Node 22/24 clean frozen install, build, typecheck, lint, unit/exports/config/package dry-run | command log | zero failures and intended tarball surface |
| RU2 | U3 | MCP contract suite, exact seven tools, invalid-input matrix, clean stdout, untrusted-data framing | contract results | independent client passes without private APIs |

## Review Gate

- Code review threshold: P0-P2; lower findings logged.

## Security Gate

- Run after each work-review loop: required.
- Security Watch during work: enabled for dependencies, executable config, input validation, stdout, and public MCP schemas.
- Security Watch notes: RU1 rejects project/artifact traversal and links,
  confines launch overlay paths, allowlists project-derived launch executables,
  keeps argv shell-free, uses static public error text, injects CLI protocol and
  diagnostic channels, and audits the runtime dependency with no known
  vulnerability.
- Security reviewer: `krt-security-sentinel`.
- Security review result: RU1 passed with no unresolved P0-P2. Deferred P3:
  U11 must create and clean artifacts with race-safe no-follow/reparse checks;
  source maps expose relative mapping paths but contain no source content.
- Required security verification: no unresolved P0-P2; rerun focused tests and review after security fixes.

## CI Break-Prevention And Escalation

- CI risk surfaces: clean install/build, types/lint/tests, exports and packed files.
- Preventive evidence: Node 22/24 local matrix.
- If CI breaks: invoke `krt-ci-questor`.
- Escalation rule: keep affected RU pending with cause/owner/next action.

## Branch and PR Handoff Inputs

- Review unit: RU1 or RU2.
- Branch name: `feat/tauri-agent-contracts`.
- PR base: unresolved-final-release.
- Suggested commit grouping for this review unit: `feat(core): establish Tauri agent contracts`; `feat(mcp): expose semantic Tauri tool schemas`.
- PR title: Establish reusable Tauri agent contracts
- PR body bullets:
  - Defines the package, configuration and typed errors.
  - Exposes seven validated MCP tool contracts.
- Verification results location: work-package closeout.
- Production/deployment notes: no deployment.
- Autonomous mutation request: none.

## RU1 Closeout

- Status: `review-passed`.
- Unit: U2.
- Changed surfaces: publishable ESM metadata and exports, clean build, CLI
  parser/entrypoint, strict config schema/loader, launch-profile materializer,
  static typed error catalog, result union, unit tests, contract tests, and
  packed-package verification.
- Test-first evidence: five new suites initially failed because `src/` did not
  exist; implementation then made the focused contract green.
- Verification:
  - Clean frozen install, build, typecheck, lint, 23 unit tests, 10 contract
    tests, formatting and package dry-run pass on Node 22.23.1 and Node
    24.12.0.
  - The contract suite builds from a clean `dist`, packs and offline-installs
    the tarball, executes the real `tauri-agent` bin, and imports the root plus
    every declared export subpath.
  - The packed surface is exactly `package.json` plus 32 `dist/` runtime,
    declaration, and map files; U1 structural regression remains 11 passed and
    five live-only skips.
  - `pnpm audit --prod` reports no known vulnerabilities.
- Correctness review: passed after fixing clean-order testing, real packed-bin
  coverage, every export-map subpath, and typed-error leakage.
- Security review: passed after rejecting project-root artifacts and linked
  path segments, restricting executable/config paths, and making public error
  messages static.
- Recorded assumptions: Zod is pinned to 4.2.1; pnpm is pinned to 11.9.0; the
  prototype package remains `UNLICENSED` until release authority selects a
  license.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent review unit: RU2 / U3 completed below.

## RU2 Closeout

- Status: `review-passed`.
- Unit: U3.
- Changed surfaces: MCP SDK v1 dependency, exact seven strict input schemas,
  typed domain ports and stubs, static tool metadata, stdio server composition,
  CLI `mcp` wiring, image/text result framing, structured domain errors,
  cancellation propagation, bounded result serialization, and independent
  client contract tests.
- Test-first evidence: the new MCP contract suite first failed because no
  `src/mcp/` implementation existed, then exercised protocol behavior through
  in-memory and real stdio transports.
- Verification:
  - Node 22.23.1 and Node 24.12.0 pass frozen install, build, typecheck, lint,
    23 unit tests, 25 contract tests, formatting, and package dry-run.
  - The stdio client enumerates exactly seven tools, validates every schema,
    dispatches all stubs, observes PNG image framing, preserves untrusted text
    as result data, propagates cancellation, bounds structured/image output,
    and closes cleanly.
  - U1 structural regression remains 11 passed with five live-only skips.
  - `pnpm audit --prod` reports zero advisories after a workspace override pins
    `@hono/node-server` 2.0.12 beneath MCP SDK 1.29.0.
- Correctness review: passed with no unresolved P0-P2 after adding screenshot
  image framing. JSON-RPC `-32602` remains the correct protocol-level result for
  schema-invalid arguments; domain failures use the common structured envelope.
- Security review: passed with no unresolved P0-P2 after fixing the transitive
  Hono advisory, propagating `AbortSignal`, and enforcing 1 MiB structured plus
  32 MiB image result caps.
- Deferred P3: U8/U13 own graceful SIGTERM, transport-disconnect and real
  resource cleanup; U3 stubs own no runtime resources.
- Dependency assumption: the official SDK still recommends production v1 in
  July 2026, so `@modelcontextprotocol/sdk` is pinned to 1.29.0 with Zod 4.2.1.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Package result: RDM-002 is review-passed; next package is RDM-003/RU1.

## Jira Handoff Inputs

- Jira policy: optional; standalone Tarea per RU.
- Suggested issue type: Tarea.
- Suggested subtask behavior: no parent unless multiple units are grouped at final release.
- PR-to-Jira mapping: one task per RU.
- Jira summary: Definir el paquete y los contratos públicos de Tauri Agent
- Jira description: Crear la base publicable, la configuración validada y los siete contratos MCP.
- Optional-policy fallback: Jira omitted: no context/config.
