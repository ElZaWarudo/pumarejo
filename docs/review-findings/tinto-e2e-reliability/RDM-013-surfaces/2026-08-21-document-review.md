---
title: RDM-013 surface graph document review
status: superseded-by-execution-evidence
date: 2026-08-21
roadmap_item: RDM-013
compound_run_id: tinto-e2e-rdm-013-surfaces
review_mode: non-interactive
review_role: ce-doc-review
security_role: krt-security-sentinel-design-gate
---

# RDM-013 surface graph document review

## Review scope and coverage

Reviewed the focused requirements-only input, implementation plan, dependency/
overlap map, and work package as one RDM-013 artifact set:

- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-013-surface-graph-requirements.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-013-surface-graph-plan.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-013-surface-graph-dependency-map.md`
- `docs/work-packages/RDM-013-surface-graph/2026-08-21-013-surface-graph-work-package.md`

The review used the resolved document-review role's coherence and feasibility
lenses, with product-contract, adversarial-surface, and security design lenses
activated because the package changes public MCP planning, exact references,
provider context selection, screenshots, and untrusted application data. The
review was performed inline in the serial artifact lane; no mutating reviewer
or product-code worker was dispatched.

## Evidence inspected

- Initiative contract: `docs/plans/tinto-e2e-reliability/initiative-requirements.md`
  (`artifact_contract: ce-unified-plan/v1`, requirements-only, approved).
- Roadmap: `docs/product/roadmap.md` RDM-013 and dependency graph.
- Existing public contracts: `docs/contracts.md`, `docs/architecture.md`,
  `docs/compatibility.md`, and `docs/security.md`.
- Existing surface implementation boundaries under `src/observation`,
  `src/webdriver`, `src/session`, `src/mcp`, and focused unit/integration/
  contract/platform tests.
- Shared artifact bundle hashes: initiative contract
  `316162394faf3dc5a898e6af7f915ac712fd8e24d22af79ee1c220a0adba4805`, roadmap
  `846b74d7607dbe5ae8e2e5a24425d0dbb63262f947c7b1b1760330fe5d44a0d6`.

## Review result

**Document gates passed with three explicit brokered decision gates.** This
historical review was superseded by the 2026-08-24 execution evidence after
all three decisions were brokered and recorded in the initiative contract. The
artifact set is coherent, scoped to RDM-013, maps U24-U27 into two reviewable
units, preserves RDM-009 and installer ownership boundaries, names literal
focused checks, and records a two-PR stack cap. It is not an implementation or
release approval.

## Findings and routing

| ID         | Severity                     | Finding                                                                                                                                          | Route                                                                    | Resolution/evidence                                                                                                  |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| DR-013-001 | P1 contract gate             | Exact public discovery/selection API shape is not inferable from the inherited requirements.                                                     | Brokered decision; blocks U24/U25/RU1 only.                              | Requirements, plan, and package all carry the question, recommendation, safe fallback, and canonical target.         |
| DR-013-002 | P1 contract/security gate    | Capability-state vocabulary must distinguish provider limitation, denial, unavailability, and postcondition failure without overstating support. | Brokered decision; blocks U25/U26/RU1/RU2 only.                          | Package requires provider evidence, typed outcomes, and conservative unsupported fallback.                           |
| DR-013-003 | P2 diagnostic gate           | Pixel/geometry granularity and threshold for screenshot-to-semantics gaps are not specified.                                                     | Brokered decision; blocks U27/RU2 only.                                  | Package requires conservative unknown state, bounded evidence, and no OCR/coordinate action.                         |
| F-013-004  | P2 security design note      | Nested context identity can become a cross-session or stale-ref authority if graph generation and session binding are not enforced.              | Required implementation/security verification.                           | Plan and package require session/generation/parentage validation, wrong-session tests, and no raw handle disclosure. |
| F-013-005  | P2 provider feasibility note | Existing docs explicitly exclude closed roots and out-of-process surfaces; a provider brand cannot prove iframe/WebView reachability.            | Required read-only feasibility probes; no contract claim until evidence. | Requirements and map require provider/runtime matrix and truthful gaps; no unsupported provider is invented.         |
| F-013-006  | P3 compatibility note        | Existing `tauri_snapshot` behavior must remain valid when no surface is supplied.                                                                | Required contract regression test.                                       | Plan and package state additive/no-surface compatibility as a done criterion.                                        |

No finding required an artifact rewrite before the original handoff. The three
decision requests were deliberate historical gates; their resolved answers are
recorded in the initiative contract, requirements, plan, and completed package.

## Security/public-contract gate summary

- Trust boundary preserved: local `stdio` MCP -> owned runtime/session ->
  authenticated loopback provider; provider ports/nonces/raw handles remain
  private.
- Authorization preserved: a surface reference is valid only for the current
  session and graph/generation; stable identities are correlation-only.
- Disclosure preserved: bounded sanitized metadata and screenshot diagnostics;
  no frame URLs, sensitive content, raw IDs, coordinates, OCR, or provider
  endpoints in public output.
- Unsupported behavior preserved: closed roots, unreachable frames, browser
  chrome, and provider gaps become non-actionable evidence.
- Public compatibility gate: exact API shape, error vocabulary, and diagnostic
  policy are brokered before schema/code work; existing no-surface calls stay
  covered by regression tests.

## Mechanical verification

```text
python C:\Users\User\.agents\skills\krt-compound-master\scripts\check_work_package.py docs/work-packages/RDM-013-surface-graph/2026-08-21-013-surface-graph-work-package.md
```

Result: `work package review-unit checks passed`.

Product tests were intentionally not run for this historical `mode:artifacts`
review. The subsequent `mode:execute` run recorded product, contract,
platform-structural, build, lint, code-review, and security evidence in the
current package and canonical run state.

## Review handoff

- Artifact status: historical review retained for traceability; superseded by
  the completed execution package and current canonical run state.
- Implementation status: decisions resolved and implementation evidence
  recorded in `2026-08-24-code-review.md` and `2026-08-24-security-review.md`.
- Security status: historical design gate retained; the current security
  review reports no P0-P2 findings and identifies only provider-evidence limits.
