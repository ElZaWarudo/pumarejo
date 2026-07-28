---
title: Prove isolated Tauri control
status: review-passed
roadmap_item: RDM-001
origin_roadmap: docs/roadmaps/2026-07-23-001-pumarejo-roadmap.md
origin_brainstorm: STRATEGY.md
origin_planning_input: docs/product-requirements.md
origin_plan: docs/plans/2026-07-23-001-feat-pumarejo-plan.md
units: [U1]
unit_alignment: complete
review_units: [RU1]
base_branch: unresolved-final-release
pr_strategy: independent
max_open_stack: n/a
jira_policy: optional
production_posture: prototype
autonomy: guarded
autonomous_ledger: none
allowed_mutation_classes: []
---

# Prove isolated Tauri control

## Scope

Create the minimal Node test harness and accessible Tauri fixture, then prove direct W3C control, authenticated exclusive loopback ownership, visible/background behavior, input isolation, and basic cleanup on Windows 11 24H2 and an Ubuntu 24.04 LTS native or dedicated-VM graphical host.

## Non-goals

No reusable runtime, consumer installer, semantic engine, or release action.
WSLg/Xvfb evidence is supplementary by default. User decision
`USER-2026-07-27-WINDOWS-WSL` explicitly accepts the available Windows host
and Ubuntu 24.04 under WSLg for this prototype feasibility gate; this does not
change the product's supported-platform contract.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: fixture markup, internal test helpers, available high ports, and equivalent read-only environment probes.
- Agent must record as assumptions: exact OS/WebView/toolchain versions and environment limitations.
- Agent must escalate: installing or provisioning a system VM/hypervisor, paid resources, credentials, or any proposal to weaken the platform gate.
- Safe fallback: preserve partial Windows/WSLg evidence while leaving RU1 blocked.
- Autonomous ledger: none.
- Allowed external mutation classes: none.

## Dependencies

- Requires: reviewed plan only.
- Blocks: every later package.
- Wave: 1. RU1 has no predecessor but cannot pass without both authoritative hosts.

Previous blocker superseded by user decision
`USER-2026-07-27-WINDOWS-WSL`: execute the complete evidence matrix on the
available Windows 10 Pro 25H2 build 26200 host and Ubuntu 24.04 WSL2/WSLg.
The exception must be enabled explicitly in the harness and recorded in the
evidence bundle.

## Production Posture

- Posture: prototype.
- Evidence: greenfield workspace.
- Confidence: high.
- Consequences for this package: disposable spike code is allowed; only reusable fixture/tests are promoted.
- Breaking existing behavior allowed: yes within the fixture.

## Plan Unit Alignment

| Plan unit | Included | Reason                 |
| --------- | -------- | ---------------------- |
| U1        | yes      | Exact feasibility gate |

Grouping rationale: one high-risk proof slice with no reusable runtime. Estimated review size: 350-650 human-authored lines, 0 generated lines, 50-150 evidence/doc lines.

## Implementation Units

- U1: provider and platform proof.

## Review Units

| Review unit | Scope                                       | Expected changed surfaces                       | PR base                  | Jira issue/subtask       | Size/risk note                                           |
| ----------- | ------------------------------------------- | ----------------------------------------------- | ------------------------ | ------------------------ | -------------------------------------------------------- |
| RU1         | Fixture, harness, provider/background proof | root harness, fixture, platform tests, evidence | unresolved-final-release | optional standalone Task | 350-650 human + 50-150 docs; hard endpoint/platform gate |

## Reviewability Diagnosis

- Reviewer-experience check: yes; one falsifiable proof question.
- Granularity chosen because: fixture, commands, and evidence must be read together.
- Open-stack plan: independent, no PR during implementation.
- Jira mapping: optional standalone Task.
- Downstream-fix trace: none.
- Failure-mode check: not a micro-split; no reusable lifecycle is hidden here.

## Files and Tests

`package.json`, lock/config files, `tests/fixtures/tauri-app/`, `tests/platform/`, and `docs/evidence/rdm-001/`. Tests cover W3C status/session/window/script/screenshot/element/action/delete, competing-client races, loopback, both modes, focus, OS-input evidence, and spike cleanup.

## Impact Scan

