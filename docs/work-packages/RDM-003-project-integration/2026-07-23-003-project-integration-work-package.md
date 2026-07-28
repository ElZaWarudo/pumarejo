---
title: Integrate consumer projects safely
status: review-passed
roadmap_item: RDM-003
origin_roadmap: docs/roadmaps/2026-07-23-001-pumarejo-roadmap.md
origin_brainstorm: STRATEGY.md
origin_planning_input: docs/product-requirements.md
origin_plan: docs/plans/2026-07-23-001-feat-pumarejo-plan.md
units: [U4, U5, U6]
unit_alignment: complete
review_units: [RU1, RU2, RU3]
base_branch: unresolved-final-release
pr_strategy: independent
max_open_stack: n/a
jira_policy: optional
production_posture: prototype
autonomy: guarded
autonomous_ledger: none
allowed_mutation_classes: []
---

# Integrate consumer projects safely

## Scope

Detect supported Tauri 2 projects and launch shapes, apply dry-runnable attributable integration, then diagnose and conservatively remove it.

## Non-goals

No runtime session, UI control, ambiguous source rewrite, or release.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: parser/helper decomposition and fixture variants already within the compatibility contract.
- Agent must record as assumptions: detected package-manager conventions and formatting-preservation tradeoffs.
- Agent must escalate: ambiguous mutation, public config change, or destructive reversal.
- Safe fallback: abort before the first write and report the exact manual action.
- Autonomous ledger: none.
- Allowed external mutation classes: none.

## Dependencies

- Requires: RDM-002 passed.
- Blocks: RDM-008.
- Waves: RU1 then RU2 then RU3; no unit starts before predecessors pass.

## Production Posture

- Posture: prototype.
- Evidence: greenfield tool, but consumer projects are trusted user assets.
- Confidence: high.
- Consequences for this package: consumer writes require transactional safety despite prototype posture.
- Breaking existing behavior allowed: no.

## Plan Unit Alignment

| Plan unit | Included | Reason                         |
| --------- | -------- | ------------------------------ |
| U4        | yes      | Read-only project/launch model |
| U5        | yes      | Idempotent integration         |
| U6        | yes      | Diagnostics and safe removal   |

Grouping rationale: three independently testable mutation stages. Estimates: RU1 300-550 human; RU2 500-900 human + <150 templates; RU3 350-650 human.

## Implementation Units

- U4: project detection and launch profile.
- U5: init/dry-run and integration manifest.
- U6: doctor and remove.

## Review Units

| Review unit | Scope                   | Expected changed surfaces                           | PR base                  | Jira issue/subtask | Size/risk note                           |
| ----------- | ----------------------- | --------------------------------------------------- | ------------------------ | ------------------ | ---------------------------------------- |
| RU1         | Read-only project model | detector/config generator/fixtures                  | unresolved-final-release | optional Task     | 300-550 human                            |
| RU2         | Transactional init      | Cargo/Rust/capability/template/manifest/write/tests | unresolved-final-release | optional Task     | 500-900 human + templates; mutation risk |
| RU3         | Doctor and remove       | CLI/diagnostics/reversal/tests                      | unresolved-final-release | optional Task     | 350-650 human; destructive-safety review |

## Reviewability Diagnosis

- Reviewer-experience check: yes; discovery, write, and reversal have distinct evidence.
- Granularity chosen because: safe reversal should not be buried in init logic.
- Open-stack plan: serial local work; independent final handoff.
- Jira mapping: optional standalone Task per RU.
- Downstream-fix trace: none.
- Failure-mode check: avoids one mutation mega-diff.

## Files and Tests

`src/installer/`, installer CLI commands, `templates/`, `tests/fixtures/projects/`, and focused unit/integration tests.

## Impact Scan

