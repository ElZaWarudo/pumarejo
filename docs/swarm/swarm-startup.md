---
title: Swarm startup for Pumarejo reliable native E2E
status: in-review
date: 2026-08-21
mode: document-plan
---

# Swarm startup

## Source and operating mode

- Source: the 2026-08-21 Tinto improvement proposal plus the existing accepted audit, roadmap, delivery plan, and RDM-009 through RDM-012 work packages.
- Current mode: `document-plan`, manual interaction.
- Code, workers, branches, worktrees, commits, PRs, Jira, and release handoff remain blocked until explicit documentation approval.
- The current checkout is `main` with pre-existing changes in `src/installer/project.ts` and `tests/unit/project-detection.test.ts`. Those files belong to the user and must not be reverted, folded into this initiative, or used as a shared mutable base accidentally.

## Composition approach

- Reuse the existing RDM-009 work package after its contract decision is resolved.
- Treat RDM-010 through RDM-012 as review-passed baseline; live Tinto failures may open focused regression units, not wholesale reimplementation.
- Use one isolated Compound Master artifact flow for each new deep roadmap item that lacks a reviewed work package.
- After a work package is execution-ready, apply the lane gate again: dispatch a direct `luna_xhigh` implementer when the package already supplies all required gates; retain nested Compound execution only when its multi-stage review/security pipeline is still needed.
- RDM-020 and RDM-021 should be split into disjoint standard review units when their contracts are fixed; RDM-022 begins as deep because it reads filesystem/install state and produces repair guidance.

## Concurrency and role caps

```yaml
planner_workers: 4
implementer_workers: 2
reviewer_workers: 2
fixer_workers: 1
integrator_workers: 1
documenter_workers: 1
```

These are ceilings. Optional roles start at zero and require their trigger:

- Planner: only for a broad item not yet decomposed into a reviewed work package.
- Reviewer: every behavior/public-contract/security/process change.
- Fixer: only after a concrete finding or failed check.
- Integrator: waves with shared MCP schemas, provider interfaces, state machines, fixtures, or dependency edges.
- Documenter: when maintained contracts, architecture, compatibility, security, or operator docs change.

At most two mutable implementers run concurrently. Serialize changes to public MCP contracts, central session/generation state, provider interfaces, capability composition, dependency manifests/lockfiles, shared fixtures, and generated outputs.

## Isolation

- Preferred isolation: one Git worktree and `codex/<unit-slug>` branch per mutable unit, rooted at the same approved shared documentation revision.
- The approved composition-review bundle is `sha256:b0f646489c37c205beccbe6cbe26cb5aa1169b73d8d83922d6a0fb8af5a48d12`, recorded in `docs/swarm/shared-artifact-revision.json`. Artifact-planning children must verify that bundle and work read-only against those exact inputs while writing only their collision-free namespace/state path.
- If the approved documentation is not on a revision every worktree can read, first route that stable-base creation through the repository's Git workflow. Until then, dispatch is blocked.
- No worker may edit or reset the user's existing dirty files unless a later approved work package explicitly owns them and the user first isolates or integrates those changes.

## Composition review

- The initiative contract is requirements-only and covers all sixteen proposal areas, actors, non-goals, success criteria, invariants, settled decisions, escalation boundaries, and open decisions.
- The roadmap separates the Tinto MVP from Phase 2 operational hardening and retains RDM-009 through RDM-012 authority instead of duplicating it.
- Every planned deep child has a unique run ID, state path, artifact namespace, brokered interaction contract, dependency list, and exact `mode: artifacts` authority.
- The shared contract and roadmap match the recorded read-only content bundle. Mutable execution still requires an approved Git revision on the intended base.
- Jira hierarchy is proposed only; its provider and target project remain unresolved.
- No child artifact or canonical state is claimed to exist before launch.

## Planned Compound invocation envelopes

