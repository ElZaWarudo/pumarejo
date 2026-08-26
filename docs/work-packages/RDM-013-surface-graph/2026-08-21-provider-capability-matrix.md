---
title: RDM-013 provider capability matrix
status: implementation-evidence
roadmap_item: RDM-013
compound_run_id: tinto-e2e-rdm-013-surfaces
---

# Provider capability matrix

This matrix records the provider evidence used by RU1/RU2. A static provider
brand is never treated as proof of support. The implementation emits a stable
state/code pair from the bounded discovery probe and keeps unsupported or
inconclusive contexts non-actionable.

| Context/operation                       | Windows WebDriver                                     | Linux WebDriver                                       | Evidence/code                                                                 | Public behavior                       |
| --------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------- |
| Top-level window discovery              | supported                                             | supported                                             | `provider_window_enumerated`                                                  | bounded window records                |
| Top-level window selection              | supported                                             | supported                                             | `provider_window_selectable`                                                  | exact owned window selection          |
| Root semantic observation               | supported                                             | supported                                             | `provider_semantics_available`                                                | current-generation refs               |
| Root interaction                        | supported                                             | supported                                             | `provider_actions_available`                                                  | WebDriver-only actions                |
| Root screenshot                         | supported                                             | supported                                             | `provider_screenshot_available`                                               | validated PNG metadata/image          |
| Open shadow/panel discovery             | supported when returned by probe                      | supported when returned by probe                      | `provider_context_enumerated`                                                 | parented graph record                 |
| Open shadow/panel observation           | supported through existing traversal                  | supported through existing traversal                  | `provider_context_reachable`                                                  | exact refs remain root-session scoped |
| Open shadow/panel selection             | unsupported by dedicated provider switch              | unsupported by dedicated provider switch              | `nested_selection_unavailable`                                                | non-actionable, inspect owning root   |
| Reachable iframe discovery              | supported when probe returns reachable                | supported when probe returns reachable                | `provider_context_reachable`                                                  | bounded frame record                  |
| Reachable iframe selection              | supported when exact W3C frame commands are available | supported when exact W3C frame commands are available | `provider_frame_selectable`                                                   | exact frame switch, fresh generation  |
| Cross-origin/closed/unreachable context | unsupported or unavailable                            | unsupported or unavailable                            | `nested_cross_origin`, `nested_closed_root`, or `nested_provider_unavailable` | gap evidence only                     |
| Screenshot geometry inconclusive        | coverage unknown                                      | coverage unknown                                      | `coverage_unknown`                                                            | no OCR/coordinate fallback            |

## Verification evidence

- `tests/unit/surfaces.test.ts` proves bounded graph metadata, no raw provider
  handles, stale graph rejection, unsupported context denial, and conservative
  coverage gaps.
- `tests/integration/surface-graph.test.ts` proves dynamic window refresh,
  exact frame selection when the provider exposes frame commands, and return to
  the owning context before refresh.
- `tests/unit/snapshot-surface.test.ts` proves selected-surface metadata and
  generation invalidation.
- Existing `tests/unit/snapshot-browser.test.ts` and
  `tests/integration/snapshot-fixture.test.ts` cover open-shadow traversal and
  exact current-generation element handles.

## Environment limits

The current host permits structural/unit/integration evidence. The literal
Windows and Linux native provider gates remain environment-dependent and are
reported as CI/platform evidence when their host gates are unavailable; no
provider support claim is inferred from a skipped native run.
