---
title: Diagnose integration drift by owned attribution
status: review-passed
artifact_status: artifacts-ready
roadmap_item: RDM-020
origin_roadmap: docs/product/roadmap.md
origin_audit: docs/audits/2026-08-21-tinto-gap-audit.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-020-attributed-drift-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
units: [U28, U29]
unit_alignment: complete
review_units: [RU1, RU2]
base_branch: main
pr_strategy: standalone
jira_policy: skip
production_posture: hardening
autonomy: guarded
allowed_mutation_classes: []
---

# Diagnose integration drift by owned attribution

## Scope

Replace whole-file integration drift authority with safe attributed checks for
the Rust registration markers, Cargo dependency/features semantics, the owned
`.gitignore` block, the isolated generated capability schema, and integration-
owned `.pumarejo.json` fields. Full-file hashes stay in the manifest as
secondary evidence. `doctor` remains read-only: unrelated user edits are
preserved and not auto-repaired.

This package is documentation/planning output in the current run; it does not
authorize product-code or test edits here.

## Non-goals

- Reverting unrelated edits or adding automatic repair/remove behavior.
- Changing RDM-017 project detection, launch resolution, or user-owned dirty
  files `src/installer/project.ts` and `tests/unit/project-detection.test.ts`.
- Adding `doctor --self`, dependency/install/junction diagnosis, network or
  artifact policy (RDM-021/RDM-022).
- Changing MCP tools, session ownership, observation, capability composition in
  the source application, or release/Jira/branch/PR state.
- Treating full-file hashes as the sole authority or dropping them from the
  manifest.

## Autonomy Contract

- Mode: guarded, local artifact autonomy only.
- Agent may decide without asking: pure evaluator names, internal reason codes,
  test fixture arrangement, and equivalent read-only verification commands.
- Agent must preserve: manifest v1/v2 compatibility, safe-file confinement,
  stable `doctor` diagnostic IDs, and exact generated capability permissions.
- Agent must escalate: any public config/schema migration, source capability
  merge, auto-repair, changed ownership boundary, or new diagnostic that leaks
  paths/content/secrets.
- Safe fallback: classify an unprovable owned projection as drift/error; never
  treat a malformed or unsafe file as unrelated.
- Allowed external mutation classes: none for this artifact-only run.

## Dependencies

- Requires RDM-017's accepted project/config detection contract and its
  integration of any current dirty-file reconciliation.
- Consumes the approved initiative contract, roadmap, and gap audit evidence.
- Blocks RDM-023 release certification's drift/regression evidence until the
  focused matrix passes.
- Does not own RDM-009 observation package/state, RDM-013 surface artifacts, or
  any user-owned installer changes.

## Resolved attribution contract

The following rules are final for implementation and leave no product decision
open:

1. Attribution is authoritative. Every manifest entry is evaluated against its
   owned marker, semantic projection, or field set even when its full hash
   matches.
2. A full-hash mismatch with an intact attributed projection is tolerated and
   is not integration drift. A full-hash match never rescues an altered owned
   projection or forged attribution.
3. Rust owns one exact generated marker block and one exact builder wrapper;
   `.gitignore` owns one exact marker block and `/.pumarejo/`; Cargo owns only
   attributed dependency/feature semantics; and user edits outside those areas
   are preserved.
4. The generated capability must parse as exactly:

   ```json
   {
     "identifier": "pumarejo-agent",
     "windows": ["<initialized-window-label>"],
     "permissions": [
       "wdio-webdriver:default",
       "core:window:allow-set-size",
       "core:window:allow-maximize",
       "core:window:allow-is-maximized",
       "core:window:allow-unmaximize"
     ]
   }
   ```

   No extra keys, wildcard window, duplicate/reordered permission, or
   authority-bearing command/scope is accepted.
5. Integration-owned config is limited to `version`, initialized `window`,
   generated artifact defaults, and the launch argument coupling (`pumarejo`
   feature plus exactly one `{tauriConfig}`). Canonical v2 attribution names
   these fields as `field:version`, `field:window`,
   `field:artifactsDirectory`, `field:retainArtifacts`,
   `launch:feature:pumarejo`, and `launch:config-placeholder`; the expected
   window is taken from the exact isolated capability window label. User-owned
   valid launch command, path, environment, and optional port edits are not
   manifest drift; existing schema validation still applies.
6. Missing, duplicated, malformed, symlinked, or otherwise unsafe owned
   content fails closed and never triggers repair.

## Implementation Units

