---
title: Expose faithful semantic observations
status: complete
roadmap_item: RDM-005
origin_roadmap: docs/roadmaps/2026-07-23-001-pumarejo-roadmap.md
origin_brainstorm: STRATEGY.md
origin_planning_input: docs/product-requirements.md
origin_plan: docs/plans/2026-07-23-001-feat-pumarejo-plan.md
units: [U10, U11]
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

# Expose faithful semantic observations

## Scope

Build the standards-derived semantic snapshot/reference engine and the screenshot/artifact store with redaction, strict permissions, cleanup and hard-termination recovery.

## Non-goals

No component mutation, autonomous interpretation, closed-shadow/cross-origin/native semantics, or release.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: internal descriptor helpers and conformance fixture organization.
- Agent must record as assumptions: standards-library deviations and platform permission APIs.
- Agent must escalate: public schema change, redaction weakening, heuristic target re-query, or unsafe cleanup.
- Safe fallback: omit unsupported semantics with a typed limitation; fail artifacts closed.
- Autonomous ledger: none.
- Allowed external mutation classes: none.

## Dependencies

- Requires: RDM-002 and RDM-004 passed.
- Blocks: RDM-006 through RDM-008.
- Waves: RU1 then RU2; both must pass before interaction/MCP.

## Production Posture

- Posture: prototype.
- Evidence: greenfield observation engine.
- Confidence: high.
- Consequences for this package: schema is pre-release, but sensitive-data and cleanup safety are mandatory.
- Breaking existing behavior allowed: only with contract approval.

## Plan Unit Alignment

| Plan unit | Included | Reason                              |
| --------- | -------- | ----------------------------------- |
| U10       | yes      | Semantic tree and exact refs        |
| U11       | yes      | Screenshots and protected artifacts |

Grouping rationale: split traversal/schema/refs, redaction/taint, and filesystem/permission security. Estimates: RU1 400-700 human + 150-400 conformance fixtures; RU2 250-450 human; RU3 350-650 human.

## Implementation Units

- U10: semantic snapshot and reference generations.
- U11: screenshots and artifact lifecycle.

## Review Units

| Review unit | Scope                            | Expected changed surfaces                     | PR base                  | Jira issue/subtask | Size/risk note                              |
| ----------- | -------------------------------- | --------------------------------------------- | ------------------------ | ------------------ | ------------------------------------------- |
| RU1         | Snapshot traversal, schema, refs | browser bundle/schema/refs/conformance/tests  | unresolved-final-release | optional Task      | 400-700 human + fixtures; semantic fidelity |
| RU2         | Redaction and UI-taint boundary  | redaction/provenance/MCP-boundary tests       | unresolved-final-release | optional Task      | 250-450 human; untrusted data               |
| RU3         | Screenshot and artifacts         | PNG/store/permissions/manifest/recovery/tests | unresolved-final-release | optional Task      | 350-650 human; filesystem security          |

## Reviewability Diagnosis

- Reviewer-experience check: yes; semantic correctness and artifact confinement have separate evidence.
- Granularity chosen because: merging DOM semantics with OS permissions would obscure both reviews.
- Open-stack plan: serial local work, independent final handoff.
- Jira mapping: optional standalone Task per RU.
- Downstream-fix trace: none.
- Failure-mode check: conformance fixtures separated by commit, not hidden as generated noise.

## Files and Tests

RU1 changes `src/observation/` and accessibility fixtures/corpus. RU2 changes redaction/provenance and boundary tests. RU3 changes `src/artifacts/`, screenshot handling and filesystem integration tests.

## Impact Scan

- Changed contract: snapshot node schema, refs/generation/fingerprint, redaction marker and screenshot metadata.
- Consumer scan patterns: node fields, error codes, `data-pumarejo-sensitive`, element handles, artifact paths.
- Consumers found: interactions, MCP runtime and certification.
- Contract-drift tests searched: schema snapshots, compatibility corpus, stale refs, tainted UI, permission/path cleanup.
- Required consumer tests: fixture snapshot/screenshot and later MCP tests.
- Run/skipped results: RU1 through RU3 passed; ordinary matrices retain only
  the ten explicit live-platform gates.

