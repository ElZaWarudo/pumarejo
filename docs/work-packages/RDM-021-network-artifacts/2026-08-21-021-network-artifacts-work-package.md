---
title: Harden loopback diagnostics and artifact hygiene
status: package-ready
roadmap_item: RDM-021
origin_roadmap: docs/product/roadmap.md
origin_brainstorm: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-021-network-artifacts-requirements.md
origin_planning_input: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-021-network-artifacts-requirements.md
origin_plan: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-021-network-artifacts-plan.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-021-network-artifacts
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-021-network-artifacts/state.md
units: [U30, U31]
unit_alignment: complete
review_units: [RU1, RU2]
base_branch: main
pr_strategy: independent
max_open_stack: n/a
jira_policy: skip
production_posture: unknown
autonomy: high
autonomous_ledger: docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json
allowed_mutation_classes: []
open_decisions: [DR-021-001]
---

# Harden loopback diagnostics and artifact hygiene

## Scope

Implement two additive, bounded operational-hardening slices after RDM-015 and
RDM-016 expose their accepted adapter contracts:

- RU1/U30: explicit IPv4/IPv6 loopback reservation and readiness observation,
  strict Tauri `build.devUrl` comparison, actionable family/port mismatch
  diagnostics, and sanitized evidence sent through RDM-015; and
- RU2/U31: default discovery exclusions, safe explicit-fixture handling,
  deterministic retained-session cleanup planning, containment/symlink/race
  checks, owner-only permissions, and sanitized cleanup evidence.

The package is execution-ready for pure models, explicit-policy evaluation,
tests, and adapter integration. Automatic deletion of retained artifacts with a
new implicit product default is gated by `DR-021-001`; until that decision is
canonical, the runtime must preserve retained artifacts when no explicit policy
is supplied.

This is a planning/package artifact. It does not authorize product edits in the
current child run.

## Non-goals

- Network service, wildcard/external listener, DNS resolution, or non-loopback
  access.
- Process termination, lease repair, orphan ownership, or port ownership policy
  (RDM-016).
- A second diagnostic public tool, raw diagnostic buffer, raw URL/path/cause,
  environment dump, or application-content retention (RDM-015 owns the public
  sink/query contract).
- Generic repository indexing, traversal through symlinks/junctions, cleanup of
  unknown/unmanifested artifact content, dependency repair (RDM-022), or
  attribution/drift edits (RDM-020).
- Any change to RDM-009 observation, RDM-013 surface contracts, RDM-019
  certification, Jira, commits, staging, branch pushes, PRs, merge, or release.

## Autonomy Contract

- Mode: high, local artifact autonomy only.
- Agent may decide without asking: package-local document structure, stable
  U-IDs, two-unit review decomposition, pure helper names, deterministic sort
  tie-breakers, equivalent read-only inspection commands, and conservative
  evidence field labels.
- Agent must record as assumptions: existing `ArtifactStore` manifest and
  permission invariants remain authoritative; RDM-015/RDM-016 adapter contracts
  are consumed rather than redefined; current no-surface behavior remains
  backward compatible; platform-specific IPv6 availability may be a CI-only
  gap; and automatic retention defaults are not enabled without DR-021-001.
- Agent must escalate: public MCP/config fields, retention deletion defaults,
  destructive persistence, auth/ownership changes, public error vocabulary,
  provider support claims, installer/self-doctor/drift scope, branch/base
  strategy, Jira/PR workflow, credentials, or any sibling surface.
- Safe fallback: preserve retained artifacts when policy is absent, mark
  unsupported/unavailable listener families explicitly, continue pure parsing,
  validation, evidence, and tests, and block only the affected wiring.
- Autonomous ledger: `docs/orchestration/autonomy-ledgers/tinto-e2e-reliability.json`.
- Allowed external mutation classes: none for artifact mode; the inherited
  ledger cannot authorize worker shipping.

## Dependencies