- Changed contract: RU1 adds the public read-only consumer-project detector,
  deterministic argv launch profiles, effective Tauri config format, primary
  window label, and validated project-config generation. RU2 adds dry-run and
  attributable, idempotent consumer integration. The obsolete inert
  `init --scripts` option was removed; package scripts are preserved. RU3 adds
  stable human/JSON diagnostics and conservative dry-run/removal.
- Consumer scan patterns: `pumarejo`, `wdio-webdriver`, capability entries, package scripts, config formats.
- Consumers found: the root package export, config schema/materializer, packed
  ESM contract, MCP launch stubs, and the pnpm/npm/yarn/bun/deno/cargo fixture
  matrix.
- Contract-drift tests searched: idempotence, semantic restore, ambiguous abort, unrelated-edit preservation.
- Required consumer tests: dry-run/init twice/remove, debug-with-feature and release-without-feature.
- Run/skipped results: the completed package passes 40 unit, 42 integration
  and 25 contract tests on Node 22.23.1 and Node 24.12.0. The U1 structural
  regression remains 11 passed with five live-only skips.

## Verification Gate

Inherited gates for every RU: run `pnpm install --frozen-lockfile` and `pnpm build`, `pnpm typecheck`, `pnpm lint`, and the repository format check on Node 22 and Node 24; a skipped clean-install/build/format gate blocks closeout.
Mutation gates are mandatory: canonicalize the project root and every target, reject symlink/junction/reparse-point targets, use atomic relative writes with revalidation immediately before write/delete, and test race/escape fixtures plus argv-only command execution.

| RU  | U   | Required verification                                                        | Evidence                  | Pass signal                        |
| --- | --- | ---------------------------------------------------------------------------- | ------------------------- | ---------------------------------- |
| RU1 | U4  | detection matrix for package managers/config formats and all rejection paths | unit/fixture results      | deterministic profile, zero writes |
| RU2 | U5  | dry-run, idempotence, atomic-abort, Cargo feature and debug/release builds   | integration results/diffs | only attributable changes          |
| RU3 | U6  | diagnostic identity matrix and semantic restore with developer edits         | integration results/diffs | safe restore or explicit refusal   |

## Review Gate

- Code review threshold: P0-P2; lower findings logged.

## Security Gate

- Run after each work-review loop: required.
- Security Watch during work: enabled for command/config injection, path confinement, atomic writes, manifest trust, and reversal safety.
- Security Watch notes: RU1 accepts only allowlisted executable-plus-argv
  profiles, exact direct `tauri` tasks, one lockfile family, bounded regular
  project files, canonical roots, and no linked metadata; it performs no
  writes or project command execution.
- Security reviewer: `krt-security-sentinel`.
- Security review result: RU1 and RU2 advisory-only with no P0-P2.
  CVE-2026-14257 in
  `brace-expansion` is confined to transitive ESLint development tooling;
  `pnpm audit --prod` is clean. Keep `blockExoticSubdeps` and monitor the
  registry for the announced patched release rather than weakening install
  policy. RU2 rejects linked/root-swapped targets, validates the exact applied
  manifest shape and hashes, journals applying/applied state, and uses atomic
  rollback-safe writes. Directory fsync/no-follow handles remain P3 hardening.
  RU3 accepts only canonical sanitized manifests and exact Cargo/Rust/ignore
  ownership markers, uses a fail-closed removing journal, never terminates
  residue, and passed with no P0-P2.
- Required security verification: no unresolved P0-P2; rerun tests/review after security fixes.

## CI Break-Prevention And Escalation

- CI risk surfaces: fixtures, parsers, formatting, Rust/Tauri builds, Windows path semantics.
- Preventive evidence: fixture matrix and release-safety build.
- If CI breaks: invoke `krt-ci-questor`.
- Escalation rule: leave unit pending with cause/owner/next action.

## RU1 Closeout

- Status: `review-passed`.
- Unit: U4.
- Changed surfaces: bounded read-only Cargo/Tauri/package manifest parsing;
  Tauri 2, JSON, JSON5 and TOML detection; pnpm, npm, yarn, bun, deno and cargo
  launch-profile derivation; generated v1 project configuration; public ESM
  exports; fixture and rejection-path matrix.
