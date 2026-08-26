---
title: RDM-013 surface graph implementation closeout
status: ci-prevention-ready
date: 2026-08-24
run_id: tinto-e2e-rdm-013-surfaces
---

# RDM-013 surface graph implementation closeout

## Outcome

RDM-013 is implemented in two serialized review units. RU1 adds additive
surface discovery/selection operations, bounded graph metadata, explicit
capability outcomes, and session/generation binding. RU2 adds provider-context
evidence, exact W3C frame switching where available, conservative coverage
diagnostics, fixtures, and maintained security/compatibility documentation.

The approved decisions are persisted: dedicated discovery/selection tools,
the explicit `supported`/`unsupported`/`unavailable`/`denied`/`failed` matrix,
and conservative provider-region coverage with `coverage_unknown`.

## Changed surfaces

- Product: `src/observation/surfaces.ts`, screenshot/schema/snapshot integration,
  MCP domain/schema/server/runtime/tool registry, stable surface errors, and
  WebDriver frame operations.
- Tests: surface graph unit/integration tests, snapshot surface generation
  test, MCP contract dispatch/schema updates, stable-error contract updates.
- Docs: contracts, architecture, compatibility, security, provider matrix,
  requirements/plan/package decision resolution, code/security reviews, and
  canonical child state.
- Excluded and preserved: installer, process custody, environment/toolchain,
  RDM-009-owned package/state, and RDM-014+ sibling product surfaces.

## Verification

- Pass: work-package checker, typecheck, build, integration (67 passed/5
  skipped), contract (49 passed), platform structural (11 passed/5 skipped),
  lint, and all targeted RDM-013 tests.
- Environment blocker: `pnpm test:platform:windows` stops at the authoritative
  `PUMAREJO_RUN_PROVIDER=1 is required` gate; no native Windows support claim
  is made.
- CI baseline gap: full `pnpm format:check` reports 139 existing repository
  formatting warnings; all changed RDM-013 source/test/docs files pass targeted
  Prettier validation. `pnpm test:unit` has five existing sibling/host failures
  (RDM-017 mode-config expectations and Windows artifact-permission module
  loading); focused RDM-013 units pass.

## Review and handoff

- Code review: pass at P0-P2 threshold; no unresolved correctness, contract,
  or compatibility blocker.
- Security review: pass; stale/foreign surface refs, provider disclosure,
  unsupported contexts, bounded output, and non-actionable coverage evidence
  are covered. Native provider publication remains an advisory host gate.
- Release readiness: ready for Seneschal aggregate reconciliation only. This
  child performed no commit, push, PR, Jira, reviewer request, merge, or
  release action.

## Parent next action

Run the aggregate build/typecheck/lint/format/test/pack fingerprint, reconcile
RDM-013's public contract with RDM-014/RDM-015/RDM-018/RDM-019, and hand the
result to the release owner under the parent's authority.