All children use `interaction: brokered`, `parallel: false`, and shipping disabled. The state paths are reserved but do not exist yet.

```yaml
rdm-013-surfaces:
  orchestrator: seneschal
  run_id: tinto-e2e-rdm-013-surfaces
  state_path: docs/orchestration/compound-master/tinto-e2e-rdm-013-surfaces/state.md
  interaction: brokered
  mode: artifacts
  parallel: false
  shipping: disabled
  initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
  target:
    roadmap: docs/product/roadmap.md
    roadmap_item: RDM-013
    work_package: null
    review_unit: null
  artifact_namespace: tinto-e2e-reliability/RDM-013-surfaces
  shared_decisions:
    [docs/plans/tinto-e2e-reliability/initiative-requirements.md]
  depends_on: [RDM-009]

rdm-014-native-control:
  orchestrator: seneschal
  run_id: tinto-e2e-rdm-014-native-control
  state_path: docs/orchestration/compound-master/tinto-e2e-rdm-014-native-control/state.md
  interaction: brokered
  mode: artifacts
  parallel: false
  shipping: disabled
  initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
  target:
    {
      roadmap: docs/product/roadmap.md,
      roadmap_item: RDM-014,
      work_package: null,
      review_unit: null,
    }
  artifact_namespace: tinto-e2e-reliability/RDM-014-native-control
  shared_decisions:
    [docs/plans/tinto-e2e-reliability/initiative-requirements.md]
  depends_on: [RDM-013]

rdm-015-observability:
  orchestrator: seneschal
  run_id: tinto-e2e-rdm-015-observability
  state_path: docs/orchestration/compound-master/tinto-e2e-rdm-015-observability/state.md
  interaction: brokered
  mode: artifacts
  parallel: false
  shipping: disabled
  initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
  target:
    {
      roadmap: docs/product/roadmap.md,
      roadmap_item: RDM-015,
      work_package: null,
      review_unit: null,
    }
  artifact_namespace: tinto-e2e-reliability/RDM-015-observability
  shared_decisions:
    [docs/plans/tinto-e2e-reliability/initiative-requirements.md]
  depends_on: [RDM-013]

rdm-016-process-custody:
  orchestrator: seneschal
  run_id: tinto-e2e-rdm-016-process-custody
  state_path: docs/orchestration/compound-master/tinto-e2e-rdm-016-process-custody/state.md
  interaction: brokered
  mode: artifacts
  parallel: false
  shipping: disabled
  initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
  target:
    {
      roadmap: docs/product/roadmap.md,
      roadmap_item: RDM-016,
      work_package: null,
      review_unit: null,
    }
  artifact_namespace: tinto-e2e-reliability/RDM-016-process-custody
  shared_decisions:
    [docs/plans/tinto-e2e-reliability/initiative-requirements.md]
  depends_on: [RDM-010, RDM-015]

rdm-017-portable-runtime:
  orchestrator: seneschal
  run_id: tinto-e2e-rdm-017-portable-runtime
  state_path: docs/orchestration/compound-master/tinto-e2e-rdm-017-portable-runtime/state.md
  interaction: brokered
  mode: artifacts
  parallel: false
  shipping: disabled
  initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
  target:
    {
      roadmap: docs/product/roadmap.md,
      roadmap_item: RDM-017,
      work_package: null,
      review_unit: null,
    }
  artifact_namespace: tinto-e2e-reliability/RDM-017-portable-runtime
  shared_decisions:
    [docs/plans/tinto-e2e-reliability/initiative-requirements.md]
  depends_on: [RDM-015]

rdm-018-sequences-refs:
  orchestrator: seneschal
  run_id: tinto-e2e-rdm-018-sequences-refs
  state_path: docs/orchestration/compound-master/tinto-e2e-rdm-018-sequences-refs/state.md
  interaction: brokered
  mode: artifacts
  parallel: false
  shipping: disabled
  initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
  target:
    {
      roadmap: docs/product/roadmap.md,
      roadmap_item: RDM-018,
      work_package: null,
      review_unit: null,
    }
  artifact_namespace: tinto-e2e-reliability/RDM-018-sequences-refs
  shared_decisions:
    [docs/plans/tinto-e2e-reliability/initiative-requirements.md]
  depends_on: [RDM-009, RDM-013, RDM-014]

rdm-019-tinto-certification:
  orchestrator: seneschal
  run_id: tinto-e2e-rdm-019-certification
  state_path: docs/orchestration/compound-master/tinto-e2e-rdm-019-certification/state.md
  interaction: brokered
  mode: artifacts
  parallel: false
  shipping: disabled
  initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
  target:
    {
      roadmap: docs/product/roadmap.md,
      roadmap_item: RDM-019,
      work_package: null,
      review_unit: null,
    }
  artifact_namespace: tinto-e2e-reliability/RDM-019-certification
  shared_decisions:
    [docs/plans/tinto-e2e-reliability/initiative-requirements.md]
  depends_on: [RDM-014, RDM-015, RDM-016, RDM-017, RDM-018]

rdm-022-self-doctor:
  orchestrator: seneschal
  run_id: tinto-e2e-rdm-022-self-doctor
  state_path: docs/orchestration/compound-master/tinto-e2e-rdm-022-self-doctor/state.md
  interaction: brokered
  mode: artifacts
  parallel: false
  shipping: disabled
  initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
  target:
    {
      roadmap: docs/product/roadmap.md,
      roadmap_item: RDM-022,
      work_package: null,
      review_unit: null,
    }
  artifact_namespace: tinto-e2e-reliability/RDM-022-self-doctor
  shared_decisions:
    [docs/plans/tinto-e2e-reliability/initiative-requirements.md]
  depends_on: [RDM-017]
```