- Requires: RDM-015 bounded sanitized diagnostic sink and RDM-016 listener/
  process ownership evidence; current `ArtifactStore` manifest, permission,
  and recovery invariants; approved shared bundle
  `sha256:b0f646489c37c205beccbe6cbe26cb5aa1169b73d8d83922d6a0fb8af5a48d12`.
- Requires before implicit retained deletion: brokered `DR-021-001`.
- Blocks: RDM-023 release certification evidence for REL-013/REL-014.
- Sibling coordination: RDM-020 owns attributed drift; RDM-022 owns self-doctor
  and link/dependency diagnostics; neither is edited by this package. Minimal
  Tauri config extraction may overlap their installer surfaces and must be
  assigned one parent integrator before execution.

## Production Posture

- Posture: unknown.
- Evidence: inherited initiative is a local developer tool; no explicit live,
  preproduction, or deployment rollback posture is recorded.
- Confidence: medium.
- Consequences: preserve current public behavior, authenticated loopback and
  artifact security; require additive compatibility and cross-platform evidence
  before release handoff.
- Breaking existing behavior allowed: only with explicit approval. In
  particular, retained artifact deletion is not enabled by an inferred default.

## Plan Unit Alignment

| Plan unit | Included in this package | Reason |
| --- | --- | --- |
| U30 | yes | Loopback family model, readiness/listener ownership comparison, `build.devUrl` mismatch diagnostics, and bounded RDM-015 adapter form one network-diagnostics review slice. |
| U31 | yes | Discovery exclusions, explicit fixture policy, retained cleanup planning, containment/link safety, permissions, and evidence share one artifact-root security boundary. |

Grouping rationale:

- RU1 is isolated from filesystem deletion because listener family and
  `devUrl` diagnosis have distinct platform and ownership risks and can be
  verified with fake/network adapters.
- RU2 keeps exclusions with retention and containment because splitting them
  would force a reviewer to reason about two implementations of path safety and
  could defer the deletion boundary into a hidden consolidation.
- Two independent review units are the smallest reviewer-comprehensible split;
  they are not micro-PRs or Jira-driven partitions. Shared config/fixture edits
  still serialize under parent reconciliation.

## Implementation Units

- **U30 — Family-aware loopback diagnostics:** explicit IPv4/IPv6 endpoint
  identity, reservation/readiness probes, ownership result consumption,
  strict/bounded `build.devUrl` comparison, stable correction guidance, and
  sanitized RDM-015 event adapter.
- **U31 — Discovery and retained-artifact hygiene:** default exclusion
  predicate, explicit fixture validation, fake-clock retention evaluator,
  manifest/entry canonical revalidation, link/race refusal, owner-only
  permissions, and bounded cleanup evidence.

## Review Units

| Review unit | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
| --- | --- | --- | --- | --- | --- |
| RU1 | U30 loopback endpoint/readiness and devUrl mismatch evidence. | `src/platform/loopback.ts` (new pure helper), `src/session/endpoint.ts`, `src/platform/tracked-process.ts`, `src/platform/mode-config.ts`, existing Windows/Linux launch seams, `src/shared/errors.ts` if approved, focused unit/integration/platform tests, maintained contract/security docs. | `main` | skip (Jira policy explicitly skipped) | High platform/ownership risk; target <=400 human-authored lines; no network-service expansion; shared config edits serialize. |
| RU2 | U31 exclusions, explicit fixtures, retention evaluator, artifact containment/permissions, and cleanup evidence. | `src/artifacts/`, narrowly scoped `src/config`/runtime wiring after decision, focused unit/integration/platform tests, security/compatibility docs. | `main` | skip (Jira policy explicitly skipped) | High destructive-filesystem risk; target <=450 human-authored lines; generated artifacts none; implicit deletion remains gated. |

## Reviewability Diagnosis

- Reviewer-experience check: yes. RU1 is a self-contained loopback/protocol
  diagnostic slice; RU2 is a self-contained artifact-root safety/policy slice.
  Both have deterministic tests and explicit sibling boundaries.
