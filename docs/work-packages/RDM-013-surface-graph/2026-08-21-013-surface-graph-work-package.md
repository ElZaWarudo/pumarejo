---
title: Discover and diagnose nested semantic surfaces
status: completed
roadmap_item: RDM-013
origin_roadmap: docs/product/roadmap.md
origin_brainstorm: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-013-surface-graph-requirements.md
origin_planning_input: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-013-surface-graph-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-013-surface-graph-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
compound_run_id: tinto-e2e-rdm-013-surfaces
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-013-surfaces/state.md
units: [U24, U25, U26, U27]
unit_alignment: complete
review_units: [RU1, RU2]
base_branch: main
pr_strategy: stacked
max_open_stack: 2
jira_policy: skip
production_posture: unknown
autonomy: high
autonomous_ledger: docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json
allowed_mutation_classes: []
---

# Discover and diagnose nested semantic surfaces

## Scope

Define and implement, after the brokered contract gates close, the bounded
surface graph for one owned Tauri application session. The package covers
surface enumeration and selection, dynamic discovery, Dockview-style nested
panels, open shadow roots, provider-reachable iframe/WebView contexts, truthful
provider capability metadata, and screenshot-to-semantics coverage-gap
diagnostics. Every supported visible Tinto target must remain addressable by a
fresh exact current-generation reference; unsupported visible regions must be
reported with owning-surface context and no actionable fallback.

The approved decision resolutions authorize the bounded product/test
implementation described by this package during the nested execute run.

## Non-goals

- Closed shadow roots without explicit application instrumentation.
- Generic desktop automation, OS input, coordinates, OCR, arbitrary selectors,
  scripts, shell/WebDriver/Tauri passthrough, or browser chrome.
- Multiple independent application sessions in one MCP owner.
- Native dialog control, diagnostics buffers, process custody, environment and
  toolchain resolution, interaction sequences, or final Tinto certification.
- Any change to the RDM-009 bounded observation contract or its worker-owned
  package/state.
- `src/installer/project.ts` and `tests/unit/project-detection.test.ts`, which
  are user-owned dirty changes outside this package.
- Jira, commits, staging, branch pushes, PRs, reviewer requests, merge, release,
  or any external mutation from this artifact run.

## Autonomy Contract

- Mode: high, local artifact autonomy only.
- Agent may decide without asking: package-local document structure, stable
  internal U-ID names, review-unit grouping, equivalent read-only inspection
  commands, and conservative provider-probe evidence formatting.
- Agent must record as assumptions: repository surface ownership inferred from
  the current tree, no-surface backward-compatibility expectation, and any
  skipped provider probe or CI-only check.
- Agent must escalate: public MCP tool/field names, capability/error vocabulary,
  screenshot-gap threshold/region policy, provider support claims, generation
  semantics, auth/ownership/disclosure changes, production posture, branch/base
  strategy, Jira/PR workflow, credentials, or scope outside this package.
- Safe fallback: if a provider probe is unavailable, retain the explicit
  unavailable/unsupported/coverage_unknown outcome and never advertise an
  unsupported context as actionable. The three brokered public-contract
  decisions are resolved in the initiative contract and are no longer
  execution blockers.
- Autonomous ledger: `docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json`.
- Allowed external mutation classes: none for this local implementation run; the ledger
  is recorded for inherited context and cannot authorize worker shipping.

## Dependencies

- Requires: RDM-009 bounded observation contract and its accepted continuation/
  actionable-generation decision; shared approved artifact bundle
  `sha256:b0f646489c37c205beccbe6cbe26cb5aa1169b73d8d83922d6a0fb8af5a48d12`.
- Blocks: RDM-014 native control, RDM-015 observability, and RDM-018
  sequences/refs until the surface contract is accepted.
- Sibling ownership: the RDM-009 worker owns all RDM-009 code/package/state;
  RDM-013 only consumes its contract. Installer dirty files remain excluded.

## Production Posture

- Posture: unknown.
- Evidence: no explicit live/preprod/prototype deployment posture in the
  inherited contract; the initiative describes a local developer tool.
- Confidence: medium.
- Consequences for this package: preserve existing public behavior and security
  boundaries; require compatibility and regression evidence for any schema or
  provider-interface addition; do not infer deployment rollback behavior.
- Breaking existing behavior allowed: only with explicit approval; additive
  behavior is preferred.

## Plan Unit Alignment

