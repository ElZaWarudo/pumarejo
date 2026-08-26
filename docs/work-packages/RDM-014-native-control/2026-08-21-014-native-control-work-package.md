---
title: Truthful native control and Tauri dialog decisions
status: completed
roadmap_item: RDM-014
origin_roadmap: docs/product/roadmap.md
origin_brainstorm: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-014-native-control-requirements.md
origin_planning_input: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-014-native-control-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-014-native-control-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
compound_run_id: tinto-e2e-rdm-014-native-control
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-014-native-control/state.md
units: [U32, U33]
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
applied_decisions:
  DEC-2026-08-21-003: additive dedicated discovery and selection operations; existing calls remain backward compatible
  DEC-2026-08-21-004: supported, unsupported, unavailable, denied, and failed states with stable codes and bounded sanitized evidence
decisions_source: docs/plans/tinto-e2e-reliability/initiative-requirements.md#approved-decisions-and-escalation-boundaries
decisions_applied_at: 2026-08-21T12:04:48Z
---

# Truthful native control and Tauri dialog decisions

## Scope

This package defines the implementation-ready shape for truthful window support and explicit Tauri dialog control within one owned application session. It covers launch-scoped effective capability probing, bounded initial/effective window dimensions, provider postcondition verification, supported Tauri dialog detection, grant validation, explicit accept/cancel, replay resistance, and bounded sanitized default evidence.

This nested execute run implements the owned central MCP/session/provider/window/dialog slice and its focused tests. Public dialog MCP operation naming remains deferred because the package explicitly requires escalation for that public contract; the internal runtime seam and provider boundary are complete. No Jira, commit, PR, merge, release, process/environment/installer sibling, or RDM-013 surface mutation was performed.

## Non-goals

- Arbitrary operating-system dialogs, menus, screen-coordinate input, OCR, generic desktop automation, shell/command passthrough, arbitrary JavaScript, or unrestricted WebDriver/Tauri commands.
- Treating existing WebDriver JavaScript-alert endpoints as Tauri dialog support without provider fixture evidence.
- Defining or changing the RDM-013 public surface operation shape or capability vocabulary. RDM-014 consumes the applied DEC-003/004 contract and does not define a competing shape.
- Replacing RDM-015's sanitize-before-store sink or creating an independent observability query surface.
- Redefining RDM-016 process custody, nonce/ancestry validation, cleanup, or repair authority.
- Implementing RDM-018 sequence/generation composition or RDM-019 public Tinto certification.
- Editing sibling package/state/review files or shared queue/ledger artifacts.

## Autonomy Contract

- **Mode:** execute, high local implementation autonomy within the delegated central control surfaces.
- **Agent may decide without asking:** package-local document structure, U-ID names, the RU1/RU2 boundary, equivalent read-only inspection commands, conservative provider-feasibility evidence formatting, and bounded evidence field examples that do not become public vocabulary.
- **Agent must record as assumptions:** current ownership inferred from the repository tree; RDM-013 remains the owner of surface API and capability vocabulary; initial-size input is additive and uses the existing dimension bounds unless the canonical contract changes it; the provider bridge may be unsupported until a fixture proves it.
- **Agent must escalate:** DEC-003/004, public MCP operation/schema names, public outcome/error vocabulary, dialog authorization transport, process/session/nonce/generation contract changes, provider support claims, capability manifest security semantics, branch/base strategy, credentials, Jira/PR workflow, or scope outside this package.
- **Safe fallback:** when feasibility or authorization cannot be proven, report the canonical unsupported/denied outcome and keep the decision action disabled. This is an implementation verification result, not a product-package blocker.
- **Autonomous ledger:** inherited contract remains non-shipping; the parent explicitly authorized this nested implementation despite the artifact-era empty mutation list.
- **Allowed external mutation classes:** none; local product implementation and focused verification only.

## Dependencies

- **Requires:** accepted RDM-013 surface contract with applied DEC-003 and DEC-004 answers; provider feasibility evidence for a supported Tauri dialog boundary during implementation; existing one-session/process/nonce/generation contracts; RDM-015 sink contract for final public evidence projection.
- **Consumes:** existing `src/webdriver/client.ts` window/alert seams, `src/session` ownership state, `src/installer/capabilities.ts` composition, and bounded output/security rules from the initiative contract.
- **Blocks:** RDM-018 sequences/reference generation composition and RDM-019 Tinto certification until both review units have accepted evidence.
- **Sibling ownership:** RDM-013 owns surface graph/API and capability vocabulary; RDM-015 owns observability sink/query; RDM-018 owns sequence and generation composition; RDM-016 owns process custody; RDM-020 owns attributed installer drift. This child consumes those contracts and does not edit their artifacts.

