---
title: RDM-022 self-doctor document review
status: review-passed
date: 2026-08-21
run_id: tinto-e2e-rdm-022-self-doctor
review_mode: non-interactive-inline
documents:
  - docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-requirements.md
  - docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-plan.md
  - docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-dependency-map.md
  - docs/work-packages/RDM-022-self-doctor/2026-08-21-022-self-doctor-work-package.md
---

# RDM-022 self-doctor document review

## Review complete

The requirements, implementation plan, dependency map, and work package pass
the artifact gate after one local completeness fix. No P0-P2 document finding
remains. The review was run serially inline because this worker runtime exposed
no subagent dispatch surface; coverage and rationale are recorded below.

## Coverage

| Reviewer lens | Coverage | Result |
| --- | --- | --- |
| coherence-reviewer | Requirements-to-plan-to-package alignment, IDs, dependencies, scope, and status freshness. | pass; U50-U53 map one-to-one and RU1/RU2 preserve the same boundaries. |
| feasibility-reviewer | Existing CLI/project-doctor shape, RDM-017 dependency, test seams, exact verification commands, and implementation sequencing. | pass; safe fallback is explicit while RDM-017 is unavailable. |
| security-lens-reviewer | Path traversal, symlink/junction/reparse handling, no-follow behavior, lifecycle execution, host/child resolver boundary, and output sanitization. | pass; fail-closed behavior and bounded pre-serialization sanitization are explicit. |
| scope-guardian-reviewer | 12 requirements, non-goals, RDM-020/RDM-021/RDM-017 overlap, and downstream RDM-023 boundary. | pass; package remains limited to self-install diagnostics. |
| adversarial-document-reviewer | Challenge claims that package-manager links can be trusted, that resolver health can be inferred from host state, and that a diagnostic can remain read-only. | pass; accepted links require bounded provenance, unknown resolver state is conservative, and tests assert no writes/scripts. |

No persona returned a malformed result; no reviewer was dropped. This was an
inline serial review rather than a delegated persona run.

## Applied fix

1. **Applied — make bounds and stable IDs executable rather than aspirational.**
   Added the initial `self.*` diagnostic ID list and explicit limits (32
   diagnostics, 512-character summary/action, 64-character reason, 128-character
   manager/version/source fields, 16 evidence fields, depth 8, 256 entries,
   1 MiB per file, 8 MiB total, and 5-second resolver/process probes) to the
   requirements, plan, and work package. A limit emits `self.report.bounds`
   instead of raw truncation.

## Entailed implementation obligations

- Keep `doctor --self` additive and reject ambiguous `--self` plus `--project`
  usage without inspecting a project.
- Assert unchanged filesystem state and zero install/delete/rename/chmod/script
  calls for every diagnostic scenario.
- Check lexical and canonical containment before reading metadata; no-follow
  unknown or unsafe links/junctions/reparse entries.
- Sanitize before report storage/serialization in both human and JSON modes.
- Keep U53 conservative until RDM-017 publishes the accepted resolver contract.

## Residual concerns

- **RDM-017 contract timing:** the exact adapter field names and child resolver
  provenance remain dependency-owned. U53 is implementation-blocked for healthy
  compatibility claims until that contract is review-passed.
- **Windows reparse evidence:** platform support may not expose a complete
  reparse classification in every CI environment. The package requires an
  injected unknown path and a conservative unsafe result; a CI-only gap must
  name its owner and next evidence command.

These are recorded gates, not unresolved document findings.

## Verification

- Work-package checker: passed.
- Product tests: intentionally not run; no product code changed.
- Future focused checks: unit/path, integration, contract, and platform
  self-doctor commands plus root build/typecheck/lint/format/test/pack gates,
  all listed verbatim in the work package.

Review complete.