| Plan unit | Included in this package | Reason                                                                                                                       |
| --------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| U24       | yes                      | Surface graph model, metadata bounds, parentage, and generation/session binding are the RU1 contract foundation.             |
| U25       | yes                      | Dynamic discovery, selection, and provider capability outcomes complete RU1's independently reviewable public slice.         |
| U26       | yes                      | Nested panel, open-shadow, iframe/WebView traversal is the provider implementation half of RU2.                              |
| U27       | yes                      | Coverage-gap diagnostics and maintained evidence/docs must be reviewed with traversal to avoid unsupported-region ambiguity. |

Grouping rationale:

- RU1 combines U24 and U25 because graph metadata, selection, capability
  states, and generation/ownership rules form one public contract that cannot be
  independently reviewed without a deep mental stack.
- RU2 combines U26 and U27 because provider traversal and screenshot coverage
  evidence share bounds, surface parentage, and unsupported-state semantics;
  separating them would hide the principal risk in a deferred consolidation.
- The package uses two stacked review units because each slice has independent
  verification and risk ownership while the central MCP/session/provider
  surfaces require a shallow dependency. The open stack is capped at two.

## Implementation Units

- **U24 — Surface graph model and metadata:** bounded opaque selection identity,
  stable correlation identity, parent/child graph, lifecycle/dimensions/label
  metadata, session and generation binding, and backward-compatible projection
  into observations.
- **U25 — Discovery, selection, and capabilities:** dynamic provider context
  discovery, explicit active-surface selection, provider/runtime probes, and
  truthful typed support outcomes.
- **U26 — Nested provider traversal:** Dockview-like panel roots, open shadow
  roots, provider-reachable iframes/WebViews and dynamic child contexts with
  exact handles and explicit unsupported gaps.
- **U27 — Coverage diagnostics:** bounded screenshot-to-semantics comparison,
  surface-owned gap evidence, conservative unknown state, fixtures, and
  maintained contract/compatibility/security documentation.

## Review Units

| Review unit | Scope                                                                                                                    | Expected changed surfaces                                                                                                                                       | PR base                                            | Jira issue/subtask                    | Size/risk note                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RU1         | Graph model, discovery/selection, session/generation binding, provider capability vocabulary, and additive MCP contract. | `src/observation/`, `src/session/`, `src/webdriver/`, `src/mcp/`, `src/shared/errors.ts`, contract/architecture/security docs, unit/integration/contract tests. | `main`                                             | skip (Jira policy explicitly skipped) | High public-contract and ownership risk; target <=500 human-authored lines; central surfaces serialized. Resolved decisions DR-013-001 and DR-013-002 are covered by implementation and contract evidence.    |
| RU2         | Nested traversal and truthful screenshot-to-semantics coverage diagnostics.                                              | browser traversal/snapshot/screenshot/schema, provider fixtures, integration/platform/contract tests, compatibility/security docs.                              | RU1 branch after parent merge or approved retarget | skip (Jira policy explicitly skipped) | High provider/disclosure risk; target <=500 human-authored lines; generated artifacts none. Resolved decision DR-013-003 is covered by implementation and coverage evidence; provider limits remain explicit. |

## Reviewability Diagnosis

- Reviewer-experience check: yes. RU1 is a coherent public/session capability
  slice; RU2 is a coherent provider traversal/diagnostic slice. Each has
  focused tests and can be understood after its predecessor without a deep
  stack.
- Granularity chosen because: separate public contract/ownership risk (RU1)
  from provider traversal/visual evidence risk (RU2). Atomicity or Jira shape
  is not the reason for the split.
- Open-stack plan: two stacked PRs maximum (target <=2, hard max 3). At the
  cap, wait-for-parent-merge into `main` and retarget RU2; collapse to the
  refreshed integration base if the parent is already integrated.
- Jira mapping: Jira intentionally skipped for this run; if a later release
  run enables Jira, each single-review-unit PR maps to one standalone semantic
  task, not a fabricated parent/subtask hierarchy.
- Downstream-fix trace: none at artifact creation. Future units must record
  `addresses finding from PR #X` if they fix a finding from an earlier open
  review.
- Failure-mode check: passes; this is neither a deep micro-PR stack nor a
  deferred mega-consolidation PR.

## Files and Tests

Primary implementation surfaces:

- `src/observation/browser-traversal.ts`, `src/observation/browser-entry.ts`,
  `src/observation/snapshot.ts`, `src/observation/schema.ts`,
  `src/observation/refs.ts`, and `src/observation/screenshot.ts`;
