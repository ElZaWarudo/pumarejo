---
title: Bounded interaction sequences and deterministic reference generations
status: package-ready
roadmap_item: RDM-018
origin_roadmap: docs/product/roadmap.md
origin_brainstorm: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-requirements.md
origin_planning_input: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
compound_run_id: tinto-e2e-rdm-018-sequences-refs
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-018-sequences-refs/state.md
units: [U37, U38]
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

# Bounded interaction sequences and deterministic reference generations

## Scope

This package owns the RDM-018 interaction slice:

- the pure deterministic outcome-to-generation reducer and atomic reserve/
  compare/publish seam;
- integration of that matrix into exact-reference standalone actions and
  focused editable typing;
- an additive, strict bounded sequence operation over exact current-generation
  refs and finite waits;
- FIFO serialization, action-count/wall-clock limits, early stop, bounded
  per-step outcomes, one final stabilization snapshot, cancellation, and
  timeout behavior; and
- focused correctness, compatibility, disclosure, security, and provider-gap
  evidence for the above.

The item-local sequence defaults are `maxSteps: 8` with maximum `32` and
`timeoutMs: 10_000` with maximum `30_000`. The public wire shape is additive
and must consume the reconciled RDM-013/014 schemas before implementation.

The generation contract is exact:

- proven no-change preserves generation `g` and refs;
- proven state/surface/focus change advances exactly once to `g+1` and
  publishes fresh refs only through one final snapshot;
- uncertainty advances exactly once to `g+1`, invalidates old refs, and records
  a bounded reason; and
- no step after an advancing or uncertain result runs, retries, or rebinds a
  stale ref.

Continuation pages and stable semantic identifiers are non-actionable. A
separate fresh actionable snapshot is required before an exact-ref action.

## Non-goals

- RDM-009 observation/redaction changes, RDM-013 surface graph ownership, or
  RDM-014 provider/dialog grant implementation;
- implicit native dialog decisions, window capability actions inside a
  sequence, or any alternate native-input path;
- selectors, XPath/CSS, text or role lookup, coordinates, OCR, arbitrary
  JavaScript, shell, WebDriver/Tauri passthrough, or stable-ID rebinding;
- unbounded sequences, waits, text, output, retries, snapshots, logs, or
  provider evidence;
- process custody/cleanup, diagnostics retention, Tinto certification, or
  platform support claims beyond explicit focused provider evidence; and
- Jira lookup/mutation, commits, branch operations, PR/reviewer/release
  actions, or any product implementation in this artifact-only run.

## Autonomy Contract

- Mode: high, limited to reversible artifact-local writes.
- Agent may decide without asking: package-local document structure, internal
  reducer/helper names, equivalent deterministic test fixtures, bounded clock
  injection, result ordering, and focused verification command variants.
- Agent must record as assumptions: RDM-009 continuation/actionable snapshot
  semantics remain authoritative; RDM-013 capability/surface states and
  RDM-014 effective-control/dialog outcomes are consumed, not redefined;
  existing runtime/process-custody cleanup remains authoritative; and sequence
  defaults remain finite and transport-safe.
- Agent must escalate: upstream contract/revision mismatch; public schema or
  error-code changes; auth/session/tenant/surface ownership; implicit dialog or
  native input; destructive cleanup; production compatibility; branch/base;
  Jira/PR/release workflow; credentials; or scope outside this package.
- Safe fallback: complete artifact review and the pure local matrix plan while
  pausing implementation-dependent units; return a brokered decision request
  to Seneschal rather than inventing a public contract.
- Autonomous ledger: `docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json`.
- Allowed external mutation classes: none for artifact mode; the inherited
  ledger does not authorize worker shipping or Jira/release actions.

## Dependencies

- Requires: reconciled RDM-009 bounded observation/continuation contract;
  reconciled RDM-013 surface identity/selection and explicit capability
  matrix; reconciled RDM-014 effective window/native-dialog outcomes; existing
  exact-ref/session FIFO and provider ownership checks.
- Adjacent integration: RDM-015 may consume bounded sequence/invocation
  evidence after its sink is accepted; it is not a prerequisite for the pure
  reducer.
