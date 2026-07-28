---
title: Certify and prepare final release
status: passed
roadmap_item: RDM-008
origin_roadmap: docs/roadmaps/2026-07-23-001-tauri-agent-roadmap.md
origin_brainstorm: STRATEGY.md
origin_planning_input: docs/product-requirements.md
origin_plan: docs/plans/2026-07-23-001-feat-tauri-agent-plan.md
units: [U14]
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

# Certify and prepare final release

## Scope

Execute and record the full Node/OS/mode/compatibility matrix, package and release-safety audits, security fixtures, reproducible agent-understanding protocol and operator documentation.

## Non-goals

No publication, repository/branch/commit/PR/Jira mutation, unsupported platform certification, or subjective unrecorded demo.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: evidence organization and equivalent non-weakening audit commands.
- Agent must record as assumptions: exact candidate images, agent/model/version and unavoidable CI-only gaps.
- Agent must escalate: missing authoritative host, credentials, paid resources, release/publication scope or any proposed skipped hard gate.
- Safe fallback: keep release blocked with completed partial evidence.
- Autonomous ledger: none.
- Allowed external mutation classes: none.

## Dependencies

- Requires: RDM-003 through RDM-007 passed; inherits the authoritative host requirement from RDM-001.
- Blocks: final Release Marshal handoff.
- Wave: final local review unit only.

## Production Posture

- Posture: prototype preparing first release.
- Evidence: all prior package closeouts.
- Confidence: high.
- Consequences for this package: support claims require exact evidence; no migration is needed.
- Breaking existing behavior allowed: no after certification begins.

## Plan Unit Alignment

| Plan unit | Included | Reason                                     |
| --------- | -------- | ------------------------------------------ |
| U14       | yes      | Integrated certification and documentation |

Grouping rationale: one release-readiness verdict; evidence files are committed separately from authored docs if they dominate review. Estimate 300-600 human lines, 200-800 evidence/generated lines, 300-700 docs.

## Implementation Units

- U14: cross-platform certification and docs.

## Review Units

| Review unit | Scope                                     | Expected changed surfaces          | PR base                  | Jira issue/subtask | Size/risk note                                       |
| ----------- | ----------------------------------------- | ---------------------------------- | ------------------------ | ------------------ | ---------------------------------------------------- |
| RU1         | Platform/package/security certification   | tests/evidence/audit reports       | unresolved-final-release | optional Tarea     | 250-450 human; hard release gates                    |
| RU2         | Reproducible agent-understanding protocol | agent fixtures/transcripts/scoring | unresolved-final-release | optional Tarea     | 200-400 human + generated transcripts; hidden rubric |
| RU3         | Support/release documentation             | README/security/support docs       | unresolved-final-release | optional Tarea     | 200-400 human; operator-facing                       |

## Reviewability Diagnosis

- Reviewer-experience check: yes; one release-readiness decision with indexed evidence.
- Granularity chosen because: splitting evidence from its verdict would make neither independently useful.
- Open-stack plan: independent final local review; Release Marshal resolves actual release shape once.
- Jira mapping: optional standalone Tarea.
- Downstream-fix trace: record any earlier-review surface revalidated here.
- Failure-mode check: evidence is indexed, not a hidden mega-diff.

## Files and Tests

Full `tests/` matrix, `docs/evidence/`, `README.md`, `docs/security.md`, support/compatibility docs and checked-in agent certification protocol.

## Impact Scan

- Changed contract: published support matrix and operator-facing behavior description.
- Consumer scan patterns: tool/config/schema docs, error codes, compatibility boundaries, package files.
- Consumers found: fixtures, independent MCP client, operator docs.
- Contract-drift tests searched: exact docs/schema/tool matrix and packed-file allowlist.
- Required consumer tests: all earlier suites plus agent-only public flow.
- Run/skipped results: Windows Node 22/24 and Ubuntu Node 22 each pass frozen
  install and `pnpm validate`; 276 ordinary tests pass with 13 deliberate live
  skips, and every required live flow passes separately under the accepted
  host exception.

## Verification Gate

| RU  | U   | Required verification                                                                                                                                      | Evidence                                                                                         | Pass signal                                                                             |
| --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| RU1 | U14 | Node 22/24 frozen install/build/validate; Windows and native/dedicated-VM Ubuntu matrix; package/dependency/secret/path audit; provider-free release build | versioned release evidence with no-secret/no-PII scan and current-user-only evidence permissions | every platform/package/security gate passes                                             |
| RU2 | U14 | fixed agent/model/prompt/tool-budget/trials/hidden-rubric scoring through MCP only; prompt/sensitive fixtures                                              | redacted transcripts and deterministic score report                                              | aggregate agent threshold is met; no raw UI secrets or prompts become release artifacts |
| RU3 | U14 | support matrix and operator/security/release docs                                                                                                          | reviewed docs                                                                                    | documented support and handoff boundaries                                               |