- Changed contract: proof harness and fixture only.
- Consumer scan patterns: `tauri-plugin-wdio-webdriver`, `TAURI_WEBDRIVER_PORT`, `pumarejo` Cargo feature.
- Consumers found: fixture only.
- Contract-drift tests searched: Cargo feature/registration/capability and release omission.
- Required consumer tests: fixture debug with feature, normal debug without feature, release without feature.
- Run/skipped results: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm test:platform:structural` pass on Node 24/Windows; the structural suite has 11 passing tests and five live-only skips. Under exception `USER-2026-07-27-WINDOWS-WSL`, both Windows and Ubuntu platform suites pass all nine live tests. Each suite proves visible/background W3C behavior, direct-provider bypass rejection, proxy authentication, process/port cleanup, and feature-enabled debug plus featureless debug/release Cargo variants. Ubuntu background mode passes repeatedly on authenticated Xvfb using the versioned WebKitGTK hidden-snapshot fallback.

## Verification Gate

| RU  | U   | Required verification                                                                                                                                                                                                                                                     | Evidence                                                                                                                                                                | Pass signal                                                                                                           |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| RU1 | U1  | clean `pnpm install --frozen-lockfile`; `pnpm build`; visible/background proof on the available Windows host and Ubuntu 24.04 WSLg under approved exception `USER-2026-07-27-WINDOWS-WSL`; authenticated competing-client, port-race/TOCTOU, and release-safety scenarios | `docs/evidence/rdm-001/README.md` plus automated results recording OS build, session/display type, WebView runtime, provider version, ownership nonce, and exception id | All scenarios pass on both accepted hosts; the exception is explicit and does not alter the shipping support contract |

## Review Gate

- Code review threshold: P0-P2.
- Findings below threshold: log unless user marks blocking.
- Current review result: passed at P0-P2. Earlier false-pass, skipped-gate, host-validation and Cargo-evidence findings are fixed. The final manual correctness pass found and resolved a P1 direct-provider nonce bypass, then reran both live host matrices.

## Security Gate

- Run after work-review loop: required.
- Security Watch during work: enabled for endpoint ownership, process isolation, dependency supply chain, and OS-input evidence.
- Security Watch notes: endpoint authentication uses distinct client/provider nonces; both endpoints bind to loopback; the proxy allowlists W3C routes; provider nonce comparison is constant-time; process ownership and cleanup are fail-closed; release variants omit the optional provider.
- Security reviewer: `krt-security-sentinel`.
- Security review result: passed with no unresolved P0-P2. Direct requests to the provider now require a second internal nonce and live tests prove a client cannot bypass the authenticated proxy. Residual P3: a process that already controls the same OS account may be able to inspect peer-process state; this prototype does not claim isolation from a compromised local account.
- Required security verification: no unresolved P0-P2; after a security fix rerun focused tests and security review. The owned loopback proxy must require a per-session nonce, keep the provider port private, bind only to loopback, and fail closed if authenticated exclusive ownership cannot be established.

## CI Break-Prevention And Escalation

- CI risk surfaces: Node 22/24 clean install/build, Rust/Tauri build, Windows/Linux platform behavior.
- Preventive evidence: exact local commands and host facts in evidence.
- If CI breaks: invoke `krt-ci-questor`; do not poll.
- Escalation rule: keep RU1 blocked with cause, owner, and next action.

## Branch and PR Handoff Inputs

- Review unit: RU1 provider and platform feasibility.
- Branch name: `feat/isolated-tauri-control-proof`.
- PR base: unresolved-final-release.
- Suggested commit grouping for this review unit: `test(platform): prove isolated Tauri WebDriver control`.
- PR title: Prove isolated visible and background Tauri control
- PR body bullets:
  - Adds a minimal accessible fixture and repeatable provider proof.
  - Verifies endpoint ownership, background rendering, input isolation, and release omission.
- Verification results location: `docs/evidence/rdm-001/`.
- Production/deployment notes: no deployment; proof only.
- Autonomous mutation request: none.

## Jira Handoff Inputs

- Jira policy: optional.
- Suggested issue type: Task.
- Suggested subtask behavior: standalone task.
- PR-to-Jira mapping: RU1 to one Task.
- Jira summary: Test isolated control of Tauri applications
- Jira description: Verify the WebDriver provider, isolation, and visible and background modes on Windows and Ubuntu.
- Optional-policy fallback: Jira omitted: no Jira context/config is available.
