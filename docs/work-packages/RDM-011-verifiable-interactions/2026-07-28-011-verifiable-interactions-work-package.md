---
title: Verify desktop interactions and their effects
status: review-passed
roadmap_item: RDM-011
origin_roadmap: docs/roadmaps/2026-07-28-001-real-usage-hardening-roadmap.md
origin_planning_input: docs/audits/2026-07-28-pumarejo-usage-feedback.md
origin_plan: docs/plans/2026-07-28-001-real-usage-hardening-delivery-plan.md
units: [U19, U20, U21]
review_units: [RU1, RU2]
base_branch: unresolved-final-release
pr_strategy: deferred-final-release
jira_policy: optional
production_posture: hardening
autonomy: guarded
allowed_mutation_classes: []
---

# Verify desktop interactions and their effects

## Scope

Separate dispatch from observable effect, expose before/after focus and an optional bounded post-action observation atomically, and add only the keyboard/window/pointer operations needed for desktop Tauri QA.

## Non-goals

No application assertions, arbitrary WebDriver commands/scripts, selector/text/geometry target lookup, drag-and-drop, native/OS dialogs or menus, multiple-window certification, system input, or release.

## Contract Decision Gate

Decision accepted 2026-07-28: action results separate WebDriver dispatch
from the bounded observed effect. Effects are `window_change`,
`semantic_change`, `focus_only`, `no_observable_change`, or `unknown`.
Actions refresh atomically after a bounded `settleMs` and return the complete
bounded snapshot by default. The finite additions are modifier chords,
`tauri_window`, `tauri_pointer`, `tauri_scroll`, and
`tauri_select_option`; all use exact refs where applicable and remain
WebDriver-only.

Before implementation, accept the exact effect vocabulary, snapshot/delta shape, and finite list of action names/schemas. “Dispatched” must never imply business success, and “no observable change” must be limited to the bounded observation window.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: internal diffing, focus capture, key encoding, and WebDriver adapter composition after schemas are accepted.
- Agent must escalate: new actions, native/OS fallback, effect claims beyond observable evidence, or relaxation of exact refs.
- Safe fallback: report dispatch plus unknown/no bounded effect and provide fresh observation; never fabricate activation.

## Dependencies

- Requires: RDM-009.
- Soft preference: RDM-010 status vocabulary available first.
- Blocks: RDM-012.

## Implementation Units

- U19: dispatch/focus/effect result model.
- U20: atomic bounded post-action snapshot or delta with fresh refs.
- U21: modifier chords, sizing, maximize/restore, scroll, hover, double click, context menu, and selection.

## Review Units

| RU  | Scope                                   | Expected surfaces                                                                | Size/risk note                 |
| --- | --------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| RU1 | Verified results and atomic observation | `src/interaction/`, observation coordinator, MCP schemas/runtime, contract tests | High; semantic claims and refs |
| RU2 | Finite desktop-QA actions               | WebDriver adapter, interaction schemas, Tauri fixtures/platform tests            | High; platform/focus behavior  |

## Required Behavior

- Every action reports target/ref where applicable, dispatch method, focus before/after, current generation, and bounded effect classification.
- Focus-only clicks are distinguishable from semantic/window activation and no observable change.
- `snapshotAfter` or its accepted equivalent returns only current refs and is serialized with mutation so another snapshot cannot interleave.
- Partial post-action extraction invalidates prior refs and exposes typed recovery evidence.
- Keyboard input supports accepted modifiers/chords such as `Ctrl+Shift+D`, `Alt`, `F10`, and `Ctrl+Tab`.
- Explicit resize confirms 640×480, 800×600, and 1920×1032 effective dimensions; maximize/restore reports effective state.
- Scroll, hover, double click, context menu, and option selection stay WebDriver-only and reject unsupported/native surfaces cleanly.

## Files and Tests

Primary surfaces: `src/interaction/`, `src/webdriver/`, `src/observation/`, `src/mcp/`, `src/shared/errors.ts`, `docs/contracts.md`, and interaction/fixture/platform tests.

Add fixtures for focus-only tab buttons, delayed DOM change, unchanged DOM, same-text different-state transitions, chrome/WebView boundary limitations, shadow-root focus, modifier ordering/release, viewport constraints, scroll containers, hover menus, double-click handlers, context menus, and native select controls.

## Verification Gate

| RU  | Required verification                                                                                                            | Pass signal                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| RU1 | action/effect/delta matrix; concurrency and stale-ref tests; independent-client contract tests                                   | Dispatch and bounded effect are truthful; all returned refs are current            |
| RU2 | Windows/Ubuntu Tauri focus, chord, sizing, scroll, hover, double-click, context-menu, selection, and no-OS-input instrumentation | Finite action set works through WebDriver only or returns typed unsupported errors |

Run the repository quality gate on Node 22 and 24. Correctness and security review threshold is P0-P2.

## Acceptance Trace

- Usage criteria: 5, 6, 7, and 10.
- Existing requirements: FR-019 through FR-023, NFR-001, NFR-002, BR-002, BR-010, AC-003 through AC-006, AC-013.

## Branch and PR Handoff

- Deferred branch candidate: `feat/verifiable-desktop-interactions`.
- Base: resolve during the final Release Marshal handoff after RDM-009 evidence is accepted.
- Deferred PR title: **Report verified effects for desktop Tauri interactions**.
- Evidence location: package closeout plus cross-platform interaction matrix.
- Current mutation policy: no branch, commit, push, PR, merge, Jira, or publication action.
- External mutations: none.

## Implementation Closeout

- Status: `review-passed` on 2026-07-28.
- U19 exposes a common WebDriver dispatch result with bounded focus evidence
  and the accepted effect vocabulary without claiming application or business
  success.
- U20 serializes settling, effect classification, and a fresh full bounded
  snapshot. Refined or partial pre-action observations are explicitly
  non-comparable and therefore report `unknown`.
- U21 adds the accepted finite keyboard, window, pointer, scroll, and option
  primitives. Targets remain exact current-generation WebDriver handles and
  valid `select > optgroup > option` structures are supported.
- Code review fixed refined-snapshot identity drift, false semantic-change
  classification, fresh-session restore, grouped-option selection, and MCP
  framing headroom for adversarial snapshot content. The local adversarial
  fallback corroborated the two refined-snapshot defects; no independent
  cross-model route was available.
- Validation: build, TypeScript typecheck, Prettier, scoped ESLint, and package
  dry-run passed. The complete suite passed with 373 tests and 13 documented
  skips; the RDM-011 focal matrix passed with 196 tests.
- Known repository-only lint noise remains confined to generated declaration
  files under the pre-existing `.proof-target/` evidence directories; all
  source, test, and script lint targets passed.
- Deferred evidence: authoritative Node 22/24 plus live Windows/Ubuntu Tauri
  focus, chord, sizing, pointer, scroll, selection, and no-OS-input matrices
  remain part of final release certification. No release or external mutation
  was authorized here.
