---
title: RDM-016 process custody and orphan recovery document review
status: passed
date: 2026-08-21
roadmap_item: RDM-016
compound_run_id: tinto-e2e-rdm-016-process-custody
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-016-process-custody/state.md
review_mode: non-interactive
review_role: ce-doc-review
security_role: krt-security-sentinel-design-gate
---

# RDM-016 process custody and orphan recovery document review

## Review scope and coverage

Reviewed the focused requirements, implementation plan, dependency/overlap map,
and work package as one RDM-016 artifact set:

- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-requirements.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-plan.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-016-process-custody-dependency-map.md`
- `docs/work-packages/RDM-016-process-custody/2026-08-21-016-process-custody-work-package.md`

The inline non-interactive review applied coherence, feasibility, product,
adversarial-process, filesystem, and security-design lenses. A child-local
serial lane was used; no mutating or reviewer subagent was dispatched. The
review inspected the inherited initiative/roadmap/gap evidence, current
tracked-process/session/platform seams, RDM-015 planning input, and sibling
queue ownership without editing any sibling or shared file.

## Review result

**Artifact gates passed.** The
packet maps REL-007 to three implementation units and two review units,
requires a conjunctive PID/start-time/command-hash/nonce proof, distinguishes
Windows Job Object from a truthful fallback, specifies POSIX TERM-to-KILL
convergence, bounds startup orphan repair, and preserves ambiguous residue.
It keeps RDM-015 and DEC-004 as authorities for evidence/public vocabulary and
does not authorize implementation or release from this artifact-only child.

The work package mechanical checker passed. Formal implementation security
review remains required after the future product diff.

## Evidence inspected

- Initiative REL-007, owned-process definition, cleanup invariants, bounded
  evidence rules, and non-goals: `docs/plans/tinto-e2e-reliability/initiative-requirements.md`.
- RDM-016 dependency/order and route: `docs/product/roadmap.md`.
- Gap evidence for missing durable lease, Job Object, orphan recovery, and
  verified POSIX escalation: `docs/audits/2026-08-21-tinto-gap-audit.md`.
- Existing identity and cleanup seams: `src/platform/types.ts`,
  `src/platform/tracked-process.ts`, `src/platform/windows/process.ts`,
  `src/platform/linux/process.ts`, `src/session/process-lease.ts`,
  `src/session/manager.ts`, `src/session/cleanup.ts`, `src/session/endpoint.ts`,
  and `src/mcp/server.ts`.
- RDM-015 adapter/public decision boundary:
  `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-requirements.md`,
  `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-plan.md`,
  and `DEC-2026-08-21-004` in `docs/swarm/blockers.yaml`.
- Sibling ownership and run contract: `docs/swarm/swarm-startup.md`,
  `docs/swarm/queue-state.yaml`, and active RDM-015/RDM-021/RDM-022 artifacts.

## Findings and routing

| ID | Severity | Finding | Route | Resolution/evidence |
| --- | --- | --- | --- | --- |
| DR-016-001 | P1 upstream contract gate (resolved) | RDM-015 remains the adapter authority and DEC-004 is now canonical with supported/unsupported/unavailable/denied/failed states, stable codes, and bounded sanitized evidence. | Resolved by parent decision; U34 may use the accepted RDM-015 adapter, while RDM-016 still adds no local synonym or public operation. | Requirements, plan, dependency map, and package now record the exact canonical states and keep RDM-015 as the sole public adapter. |
| F-016-002 | P1 destructive-process security | A PID can be reused or a process can change between discovery and termination; a durable lease alone must not authorize a kill. | Required implementation/security verification. | Every requirements acceptance path and KTD requires fresh PID/start-time/command-hash/nonce plus ancestry/group/job/listener proof immediately before and after action, with refusal on uncertainty. |
| F-016-003 | P1 Windows containment | A tree-termination fallback may leave descendants or target a replacement if Job Object setup is unavailable or ancestry is incomplete. | Required implementation/security verification; fallback must remain degraded. | The plan requires Job Object capability probing, explicit fallback evidence, fresh validation, and retryable residue when descendant completeness is unproven; no equivalent convergence claim is allowed. |
| F-016-004 | P1 POSIX signal race | TERM→KILL can race with root replacement or group/session loss, turning a broad negative-PID signal into an unrelated kill. | Required implementation/security verification. | The plan requires distinct group/session ownership, bounded grace, revalidation before KILL, and refusal when root/group/session/nonce proof changes. Deterministic race fixtures are named. |
| F-016-005 | P1 crash-recovery safety | Startup repair could race a live controller or treat `closing`/malformed state as permission to terminate. | Required implementation/security verification. | Controller liveness is checked first; lease transitions are atomic/resumable but never authority alone; live, foreign, linked, malformed, and ambiguous leases are preserved. |
| F-016-006 | P2 lease/filesystem overlap | A durable lease under `.pumarejo/sessions` could be mistaken for retained artifacts and swept by RDM-021 or expose raw nonce/path data. | Apply/local boundary; parent coordination required before implementation. | Package explicitly makes the lease a narrow owner-only recovery record, excludes it from generic retention, bounds fields, and keeps raw identity internal; RDM-021 is listed as consumer/coordination owner. |
| F-016-007 | P2 compatibility/disclosure | Strengthening cleanup could alter RDM-010 status/errors or leak native identity data through diagnostics. | Required implementation regression/security verification. | Requirements and package preserve existing public lifecycle behavior, route only sanitized allowlisted facts through RDM-015, and name session/error/nonce/disclosure regression tests. |

No finding requires another artifact rewrite before handoff. DR-016-001 is
closed by the parent decision; RDM-015 adapter availability remains an ordinary
implementation prerequisite. Findings F-016-002 through F-016-007 remain
required implementation and security inputs.

## Security/public-contract gate summary

- Trust boundary preserved: local `stdio` MCP -> owned session/process
  adapters -> platform enforcement -> sanitized RDM-015 evidence. No remote
  process service, arbitrary shell, or public repair operation is introduced.
- Authorization preserved: PID, start time, command identity, nonce, ancestry,
  group/job/session, and listener proof are conjunctive. RDM-016 never acts on
  a PID or port alone and preserves uncertainty as retryable residue.
- Windows safety preserved: Job Object is preferred only when native setup is
  proven; validated tree cleanup is a declared degraded fallback and cannot
  claim complete convergence without descendant proof.
- POSIX safety preserved: signals target only the owned process group/session;
  TERM grace and KILL escalation revalidate identity before widening impact.
- Crash recovery preserved: stale controller state is repairable only after a
  fresh full proof; malformed/foreign/linked/live-controller leases are kept.
- Disclosure preserved: leases are owner-only internal records; RDM-015 gets
  bounded mechanism/phase/result facts without PID, command, nonce, path,
  ancestry, raw cause, or provider identifiers.
- Public compatibility preserved: RDM-010 phases/status/errors remain the
  public baseline; RDM-015 is the adapter boundary and DEC-004's exact five
  states/codes are used without a local variant.

## Mechanical verification

```text
python C:\Users\User\.agents\skills\krt-compound-master\scripts\check_work_package.py docs/work-packages/RDM-016-process-custody/2026-08-21-016-process-custody-work-package.md
```

Result: `work package review-unit checks passed`.

`git diff --check` on the owned artifact paths is required at closeout.
Product tests were intentionally not run: this is `mode:artifacts`, and the
delegated scope forbids product-code/test/config edits. Future implementation
must run the literal focused commands in the work package and the parent-owned
aggregate gate.

## Review handoff

- Artifact status: ready for Seneschal reconciliation; DR-016-001 is resolved.
- Implementation status: RU1/U32-U33 and RU2/U34 are execution-ready after the
  accepted RDM-015 adapter is confirmed; public projection uses canonical
  DEC-004 states through RDM-015.
- Security status: design gate acceptable with required implementation tests;
  formal implementation/security review remains pending.
- No sibling/shared files were modified. No Jira, release, branch, commit, PR,
  push, reviewer, or external mutation action was performed.