- Test-first evidence: the focused suite first failed because
  `src/config/generate.ts` and `src/installer/project.ts` did not exist.
  Implementation then made the detection matrix green.
- Verification:
  - Node 22.23.1 and Node 24.12.0 pass frozen install, build, typecheck, lint,
    formatting, and 40 unit tests.
  - Seventeen project-detection scenarios cover all six supported launch
    shapes, JSON/JSON5/TOML, generated configuration, every public rejection
    reason, zero writes on rejection, and junction/symlink refusal.
  - Twenty-five package/MCP contract tests pass; the packed package imports the
    new root/config exports. U1 structural regression remains 11 passed with
    five live-only skips.
  - `pnpm audit --prod` reports zero advisories. The full development audit has
    one non-runtime upstream advisory described in the Security Gate.
- Impact Scan: root/config consumers and packed exports remain green; mutation,
  idempotence, debug/release and semantic-restore consumers are assigned to
  RU2/RU3 and were not claimed by RU1.
- Correctness review: passed with no unresolved P0-P2 after fixing effective
  JSON5 reporting for JSON5 syntax stored in `tauri.conf.json`.
- Security review: advisory-only with no unresolved P0-P2. Paths are
  canonicalized and confined, linked metadata is rejected, file sizes are
  bounded, arbitrary project scripts never become commands, and launch remains
  argv-only with exactly one `{tauriConfig}` placeholder.
- Recorded assumption: a declared direct Tauri 2 CLI task proves project-local
  package availability; Cargo-only projects defer system `cargo tauri`
  availability to RU3 doctor diagnostics. Multiple lockfile families or
  wrapped scripts fail closed.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent review unit: RU2 / U5.

## RU2 Closeout

- Status: `review-passed`.
- Unit: U5.
- Changed surfaces: dry-run and apply planning; optional Cargo dependency and
  feature insertion; debug-and-feature-gated Rust registration; derived
  agent-only capability; generated launch configuration; ignore block;
  applying/applied attributable manifest; atomic writes and rollback; real CLI
  output.
- Test-first evidence: integration scenarios initially failed because the
  installer planner and mutation modules did not exist. Subsequent red tests
  exposed root-junction escape, temporary-file cleanup, Rust comment/string
  matching, multiline crate attributes, missing `.gitignore`, and package
  result-shape issues; each now has a regression.
- Verification:
  - Node 22.23.1 and Node 24.12.0 pass frozen install, build, typecheck, lint,
    formatting, 40 unit tests, 23 integration tests and 25 contract tests.
  - All six supported launch shapes apply idempotently. Ambiguous Rust,
    concurrent edits, interrupted journals, junction insertion and canonical
    root replacement fail closed without external writes.
  - Generated Cargo compiles on the stable MSVC toolchain in normal debug,
    agent-feature debug, agent-capability overlay, and normal release forms.
    The optional provider is absent from normal dependency trees and present
    only with `--features pumarejo`.
  - U1 structural regression is 11 passed with five live-only skips;
    `pnpm audit --prod` reports zero advisories.
- Impact Scan: package scripts, unrelated Cargo values/features, source
  capabilities, config formats and ignore rules are preserved. The agent
  capability is isolated under `.pumarejo` because adding its plugin
  permission to the normal Tauri capability makes featureless builds reject
  an unknown permission.
- Correctness review: passed with no unresolved P0-P2 after fixes for
  temporary cleanup, root revalidation, executable Rust token detection and
  multiline inner attributes.
- Security review: advisory-only with no unresolved P0-P2 after validating the
  exact manifest entry set and SHA-256 shapes and adding root/junction race
  coverage. P3 hardening remains for directory fsync/no-follow handles; the
  existing ESLint-only upstream advisory remains non-runtime.