## Production Posture

- **Posture:** unknown.
- **Evidence:** the inherited initiative describes a local developer validation tool and provides no live/preproduction deployment contract.
- **Confidence:** medium.
- **Consequences:** preserve additive compatibility, one-session ownership, `stdio`, bounded sanitized output, and explicit provider support evidence. Do not infer rollout, rollback, or deployment behavior.
- **Breaking existing behavior allowed:** only with explicit approval; no-surface behavior and existing window calls remain compatible.

## Plan Unit Alignment

| Plan unit | Included in this package | Reason |
| --- | --- | --- |
| U32 | yes | Effective capability probes, initial/effective dimensions, window postconditions, and typed provider outcomes form the truthful window-control slice. |
| U33 | yes | Provider dialog detection, grant validation, explicit accept/cancel, replay resistance, and bounded evidence form the native authorization slice. |

Grouping rationale:

- RU1 combines the effective window probe and action postcondition work because both use the same provider/session boundary and share compatibility evidence.
- RU2 isolates native dialog authority because grant/replay/security review has a distinct risk profile and requires provider feasibility evidence.
- The two-unit stack is the coarsest independently reviewable decomposition that keeps the native authority decision focused. It is not split for atomicity or Jira shape.

## Implementation Units

- **U32 — Effective window capabilities and verified sizing:** launch probe; additive bounded initial dimensions; resize/maximize/restore dispatch; effective rect/state postcondition; typed internal outcomes; canonical sanitized producer evidence and public mapping.
- **U33 — Tauri dialog bridge, grant, and decision evidence:** provider feasibility adapter; supported dialog metadata; private dialog instance state; launch-scoped allowed-action grant; one-shot accept/cancel; postcondition; bounded sanitized producer evidence; fail-closed unsupported fallback.

## Review Units

| Review unit | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
| --- | --- | --- | --- | --- | --- |
| RU1 | U32 effective capability probing, initial/effective dimensions, window action postconditions, and focused compatibility evidence. | `src/webdriver/`, `src/interaction/`, `src/session/`, additive dedicated `src/mcp/` and `src/config/` wiring, `src/installer/capabilities.ts`, focused unit/contract/integration/platform tests, maintained contract/security/compatibility docs, and generated capability fixtures kept with the permission-composition proof. | `main` | skip (Jira policy explicitly skipped) | High provider/public-contract risk; target <=500 human-authored lines. Generated fixtures are mechanical evidence, not a separate review unit. Public projection follows applied DEC-003/004. |
| RU2 | U33 supported Tauri dialog provider bridge, detection, grant validation, explicit accept/cancel, postcondition, evidence, and security fixtures. | `src/webdriver/`, `src/interaction/`, `src/session/`, narrow `src/mcp/` and capability wiring after decisions, provider/plugin adapter if feasibility requires it, focused unit/contract/integration/platform tests, maintained docs. | RU1 branch after parent merge or approved retarget | skip (Jira policy explicitly skipped) | High authorization/native-boundary risk; target <=500 human-authored lines. Provider support must be proven; unsupported fallback is a valid outcome. |

## Reviewability Diagnosis

- **Reviewer-experience check:** yes. RU1 is a coherent provider truthfulness and window postcondition slice. RU2 is a coherent native authorization and audit slice. Each has focused tests and can be understood after its predecessor without a deep mental stack.
- **Granularity chosen because:** the split separates a reusable provider/window capability concern from a high-risk native authorization boundary with independent feasibility and replay verification.
- **Open-stack plan:** two stacked PRs maximum, target and hard cap 2. At the cap, wait for the parent merge into `main` and retarget RU2, or collapse onto the refreshed integration base. Do not accumulate a deeper chain or create a docs-only consolidation branch.
- **Jira mapping:** Jira is intentionally skipped. If a later release run enables Jira, each review unit maps to one standalone semantic Tarea; no fabricated parent/subtask hierarchy is planned.
- **Downstream-fix trace:** none at artifact creation. A later unit must record `addresses finding from PR #X` if it fixes an at-threshold finding from an earlier open PR.
- **Failure-mode check:** passes; this is neither a deep micro-PR stack nor a deferred mega-consolidation PR.

