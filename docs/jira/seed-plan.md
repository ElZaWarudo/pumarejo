---
title: Proposed Jira seed plan for Pumarejo reliable native E2E
status: proposed-not-executed
date: 2026-08-21
jira_provider: unresolved
---

# Proposed Jira seed plan

No Jira provider, project key, base URL, or mutation authority was supplied. This file proposes hierarchy only. It does not authorize or record any Jira mutation.

## Reuse candidates

- Reuse existing issue keys for RDM-009 through RDM-012 if a later live Jira read proves they exist and match the canonical work packages.
- Treat RDM-010, RDM-011, and RDM-012 as review-passed baseline items, not new implementation tasks. They may receive release-evidence links only through the resolved Jira provider and release workflow.
- Do not invent issue keys or infer a Jira provider from local documentation.

## Proposed hierarchy

### Epic

- **PUM-E2E — Reliable native end-to-end validation**
  - Initiative contract: `docs/plans/tinto-e2e-reliability/initiative-requirements.md`
  - Roadmap: `docs/product/roadmap.md`

### Parent issues and child shapes

| Proposed parent                           | Purpose                                              | Proposed children         | Initial status                   |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------- | -------------------------------- |
| PUM-E2E-A Surface foundation              | Bounded observation and surface graph                | RDM-009, RDM-013          | RDM-009 blocked; RDM-013 planned |
| PUM-E2E-B Native control and evidence     | Truthful windows/dialogs and sanitized observability | RDM-014, RDM-015          | Planned, documentation-gated     |
| PUM-E2E-C Runtime custody and portability | Process supervision, environment, toolchains         | RDM-016, RDM-017          | Planned, dependency-gated        |
| PUM-E2E-D Efficient interaction           | Sequences and generation semantics                   | RDM-018                   | Planned, dependency-gated        |
| PUM-E2E-E Tinto certification             | Public end-to-end proving journey                    | RDM-019                   | Planned, dependency-gated        |
| PUM-E2E-F Operational hardening           | Attribution, network/artifacts, self-diagnostics     | RDM-020, RDM-021, RDM-022 | Deferred to Phase 2              |
| PUM-E2E-G Release certification           | Cross-platform regression and release evidence       | RDM-023                   | Deferred to final wave           |

Each RDM issue should contain one subtask per approved work-package review unit. One worker owns exactly one subtask or standalone RDM issue. Item-level artifact planning may use a temporary planning subtask, but it must not be confused with implementation completion.

## Proposed labels and fields

- Labels: `pumarejo`, `tauri`, `native-e2e`, `security-reviewed`, `platform-windows`, `platform-linux`.
- Phase labels: `phase-mvp`, `phase-2`, `release-certification`.
- Lane labels after package review: `lane-fast`, `lane-standard`, or `lane-deep`.
- Blocker labels: `decision-required`, `provider-feasibility`, `shared-revision-required`.
- Suggested statuses: project-native equivalents of `Por hacer`, `En progreso`, `En revisión`, `Bloqueado`, and `Hecho`; resolve from live Jira metadata before mutation.
- Sprint placement: none until provider/project and active sprint are read explicitly.

## Dependencies to encode

- RDM-009 blocks RDM-013 and RDM-018.
- RDM-013 blocks RDM-014, RDM-015, and RDM-018.
- RDM-015 plus RDM-010 block RDM-016.
- RDM-015 blocks RDM-017.
- RDM-014 through RDM-018 block RDM-019.
- RDM-017 blocks RDM-020 and RDM-022.
- RDM-015 plus RDM-016 block RDM-021.
- RDM-019 through RDM-022 block RDM-023.

## Blocked and deferred items

- RDM-009 is blocked on the continuation/generation contract decision.
- RDM-014 implementation is blocked on dialog authorization shape and provider feasibility evidence.
- All code work is blocked until the documentation packet is approved and available on a shared revision.
- RDM-020 through RDM-023 are Phase 2/final certification and are not candidates for the first MVP waves.
- Jira seeding itself is blocked until the user chooses Jira, the provider resolves unambiguously, the live project is inspected, and the exact mutation plan is confirmed.

## Exact future mutation classes

If Jira is selected after documentation approval, the provider-specific skill would need authorization to:

1. read project metadata, issue types, workflows, existing RDM issues, labels, and active sprint;
2. create or reuse one epic;
3. create or reuse the proposed parent issues and RDM children/subtasks;
4. set descriptions, labels, dependencies/links, and sprint placement;
5. record canonical documentation/work-package links;
6. transition only issues whose local reconciled status and provider workflow permit it.

Comments, backlinks, reviewer requests, transitions, and release mutations remain owned by the resolved Jira/release flow; none are authorized by this plan.
