---
title: RDM-020 attributed drift document review
status: review-passed
artifact_status: artifacts-ready
date: 2026-08-21
roadmap_item: RDM-020
compound_run_id: tinto-e2e-rdm-020-attributed-drift
review_mode: non-interactive
review_role: ce-doc-review
security_role: krt-security-sentinel-design-gate
---

# RDM-020 attributed drift document review

## Review scope and coverage

Reviewed the focused implementation plan and human-reviewable work package as
one RDM-020 artifact set:

- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-020-attributed-drift-plan.md`
- `docs/work-packages/RDM-020-attributed-drift/2026-08-21-020-attributed-drift-work-package.md`

The non-interactive review used coherence, feasibility, scope, and security
lenses. It was completed inline in the serial artifact lane; no product-code,
test, config, Jira, or reviewer mutation was dispatched.

## Evidence inspected

- Approved initiative contract:
  `docs/plans/tinto-e2e-reliability/initiative-requirements.md`, REL-012.
- Roadmap: `docs/product/roadmap.md`, RDM-020 and its RDM-017 dependency.
- Approved gap audit: `docs/audits/2026-08-21-tinto-gap-audit.md`, REL-012
  evidence and recommended attribution decomposition.
- Existing installer ownership and attribution surfaces under `src/installer`
  and focused doctor/init/remove tests, read-only.
- Current worktree ownership: RDM-009 and RDM-013 sibling artifacts/code are
  outside this run; RDM-017 project-detection files are user-owned dirty
  surfaces and explicitly excluded.

## Review result

**Document gates passed. Artifact status is `review-passed/artifacts-ready`.**
The plan and package agree on two review units, exact owned projections, Cargo
semantic checks, the isolated capability schema, config-field attribution,
secondary hashes, compatibility boundaries, literal verification commands,
and the RDM-017 dependency. No product decision, blocker, or unresolved P0-P2
finding remains.

## Findings and routing

| ID | Severity | Finding | Route | Resolution/evidence |
| --- | --- | --- | --- | --- |
| DR-020-001 | none | No actionable coherence, feasibility, scope, or security finding. | No action | Exact attribution precedence and fail-closed behavior are stated in both artifacts. |

No proposed fix, decision request, residual blocker, or deferred product
question remains.

## Security/public-contract gate summary

- Attribution is evaluated before trusting a full-file hash; forged hashes do
  not rescue changed owned content.
- Rust and ignore markers, Cargo dependency/features, owned config fields, and
  the isolated capability are bounded semantic projections.
- The generated capability requires the exact `pumarejo-agent` identifier,
  initialized window, and ordered `AGENT_PERMISSIONS`, with no extra keys.
- Malformed, duplicated, missing, symlinked, or otherwise unsafe owned content
  fails closed; `doctor` does not repair or revert user edits.
- No new MCP endpoint, authority, secret disclosure, raw content, or external
  mutation is introduced by the artifact packet.

## Mechanical verification

```text
python C:\Users\User\.agents\skills\krt-compound-master\scripts\check_work_package.py docs/work-packages/RDM-020-attributed-drift/2026-08-21-020-attributed-drift-work-package.md
```

Result: `work package review-unit checks passed`.

Product tests were intentionally not run: this is artifact mode and the
delegated scope forbids product-code/test/config edits. Future implementation
must run `pnpm test:unit`, `pnpm test:integration`, and `pnpm test:contract`;
aggregate verification remains Seneschal/root-owned.

## Dependencies, blockers, and handoff

- Dependency: RDM-017's accepted project/config detection contract.
- Blockers: none for artifact reconciliation; implementation consumes the
  dependency before execution.
- Decisions: none; `open_decisions: []` is recorded in the plan.
- Artifact status: `review-passed/artifacts-ready`.
- Release status: ready for Seneschal/root reconciliation, not a release or PR
  approval.

Exact resume invocation:

```text
krt-compound-master mode:resume package:docs/work-packages/RDM-020-attributed-drift/2026-08-21-020-attributed-drift-work-package.md review-unit:RU1 orchestrator:seneschal run-id:tinto-e2e-rdm-020-attributed-drift state-path:docs/orchestration/compound-master/tinto-e2e-rdm-020-attributed-drift/state.md initiative-contract:docs/plans/tinto-e2e-reliability/initiative-requirements.md interaction:brokered jira-policy:skip parallel:false
```

Exact execute invocation after dependency reconciliation:

```text
krt-compound-master mode:execute package:docs/work-packages/RDM-020-attributed-drift/2026-08-21-020-attributed-drift-work-package.md review-unit:RU1 orchestrator:seneschal run-id:tinto-e2e-rdm-020-attributed-drift state-path:docs/orchestration/compound-master/tinto-e2e-rdm-020-attributed-drift/state.md initiative-contract:docs/plans/tinto-e2e-reliability/initiative-requirements.md interaction:brokered jira-policy:skip parallel:false
```

RU2 follows RU1's accepted evaluator contract on the same reconciled base.