## Files and Tests

Future implementation surfaces are expected to include:

- `src/webdriver/client.ts`, `src/webdriver/protocol.ts`, and provider error normalization for effective window probing, bounded dialog metadata, decision operations, and postconditions.
- `src/interaction/engine.ts`, `src/session/manager.ts`, and `src/session/state.ts` for action serialization, one-session binding, current surface/generation, and private grant/dialog state.
- `src/mcp/domain-ports.ts`, `src/mcp/schemas.ts`, `src/mcp/server.ts`, `src/mcp/runtime.ts`, and `src/mcp/tools/index.ts` only after DEC-003/004 for additive public projection.
- `src/config/schema.ts` and `src/config/generate.ts` for any approved additive initial-size input, preserving existing bounds and defaults.
- `src/installer/capabilities.ts` and generated Tauri capability fixtures for additive application permissions, preserving unrelated entries and markers.
- A narrowly scoped provider/plugin adapter under the existing vendor boundary only if feasibility proves it is the supported Tauri dialog source. No arbitrary Tauri command is allowed.
- `tests/unit/interaction.test.ts`, `tests/unit/webdriver-client.test.ts`, `tests/unit/mcp-runtime.test.ts`, `tests/contract/mcp-server.test.ts`, `tests/contract/real-usage-journey.test.ts`, `tests/integration/`, `tests/platform/provider-proof.test.ts`, `tests/platform/public-journey.test.ts`, and relevant fixture files.
- Maintained `docs/contracts.md`, `docs/security.md`, and `docs/compatibility.md` text only for behavior proven by the implementation.

Required future scenarios include successful and denied window capability, unsupported/unavailable/incompatible/failed postcondition outcomes, initial and effective dimensions, native dialog detection, finite sanitized metadata, missing/wrong/replayed grant, wrong session/process/nonce/surface/generation, timeout/no-choice, authorized accept/cancel, failed postcondition, redaction, and provider unsupported truth on Windows/Linux where available.

Literal focused commands assigned to the future implementation are `pnpm test:unit`, `pnpm test:contract`, `pnpm test:integration`, and `pnpm test:platform:windows`; `pnpm test:platform:linux` is required when the host permits it. The parent owns aggregate `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm pack:check`.

## Impact Scan

- **Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/tenant/ownership/test fixtures:** future additive capability metadata, window initial-size input if approved, native dialog detection/decision projection, provider adapter routes, launch-scoped grant binding, and sanitized evidence fields. No such product surface is changed in the current run.
- **Consumer scan patterns:** `rg "tauri_window|windowAction|setWindowRect|window/maximize|alert|dialog|capability|generation|nonce|surface|DomainPorts" src tests docs`.
- **Consumers found:** `src/interaction/engine.ts`, `src/webdriver/client.ts`, `src/mcp/domain-ports.ts`, `src/mcp/schemas.ts`, `src/mcp/server.ts`, `src/mcp/runtime.ts`, `src/mcp/tools/index.ts`, `src/session/manager.ts`, `src/session/state.ts`, `src/installer/capabilities.ts`, provider endpoint allowlists, unit/contract/integration/platform fixtures, and the vendored WebDriver alert state.
- **Contract-drift tests searched:** strict MCP tool/schema assertions, existing window-action schemas, effective-rect tests, stale/current-generation tests, process/nonce ownership tests, capability composition fixtures, provider endpoint allowlists, redaction tests, and public-journey tests.
- **Required consumer tests:** the four focused commands above, provider feasibility fixtures, and the parent-owned aggregate commands.
- **Consumer tests run/skipped:** skipped because `mode:artifacts` forbids product tests and product edits. This is an explicit implementation gate, not a pass claim.

## Verification Gate