- Blocks: RDM-019 Tinto journey and forced-failure certification until the
  sequence contract and focused evidence are accepted.
- Sibling coordination: `src/observation`, `src/session`, `src/mcp`, provider
  adapters, and shared fixtures are serialized with RDM-013/014/015. This
  package records overlap and does not claim their ownership.

## Production Posture

- Posture: unknown.
- Evidence: this is an initiative-hardening package; no live deployment
  posture was established for this child.
- Confidence: medium for implementation scope; high for the explicit
  generation matrix and safety boundary.
- Consequences: preserve current individual-tool compatibility, one-session
  ownership, local `stdio`, bounded output, exact handles, and mandatory
  redaction. Provider/platform gaps are recorded rather than normalized to
  support.
- Breaking existing behavior allowed: no, except the explicitly reviewed
  correction from unconditional clear/increment to the accepted matrix.

## Plan Unit Alignment

| Plan unit | Included in this package | Reason |
| --- | --- | --- |
| U37 | yes | The reducer and exact-action publication are the prerequisite contract for any safe sequence. |
| U38 | yes | The bounded sequence executor, focused typing projection, final snapshot, and public compatibility evidence complete RDM-018. |

Grouping rationale:

- RU1 groups U37 because generation, stale-ref invalidation, comparison, and
  focused typing must be reviewed as one authority; splitting them would leave
  an unsafe standalone action seam beneath the sequence.
- RU2 contains U38 because count/deadline limits, early-stop outcomes, final
  stabilization, and MCP framing form one independently verifiable public
  capability. It is a child of RU1 and never a separate docs-only branch.

## Implementation Units

- **U37 — deterministic generation reducer and exact actions:** encode the
  proven-no-change/proven-change/uncertain matrix, atomic reserve/publish,
  comparison-only stabilization, exact session/surface checks, and focused
  editable typing. Adapt existing actions without clearing refs before the
  provider effect is classified.
- **U38 — bounded sequence executor and public boundary:** validate finite
  exact-ref steps, run through the existing FIFO, stop on generation change or
  uncertainty, return ordered bounded outcomes, enforce count/deadline,
  perform one final stabilization snapshot, and project only accepted
  capability/security fields through the additive MCP boundary.

## Review Units

| Review unit | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
| --- | --- | --- | --- | --- | --- |
| RU1 | Pure generation matrix, atomic publication, standalone action integration, focused editable typing. | `src/interaction/`, `src/observation/refs.ts`, `src/observation/snapshot.ts`, bounded error/result types, unit tests, proven contract/security docs. | `main` | intentionally skipped | Medium code/test slice; high stale-state and compatibility risk; review as one generation authority. |
| RU2 | Strict bounded sequence executor, additive MCP/domain/runtime projection, final snapshot, early stop, cancellation/timeout, security/compatibility fixtures. | `src/interaction/`, `src/mcp/`, `src/session/` consumers, contract/integration/platform tests, maintained docs. | Refreshed RU1 base | intentionally skipped | Medium public-boundary slice; depends on RU1 and serialized RDM-013/014 seams; no native dialog/window authorization. |

## Reviewability Diagnosis

- Reviewer-experience check: yes. RU1 can prove every generation outcome and
  standalone exact-ref behavior without a public sequence schema. RU2 can then
  be reviewed as a finite public executor whose only authority is RU1.
- Granularity chosen because: the two units separate the high-risk stale-state
  authority from the public batching/serialization boundary; this is reviewer
  comprehension and independent verification, not Jira or micro-atomicity.
- Open-stack plan: target one open PR and hard cap two. RU2 waits for RU1 to
  merge into `main` or is collapsed onto the refreshed integration base at the
  cap; never deepen the stack or create a deferred mega-consolidation PR.
- Jira mapping: intentionally skipped by the delegated contract.
- Downstream-fix trace: none at artifact creation.
- Failure-mode check: no deep micro-PR chain; no planning/docs-only branch;
  related behavior docs stay with the first executable semantic branch.

## Files and Tests

Expected implementation surfaces (repo-relative; no files are changed in this
artifact run):