- Recorded contract correction: `init --scripts` had no specified behavior and
  silently did nothing. It was removed from parsing, help and contracts; init
  explicitly preserves consumer package scripts.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent review unit: RU3 / U6.

## RU3 Closeout

- Status: `review-passed`.
- Unit: U6.
- Changed surfaces: thirteen stable doctor diagnostics with matching
  human/JSON identities; project/config/integration/toolchain/platform/port and
  residue checks; CLI doctor/remove routing; dry-run removal; semantic Cargo,
  Rust and ignore restoration; owned-file deletion; removing journal and
  transactional rollback.
- Test-first evidence: focused tests exercised the public CLI, every diagnostic
  identity, aggregate ready/warn/error states, developer edits, forged
  manifests/attribution, interrupted journals, linked residue, repeated remove,
  rollback and the originally missing-ignore case. Review then exposed and
  fixed executable path hijacking, manifest trust, Cargo extra-field deletion
  and Node-version drift.
- Verification:
  - Node 22.23.1 and Node 24.12.0 pass frozen install, build, typecheck, lint,
    formatting, 40 unit tests, 42 integration tests and 25 contract tests.
  - Doctor reports all FR-005 prerequisites independently, keeps human and JSON
    identities aligned, detects owned residue without deleting or terminating
    it, and rejects linked/oversized/noncanonical state.
  - Remove preserves unrelated Cargo/Rust/ignore edits, preserves pre-existing
    dependency/feature values exactly, refuses changed owned values, rejects
    forged attribution, rolls back injected failures and leaves interrupted
    work diagnosable as `removing`.
  - Generated Cargo with ownership comments compiles in normal debug,
    agent-feature debug and featureless release forms on stable MSVC.
  - U1 structural regression is 11 passed with five live-only skips;
    `pnpm audit --prod` reports zero advisories.
- Impact Scan: init remains idempotent across all six launch shapes; canonical
  manifest parsing now sanitizes unknown fields; package scripts and source
  capabilities remain untouched; CLI contracts reject the removed inert
  option and expose working doctor/remove commands.
- Correctness review: passed with no unresolved P0-P2 after exact Cargo
  ownership markers, canonical manifest enforcement, conservative empty-ignore
  restoration and the Node 22/24 diagnostic correction.
- Security review: advisory-only with no unresolved P0-P2. WebView probes use
  fixed validated executables, residue reads are bounded and link-safe, and
  removal trusts only canonical entries plus exact ownership markers. P3
  remains for the unavoidable micro-TOCTOU between final revalidation and
  portable Node `rm`/`rename`, and for the ESLint-only upstream advisory.
- Recorded assumption: an init-created `.gitignore` is restored to an empty
  inert file instead of deleting it based only on untrusted historical
  metadata; this preserves semantic pre-init behavior while failing
  conservatively.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent package: RDM-004 / RU1 / U7.

## Branch and PR Handoff Inputs

- Review unit: RU1, RU2, or RU3.
- Branch name: `feat/reversible-tauri-integration`.
- PR base: unresolved-final-release.
- Suggested commit grouping for this review unit: `feat(integration): detect supported Tauri projects`; `feat(integration): add reversible debug setup`; `feat(cli): diagnose and remove Tauri integration safely`.
- PR title: Add reversible Tauri project integration
- PR body bullets:
  - Detects supported project shapes without mutation.
  - Adds idempotent setup, diagnostics and conservative removal.
- Verification results location: work-package closeout.
- Production/deployment notes: consumer files are preserved transactionally.
- Autonomous mutation request: none.

## Jira Handoff Inputs

- Jira policy: optional; standalone Task per RU.
- Suggested issue type: Task.
- Suggested subtask behavior: shared parent only if final grouped delivery justifies it.
- PR-to-Jira mapping: one task per RU.
- Jira summary: Integrate Tauri projects reversibly
- Jira description: Detect compatible projects, apply debug instrumentation, and remove it without affecting unrelated changes.
- Optional-policy fallback: Jira omitted: no context/config.