- **Package checker:** run `python <compound-master-skill-dir>/scripts/check_work_package.py docs/work-packages/RDM-014-native-control/2026-08-21-014-native-control-work-package.md`; this child must obtain `work package review-unit checks passed`.
- **Artifact checks:** run `git diff --check` scoped to the seven owned artifact paths. No product test or release command is authorized.
- **Surface-aware evidence:** RU1 must prove provider capability truth, dimensions, action postconditions, ownership binding, and no-surface compatibility. RU2 must prove provider dialog source, bounded metadata, grant/replay binding, explicit decision, postcondition, redaction, and unsupported fallback.
- **Decision evidence:** canonical DEC-003/004 answers are persisted and cited. Implementation must map outcomes to the canonical public shape and state matrix without introducing a competing vocabulary.
- **Production posture evidence:** posture is unknown. Future execution must show additive compatibility, security review, platform/provider results, and no deployment assumptions.

## Review Gate

- **Code review threshold:** P0-P2 for future implementation; no code review is run in this artifact-only child.
- **Findings below threshold:** record as advisory. No finding may be used to claim unsupported provider behavior or relax grant/ownership rules.
- **Document review:** required for this artifact set. The non-interactive review records the applied DEC-003/004 contract and provider feasibility verification requirement.

## Security Gate

- **Run after work-review loop:** required because this package crosses authorization, public API, native provider boundary, session/process/nonce ownership, audit evidence, and potentially sensitive dialog content.
- **Security Watch during work:** enabled for future execution; current artifact review is read-only and performs no intrusive scan.
- **Security Watch notes:** never expose grant material, nonce, private provider IDs, raw paths, or raw causes; never treat timeout as a decision; never allow cross-session or wrong-generation action; do not equate JavaScript alerts with Tauri dialogs without evidence.
- **Security reviewer:** `krt-security-sentinel` in future implementation; inline design review is recorded in the durable document review.
- **Security review result:** pending implementation and provider feasibility verification; artifact design passed with grant, ownership, replay, and redaction checks retained.
- **Required security verification:** seeded redaction corpus; grant entropy/format and one-shot consumption tests; replay and cross-session/process/nonce/surface/generation tests; unsupported/denied provider tests; bounded metadata and finite-button tests; capability-composition fixtures; no implicit timeout decision; provider bridge authentication tests.

## CI Break-Prevention And Escalation

- **CI risk surfaces:** strict MCP schemas, provider endpoint allowlists, Tauri capability composition, generated capability fixtures, session/generation state, grant authorization, native provider behavior, sanitization, and Windows/Linux platform suites.
- **Preventive evidence:** focused commands and provider feasibility matrix are named; product evidence is intentionally absent in this artifact-only run. Parent aggregate fingerprint is required after serialized changes.
- **If CI breaks:** invoke `krt-ci-questor` with the workflow/job/check context; do not poll checks in Compound Master.
- **Escalation rule:** record a release-follow-up blocker with cause, owner, and next action. Never bypass a red check or mark provider support from a skipped platform test.

## Execution closeout

- **RU1/U32:** complete. The authenticated provider capability probe records
  per-action `supported|unsupported|unavailable|denied|failed` outcomes;
  initial sizing is additive and bounded; resize/maximize/restore return a
  fresh effective rect and reject mismatched resize postconditions.
- **RU2/U33:** complete for the private provider/runtime boundary. Dedicated
  Tauri-dialog routes only are used; metadata is bounded and sanitized; the
  launch-scoped random grant is private, action-limited, bound to session,
  process, nonce, surface, generation, and detected dialog instance, then
  consumed once. Current vendored provider exposes browser-alert plumbing but
  no dedicated Tauri-dialog boundary, so runtime evidence is `unsupported` and
  no decision is claimed. Public MCP dialog operation naming/transport is a
  recorded parent decision gate, not silently invented here.
- **Focused unit verification:** `pnpm typecheck` passed; targeted ESLint
  passed; RU1/RU2/runtime unit run passed 5 files, 81 tests.
- **Natural verification:** `pnpm test:contract` passed 5 files, 49 tests;
  `pnpm test:integration` passed 6 files, 67 tests, with 4 files and 5 tests
  skipped by provider/fixture gates. The narrower endpoint/contract run also
  passed 4 files, 45 tests with 1 provider test skipped.
- **Full unit verification:** 21 files, 311 passed, 2 skipped, 5 failed.
  All failures are pre-existing host/environment assumptions: unavailable
  PowerShell `Get-Acl` module and tests expecting `C:\nvm4w` while this host
  resolves `C:\ProgramData\nvm\v24.13.0`. No RDM-014 test failed.