RDM-009 reuses its canonical work package. A new collision-free Compound state path, if its remaining execution/review pipeline requires one, will be `docs/orchestration/compound-master/tinto-e2e-rdm-009-observation/state.md`; it must not reuse `docs/orchestration/compound-master-state.md`.

## Verification ownership

- Leaf implementers run literal work-package-focused checks only.
- The Seneschal/root owns one aggregate fingerprint and CI-equivalent run after each mutable wave.
- Reviewers consume existing evidence and add only risk-specific checks.
- Nested Compound runs own their required inner gates; the root does not duplicate them.
- Aggregate baseline: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm pack:check`.
- Contract changes add `pnpm test:contract`; runtime/provider changes add `pnpm test:integration` and the applicable Windows/Linux platform gates; final certification runs `pnpm validate` plus the public Tinto journey.

## Review, security, and release gates

- Independent correctness review is mandatory for every roadmap item.
- Security review is mandatory for dialogs, logs/redaction, environment, process ownership/repair, filesystem self-diagnostics, and capability behavior.
- No unit is release-ready with unresolved P0-P2 findings, missing focused evidence, stale aggregate fingerprint, or undocumented unsupported provider behavior.
- Only `krt-release-marshal` may commit, push, open a PR, mutate Jira during release, request reviewers, or perform merge-related work.
- Jira provider remains unresolved; no Jira mutation is planned for the current mode.

## Stop conditions

- Documentation is not explicitly approved.
- A selected unit has an open blocker or depends on one.
- Shared approved artifacts are not readable from a stable common revision.
- Provider feasibility cannot support the promised surface/dialog behavior and the contract has not been revised truthfully.
- Isolation would overlap the dirty user-owned installer changes.
- Verification or security gates fail, a worker exceeds scope, or ownership proof is insufficient for cleanup/repair.

## Timing

No timing file is created before dispatch. The first approved wave will use `docs/orchestration/runs/tinto-e2e-reliability-timing.json`; only the root writes it and it must contain no prompts, source text, logs, secrets, or sensitive URLs.