- **U28 — Attributed evaluator and doctor wiring:** add pure read-only
  projections for manifest entries, replace whole-file drift authority in
  `src/installer/doctor.ts`, and preserve v1/v2 attribution/hash compatibility.
- **U29 — Regression matrix and maintained contract evidence:** add unit,
  integration, and contract fixtures proving unrelated edits are tolerated and
  owned mutations are detected; update `docs/contracts.md` and
  `docs/security.md` only for tested behavior.

## Review Units

| RU | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
| --- | --- | --- | --- | --- | --- |
| RU1 | Attributed projection evaluators and `doctor` integration diagnostics for Rust, Cargo, ignore, capability, config, and secondary hashes. | `src/installer/doctor.ts`, pure helpers in existing `src/installer/*`, focused unit tests. | `main` | skip (Jira policy explicitly skipped) | High installer safety/security risk; target <=500 human-authored lines; no repair or public MCP change. |
| RU2 | Regression matrix, contract/security wording, and compatibility proof for tolerated versus owned mutations. | `tests/unit/`, `tests/integration/doctor.test.ts`, `tests/integration/init.test.ts`, `tests/contract/`, `docs/contracts.md`, `docs/security.md`. | `main` after RU1 contract is accepted | skip (Jira policy explicitly skipped) | Medium-high fixture/contract risk; target <=500 human-authored lines; shared installer fixture edits serialize with RU1. |

## Reviewability Diagnosis

- Reviewer-experience check: yes. RU1 isolates the authority decision and
  read-only evaluator safety; RU2 proves each projection with an explicit
  mutation matrix and documents only tested public/security behavior.
- Granularity chosen because: evaluator correctness and fixture/contract proof
  have distinct risk ownership, but both remain small, standalone slices.
- Open-stack plan: no stack; RU2 starts from `main` after RU1's evaluator
  contract is accepted. If RU1 is merged first, rebase/retarget only through
  the release owner; this worker does not perform history mutation.
- Jira mapping: Jira intentionally skipped by the delegated contract.
- Downstream-fix trace: none at artifact creation.
- Failure-mode check: passes; no deep micro-PR stack and no deferred mega-PR.

## Files and Tests

Future implementation surfaces:

- `src/installer/doctor.ts`, `src/installer/manifest.ts`,
  `src/installer/cargo.ts`, `src/installer/rust.ts`,
  `src/installer/capabilities.ts`, and `src/installer/plan.ts`;
- `src/config/schema.ts`/`src/config/load.ts` only where owned-field parsing
  must reuse existing validation;
- focused tests in `tests/unit/`, `tests/integration/doctor.test.ts`,
  `tests/integration/init.test.ts`, `tests/integration/remove.test.ts`, and
  `tests/contract/`; and
- maintained wording in `docs/contracts.md` and `docs/security.md` only.

Literal focused commands:

```text
pnpm test:unit
pnpm test:integration
pnpm test:contract
```

The artifact run executes only the package checker and document review. The
wave root owns aggregate build/typecheck/lint/format/pack verification.

## Dependency and overlap map

| Surface | RU1/RU2 ownership | Sibling ownership | Coordination rule |
| --- | --- | --- | --- |
| `src/installer/doctor.ts` | RU1 owns attributed integration checks. | RDM-017 owns project detection/runtime; RDM-022 owns future self-doctor. | Keep doctor IDs stable and serialize installer changes. |
| `src/installer/project.ts`, `tests/unit/project-detection.test.ts` | None. | User-owned dirty RDM-017 surface. | Do not edit, reset, or include in the package. |
| Manifest attribution and generated fixture | RU1 defines projection semantics; RU2 tests them. | Existing init/remove behavior is a compatibility baseline. | Reuse v1/v2 parser and preserve full hashes. |
| `docs/contracts.md`, `docs/security.md` | RU2 updates only proven attribution/capability wording. | RDM-023 consumes certification. | No broad docs refactor or unsupported security claim. |
| RDM-009/RDM-013 artifacts and state | None. | Their workers own those files. | Do not edit, stage, or reconcile sibling artifacts/state. |

## Impact Scan

- Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/tenant:
  no new endpoint or MCP operation; `doctor` readiness classification becomes
  attribution-correct and remains bounded.
- Consumer scan: `src/cli/doctor.ts`, `src/installer/remove.ts`,
  `src/installer/plan.ts`, installer tests, Cargo proof, and maintained CLI/
  security docs.