- `src/webdriver/client.ts`, `src/webdriver/protocol.ts`, and provider endpoint
  handling;
- `src/session/state.ts`, `src/session/manager.ts`, `src/mcp/domain-ports.ts`,
  `src/mcp/schemas.ts`, `src/mcp/server.ts`, `src/mcp/runtime.ts`, and
  `src/mcp/tools/index.ts`;
- `src/shared/errors.ts` only for new typed surface outcomes, if approved;
- `docs/contracts.md`, `docs/architecture.md`, `docs/compatibility.md`, and
  `docs/security.md` only for proven additive semantics; and
- focused fixtures/tests under `tests/unit`, `tests/integration`,
  `tests/contract`, `tests/platform`, and relevant `tests/fixtures`.

Literal focused checks assigned to implementation are:

```text
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:platform:windows
```

Linux provider/structural evidence is required when the host permits it; the
Seneschal/root owns the aggregate `pnpm build`, `pnpm typecheck`, `pnpm lint`,
`pnpm format:check`, `pnpm test`, and `pnpm pack:check` run.

## Impact Scan

- Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/
  tenant/ownership/test fixtures: additive MCP surface discovery/selection and
  graph-aware snapshot metadata; session/generation ownership; provider
  context operations; bounded coverage evidence. Implementation evidence is
  recorded in the current run state and closeout summary.
- Consumer scan patterns: `rg "tauri_snapshot|tauri_screenshot|tauri_window|generation|rootRef|windowHandles|shadow|iframe|WebView|currentSnapshot|DomainPorts" src tests docs`.
- Consumers found: `src/mcp/domain-ports.ts`, `src/mcp/schemas.ts`,
  `src/mcp/server.ts`, `src/mcp/runtime.ts`, `src/observation/*`,
  `src/interaction/*`, `src/session/*`, `src/webdriver/*`, contract/integration
  tests, platform provider helpers, and maintained contract docs.
- Contract-drift tests searched: strict MCP tool list/schema assertions,
  generation/stale-ref tests, snapshot schema invariants, provider endpoint
  allowlists, ownership/nonce tests, screenshot framing, and existing
  compatibility/public-journey tests.
- Required consumer tests: all four focused commands above plus the root-owned
  aggregate commands; root aggregate remains parent-owned.
- Consumer tests run: `pnpm test:unit` (focused RDM-013 tests pass; five
  unrelated sibling/host failures), `pnpm test:integration` (67 passed/5
  skipped), `pnpm test:contract` (49 passed), and structural platform checks
  (11 passed/5 skipped). Native Windows is blocked by its authoritative
  `PUMAREJO_RUN_PROVIDER=1` gate.

## Verification Gate

- Commands/outcomes verified in this execute run: `pnpm test:unit`,
  `pnpm test:integration`, `pnpm test:contract`, and
  `pnpm test:platform:windows`; provider feasibility and Linux structural
  results are recorded separately. The package checker and implementation
  evidence are both recorded below and in canonical state.
- Surface-aware evidence:
  - Graph metadata/session ownership: schema and unit tests prove bounded,
    cycle-free parentage and wrong-session/generation rejection.
  - Provider traversal: integration/platform fixtures prove open-shadow,
    nested panel, reachable iframe/WebView, and dynamic context behavior.
  - Public MCP contract: contract tests prove strict/additive schemas and
    stable unsupported/denied/unavailable/failed outcomes.
  - Screenshot coverage: bounded contract/integration tests prove gap evidence
    is surface-owned, sanitized, non-actionable, and conservative when unknown.
  - Docs/orchestration: package checker, provider matrix, code/security review,
    and canonical closeout state are updated with implementation evidence.
- Production posture evidence: posture is unknown, so implementation must show
  backward-compatible no-surface behavior, stale-reference safety, provider
  ownership, and explicit CI-only gaps before any release handoff.

## Review Gate

- Code review threshold: P0-P2; implementation review passed with no unresolved
  P0-P2 finding. See `docs/review-findings/tinto-e2e-reliability/RDM-013-surfaces/2026-08-24-code-review.md`.
- Findings below threshold: log as advisory; no finding may be silently used
  to claim provider support or relax disclosure/ownership rules.
