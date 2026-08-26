---
run_id: tinto-e2e-rdm-022-self-doctor
status: release-ready-with-platform-and-resolver-evidence-gaps
phase: implementation
mode: execute
date: 2026-08-24
parent_orchestrator: krt-swarm-seneschal
orchestrator: seneschal
interaction: brokered
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
target_roadmap: docs/product/roadmap.md
target_roadmap_item: RDM-022
artifact_namespace: tinto-e2e-reliability/RDM-022-self-doctor
canonical_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-022-self-doctor/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
base_branch: main
worktree_policy: required
jira_policy: skip
production_posture: unknown
shipping: parent-owned
---

# Compound state — RDM-022 self-doctor

## Current phase and status

Artifact generation is complete and the parent Seneschal has admitted the
package for implementation. RU1/U50-U51 is in mandatory deep discovery before
any product mutation. Shipping remains parent-owned and is not authorized from
this child run.

## Resolved roles and runtime

- `roadmap_generator`: inherited reviewed `docs/product/roadmap.md`; no
  competing roadmap generated in this nested run.
- `brainstorm`: focused requirements written from the inherited initiative
  contract and accepted gap audit; no general initiative brainstorm rerun.
- `plan`: `ce-plan` contract applied inline to produce an implementation-ready
  plan with stable U50-U53 units.
- `document_review`: inline serial review because no subagent dispatch surface
  is available in this worker runtime; review findings and coverage are
  recorded under the RDM-022 review namespace.
- `work`, `code_review`, `security_review`, `project_pr`, and release roles:
  not invoked; shipping is disabled and no product code changed.

## Delegation and autonomy

- Selected delegation: inline/serial, artifact-only.
- Mutating worker: none.
- Read-only review: inline coherence, feasibility, scope, security, and
  adversarial checks.
- Autonomy: high locally for package/document decisions only.
- Ledger: `docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json`.
- Ledger use: recorded inherited context; no external mutation class requested
  or authorized (`allowed_mutation_classes: []` in the work package).

## Artifact paths and gate status

| Artifact            | Path                                                                                           | Status                               |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------ |
| Initiative contract | `docs/plans/tinto-e2e-reliability/initiative-requirements.md`                                  | inherited/approved                   |
| Roadmap             | `docs/product/roadmap.md`                                                                      | inherited/in-review                  |
| Requirements        | `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-requirements.md`              | review-passed                        |
| Plan                | `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-plan.md`                      | review-passed / implementation-ready |
| Dependency map      | `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-022-self-doctor-dependency-map.md`            | review-passed                        |
| Work package        | `docs/work-packages/RDM-022-self-doctor/2026-08-21-022-self-doctor-work-package.md`            | package-ready                        |
| Review findings     | `docs/review-findings/tinto-e2e-reliability/RDM-022-self-doctor/2026-08-21-document-review.md` | complete                             |
| Summary             | `docs/orchestration/compound-master/tinto-e2e-rdm-022-self-doctor/summary.md`                  | complete                             |

## Implementation units and waves

- Wave 0: RDM-017 resolver contract prerequisite.
- Wave 1: RU1 / U50-U51 — additive CLI/report boundary and safe no-follow
  installation inspection.
- Wave 2: RU2 / U52-U53 — lock/install/bin coherence and host/child resolver
  comparison.
- Wave 3: root aggregate and RDM-023 consumption.

Reviewability Gate: passed with two stacked review units, target/open-stack cap
2, and `wait-for-parent-merge` or `collapse-to-integration-base` at the cap.

## RU1 discovery checkpoint

Deep read-only discovery completed on 2026-08-24 and admitted the following
minimal implementation manifest:

- `src/cli/parse.ts`, `src/cli/doctor.ts`;
- new `src/installer/self-doctor.ts` and
  `src/installer/self-doctor-paths.ts`; and
- new focused unit, integration, contract, and platform self-doctor suites.

The accepted design derives its installation anchor internally, inspects only
a fixed non-recursive relative-entry manifest, rejects unsafe path forms before
I/O, enforces lexical/canonical containment and per-component no-follow checks,
and emits only bounded logical subjects. RDM-017 is intentionally deferred to
RU2. Root verification passed 60 tests with 2 skips plus typecheck, targeted
lint, formatting, and diff checks. Independent review then opened four
actionable findings: parent-chain TOCTOU, silently truncated metadata paths,
total-byte over-read, and incomplete CLI help. A deep Fixer is active; RU1 is
not accepted until independent rereview closes all P0-P2 findings.

RU1 is now accepted. The review/fix loop closed all P0-P2 findings, including
descriptor identity, pre-read containment, metadata/frontier bounds, byte
accounting, Windows warning precedence, and canonical-root widening. Final
focused verification passed 31 tests with 2 skips plus typecheck, targeted
lint, and formatting. Security Sentinel status is `pass`. Windows authoritative
handle identity remains an explicit warning/platform limitation. RU2 deep
discovery is active and consumes RDM-017 without modifying its resolver.

## Dependency and blockers

- RDM-017 is now `implementation-review-passed-with-platform-gap` in this
  worktree and its structured host/child resolver contract is available for
  U53 consumption. Its native Windows reparse/handle-pinning limitation remains
  inherited and cannot be upgraded into a complete platform claim.
- No other blockers for artifact review or package reconciliation.
- RDM-020 and RDM-021 are sibling owners; shared CLI/helper edits require
  Seneschal serialization. No shared queue, blocker, autonomy, shipping, or
  sibling artifact files were edited by this run.

## Verification

- Mechanical checker: `python C:\Users\User\.agents\skills\krt-compound-master\scripts\check_work_package.py docs/work-packages/RDM-022-self-doctor/2026-08-21-022-self-doctor-work-package.md` — passed (`work package review-unit checks passed`).
- Document review: inline serial review of requirements, plan, dependency map,
  and work package passed; one completeness fix added stable self IDs and
  exact bounds. Findings/coverage are recorded in the linked review artifact.
- Product tests: not run; no product code changed and shipping is disabled.
- Future focused commands are listed verbatim in the work package:
  self-doctor unit/path, integration, contract, platform, then root build,
  typecheck, lint, format, test, and pack checks.

## Next action

Complete RU1 discovery, dispatch its bounded deep implementation, then perform
focused verification, independent P0-P2 review/fix, and Security Watch before
serializing RU2. Do not invoke `krt-release-marshal`, Jira, PR, commit, or push
from this child run.

## Implementation closeout — 2026-08-24

- RU1 and RU2 are implemented and independently accepted with no unresolved
  P0-P2 correctness or security finding.
- Final focused matrix: 79 passed, 2 platform skips; typecheck, focused lint,
  focused formatting, and diff checks pass.
- Aggregate: build, typecheck, lint, and pack pass. Format reports 101 inherited
  CRLF/baseline files. Full tests report 639 pass, 19 skip, and seven known
  host/baseline failures outside RDM-022.
- Durable reviews:
  `docs/review-findings/tinto-e2e-reliability/RDM-022-self-doctor/2026-08-24-implementation-review.md`
  and
  `docs/review-findings/tinto-e2e-reliability/RDM-022-self-doctor/2026-08-24-security-review.md`.
- Fingerprint:
  `5da23bbf8b1f26172b5e53fc87e2a4d115372369b0cdcae73436f7aa5d9ccecb`.
- Windows native handle identity and CLI effective-child evidence remain
  conservative unknown/warn. RDM-023 must not promote either gap into a healthy
  platform claim.
- Return to Seneschal for RDM-023 reduction. Release Marshal remains the sole
  owner of stage, commit, push, and PR.