- `src/interaction/generation.ts` (new pure reducer or equivalent local
  module), `src/interaction/engine.ts`, and `src/interaction/sequence.ts`
  (new executor or equivalent);
- `src/observation/refs.ts` and `src/observation/snapshot.ts` for atomic
  reserve/compare/publish semantics;
- `src/mcp/schemas.ts`, `src/mcp/domain-ports.ts`, `src/mcp/runtime.ts`,
  `src/mcp/server.ts`, and `src/mcp/tools/index.ts` for additive strict
  sequence wiring;
- existing `src/session/` and surface/provider consumers only where the
  reconciled RDM-013/014 contract requires generation/surface context;
- `tests/unit/interaction.test.ts`, focused generation/reference/sequence unit
  files, `tests/contract/mcp-server.test.ts`, focused integration/provider
  fixtures, and applicable Windows/Linux platform fixtures; and
- `docs/contracts.md`, `docs/architecture.md`, `docs/security.md`, and
  `docs/compatibility.md` only for behavior proven by implementation.

Required tests cover:

- the complete exact generation matrix, including no-change preservation,
  exactly-once state/surface increment, stale/changed identity, uncertainty
  with reason, final refresh failure, cancellation phases, and no double
  increment;
- exact current session/surface/generation binding, continuation rejection,
  concurrent FIFO serialization, no rebind/retry, and focused editable typing;
- strict count/wall budgets, bounded waits/text/outcomes, early stop and
  ordered `not_run`, one final stabilization snapshot, and ending-generation
  consistency;
- cancellation/transport loss, provider timeout, unsupported/denied/
  unavailable/failed capability outcomes, MCP framing, hostile application
  text, input/output redaction, and existing-tool compatibility; and
- supported/unsupported provider evidence on Windows and Linux when hosts
  permit it, with explicit skip reasons otherwise.

## Impact Scan

- Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/
  tenant/ownership/test fixtures: additive sequence schema/domain port/runtime
  path; generation publication and active surface/session context; no tenant
  or auth contract change; no dialog authorization expansion.
- Consumer scan patterns: `rg -n "generation|references|snapshotAfter|tauri_click|tauri_type|tauri_press_key|domain ports|createMcpServer" src tests docs`.
- Consumers found: `src/interaction/engine.ts`, `src/observation/refs.ts`,
  `src/observation/snapshot.ts`, `src/mcp/schemas.ts`,
  `src/mcp/domain-ports.ts`, `src/mcp/runtime.ts`, `src/mcp/server.ts`,
  `tests/unit/interaction.test.ts`, `tests/contract/mcp-server.test.ts`,
  and the RDM-013/014 surface/provider seams owned by sibling packages.
- Contract-drift tests searched: stale/current generation tests, concurrent
  action tests, partial snapshot tests, exact-tool inventory/schema tests,
  cancellation/error-envelope tests, and redaction/transport framing corpus.
- Required consumer tests: focused `pnpm test:unit`, `pnpm test:contract`,
  `pnpm test:integration`, and applicable Windows/Linux platform commands;
  root aggregate remains Seneschal-owned.
- Consumer tests run/skipped: not run; artifact-only mode forbids product
  implementation/tests. Exact future commands and skip evidence are named in
  the plan and verification gate.

## Verification Gate

- RU1: focused generation/reference/interaction unit suite and `pnpm test:unit`.
- RU2: focused sequence/MCP contract suite and `pnpm test:contract`; runtime
  FIFO/session/provider suite and `pnpm test:integration`; applicable
  `pnpm test:platform:windows` and `pnpm test:platform:linux`.