- Granularity chosen because: network-family/ownership reasoning and
  filesystem/deletion reasoning are distinct security risks with independent
  evidence. Atomicity or Jira shape is not the reason for the split.
- Open-stack plan: independent PRs against `main`; if a shared config/fixture
  change forces stacking, cap at two open PRs, wait for parent merge, then
  retarget the child to the refreshed integration base.
- Jira mapping: Jira is intentionally skipped. If a later release run enables
  Jira, each single-review-unit PR maps to one standalone semantic task.
- Downstream-fix trace: none at artifact creation. A later unit must record
  `addresses finding from PR #X` if it fixes a finding from an earlier open PR.
- Failure-mode check: passes; this is neither a deep micro-PR stack nor a
  deferred mega-consolidation PR.

## Files and Tests

Expected future implementation surfaces (not changed in this run):

- `src/platform/loopback.ts` (new pure endpoint/parser/diagnostic model),
  `src/session/endpoint.ts`, `src/platform/tracked-process.ts`, and existing
  Windows/Linux launch/readiness seams;
- `src/platform/mode-config.ts` and existing Windows/Linux launch seams for
  bounded `build.devUrl` input; do not edit `src/installer/project.ts` or absorb
  installer/self-doctor/drift changes owned by RDM-020/RDM-022;
- `src/artifacts/store.ts`, `src/artifacts/permissions.ts`, and an explicit
  policy module or narrow runtime adapter; preserve existing manifest schema and
  recovery core unless a reviewed migration is required;
- `tests/unit/loopback.test.ts`, `tests/unit/artifact-discovery.test.ts`,
  `tests/unit/artifact-retention.test.ts` (or repository-equivalent names),
  `tests/unit/session-endpoint.test.ts`, `tests/unit/artifact-permissions.test.ts`,
  `tests/integration/artifact-store.test.ts`,
  `tests/integration/session-cleanup.test.ts`, and Windows/Linux platform tests;
- maintained `docs/contracts.md`, `docs/compatibility.md`, and `docs/security.md`
  only for behavior proven by implementation.

Mandatory behavioral tests:

- IPv4 and IPv6 endpoint formatting, reservation, readiness, occupied/refused/
  timeout/wrong-family outcomes, and ownership-unproven refusal;
- `build.devUrl` explicit IPv4/IPv6, bracketed IPv6, `localhost`, wildcard,
  invalid scheme/port, family mismatch, port mismatch, and sanitized correction;
- default exclusions, explicit fixture selection, path escape, symlink,
  junction, broken link, and replacement race;
- fake-clock retention age/count/byte ordering, active-session preservation,
  malformed/foreign/unmanifested preservation, repeat determinism, crash
  recovery, and permission-before-write;
- bounded evidence count/bytes, stable codes, secret/path/URL redaction, and
  RDM-015 adapter contract; no raw cause or application content.

## Impact Scan

- Changed API contracts/endpoints/bindings/helpers/schemas/payloads/auth/
  tenant/ownership/test fixtures: loopback readiness observation and typed
  diagnostic input; bounded retained-artifact policy/evidence; no new public MCP
  tool is authorized by this package. Ownership and destructive cleanup seams
  are security-sensitive even when public schemas remain additive.
- Consumer scan patterns: `rg "reserveProviderPort|waitUntilProviderReady|waitForPort|localhost|127\\.0\\.0\\.1|::1|devUrl|retainArtifacts|ArtifactStore|artifactsPath|recover\\(|lstat|realpath|symlink|junction|cleanup" src tests docs`.
- Consumers found: `src/session/endpoint.ts`, `src/platform/tracked-process.ts`,
  Windows/Linux launch adapters, `src/mcp/runtime.ts`, `src/artifacts/store.ts`,
  `src/artifacts/permissions.ts`, config loading, session/artifact integration,
  platform ownership tests, and maintained contracts/security docs.
- Contract-drift tests searched: endpoint host/port schemas, readiness timeout
  and error envelopes, process ownership/port proof, artifact manifest schema,
  permission-before-write, retention close/recovery, link refusal, cleanup
  status, and platform gate fixtures.
