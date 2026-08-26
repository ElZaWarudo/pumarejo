---
title: Pumarejo reliable native E2E roadmap
status: in-review
date: 2026-08-21
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
---

# Pumarejo reliable native E2E roadmap

## Product framing

Pumarejo already launches and drives a Tauri WebView, but the Tinto trial exposed a gap between a visually present desktop interface and a semantically controllable, diagnosable, ownership-safe test. This roadmap closes that gap while preserving the existing `stdio`, exact-reference, bounded-output, and owned-process security model.

The current review-passed RDM-010 through RDM-012 work is baseline. RDM-009 remains a carry-over dependency. New numbering begins at RDM-013.

## MVP boundary: complete and diagnose the Tinto journey

| Item    | Outcome                                                                                                                                | Depends on                | Lane trigger                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| RDM-009 | Bounded, protected observation contract is settled and implemented.                                                                    | Existing RDM-005/RDM-007  | `deep`: public snapshot/ref contract and disclosure            |
| RDM-013 | Surface graph discovers/selects nested panels, open shadow roots, supported iframes, windows, and WebViews; visible gaps are explicit. | RDM-009                   | `deep`: new cross-cutting surface architecture/public contract |
| RDM-014 | Window actions advertise effective support and a capability-gated Tauri dialog bridge enables explicit accept/cancel.                  | RDM-013                   | `deep`: permissions, native boundary, public contract          |
| RDM-015 | Bounded sanitized console/process/invocation/phase/error diagnostics are queryable.                                                    | RDM-013                   | `deep`: sensitive output and public tools                      |
| RDM-016 | Job Objects/process groups, disconnect cleanup, orphan recovery, and owned repair converge safely.                                     | RDM-010, RDM-015          | `deep`: process ownership, concurrency, destructive boundary   |
| RDM-017 | Windows environment reconstruction and portable toolchain resolution are accurate and secret-safe.                                     | RDM-015                   | `deep`: environment/security/platform compatibility            |
| RDM-018 | Bounded interaction sequences, focused editable typing, and deterministic reference-generation rules reduce round trips safely.        | RDM-009, RDM-013, RDM-014 | `deep`: public action contract and stale-state ordering        |
| RDM-019 | The complete Tinto journey and forced-failure variants produce sanitized cross-platform evidence and zero owned residue.               | RDM-014 through RDM-018   | `deep`: integration/release evidence across all surfaces       |

MVP acceptance is the proving journey in the initiative contract, including a forced timeout and a rejected dialog authorization case. It does not require every operational hardening item below to be complete before the first end-to-end proof, but no public release is ready until Phase 2 is also reconciled.

## Phase 2 epics: operational hardening before release

| Item    | Outcome                                                                                                                                                | Depends on              | Expected route                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------ |
| RDM-020 | Drift checks validate owned markers, Cargo features, ignore entries, isolated capability, and config fields without rejecting unrelated edits.         | RDM-017                 | `standard` after contract is fixed; independent review required          |
| RDM-021 | IPv4/IPv6 diagnostics, discovery exclusions, artifact retention, cleanup, and permissions are deterministic.                                           | RDM-015, RDM-016        | Split into execution-ready `standard` review units                       |
| RDM-022 | `doctor --self` diagnoses unresolved dependencies, broken symlinks/junctions, lockfile/install drift, postinstall binaries, Node, and package manager. | RDM-017                 | `deep` for filesystem/security boundary during planning; may split later |
| RDM-023 | Final regression certification preserves capability composition and rustfmt-idempotent generation across real fixtures.                                | RDM-019 through RDM-022 | `standard` evidence unit with Reviewer trigger                           |

## Explicit non-goals

- Closed-shadow inspection without opt-in application instrumentation.
- Generic native desktop automation or implicit native prompt approval.
- Arbitrary WebDriver/Tauri/shell passthrough.
- Unbounded logs, raw environment dumps, or unowned process cleanup.
- Multiple independent launched applications per MCP session.

## Dependency graph

```text
RDM-009 -> RDM-013 -> RDM-014 -> RDM-018 -> RDM-019
                    \-> RDM-015 -> RDM-016 -/
                              \-> RDM-017 -/

RDM-017 -> RDM-020
RDM-015 + RDM-016 -> RDM-021
RDM-017 -> RDM-022
RDM-019 + RDM-020 + RDM-021 + RDM-022 -> RDM-023
```

## Proposed waves

1. **Wave A — contract and surface foundation:** resolve the RDM-009 continuation decision; plan and implement RDM-009; run RDM-013 artifact planning after the observation contract is stable.
2. **Wave B — truthful native control and diagnostics:** plan RDM-014 and RDM-015 in parallel. Their implementations serialize where they overlap on MCP schemas/runtime or provider interfaces.
3. **Wave C — custody and portability:** plan RDM-016 and RDM-017 in parallel; implementation remains isolated by lifecycle versus environment/toolchain surfaces.
4. **Wave D — efficient interaction:** plan and implement RDM-018 after surface and dialog contracts are accepted.
5. **Wave E — proving journey:** RDM-019 integrates the MVP through public interfaces and captures failure-path evidence.
6. **Wave F — operational hardening:** split RDM-020 through RDM-022 into reviewable packages, allowing at most two disjoint implementers.
7. **Wave G — release certification:** RDM-023 runs the full regression and platform matrix before release handoff.

The default mutable implementer cap is two. Public MCP schemas, central session state, provider interfaces, capability files, dependency manifests, and shared fixtures are serialized even when planning proceeds in parallel.

## Risks and mitigations

| Risk                                               | Consequence                                            | Mitigation                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Provider cannot expose a visible WebView or iframe | Acceptance promise becomes impossible on that provider | Probe first; publish a truthful surface capability matrix and require explicit instrumentation as a separately reviewed option. |
| Dialog automation weakens confirmation security    | Tests silently approve destructive actions             | Independent capability, explicit test authorization, finite buttons, audit evidence, deny by default.                           |
| Logs/environment leak secrets or personal paths    | Local data crosses MCP boundary                        | Source-side bounding, denylist plus value-pattern redaction, seeded leakage corpus, memory-only fallback.                       |
| Orphan repair kills unrelated processes            | Severe local safety failure                            | Job/process-group ownership plus PID creation identity, nonce, command hash, ancestry, and port revalidation.                   |
| Parallel work conflicts in central contracts       | Merge errors and incoherent generations                | Two-worker cap, surface map, serialized public-contract changes, aggregate verification once per fingerprint.                   |
| Existing dirty changes overlap installer work      | User work is lost or mixed                             | Preserve the current edits; use isolated worktrees from an approved shared documentation revision.                              |

## Implementation start criteria

- Documentation gate in `docs/swarm/queue-state.yaml` is explicitly `approved`.
- Open decision blockers for the selected unit are resolved in the initiative contract or an item-specific artifact.
- The approved initiative contract and roadmap exist on one shared revision readable by every isolation target.
- Each selected unit has a reviewed work package, complete acceptance criteria, owned surfaces, literal focused checks, and a unique Compound state path when applicable.
- The current dirty worktree is not used as a mutable worker base unless its owner explicitly integrates or isolates those changes.
- Required platform/provider feasibility probes are named before implementation.
- Aggregate gates are available: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm pack:check`, plus contract/integration/platform suites where applicable.

## Release readiness

Release handoff is allowed only after RDM-023, no unresolved P0-P2 correctness/security findings, sanitized evidence for supported Windows and Linux matrices, zero unexplained owned residue, and reconciliation through `krt-release-marshal`.