## Review Gate

- Code review threshold: P0-P2; lower findings logged.

## Security Gate

- Run after work-review loop: required.
- Security Watch during work: enabled for supply chain, package contents, secrets, release exposure, prompt/sensitive fixtures and evidence integrity.
- Security Watch notes: release scans cover provider gating, JavaScript runtime
  dependencies, package allowlist, known fixture secrets, personal paths and
  secret-like assignments; agent evidence is redacted and deterministically
  rescored.
- Security reviewer: `krt-security-sentinel`.
- Security review result: passed with no unresolved P0-P2 after fixing the
  instruction-canary boundary, derived scoring/provenance, publication guard,
  recursive `dist` scan, transcript event-budget enforcement, and the
  ordered-flow keyword-soup bypass.
- Required security verification: no unresolved P0-P2; rerun affected matrix and security review after fixes.

## CI Break-Prevention And Escalation

- CI risk surfaces: every declared package script and both platform matrices.
- Preventive evidence: `pnpm validate` plus exact support matrix.
- If CI breaks: invoke `krt-ci-questor`; do not poll.
- Escalation rule: final release stays blocked until cause/owner/next action is recorded.

## Branch and PR Handoff Inputs

- Review unit: RU1, RU2, or RU3 certification slice; aggregate release gate requires all three.
- Branch name: `feat/semantic-tauri-agent-control`.
- PR base: unresolved-final-release; Release Marshal must resolve repository/default base.
- Suggested commit grouping for this review unit: `test(certification): verify supported Tauri agent workflows`; `docs: document Tauri agent operation and security`.
- PR title: Enable agents to inspect and operate Tauri apps without desktop takeover
- PR body bullets:
  - Adds reversible Tauri 2 integration and isolated visible/background sessions.
  - Exposes semantic observation and component interaction through seven MCP tools.
  - Certifies security, package and agent-understanding outcomes on supported hosts.
- Verification results location: final Compound Master summary and `docs/evidence/`.
- Production/deployment notes: npm publication requires separate explicit Release Marshal authority.
- Autonomous mutation request: none.

## Jira Handoff Inputs

- Jira policy: optional.
- Suggested issue type: Tarea.
- Suggested subtask behavior: Release Marshal may create a multi-child parent only if final grouped delivery includes multiple review units.
- PR-to-Jira mapping: preserve each completed review unit if grouped.
- Jira summary: Certificar y preparar Tauri Agent para su primera entrega
- Jira description: Validar plataformas, seguridad, empaquetado y comprensión de flujos antes de la publicación final.
- Optional-policy fallback: Jira omitted: no context/config.

## Closeout Candidate

- RU1 platform/package/security certification: Windows Node 22.23.1 and
  24.12.0 plus Ubuntu/WSL Node 22.23.1 pass frozen installation, build,
  typecheck, lint, formatting, 276 ordinary tests, tarball construction and
  real tarball consumption. The production dependency audit reports no known
  vulnerabilities.
- RU1 live matrix: the independent public MCP client passes visible and
  background seven-tool workflows on both accepted hosts. Final Windows times
  are 50.75 s and 30.53 s; final Ubuntu/WSL times are 13.59 s and 19.15 s.
- RU1 release safety: the provider remains optional and debug-feature gated;
  release-facing docs/evidence contain no known fixture secret or personal
  path; the tarball contains only README, package metadata and built runtime.
- RU2 agent understanding: three fixed-prompt, zero-retry, transcript-only
  trials with an instruction-shaped canary each score 10/10 (aggregate 10/10,
  threshold 9/10). The executable test hashes raw answers, derives scoped
  criteria from their text, requires two ordered six-step flows, rejects
  keyword soup, counts transcript events against the tool budget, verifies
  per-agent execution receipts, and requires the redaction and untrusted-data
  boundaries.
- RU3 documentation: README, security, compatibility and indexed release
  evidence describe install/init/doctor/remove, the seven tools, modes,
  cleanup, support boundaries and the non-publishing host exception.
- Final review proof: independent correctness and Security Sentinel re-reviews
  pass with no unresolved P0-P2. Review-found scoring and evidence-integrity
  issues were fixed, covered by adversarial regression tests, and retested on
  Windows Node 22/24 and WSL Node 22.
- Publication disposition: not authorized. Native Windows 11 and
  native/dedicated-VM Ubuntu certification, an initial integration-base
  decision for the unborn remote repository, and explicit publication
  authority remain final release gates.
