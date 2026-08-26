---
title: RDM-018 bounded sequences and deterministic reference generations document review
status: passed
date: 2026-08-24
roadmap_item: RDM-018
compound_run_id: tinto-e2e-rdm-018-sequences-refs
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-018-sequences-refs/state.md
review_mode: non-interactive
review_role: ce-doc-review
security_role: krt-security-sentinel-design-gate
---

# RDM-018 bounded sequences and deterministic reference generations document review

## Review scope and result

Reviewed the RDM-018 requirements, implementation plan, dependency/overlap
map, and work package as one artifact set:

- `docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-requirements.md`
- `docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-plan.md`
- `docs/plans/tinto-e2e-reliability/2026-08-24-rdm-018-sequences-refs-dependency-map.md`
- `docs/work-packages/RDM-018-sequences-refs/2026-08-24-018-sequences-refs-work-package.md`

Result: `passed` for artifact planning. The packet is coherent, bounded to
RDM-018, and directly addresses the gap audit: the generation outcome matrix
is explicit, no-change preserves the generation, proven change advances once,
uncertainty advances with a reason, and sequences stop before stale refs can
be reused. The packet preserves continuation non-actionability, the RDM-013
capability vocabulary, the RDM-014 dialog/native boundary, and one-session
ownership.

The package is ready for Seneschal reconciliation and later implementation
handoff. It is not product implementation or release approval. Implementation
remains dependency-gated on RDM-009/RDM-013/RDM-014 shared artifact
reconciliation.

## Evidence inspected

- Initiative contract and settled semantics:
  `docs/plans/tinto-e2e-reliability/initiative-requirements.md`.
- RDM-018 roadmap/dependency/decomposition:
  `docs/product/roadmap.md` and
  `docs/audits/2026-08-21-tinto-gap-audit.md`.
- Upstream continuation and surface/control artifacts:
  RDM-009 package/state, RDM-013 requirements/plan/map, and RDM-014
  requirements/plan/map/package.
- Current implementation evidence in `src/interaction/engine.ts`,
  `src/observation/refs.ts`, `src/observation/snapshot.ts`, and focused
  interaction/contract tests. The review confirmed current unconditional
  clearing/advancement behavior is captured as the implementation delta,
  without modifying those files.
- Seneschal scope and run envelope in `docs/swarm/swarm-startup.md` and
  `docs/swarm/queue-state.yaml`: brokered interaction, serial artifact lane,
  shipping disabled, run/state/artifact namespace as assigned, Jira skipped.

## Findings and routing

| ID | Severity | Finding | Route | Resolution/evidence |
| --- | --- | --- | --- | --- |
| DR-018-001 | P1 upstream coordination gate | The matrix depends on RDM-009 actionable/continuation publication and RDM-013 surface identity; a local generation interpretation would create stale-ref or non-actionable evidence drift. | Seneschal reconciliation before implementation | Requirements, plan, map, and package name RDM-009/RDM-013/RDM-014 as hard prerequisites and preserve the exact no-change/change/uncertainty rows. No competing upstream contract is written. |
| DR-018-002 | P1 stale-state/security design | Clearing refs before classifying dispatch and incrementing after an uncertainty can either leave usable stale refs or produce `g+2`. | Required U37 implementation/security verification | Pure reducer, atomic reserve/publish, exactly-once assertions, uncertainty reasons, and old-ref invalidation are required in all artifacts. |
| DR-018-003 | P1 public-boundary security | A batched operation could become a lookup/retry/native-input bypass or implicitly authorize a dialog. | Required U38 implementation/security verification | Steps use only exact current-generation refs; early stop is mandatory; window/dialog decisions are excluded; no selector/stable-ID/OS fallback is permitted. |
| DR-018-004 | P2 timeout/cancellation ambiguity | A provider timeout or client cancellation may occur after dispatch and cannot be treated as a no-change failure without provider proof. | Required implementation verification | Matrix maps post-dispatch cancellation, transport loss, provider timeout, missing postcondition, and final-refresh failure to one advancing uncertainty outcome with bounded reason. |
| DR-018-005 | P2 output disclosure | Per-step results could echo typed text, handles, paths, raw provider errors, or hostile application content. | Required implementation/security verification | Input text and private identity are excluded from result shape; bounded sanitize-before-MCP and hostile-payload corpus are explicit. |
| DR-018-006 | P2 public numeric bounds | `maxSteps`/`timeoutMs` defaults and sequence wire name must align with sibling public schemas before implementation. | Shared-contract reconciliation, not an artifact blocker | Values are recorded as finite item-local defaults and `tauri_sequence` as a planning name; the package explicitly blocks implementation until RDM-013/014 schemas and shared revision are reconciled. |

No finding requires an artifact rewrite. DR-018-001 and DR-018-006 are
coordination gates to carry into state; DR-018-002 through DR-018-005 are
implementation/security verification inputs. No product behavior outside the
delegated RDM-018 contract was inferred.

## Coherence and feasibility checks

- Requirements, plan, map, and package all map U37/U38 to RU1/RU2 and preserve
  the same exact generation matrix.
- The sequence lifecycle is finite: strict count/wall budgets, FIFO action
  validation, early stop, ordered `not_run`, one final stabilization snapshot,
  bounded outcomes, and no implicit retries/rebinding.
- Focused typing proves editable exact targets before clear/type and classifies
  partial/uncertain effects through the same reducer.
- Continuation evidence and stable semantic identifiers remain non-actionable;
  final snapshots are current-generation actionable evidence only when
  publication succeeds.
- RDM-013 capability states and RDM-014 native/dialog authorization are
  consumed rather than locally renamed or bypassed.
- The package identifies all shared seams and requires Seneschal serialization;
  no sibling or product file was modified.

## Security design gate

Design is acceptable for artifact planning with required implementation tests.
The execution security gate must verify:

- exact session, active surface, generation, and opaque-handle binding;
- no old refs survive proven drift or uncertain effect;
- no continuation/stable-ID/selector/coordinate/OS-input authority;
- no implicit native dialog authorization or provider fallback;
- bounded/sanitized step results and no text/handle/nonce/path/cause leakage;
- cancellation/timeout behavior remains within the owned cleanup boundary; and
- hostile application output cannot alter schema, authorization, or execution.

Formal implementation `krt-security-sentinel` review remains pending until a
product diff exists.

## Mechanical verification

```text
python C:\Users\User\.agents\skills\krt-compound-master\scripts\check_work_package.py docs/work-packages/RDM-018-sequences-refs/2026-08-24-018-sequences-refs-work-package.md
```

Expected result: `work package review-unit checks passed`.

Product tests are intentionally not run: the delegated mode is artifact-only
and prohibits product implementation/test/config changes. `git diff --check`
on the seven owned artifact destinations is required at closeout.

## Review handoff

- Artifact status: package-ready for Seneschal reconciliation.
- Reviewability: RU1 is the parent generation-authority slice; RU2 is one
  serial public sequence slice. Target one open PR, hard cap two.
- Security status: design gate acceptable with required implementation tests;
  formal implementation review remains pending.
- No sibling/shared files, product files, Jira, release, branch, commit, PR,
  push, reviewer request, merge, or external mutation action was performed.
