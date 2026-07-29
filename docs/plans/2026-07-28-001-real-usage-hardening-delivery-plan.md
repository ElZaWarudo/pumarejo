---
title: Pumarejo Real-Usage Hardening Delivery Plan
status: ready
date: 2026-07-28
planning_source:
  - docs/audits/2026-07-28-pumarejo-usage-feedback.md
  - docs/roadmaps/2026-07-28-001-real-usage-hardening-roadmap.md
delivery_approach: hybrid
---

# Pumarejo Real-Usage Hardening Delivery Plan

## Planning Source

This plan turns the reproduced usage findings in `docs/audits/2026-07-28-pumarejo-usage-feedback.md` into the four dependency-ordered items in `docs/roadmaps/2026-07-28-001-real-usage-hardening-roadmap.md`.

Planning confidence is high for the problem, scope boundaries, platform, and acceptance criteria. Confidence is medium for two protocol details that require an explicit contract decision before implementation: snapshot continuation across generations and consultable long-running launch representation.

## Scope Summary

In scope:

- bounded, truncatable, filterable semantic snapshots with safe disclosure defaults;
- faithful ARIA states/relationships and partial evidence on semantic failure;
- observable long-running launch, compact session status, cancellation, and retryable cleanup;
- action-effect classification, atomic post-action observation, keyboard chords, window sizing, and a finite desktop-QA action set;
- accurate diagnostics, generated local MCP configuration, version checks, and real-usage recertification.

Out of scope:

- network transports or background daemons;
- concurrent sessions, multiple-window certification, or general desktop automation;
- operating-system input, arbitrary WebDriver passthrough, native dialogs/menus, or application-specific assertions;
- automatic mutation of MCP host configuration;
- release, publication, or Jira mutation.

## Delivery Approach

A hybrid plan fits this increment: four milestone packages provide visible outcomes, while each package contains small review units that may be refined as implementation reveals provider behavior. Sequencing is driven by safety and learning:

1. make observation bounded before returning it atomically from actions;
2. make lifecycle cancellation diagnosable before expanding long-running workflows;
3. add verifiable interactions on the bounded observation contract;
4. certify the public journey and improve setup only after final schemas settle.

## Major Workstreams

| Roadmap item | Units   | Deliverable                                            | Primary surfaces                                                    |
| ------------ | ------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| RDM-009      | U15-U16 | Bounded protected snapshots and ARIA fidelity          | `src/observation/`, `src/mcp/`, observation tests                   |
| RDM-010      | U17-U18 | Observable launch/status and recoverable cleanup       | `src/session/`, `src/platform/`, `src/mcp/`, lifecycle tests        |
| RDM-011      | U19-U21 | Verified atomic interactions and desktop-QA operations | `src/interaction/`, `src/webdriver/`, `src/mcp/`, platform fixtures |
| RDM-012      | U22-U23 | Actionable setup and integrated real-usage evidence    | `src/installer/`, `src/cli/`, docs and certification tests          |

## Prioritized Backlog

### U15. Define and implement the bounded snapshot protocol

- Decide subtree, limit, filter, truncation, and continuation semantics.
- Guarantee a valid partial result rather than schema failure when a configured or transport-safe limit is reached.
- Preserve deterministic containment and generation/ref invariants.
- Add explicit truncation reasons, counts, and continuation guidance.

### U16. Harden disclosure, ARIA fidelity, and partial evidence

- Add conservative per-field limits and optional text/voluminous-attribute omission.
- Add configurable redaction without weakening mandatory password or `data-pumarejo-sensitive` handling.
- Reproduce and fix missing `pressed`, `selected`, `current`, `checked`, `expanded`, `invalid`, `required`, and relationship data, including `controls`.
- Preserve valid screenshot/window/focus/generation evidence when semantic extraction fails.

### U17. Expose progress and compact consultable session state

- Publish launch stages from command resolution through first snapshot.
- Choose and document the smallest MCP-compatible pending-launch model.
- Expose sanitized phase, owned PID, selected window, proxy/WebDriver readiness, generation, last action, and cleanup-pending data.
- Document recommended client timeout behavior.

### U18. Make cancellation and cleanup convergent

- Model closing, already closed, driver unavailable, and process cleanup failure distinctly.
- Keep cleanup steps independently retryable after partial failure.
- Add a controlled owned-process-tree fallback with identity revalidation.
- Prove cancel-during-launch/action plus repeated close reaches `idle` with zero owned residue.

### U19. Classify action dispatch and observable effect

- Capture focus before and after dispatch.
- Report dispatch method and narrow effect categories: focus-only, semantic mutation, window/panel change, and no observable change.
- Avoid claiming application-level success from a protocol-level dispatch.

### U20. Return bounded post-action observation atomically

- Reuse the existing serialized mutation-plus-refresh boundary.
- Return an optional bounded snapshot or semantic delta with only fresh refs.
- Make stale-generation handling explicit when post-action extraction is partial.

### U21. Add the finite desktop-QA action set

- Support modifier chords and function/modifier keys required by the acceptance journey.
- Add explicit resize and maximize/restore with effective-size confirmation.
- Add region scroll, hover, double click, context menu, and option selection through WebDriver only.
- Reject unsupported/native surfaces with typed errors and no desktop fallback.

