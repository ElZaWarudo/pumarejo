---
initiative: tinto-e2e-reliability
mode: execute
status: implementation-review-passed-with-platform-gap
date: 2026-08-24
parent_orchestrator: seneschal
run_id: tinto-e2e-rdm-017-portable-runtime
interaction: brokered
canonical_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-017-portable-runtime/state.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
target_roadmap: docs/product/roadmap.md
target_roadmap_item: RDM-017
artifact_namespace: tinto-e2e-reliability/RDM-017-portable-runtime
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
last_parent_decision_applied: user approval of all decisions and autonomous execution through release phase (2026-08-24)
---

# RDM-017 Compound Master state

## Current phase

- Phase: RU1/RU2 implementation, local-apply review loop, security gate, and parent reconciliation.
- Status: `implementation-review-passed-with-platform-gap`.
- Result: environment reconstruction, canonical portable resolver, safe fixed probes/shims, sanitized evidence, focused fixtures, code review, independent validation, and Security Sentinel gate are complete.
- Shipping remains parent-owned. No commit, Jira, push, PR, merge, or release mutation occurred in this child.

## Preflight and ownership

- Worktree: `C:\Users\User\Documents\personal\pumarejo\.worktrees\codex-tinto-e2e-reliability`.
- Branch/base: `codex/tinto-e2e-reliability` from `23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53`.
- RDM-017 owns environment/toolchain/evidence implementation and tests. RDM-015 owns the diagnostic store. RDM-020/RDM-022 own doctor consumers. User-owned main-checkout installer/project-detection edits remain untouched.
- Jira policy: skip. Release mutations remain reserved for `krt-release-marshal` after Seneschal aggregate reconciliation.

## Resolved roles and review

| Role | Resolution | Result |
| --- | --- | --- |
| work | delegated RDM-017 implementation lanes | RU1/RU2 implemented and reconciled |
| code review | correctness, testing, security, reliability, local adversarial | nine P1 findings found; eight fully resolved, one native-platform gap retained |
| validation | fresh independent post-fix validator | launcher, identity, probe and regression fixes confirmed |
| security review | `krt-security-sentinel` | pass with native Windows evidence required |
| cross-model review | different-provider CLI route discovery | not run; no attested installed route |
| release | `krt-release-marshal` | deferred to parent release phase |

No applicable `AGENTS.md` or `CLAUDE.md` standards file was present.

## Implementation result

- U34: `resolvedLaunchEnvironmentResult` preserves complete/incomplete state, accepts a narrow injected OS source, rejects empty minimum values, and is consumed by the Windows launcher before spawn. Expansion and comparison are bounded and value-free.
- U35: explicit, child PATH, platform-root, and host-comparison candidates have truthful ordered sources and fair finite bounds. PATHEXT/Linux mode, basename/tool identity, realpath/root checks, fixed probes, standard Cargo/rustc suffixes, safe npm/pnpm shims, and cleanup-aware timeout/output behavior are covered.
- U36: ownership-bound sanitized evidence excludes raw path, PATH, values, args, output, and causes. Resolver-driven Windows/Linux fixtures and sink failure isolation pass.

## Verification evidence

- Focused RDM-017 matrix: 43 passed across 6 files.
- Focused Windows incomplete-launch refusal: 1 passed.
- `pnpm typecheck`, targeted ESLint/Prettier, and `git diff --check`: pass.
- `pnpm test:contract`: 58 passed.
- `pnpm test:integration`: 71 passed, 5 fixture/provider skips.
- `pnpm test:unit`: 350 passed, 3 skipped, 5 unchanged host/baseline failures: four NVM/process-exec-path fixture assumptions and one unavailable Windows PowerShell Security module load.
- Durable reviews: `docs/review-findings/tinto-e2e-reliability/RDM-017-portable-runtime/2026-08-24-code-review.md` and `2026-08-24-security-review.md`.

## Residual platform gap

Pure Node does not expose every non-symlink Windows reparse tag and cannot pin an executable file handle through `spawn`. The default adapter rejects symlinks, explicit reparse metadata, realpath/canonical changes, outside-root targets, and immediately revalidates before probing. Probe survivors are reported as unavailable residue, never accepted. A native Windows adapter or equivalent authoritative platform evidence remains required for a complete reparse-tag/handle-pinning or residue-zero claim.

## Closeout

RDM-017 is ready for RDM-020/RDM-022 consumption and Seneschal aggregate verification. It is not release approval. The parent must keep the native Windows gap visible and may not convert deterministic fixtures into a complete platform-support claim.
