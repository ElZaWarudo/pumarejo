---
title: RDM-021 loopback diagnostics and artifact hygiene document review
status: passed-with-decision-gate
date: 2026-08-21
roadmap_item: RDM-021
compound_run_id: tinto-e2e-rdm-021-network-artifacts
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-021-network-artifacts/state.md
review_mode: non-interactive
review_role: ce-doc-review
security_role: krt-security-sentinel-design-gate
---

# RDM-021 loopback diagnostics and artifact hygiene document review

## Review scope and coverage

Reviewed the focused requirements, implementation plan, dependency/overlap map,
and work package as one RDM-021 artifact set:

- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-021-network-artifacts-requirements.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-021-network-artifacts-plan.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-021-network-artifacts-dependency-map.md`
- `docs/work-packages/RDM-021-network-artifacts/2026-08-21-021-network-artifacts-work-package.md`

The inline non-interactive review applied coherence, feasibility, product,
adversarial-filesystem, and security-design lenses. A child-local serial lane
was used; no mutating or reviewer subagent was dispatched. The review inspected
the inherited initiative/roadmap/gap evidence, current endpoint/readiness code,
`ArtifactStore`/permission/recovery code, relevant tests, and sibling queue
ownership state without editing any sibling or shared file.

## Review result

**Artifact gates passed with one explicit brokered destructive-persistence
decision gate.** The packet maps REL-013/REL-014 to two reviewable units,
addresses both loopback families and `build.devUrl` mismatch diagnostics, keeps
RDM-015/RDM-016 as dependencies, preserves RDM-020/RDM-022 ownership, and names
deterministic tests, bounded sanitized evidence, containment, symlink/race,
permissions, and retention behavior. It is an execution-ready planning packet
for pure models and explicit-policy behavior, not an implementation or release
approval.

## Evidence inspected

- Initiative contract requirements REL-013/REL-014 and security/compatibility
  invariants: `docs/plans/tinto-e2e-reliability/initiative-requirements.md`.
- Roadmap RDM-021 dependency and route: `docs/product/roadmap.md`.
- Gap evidence for IPv4-only readiness, missing `devUrl` correction, discovery
  exclusions, and retained cleanup: `docs/audits/2026-08-21-tinto-gap-audit.md`.
- Current endpoint/readiness seams: `src/session/endpoint.ts`,
  `src/platform/tracked-process.ts`, platform launch helpers, and
  `src/platform/mode-config.ts`.
- Current artifact security core: `src/artifacts/store.ts`,
  `src/artifacts/permissions.ts`, runtime recovery, and artifact/session tests.
- Sibling ownership: `docs/swarm/queue-state.yaml`, `docs/swarm/blockers.yaml`,
  and active RDM-020/RDM-022 run state (read-only).

## Findings and routing

| ID | Severity | Finding | Route | Resolution/evidence |
| --- | --- | --- | --- | --- |
| DR-021-001 | P1 destructive-persistence/product gate | The inherited contract requires bounded retained-artifact cleanup but does not choose whether age/count/byte deletion is automatically enabled or only invoked with an explicit operator policy. | Brokered decision; blocks implicit RU2/RDM-023 wiring only. | Requirements, plan, dependency map, and package carry the question, recommendation (explicit policy first), safe fallback (preserve retained artifacts), affected unit, and canonical-parent routing. Pure evaluator/validation can proceed. |
| F-021-002 | P1 security design note | IPv4/IPv6 family confusion or `localhost` resolution could report readiness for the wrong listener or disclose a raw URL. | Required implementation/security verification. | U30 requires explicit family endpoints, no DNS/wildcard fallback, ownership proof, strict bounded parsing, stable correction, and sanitized summary. Tests cover wrong-family, mismatch, invalid, and redaction cases. |
| F-021-003 | P1 filesystem security note | A retained-cleanup pass could delete a link target, active session, malformed manifest, or unmanifested content if it trusts paths/metadata between scan and delete. | Required implementation/security verification. | U31 requires canonical root/manifest/entry revalidation immediately before every operation, link/race fail-closed behavior, active/unknown preservation, and deletion-plan-then-apply separation. |
| F-021-004 | P2 sibling-overlap note | Tauri `build.devUrl` extraction could overlap installer/self-doctor/drift work if implemented in `src/installer/project.ts`. | Apply/local design correction; parent coordination remains required for shared platform/config edits. | Plan/package now pin extraction to the existing bounded parser in `src/platform/mode-config.ts` and explicitly exclude `src/installer/project.ts`, RDM-020, and RDM-022 refactors. |
| F-021-005 | P2 compatibility note | Existing retained/non-retained close and recovery behavior is security-sensitive and must not regress while adding policy evaluation. | Required implementation regression verification. | U31 preserves the manifest/permission/recovery core and names existing artifact/session/platform tests plus deterministic fake-clock cases. |

No finding requires another artifact rewrite before handoff. DR-021-001 is a
deliberate parent decision request, not an invented default. Findings F-021-002
through F-021-005 remain required verification inputs for future implementation
and security review.

## Security/public-contract gate summary

- Trust boundary preserved: local `stdio` MCP -> owned runtime/session ->
  authenticated loopback provider; no remote or wildcard listener is introduced.
- Authorization preserved: RDM-016 remains the authority for listener/process
  ownership, PID identity, ancestry, nonce, and port revalidation; RDM-021 never
  terminates or repairs ownership.
- Disclosure preserved: network/artifact records are bounded sanitized summaries;
  raw URLs, paths, link targets, causes, secrets, environment, and application
  content remain outside the evidence boundary.
- Filesystem safety preserved: canonical root containment, `lstat`/realpath
  rechecks, link/race refusal, manifest validation, and owner-only permissions
  are required before writes or deletion.
- Compatibility preserved: existing explicit IPv4 callers and artifact close/
  recovery paths remain valid; implicit retained deletion is not enabled without
  the brokered decision.

## Mechanical verification

```text
python C:\Users\User\.agents\skills\krt-compound-master\scripts\check_work_package.py docs/work-packages/RDM-021-network-artifacts/2026-08-21-021-network-artifacts-work-package.md
```

Result: `work package review-unit checks passed`.

`git diff --check` on the owned artifact paths produced no whitespace errors.
Product tests were intentionally not run: this is `mode:artifacts`, and the
delegated scope forbids product-code/test/config edits. Future implementation
must run the literal focused commands in the work package and the parent-owned
aggregate gate.

## Review handoff

- Artifact status: ready for Seneschal reconciliation with DR-021-001 recorded.
- Implementation status: RU1 and pure RU2 policy work are execution-ready;
  implicit retained-cleanup activation is decision-gated.
- Security status: design gate acceptable with required implementation tests;
  formal implementation security review is pending.
- No sibling/shared files were modified. No Jira, release, branch, commit, PR,
  or product test action was performed.