### U22. Make diagnostics and MCP setup actionable

- Resolve and report executable identity, effective sanitized command, environment provenance, and detection confidence.
- Support explicit launch environment/runtime paths under a versioned, secret-safe config contract.
- Reconcile later successful-launch evidence with earlier heuristic warnings.
- Print copyable `stdio` configuration for explicitly supported MCP hosts and detect CLI/manifest/plugin version drift.

### U23. Reproduce and certify the real-usage journey

- Add fixtures for massive text, transcript-derived names, ARIA toggles, focus-only clicks, chords, three viewport sizes, slow launch, cancellation, partial cleanup, and diagnostic false negatives.
- Execute all ten audit acceptance criteria through the public MCP/CLI surface.
- Record sanitized evidence on supported Windows and Ubuntu environments and update contracts/operator docs.

## Milestones and Partial Deliveries

| Milestone                          | Included units | Reviewable outcome                                                            |
| ---------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| M1 Safe inspection                 | U15-U16        | Large/sensitive views return bounded faithful evidence without opaque failure |
| M2 Reliable long operations        | U17-U18        | Slow or cancelled sessions remain observable and cleanup is repeatable        |
| M3 Trustworthy desktop interaction | U19-U21        | Actions explain dispatch/effect and cover the finite desktop-QA journey       |
| M4 Adoptable hardening increment   | U22-U23        | Setup is actionable and all ten real-usage criteria have public evidence      |

Each milestone is independently reviewable. M1 and M2 may be planned in parallel, but repository implementation remains serial unless the delivery policy changes.

## Team and Ownership

| Area                            | Responsible role                   | Approval/checkpoint                                                  |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| Product and contract boundaries | Product owner / maintainer         | Accept cursor, async-launch, and finite-action contracts before code |
| TypeScript/MCP implementation   | Implementation agent or maintainer | Per-review-unit correctness review                                   |
| WebDriver/platform behavior     | Platform implementation role       | Windows and Ubuntu fixture evidence                                  |
| Redaction/process ownership     | Security reviewer                  | No unresolved P0-P2 before each affected package closes              |
| Accessibility semantics         | Observation reviewer               | WAI-ARIA fixture and real-component regression review                |
| Final acceptance                | Maintainer plus QA/review role     | Ten audit criteria pass through public interfaces                    |

## Technology and Dependencies

- Preserve ESM TypeScript, Zod schemas, MCP SDK `stdio`, W3C WebDriver, Vitest, and the existing platform adapters.
- Prefer additive optional contract fields; any tool-list, error-code, or existing-field semantic change requires explicit contract review.
- Keep one owned session and exact WebDriver handle refs. Pagination, filtering, and deltas may not introduce selector/text/geometry re-query.
- Use MCP progress/task capabilities only when supported by the pinned SDK and backed by independent-client tests; otherwise choose a small explicit status contract.
- Keep launch environment configuration data-only, versioned, bounded, and secret-safe. Never invoke through a shell.

## Quality and Verification Gates

Every review unit must pass applicable focused tests plus:

```text
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack:check
```

Contract-bearing units run `pnpm test:contract`; fixture/runtime units run `pnpm test:integration`; interaction and lifecycle packages run the applicable Windows and Ubuntu platform suites. Final U23 runs `pnpm validate` and the agent/public-MCP journey. Node.js 22 and 24 remain the package matrix.

## Risks and Mitigations

| Risk                                                 | Impact                                        | Mitigation                                                                                 |
| ---------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Cursor pages invalidate or confuse actionable refs   | Wrong-target actions or unusable continuation | Resolve generation semantics first; test concurrent snapshot/action/page requests          |
| Redaction configuration weakens mandatory protection | Sensitive content leaves the WebView          | Mandatory rules are non-overridable; security review and leakage corpus gate U16           |
| “No effect” creates false application assertions     | Misleading QA outcomes                        | Report only bounded observable categories and separate dispatch from effect                |
| Progress/task model is host-specific                 | Launch remains incompatible across clients    | Independent-client contract tests and documented fallback/status behavior                  |
| Cleanup fallback terminates unrelated processes      | Severe ownership violation                    | Revalidate PID, creation time, command hash, nonce, and owned descendants before terminate |
| Expanded action set becomes generic WebDriver API    | Product and security scope creep              | Enumerated schemas, explicit non-goals, no script/selector passthrough                     |
| Diagnostic output leaks secrets or full PATH data    | Local information exposure                    | Sanitize values, expose provenance/identity selectively, add secret/path tests             |

## Open Decisions

1. Whether continuation pages share one frozen observation generation or each page returns non-actionable data plus a separately refreshed actionable snapshot.
2. Resolved 2026-07-28: consultable launch uses an additive pending result
   plus the standard `tauri_status` tool. `tauri_launch` waits up to 5000 ms by
   default, status polling is the compatibility contract, and experimental MCP
   Tasks are not required.
3. The exact finite action names and schemas for RDM-011.
4. The first supported host formats for `mcp print-config`; automatic configuration remains excluded.

## Handoff

Start with `docs/work-packages/RDM-009-bounded-observation/2026-07-28-009-bounded-observation-work-package.md`. Do not begin U15 until decision 1 is recorded in the contract/plan closeout.