- Root: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test`, and `pnpm pack:check` after parent reconciliation.
- Surface-aware evidence: reducer table and exact refs (U37); strict finite
  public schema, serial actions, early stop, final snapshot, cancellation,
  output bounds, and provider capability truth (U38).
- Production posture evidence: unknown posture requires compatibility tests,
  bounded output/security evidence, provider support/unsupported recording,
  and no release claim in this package.

## Review Gate

- Code review threshold: P0-P2.
- Findings below threshold: log as advisory unless a later contract/security
  review marks them blocking.
- Document review: required before any execution handoff; this package is
  artifact-only and has no code-review result yet.

## Security Gate

- Run after work-review loop: required because exact refs, session/surface
  ownership, stale-state invalidation, cancellation, public MCP output, and
  native-control adjacency are security-sensitive.
- Security Watch during work: enabled; uncertainty must fail closed, old refs
  must not survive a possible effect, and sequences cannot authorize dialogs or
  native input.
- Security Watch notes: sanitize before MCP framing; do not echo typed text,
  raw refs/handles, provider data, paths, nonces, or causes; test hostile UI
  payloads and cross-session/surface/generation attempts.
- Security reviewer: `krt-security-sentinel` design gate, followed by the
  implementation security review in the execution lane.
- Security review result: pending implementation; design gate acceptable for
  artifact planning with required tests.
- Required security verification: matrix uncertainty/cancellation tests,
  wrong-session/surface/ref tests, continuation non-actionability, output
  redaction/framing corpus, and no OS-input/selector source scan.

## CI Break-Prevention And Escalation

- CI risk surfaces: generation/reference correctness, strict MCP schema,
  runtime FIFO/cancellation, typecheck/build, output bounds/redaction,
  provider/platform fixtures, and compatibility inventory.
- Preventive evidence: focused unit/contract/integration/platform commands are
  literal in the plan; root aggregate commands are named but intentionally
  deferred to Seneschal.
- If CI breaks: invoke `krt-ci-questor` with the PR/run/check context; do not
  poll or bypass checks from Compound artifact mode.
- Escalation rule: retain a release-follow-up blocker until the incident has a
  cause, owner, and next action; unsupported host/provider capability is an
  explicit evidence gap, not a green support claim.

## Branch and PR Handoff Inputs

- Review unit: RU1 — deterministic generation and exact actions.
- Branch name: `feat/bounded-sequences`.
- Branch/docs rule: the first executable review unit carries the related
  planning artifacts on the same semantic branch; do not create a planning/
  docs-only branch.
- PR base: `main` for RU1; refreshed RU1 integration base for RU2.
- Suggested commit grouping for RU1:
  - `feat(interaction): make reference generations outcome-driven` — reducer,
    atomic reserve/publish, action integration, and matrix tests — one logical
    stale-state authority.
  - `test(interaction): cover exact reference and editable typing outcomes` —
    focused unit/security fixtures for no-change, change, uncertainty, and
    cancellation.
- Suggested commit grouping for RU2:
  - `feat(interaction): add bounded exact-reference sequences` — executor,
    finite budgets, FIFO, early stop, final stabilization, and per-step
    outcomes.
  - `feat(mcp): expose bounded sequence contract` — additive schema/domain/
    runtime projection and compatibility tests using accepted sibling states.
  - `docs(interaction): document bounded sequence safety` — only proven
    contract/security/compatibility updates.
- PR title: Add bounded exact-reference interaction sequences.
- PR body bullets:
  - Preserve exact current-generation refs with a deterministic outcome matrix.
  - Stop safely on state changes or uncertain provider effects and return one
    final bounded snapshot.
  - Keep typing editable-only and preserve individual-tool compatibility.
- Verification results location: child state/package closeout, then the
  Seneschal aggregate evidence path.
- Production/deployment notes: unknown posture; preserve additive MCP
  compatibility, one-session ownership, bounded output, and explicit provider
  gaps; no native dialog authorization is added.
- Autonomous mutation request: none; worker shipping is disabled.

## Jira Handoff Inputs

- Jira policy: skip.
- Suggested issue type: none; Jira lookup and mutation are intentionally
  omitted by delegated contract.
- Suggested subtask behavior: none.
- PR-to-Jira mapping: not applicable under explicit `jira-policy:skip`.
- Jira summary: not applicable.
- Jira description: not applicable.
- Optional-policy fallback: not applicable; Jira is intentionally skipped.

## Implementation gate

The package is reviewable and package-ready, but implementation is blocked
until Seneschal reconciles the RDM-009, RDM-013, and RDM-014 artifact sets and
their shared revision. This is a dependency/coordination gate, not permission
to infer or locally rewrite a public contract.