- Required consumer tests: all mandatory tests listed above plus the natural
  unit/integration/platform commands and parent aggregate checks.
- Consumer tests run/skipped: skipped in `mode:artifacts`; no product code,
  config, or test edits are authorized and no product pass is claimed.

## Verification Gate

- Commands/outcomes required after implementation:

  ```text
  pnpm exec vitest run tests/unit/loopback.test.ts tests/unit/artifact-discovery.test.ts tests/unit/artifact-retention.test.ts
  pnpm exec vitest run tests/unit/session-endpoint.test.ts tests/unit/webdriver-client.test.ts tests/unit/artifact-permissions.test.ts
  pnpm exec vitest run tests/integration/artifact-store.test.ts tests/integration/session-cleanup.test.ts tests/integration/doctor.test.ts
  pnpm test:platform:windows
  pnpm test:platform:linux
  pnpm test:unit
  pnpm test:integration
  pnpm test:contract
  ```

- Surface-aware evidence:
  - Loopback/network: pure parser and fake listener tests prove both families,
    no wildcard/DNS fallback, deterministic mismatch guidance, and bounded
    retry/deadline behavior.
  - Ownership: RDM-016 adapter fixtures prove a listener is not ready until
    process identity/ancestry/port ownership is revalidated.
  - Artifact discovery: exclusion/fixture tests prove no recursive opening of
    default roots and no link/canonical escape.
  - Retention/cleanup: fake-clock and manifest tests prove deterministic plans,
    active/unknown/malformed preservation, and root-only deletion.
  - Permissions: POSIX mode and Windows SID/DACL tests prove owner-only setup
    before bytes are written.
  - Evidence/security: RDM-015 contract/redaction tests prove bounded stable
    records with no raw URL/path/cause/content.
  - Docs/orchestration: package checker plus document review; no product files
    change in this artifact run.
- Production posture evidence: unknown; release requires additive compatibility,
  Windows/Linux listener and permission evidence, and explicit CI-only gaps.

## Review Gate

- Code review threshold: P0-P2 (future implementation; no code review in this
  artifact-only phase).
- Findings below threshold: log as advisory; any finding involving ownership,
  public disclosure, symlink races, permissions, or destructive cleanup is
  blocking regardless of nominal severity.
- Document review result: requirements, plan, dependency map, and package
  coherence/feasibility review passed with DR-021-001 preserved as a brokered
  destructive-persistence gate. See
  `docs/review-findings/tinto-e2e-reliability/RDM-021-network-artifacts/2026-08-21-document-review.md`.

## Security Gate

- Run after work-review loop: required because the package crosses loopback
  exposure, process/listener ownership, filesystem containment, symlinks,
  permissions, manifest cleanup, and sanitized diagnostic boundaries.
- Security Watch during work: enabled for future execution; this artifact run
  performs no intrusive scan or product mutation.
- Security Watch notes: no wildcard or DNS fallback; verify listener ownership
  before readiness; preserve active/unknown artifacts; revalidate canonical
  paths immediately before deletion; permission before bytes; sanitize before
  storage; never expose URL/path/cause/link target.
- Security reviewer: `krt-security-sentinel` (future implementation gate).
- Security review result: pending until implementation; artifact design gate
  passed with required tests and the retention decision request.
- Required security verification: IPv4/IPv6 family-confusion tests, wrong-owner
  refusal, loopback disclosure tests, symlink/junction and replacement-race
  tests, permission-before-write tests, manifest tamper tests, deletion scope
  tests, and seeded secret/path/URL redaction corpus.

## CI Break-Prevention And Escalation

- CI risk surfaces: Node net family behavior, Windows/Linux process ownership,
  Tauri config parsing, strict error schemas, artifact manifest/policy
  determinism, symlink/junction semantics, DACL/mode permissions, shared
  fixtures, and maintained security/compatibility docs.