## Verification Gate

Inherited gates for every RU: run `pnpm install --frozen-lockfile` and `pnpm build`, `pnpm typecheck`, `pnpm lint`, and the repository format check on Node 22 and Node 24; a skipped clean-install/build/format gate blocks closeout.

| RU  | U   | Required verification                                                                                                                                                                                                         | Evidence                                                   | Pass signal                                                     |
| --- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| RU1 | U10 | WAI-ARIA/HTML corpus, product fixtures, preorder/containment/state/name/ref identity                                                                                                                                          | unit/integration/schema results                            | deterministic semantic contract                                 |
| RU2 | U10 | password and `data-pumarejo-sensitive` redaction, untrusted provenance for text/name/value, prompt-injection fixtures, open-shadow-root leakage checks                                                                        | boundary/security results                                  | no sensitive leakage and UI text remains non-authoritative data |
| RU3 | U11 | PNG validation, current-user-only permissions before write, permission failure, traversal/link rejection, durable manifest, explicit `retainArtifacts`, close/crash/restart cleanup on Windows and native/dedicated-VM Ubuntu | filesystem/integration results on both authoritative hosts | artifacts confined and lifecycle-complete; any host skip blocks |

## Review Gate

- Code review threshold: P0-P2; lower findings logged.

## Security Gate

No RU passes with an unresolved P0-P2 security finding. RU2 must prove that snapshot text, names, values, screenshot pixels, and redaction markers remain structurally untrusted data and are never promoted into MCP instructions; RU3 must prove explicit `retainArtifacts`, durable pre-content manifests, root-bound fail-closed cleanup, and crash/restart recovery.

- Run after each work-review loop: required.
- Security Watch during work: enabled for untrusted UI, sensitive data, stale identity, permissions, links and deletion.
- Security Watch notes: RU1 through RU3 passed.
- Security reviewer: `krt-security-sentinel`.
- Security review result: RU1/RU2/RU3 passed.
- Required security verification: no unresolved P0-P2; rerun focused tests/review after fixes.

## CI Break-Prevention And Escalation

- CI risk surfaces: browser bundle, schema snapshots, platform permissions, filesystem cleanup.
- Preventive evidence: deterministic fixtures and Windows/Linux filesystem tests.
- If CI breaks: invoke `krt-ci-questor`.
- Escalation rule: keep unit pending with cause/owner/next action.

## RU1 Closeout

- Status: `review-passed`.
- Unit: U10.
- Changed surfaces: versioned browser observation bundle; standards-derived
  accessible name and role extraction; deterministic composed preorder;
  root-scoped relationships; applicable HTML/ARIA states; redaction and
  browser-validated safe-name boundary; bounded raw schema; atomic
  generation-scoped reference table; exact W3C handle materialization for
  light DOM and open shadow roots; focused product and conformance fixtures.
- Provider adaptation: the embedded provider accepts W3C element handles as
  Execute Script arguments but serializes DOM nodes returned from a script as
  `null`. The bounded prepass therefore materializes exact objects and passes
  them into one observation script. Descriptor-to-handle mapping uses DOM
  identity, never action-time selector/name/text/geometry re-query. Additions
  without handles fail before reference replacement, removals are omitted, and
  one bounded retry covers concurrent mutation without publishing a partial
  generation.
- Semantic and security bounds: 10,000 handles/elements, one whole-prepass
  deadline, 256 relationship tokens, bounded field sources/values, a
  conservative 256-Ki-code-unit public string budget, 64-code-unit ownership
  context, 1 MiB injected-script cap and a 4 MiB transport response cap.
  Sensitive values, text and tainted accessible-name chains are removed in the
  browser, including transitive `aria-labelledby`, labels, slots and open
  shadow roots. A private `nameSafe` proof permits a non-sensitive external
  label on a redacted password field and is stripped before public output.