- Document review result: the historical requirements/plan coherence review
  passed its three brokered gates; all three decisions are now resolved and the
  historical report is marked superseded. See
  `docs/review-findings/tinto-e2e-reliability/RDM-013-surfaces/2026-08-21-document-review.md`.

## Security Gate

- Run after work-review loop: required because this package crosses public MCP,
  provider context selection, exact handles, screenshots, untrusted content,
  and session ownership.
- Security Watch during work: enabled for public MCP/provider/session and
  screenshot surfaces; read-only evidence only.
- Security Watch notes: fail closed on cross-session/wrong-generation context;
  keep raw provider IDs, frame URLs, ports, nonces, and sensitive content out
  of graph/gap output; never turn screenshot gaps into coordinate actions.
- Security reviewer: `krt-security-sentinel`.
- Security review result: pass at P0-P2 threshold; advisory native provider
  evidence gap remains environment-dependent. See
  `docs/review-findings/tinto-e2e-reliability/RDM-013-surfaces/2026-08-24-security-review.md`.
- Required security verification: redaction corpus, wrong-session and nonce
  boundary tests, unsupported-context denial tests, bounded-output tests,
  screenshot retention/permission tests, and prompt-injection/untrusted-content
  separation assertions.

## CI Break-Prevention And Escalation

- CI risk surfaces: strict MCP schemas, generation/reference invariants,
  provider endpoint routing, nested WebDriver traversal, screenshot bounds,
  shared fixtures, maintained contract docs, and platform provider gates.
- Preventive evidence: literal focused commands and implementation results are
  recorded above; the root aggregate fingerprint remains a required downstream
  gate.
- If CI breaks: invoke `krt-ci-questor` with the PR/run/check context; do not
  poll checks in Compound Master.
- Escalation rule: record a release-follow-up blocker until the CI incident has
  a cause, owner, and next action; never bypass a red check.

## Branch and PR Handoff Inputs

- Review unit: RU1 — surface graph contract, discovery, selection, and capability evidence.
- Branch name: `feat/semantic-surface-graph`.
- Branch/docs rule: RU1 carries related planning and maintained contract docs
  on the semantic implementation branch; RU2 carries only traversal/gap docs
  that explain its shipped behavior. No planning/docs-only branch.
- PR base: `main` for RU1; RU1 integration base for RU2 after parent merge or
  an explicitly reconciled retarget.
- Suggested commit grouping for this review unit:
  - `feat(surface): add bounded surface discovery and selection` — graph model,
    provider capability projection, MCP schema/runtime, and focused unit/
    contract tests as one public capability slice.
  - `docs(surface): document supported contexts and truthful gaps` — only
    maintained contract/architecture/security/compatibility text proven by the
    RU1 behavior.
- PR title: Add bounded semantic surface discovery and selection.
- PR body bullets:
  - Adds explicit provider-backed surface discovery and active selection for
    one owned Tauri session.
  - Preserves current-generation exact refs, strict schema bounds, and private
    provider ownership; unsupported contexts remain non-actionable.
  - Includes focused unit/integration/contract/platform evidence and names any
    provider-specific unsupported states.
- Verification results location: package closeout, provider matrix, and the
  implementation branch's sanitized test evidence.
- Production/deployment notes: posture unknown; release requires additive
  compatibility proof and provider matrix reconciliation.
- Autonomous mutation request: none; external mutations remain owned by
  `krt-release-marshal` after parent reconciliation.

## Jira Handoff Inputs

- Jira policy: skip.
- Suggested issue type: none; no Jira lookup or mutation is authorized.
- Suggested subtask behavior: none.
- PR-to-Jira mapping: not applicable under explicit `jira-policy:skip`.
- Jira summary: not applicable.
- Jira description: not applicable.
- Optional-policy fallback: not applicable; Jira is intentionally skipped and
  must not be queried or mutated by this run.

## Decision resolutions

- **DR-013-001:** resolved to additive dedicated discovery and selection
  operations; affects U24/U25/RU1 and downstream public-contract composition.
- **DR-013-002:** resolved to the explicit
  `supported`/`unsupported`/`unavailable`/`denied`/`failed` matrix with stable
  codes and bounded evidence; affects U25/U26/RU1/RU2.
- **DR-013-003:** resolved to a conservative provider-region map with
  `coverage_unknown` when geometry is inconclusive; affects U27/RU2 and
  RDM-019 evidence.
- Safe implementation boundary: use only these canonical answers; preserve
  additive compatibility and fail closed for unproven provider contexts.