- Preventive evidence: literal focused commands above plus platform gates; this
  artifact run has no product CI claim. Root aggregate build/typecheck/lint/
  format/full-test/pack evidence remains parent-owned.
- If CI breaks: invoke `krt-ci-questor` with PR/run/check context; do not poll
  CI from Compound Master and never bypass a red check.
- Escalation rule: retain a release-follow-up blocker until cause, owner, next
  action, and verification are recorded.

## Branch and PR Handoff Inputs

- Review unit: RU1 — loopback diagnostics and devUrl mismatch evidence.
- Review unit RU1: loopback diagnostics and devUrl mismatch evidence.
- Branch name: `feat/loopback-diagnostics`.
- PR base: `main`; independent unless parent requires a serialized shared-config
  retarget.
- Suggested commit grouping:
  - `feat(network): diagnose IPv4 and IPv6 loopback readiness` — pure endpoint
    model, readiness adapters, devUrl comparison, and focused tests.
  - `docs(network): document loopback mismatch evidence` — maintained docs only
    after behavior is proven.
- PR title: Diagnose IPv4 and IPv6 loopback readiness.
- PR body bullets:
  - Distinguishes explicit IPv4/IPv6 listener and `build.devUrl` mismatches.
  - Preserves private authenticated provider ownership and bounded evidence.
  - Includes deterministic unit/integration/platform verification and records
    any unavailable host-family gap.
- Verification results location: implementation branch's sanitized test
  evidence and package closeout; current artifact run has checker/review only.
- Production/deployment notes: posture unknown; no public release until parent
  aggregate and security gates pass.
- Autonomous mutation request: none; release mutations remain with
  `krt-release-marshal` after Seneschal reconciliation.

- Review unit: RU2 — discovery exclusions and retained-artifact hygiene.
- Review unit RU2: discovery exclusions and retained-artifact hygiene.
- Branch name: `feat/artifact-retention-hygiene`.
- PR base: `main`; independent unless shared config/fixtures require a parent
  merge and explicit retarget.
- Suggested commit grouping:
  - `feat(artifacts): add bounded discovery and retention policy` — pure
    exclusions/evaluator, manifest integration, and focused tests.
  - `fix(artifacts): preserve containment and owner-only permissions` — only
    when implementation requires a distinct security correction; keep evidence
    and docs with the same review unit unless that split materially improves
    review.
- PR title: Add bounded artifact retention and discovery hygiene.
- PR body bullets:
  - Excludes repository/runtime copies while allowing validated explicit
    fixtures.
  - Plans and applies only bounded closed-session cleanup inside canonical
    owned roots, preserving active/unknown content.
  - Proves link/race/permission safety and sanitized bounded cleanup evidence.
- Verification results location: implementation branch's sanitized test
  evidence and package closeout.
- Production/deployment notes: automatic retained deletion remains disabled
  until DR-021-001 is canonical; explicit-policy evaluator is additive.
- Autonomous mutation request: none.

## Jira Handoff Inputs

- Jira policy: skip.
- Suggested issue type: none; no Jira lookup or mutation is authorized.
- Suggested subtask behavior: none.
- PR-to-Jira mapping: not applicable under explicit `jira-policy:skip`.
- Jira summary/description: not applicable.
- Optional-policy fallback: not applicable; Jira is intentionally skipped.

## Decision request and readiness

- **DR-021-001:** Should retained artifact cleanup be automatically enabled by
  a product-wide default age/count/byte policy, or only run with an explicit
  operator-supplied policy? Recommendation: explicit policy evaluator first;
  when absent, preserve retained artifacts. Affected unit: U31/RU2 and
  RDM-023. Canonical target: the initiative decision record owned by Seneschal.
- Safe work while brokered: implement/read-only-review pure endpoint parsing,
  listener matrix, exclusion predicate, explicit fixture validation, retention
  plan generation, manifest revalidation, permission checks, and deterministic
  tests. Do not wire implicit retained deletion or modify sibling installer /
  self-doctor/drift surfaces.