- Verification:
  - Frozen dependencies and supply-chain policy pass; `pnpm audit --prod`
    reports no known vulnerabilities. The minified browser bundle is below
    20 KiB.
  - Node 22.23.1 and Node 24.12.0 each pass build, typecheck, lint, formatting
    and the full suite: 196 tests passed with ten intentionally gated live
    tests skipped in the ordinary matrix.
  - Thirty-seven focused schema/browser/WebDriver/proxy tests pass. The
    checked-in accessible-name corpus covers fifteen representative HTML/ARIA
    naming sources and roles; adversarial tests cover redaction chains, open
    shadow roots, malicious UI text, oversized strings/handles, applicable
    states, root-scoped duplicate IDs, atomic replacement and stale refs.
  - The final real semantic snapshot fixture passes on Windows 10 Pro 25H2
    build 26200 with stable MSVC and on Ubuntu 24.04 WSL2/WSLg under exception
    `USER-2026-07-27-WINDOWS-WSL`. Both prove real provider traversal,
    deterministic generations, exact opaque references, redaction and cleanup.
- Impact Scan: the public snapshot contract remains the documented v1 shape;
  raw provider IDs, semantic identity and safe-name proof remain private.
  Existing package, MCP, integration and runtime lifecycle suites remain
  green. Closed shadow roots, cross-origin content and native surfaces remain
  explicit v1 non-goals and are omitted or available only through screenshot;
  no unsupported-surface public schema was introduced.
- Correctness review: passed with no unresolved P0-P2 after fixes for provider
  identity mapping, inherited native disabled state, root-scoped relationships,
  state applicability, versioning, mutation retry, bounded relationships and
  representative corpus coverage.
- Security review: passed with no unresolved P0-P2 after fixes for direct,
  transitive and shadow-root sensitive-name leakage, pre-serialization resource
  exhaustion, initial/expanded handle limits, whole-prepass deadline and
  package-anchored bounded bundle loading.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent review unit: RU2 / U10.

## RU2 Closeout

- Status: `review-passed`.
- Unit: U10.
- Changed surfaces: the browser redaction/taint graph, private safe-name proof,
  raw schema boundary, public reference projection and MCP contract tests for
  hostile application-controlled names, text, values and top-level-looking
  result keys.
- Boundary semantics: sensitive provenance follows the accessible-name graph
  through `aria-labelledby`, `aria-owns`, associated labels, DOM descendants,
  slots and open shadow roots with cycle and traversal limits. Redacted nodes
  cannot expose text/value; a retained external non-sensitive name requires the
  private browser-produced `nameSafe: true` proof. Node validates that proof and
  removes it together with semantic identity before public output.
- MCP framing: application data remains nested inside static text and
  `structuredContent` result framing. UI-controlled fields named `isError`,
  `content` or `structuredContent`, image-looking payloads and
  instruction-shaped strings cannot replace the top-level MCP result, tool
  descriptions, error envelopes or suggestions.
- Verification:
  - Twenty-six focused browser/schema/MCP boundary tests pass, including direct,
    transitive, descendant, `aria-owns`, slot and open-shadow taint, safe
    password labels, raw private-field stripping and hostile top-level keys.
  - Node 22.23.1 and Node 24.12.0 each pass build, typecheck, lint, formatting
    and the full suite: 196 tests passed with ten intentionally gated live tests
    skipped in the ordinary matrix.
  - RU1 real-provider evidence remains green on final shared source for Windows
    stable MSVC and Ubuntu 24.04 WSL2/WSLg.
- Impact Scan: no public schema or tool-description change was introduced.
  Every observation string remains untrusted application data. Screenshot pixel
  taint and artifact lifecycle remain assigned to RU3/U11.
- Correctness review: passed with no unresolved P0-P2. Private provenance is
  stripped, public framing is immutable and hostile UI keys remain nested data.
- Security review: passed with no unresolved P0-P2 after a review-found nested
  accessible-name leak was fixed by mirroring the relevant ACCNAME graph,
  including `aria-owns` and descendant naming paths.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent review unit: RU3 / U11.