- **Build:** `pnpm build` passed, including the build in `pnpm test:contract`.
- **Review/security:** focused manual code/security review found no P0/P1
  issue. Tests cover bounded metadata, unsupported truth, authenticated
  provider routing, wrong action/session/process/nonce/surface/generation,
  detected-instance replacement, replay, one-shot consumption, and decision
  postconditions. Provider support remains unclaimed without a fixture.
- **Scope guard:** no commit, push, PR, Jira, release, installer, process,
  environment, or sibling package mutation was performed.

## Branch and PR Handoff Inputs

- **Review unit:** RU1 — effective window capability and verified sizing.
- **Branch name:** `feat/truthful-native-control`.
- **Branch/docs rule:** the first executable review unit carries the related planning and maintained contract docs on the semantic implementation branch. No planning/docs-only branch is allowed.
- **PR base:** `main` for RU1; RU1 integration base for RU2 after parent merge or an explicitly reconciled retarget.
- **Suggested commit grouping for this review unit:**
  - `feat(window): expose effective provider capabilities` — private probe, sizing/postcondition behavior, provider/session tests, and approved public projection; one truthful window capability slice.
  - `docs(window): document provider truth and compatibility` — maintained contract/security/compatibility text tied to proven behavior.
- **PR title:** Expose truthful native window capabilities.
- **PR body bullets:**
  - Adds provider-backed capability probing and effective window postcondition evidence for one owned Tauri session.
  - Preserves exact references, bounded output, capability composition, and unsupported-provider truth.
  - Includes focused unit, contract, integration, and platform evidence with any provider gap named.
- **Verification results location:** future package closeout and sanitized implementation evidence; no product result is claimed by this artifact run.
- **Production/deployment notes:** posture unknown; release requires additive compatibility and provider/security evidence.
- **Autonomous mutation request:** none; shipping is disabled and the inherited ledger does not authorize local release mutations.

## Jira Handoff Inputs

- **Jira policy:** skip.
- **Suggested issue type:** none.
- **Suggested subtask behavior:** none; Jira is intentionally not queried or mutated.
- **PR-to-Jira mapping:** not applicable under `jira-policy:skip`.
- **Jira summary:** not applicable.
- **Jira description:** not applicable.
- **Optional-policy fallback:** not applicable; this child explicitly uses `jira-policy:skip`.

## Applied Decisions

- **DEC-2026-08-21-003 / DEC-003:** applied from the initiative contract: use additive dedicated discovery and selection operations and preserve existing calls. Affects U32/U33 public projection, MCP tests, and owning-surface correlation.
- **DEC-2026-08-21-004 / DEC-004:** applied from the initiative contract: use `supported`, `unsupported`, `unavailable`, `denied`, and `failed` states with stable codes and bounded sanitized evidence. Affects U32/U33 outcome mapping and evidence tests.
- **Provider feasibility verification:** supported Tauri dialog source, finite metadata, explicit decision operation, and postcondition must be demonstrated during implementation. A failure records canonical unsupported truth and keeps RU2's decision action disabled; it does not block the product package or authorize fallback automation.

## Resume and Execute Invocations

Resume the package after reconciliation with:

```text
Use krt-compound-master with mode:resume package:docs/work-packages/RDM-014-native-control/2026-08-21-014-native-control-work-package.md review-unit:RU1 jira-policy:skip parallel:false orchestrator:seneschal run-id:tinto-e2e-rdm-014-native-control state-path:docs/orchestration/compound-master/tinto-e2e-rdm-014-native-control/state.md initiative-contract:docs/plans/tinto-e2e-reliability/initiative-requirements.md interaction:brokered autonomy:high autonomous-ledger:docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json
```

Execute the first review unit with:

```text
Use krt-compound-master with mode:execute package:docs/work-packages/RDM-014-native-control/2026-08-21-014-native-control-work-package.md review-unit:RU1 jira-policy:skip parallel:false orchestrator:seneschal run-id:tinto-e2e-rdm-014-native-control state-path:docs/orchestration/compound-master/tinto-e2e-rdm-014-native-control/state.md initiative-contract:docs/plans/tinto-e2e-reliability/initiative-requirements.md interaction:brokered autonomy:high autonomous-ledger:docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json
```
