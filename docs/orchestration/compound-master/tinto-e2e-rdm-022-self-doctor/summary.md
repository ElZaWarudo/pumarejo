# RDM-022 self-doctor artifact summary

## Result

Implementation is complete for `tinto-e2e-rdm-022-self-doctor`. Both review
units are accepted with no unresolved P0-P2. The read-only doctor recommends
manual repairs but never deletes, reinstalls, upgrades, probes `PATH`, starts
toolchain processes, or runs lifecycle scripts.

## Paths

- Requirements: `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-requirements.md`
- Plan: `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-plan.md`
- Dependency map: `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-dependency-map.md`
- Work package: `docs/work-packages/RDM-022-self-doctor/2026-08-21-022-self-doctor-work-package.md`
- Review findings: `docs/review-findings/tinto-e2e-reliability/RDM-022-self-doctor/2026-08-21-document-review.md`
- Canonical state: `docs/orchestration/compound-master/tinto-e2e-rdm-022-self-doctor/state.md`

## Decisions and local design

- `doctor --self [--json]` is additive; existing project doctor behavior is
  unchanged and `--self` plus `--project` is invalid.
- RU1 groups CLI/report bounds with safe no-follow path inspection so output
  cannot claim safety without the filesystem boundary proof.
- RU2 groups lock/install/bin coherence with host/child resolver evidence.
- Traversal, symlink/junction/reparse uncertainty, and resolver unavailability
  fail closed or report conservative `unknown`; no unproven target is followed.
- Diagnostics are bounded/sanitized before human or JSON formatting.
- Jira is intentionally skipped; shipping is disabled; no product code was
  edited.

## Residual gaps

The independent CLI has no effective child-environment instance, so U53 uses
the package-approved conservative `unknown` unless accepted RDM-017 evidence is
injected. Windows native handle identity also remains unproven. These are
explicit RDM-023 platform/evidence gaps, not healthy claims.

## Verification and next invocation

Focused self-doctor and resolver suites pass 79 tests with two platform skips.
Build, typecheck, lint, and pack pass; inherited aggregate host/baseline gaps
are recorded in canonical state and the RDM-023 readiness packet. Seneschal may
now consume RDM-022; Release Marshal retains exclusive shipping ownership.