## RU3 Closeout

- Status: `review-passed`.
- Unit: U11.
- Changed surfaces: strict screenshot decoding and metadata,
  current-generation projection, optional persistence, Windows current-SID
  DACL and POSIX owner-mode enforcement, a project-confined artifact store,
  durable pre-content manifests, serialized writes, explicit retention and
  close/startup recovery.
- Filesystem and resource boundaries: permissions are established and
  revalidated before content bytes; directory and regular-file canonical paths
  are checked around creation and rename; manifests are strict, canonical,
  size/state-bearing and atomically replaced with file and parent-directory
  sync. Each PNG is limited to 24 MiB, each session to 256 entries and 256 MiB,
  and cleanup rejects unknown, linked, escaped or size-inconsistent content
  before deleting known files.
- PNG boundary: canonical base64, signature, bounded chunk walk, chunk CRC,
  legal IHDR bit-depth/color/compression/filter/interlace combinations, IEND,
  dimensions and a 36-million-pixel decoded budget are validated before
  storage or MCP image output. `save: false` performs no artifact write and
  omits `path`.
- Verification:
  - Node 22.23.1 and Node 24.12.0 each pass build, typecheck, lint, formatting
    and the full suite: 219 tests passed with ten intentionally gated live
    tests skipped in the ordinary matrix.
  - Twenty-three focused screenshot, permission, retention, concurrency,
    malformed/link, crash/restart and recovery tests pass on both Windows and
    Ubuntu 24.04 WSL2/WSLg under exception
    `USER-2026-07-27-WINDOWS-WSL`. The host tests execute the real Windows ACL
    and POSIX chmod/stat adapters; no platform permission test is skipped.
  - The final parser validates a real 800x600 PNG through an owned Windows
    Tauri provider. On WSL, it validates a real provider PNG through a healthy
    already-owned fixture endpoint after two older graphical fixtures made a
    third WSLg initialization time out; only a temporary WebDriver session was
    created and deleted, and those older processes were not terminated.
- Impact Scan: screenshot metadata matches the documented v1 contract and
  makes `path` absent when persistence is disabled. Artifact lifecycle wiring
  into the single public MCP session remains assigned to U13/RDM-007; U11 now
  supplies the complete bounded service/store boundary for that integration.
- Correctness review: passed with no unresolved P0-P2 after fixes for
  concurrent writes/close, self-inconsistent manifest limits, durable byte
  accounting and Windows canonical-path casing.
- Security review: passed with no unresolved P0-P2 after fixes for cumulative
  disk exhaustion, decoded-pixel bombs, manifest state/size validation and
  canonical revalidation around permission/write/rename. The declared trusted
  local-project model excludes a separate malicious same-user process racing
  owner-controlled directories in the final non-atomic OS instruction.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent roadmap item: RDM-006 / RU1.

## Branch and PR Handoff Inputs

- Review unit: RU1, RU2 or RU3.
- Branch name: `feat/semantic-tauri-observation`.
- PR base: unresolved-final-release.
- Suggested commit grouping for this review unit: `feat(observation): expose semantic Tauri state`; `feat(artifacts): protect and clean session captures`.
- PR title: Expose protected semantic Tauri observations
- PR body bullets:
  - Returns deterministic semantic snapshots with exact generation-scoped references.
  - Redacts sensitive UI and confines screenshot artifacts.
- Verification results location: work-package closeout.
- Production/deployment notes: local artifacts delete by default.
- Autonomous mutation request: none.

## Jira Handoff Inputs

- Jira policy: optional; standalone Task per RU.
- Suggested issue type: Task.
- Suggested subtask behavior: shared parent only for grouped final delivery.
- PR-to-Jira mapping: one task per RU.
- Jira summary: Expose protected semantic observations of Tauri applications
- Jira description: Create accessible snapshots, exact references, redaction, and secure artifacts.
- Optional-policy fallback: Jira omitted: no context/config.