- Data/security: manifest attribution is interpreted as ownership metadata;
  exact capability parsing prevents permissions/scope expansion; diagnostics
  do not include raw file contents or secrets.
- Compatibility: init/remove remain additive and preserve unrelated values;
  v1/v2 manifest parsing and full hashes remain supported.

## Verification Gate

| RU | Required verification | Pass signal |
| --- | --- | --- |
| RU1 | Unit and focused doctor integration tests for all five projections, v1/v2 manifests, hash-secondary behavior, malformed files, unsafe links, and forged hashes. | Unrelated edits remain ready; every owned mutation/deletion/duplication/malformed/unsafe case fails closed. |
| RU2 | `pnpm test:unit`, `pnpm test:integration`, `pnpm test:contract` plus contract/security wording review. | Fixture matrix passes and docs state only observed additive behavior. |

Required matrix cases include unrelated `.gitignore`/Cargo/Rust/config edits,
owned marker deletion/mutation/duplication, Cargo semantic and parse drift,
exact capability schema failures, owned config coupling changes, missing files,
symlinks, and full-hash forgery.

No product tests are run during this artifact-only phase.

## Review Gate

- Code review threshold: P0-P2 for future implementation; no code review is
  performed by this artifact worker.
- Document review: coherence, feasibility, scope, and security lenses applied
  to the plan/package; no unresolved P0-P2 issue remains and no product
  decision is left open.
- Checker gate: `check_work_package.py` must report
  `work package review-unit checks passed`.
- Any implementation failure remains a release-follow-up blocker with cause,
  owner, and next action; no red check is bypassed.

## Security Gate

- Required because the package interprets generated permissions, config
  coupling, file ownership, and unsafe-link boundaries.
- Fail closed on malformed/unsafe files, forged manifest hashes, capability
  extras, wildcard windows, duplicate markers, and unprovable ownership.
- Keep full file content, user paths, capability source content, secrets, and
  internal causes out of public doctor output.
- Security review result for this artifact: design gate passed; implementation
  security evidence is required in RU1/RU2 focused tests and later release
  certification.

## CI Break-Prevention And Escalation

- CI risks: installer fixture semantics, manifest v1/v2 compatibility, Cargo
  parser behavior, config schema interaction, and exact capability permissions.
- Preventive evidence: the literal focused commands above plus the package
  checker; no product tests are claimed in artifact mode.
- If CI breaks, invoke `krt-ci-questor` with the failing job context and retain
  a blocker until cause/owner/next action are recorded.

## Branch and PR Handoff Inputs

- Review unit: RU1 then RU2, standalone on the supplied implementation branch
  after artifact approval; no docs-only release branch.
- Branch name: `feat/attributed-integration-drift` (release owner confirms or
  renames during handoff).
- PR base: `main` at the reconciled RDM-017-compatible revision.
- Suggested commit grouping:
  - `fix(installer): diagnose integration drift by owned attribution` — RU1
    evaluator and doctor wiring.
  - `test(installer): cover attributed drift regressions` — RU2 fixtures and
    contract/security wording proven by tests.
- PR body bullets:
  - Treats owned Rust/ignore/Cargo/capability/config projections as the
    authority for integration drift.
  - Preserves unrelated consumer edits and keeps full-file hashes as
    secondary evidence.
  - Enforces the exact isolated agent capability schema and fail-closed unsafe
    file handling.
  - Includes focused unit, integration, and contract regression coverage.
- Verification results location: implementation package closeout and sanitized
  focused test evidence; aggregate evidence remains wave-root-owned.
- Production/deployment notes: local developer-tool hardening; no automatic
  repair or rollback is introduced.
- Autonomous mutation request: none; no commit, stage, push, PR, Jira, merge,
  release, or publication action is authorized here.

## Jira Handoff Inputs

- Jira policy: skip.
- Suggested issue type/subtask: none; no Jira lookup or mutation is authorized.
- PR-to-Jira mapping: not applicable under `jira-policy:skip`.

## Acceptance Trace

- Initiative requirement: REL-012 (attribution-based integration drift).
- Roadmap acceptance: unrelated `.gitignore` edits do not produce drift;
  deletion, mutation, duplication, malformed files, and unsafe links in owned
  content still detect as drift.
- Approved audit evidence: `docs/audits/2026-08-21-tinto-gap-audit.md`,
  REL-012 row and recommended decomposition.

## Release Readiness

Ready for Seneschal/root reconciliation after the package checker and document
review pass. Implementation remains pending the RDM-017 dependency and the
future focused test matrix; no release, PR, or Jira action is implied.
