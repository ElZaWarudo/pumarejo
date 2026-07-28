---
title: Own WebDriver and platform lifecycles
status: review-passed
roadmap_item: RDM-004
origin_roadmap: docs/roadmaps/2026-07-23-001-tauri-agent-roadmap.md
origin_brainstorm: STRATEGY.md
origin_planning_input: docs/product-requirements.md
origin_plan: docs/plans/2026-07-23-001-feat-tauri-agent-plan.md
units: [U7, U8, U9]
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

# Own WebDriver and platform lifecycles

## Scope

Implement the replaceable W3C adapter, transactional exclusive session/process owner, and visible/background platform adapters.

## Non-goals

No semantic extraction, component actions, consumer writes, or public MCP composition.

## Autonomy Contract

- Mode: guarded.
- Agent may decide without asking: internal interfaces, retry constants justified by tests, and platform helper layout.
- Agent must record as assumptions: provider quirks, process-tree semantics, display/session facts.
- Agent must escalate: inability to establish exclusive ownership, weakening background behavior, or terminating non-owned processes.
- Safe fallback: fail launch closed and clean only acquired resources.
- Autonomous ledger: none.
- Allowed external mutation classes: none.

## Dependencies

- Requires: RDM-001 and RDM-002 passed.
- Blocks: RDM-005 through RDM-008.
- Waves: RU1 then RU2 then RU3; each predecessor must pass.

## Production Posture

- Posture: prototype.
- Evidence: greenfield runtime.
- Confidence: high.
- Consequences for this package: no compatibility migration, but ownership and cleanup are release-critical.
- Breaking existing behavior allowed: only inside internal adapters.

## Plan Unit Alignment

| Plan unit | Included | Reason |
|---|---|---|
| U7 | yes | W3C boundary |
| U8 | yes | Session/process lifecycle |
| U9 | yes | Platform modes |

Grouping rationale: split transport, ownership, and platform behavior because each has an independent failure model. Estimates: RU1 350-650 human; RU2 500-900; RU3 350-700.

## Implementation Units

- U7: WebDriver adapter.
- U8: session/endpoint/process lifecycle.
- U9: Windows and a generic Linux adapter; certification target is Ubuntu 24.04 LTS only.

## Review Units

| Review unit | Scope | Expected changed surfaces | PR base | Jira issue/subtask | Size/risk note |
|---|---|---|---|---|---|
| RU1 | W3C transport | client/protocol/capabilities/errors/tests | unresolved-final-release | optional Tarea | 350-650 human; provider normalization |
| RU2 | Exclusive lifecycle owner | session/endpoint/cleanup/process/tests | unresolved-final-release | optional Tarea | 500-900 human; concurrency/security |
| RU3 | Visible/background adapters | mode config/platform launch/diagnostics/tests | unresolved-final-release | optional Tarea | 350-700 human; Windows + Ubuntu 24.04 platform risk |

## Reviewability Diagnosis

- Reviewer-experience check: yes; each RU answers transport, ownership, or platform behavior separately.
- Granularity chosen because: combining them would obscure independent high-risk failure modes.
- Open-stack plan: serial local work, independent final handoff.
- Jira mapping: optional standalone Tarea per RU.
- Downstream-fix trace: none.
- Failure-mode check: no deep stack; each unit verifies independently.

## Files and Tests

`src/webdriver/`, `src/session/`, `src/platform/`, fake-server tests, provider integration tests, state-transition tests, and Windows/Linux mode suites.

## Impact Scan

- Changed contract: internal W3C port, session state machine, process/platform adapters.
- Consumer scan patterns: WebDriver commands/errors, session states, port/process/config ownership.
- Consumers found: later observation, interaction and MCP runtime.
- Contract-drift tests searched: adapter contract, every state edge, mode parity.
- Required consumer tests: provider fixture and lifecycle/mode integration.
- Run/skipped results: Node 22.23.1 and 24.12.0 pass 183 tests with nine
  explicitly gated live tests skipped in the ordinary matrix. The authoritative
  RU3 mode test passes separately on Windows and Ubuntu 24.04 WSL.

## Verification Gate

| RU | U | Required verification | Evidence | Pass signal |
|---|---|---|---|---|
| RU1 | U7 | fake W3C contract plus real provider commands/cancellation/error normalization | unit/integration results | provider-independent port passes |
| RU2 | U8 | every state edge, phase failures, competing clients, unrelated process/port protection, PID-reuse/crash/port-race cases; owner lease uses PID + creation time + command hash + session nonce and revalidates before terminate | transition/integration results on both authoritative hosts | no owned residue, hijack, or non-owned termination |
| RU3 | U9 | Windows and native/dedicated-VM Ubuntu visible/background parity and focus/input evidence | platform evidence | both modes pass on both hosts |

## Review Gate

- Code review threshold: P0-P2; lower findings logged.

## Security Gate

- Run after each work-review loop: required.
- Security Watch during work: enabled for endpoint hijack, process ownership, command spawn, cleanup, ports and environment.
- Security Watch notes: RU1 confines transport to authenticated loopback,
  bounds response and input shapes, rejects redirects, normalizes provider
  errors, compensates malformed session creation, preserves retryable cleanup
  state, and serializes concurrent creation on one adapter. RU2 adds
  transactional acquisition/rollback, exact process leases, per-command
  upstream ownership authorization, method-and-route allowlisting, bounded
  proxy input and fail-closed PID/port-race behavior. RU3 confines overlays to
  canonical project-owned directories, sends only allowlisted toolchain/display
  environment to application and diagnostic children, preserves effective
  base/platform window configuration, and fails background evidence closed if
  the continuous Windows foreground monitor exits or cannot stop promptly.
- Security reviewer: `krt-security-sentinel`.
- Security review result: RU1, RU2 and RU3 passed with no unresolved P0-P2.
- Required security verification: no unresolved P0-P2; rerun focused tests/review after fixes.

## CI Break-Prevention And Escalation

- CI risk surfaces: async tests, process cleanup, platform commands, Tauri provider.
- Preventive evidence: deterministic fake-server/state tests plus platform evidence.
- If CI breaks: invoke `krt-ci-questor`.
- Escalation rule: keep unit pending with cause/owner/next action.

## RU1 Closeout

- Status: `review-passed`.
- Unit: U7.
- Changed surfaces: replaceable authenticated loopback W3C transport; strict
  Wry capabilities; readiness, session, window, script, element, action and
  screenshot commands; bounded cancellation; provider error normalization;
  static compatibility fallbacks for the embedded provider.
- Test-first evidence: focused tests initially lacked the adapter. Review and
  live-provider runs then exposed hard-deadline, IPv6 URL, malformed-session
  compensation, retryable deletion, cancellation-reason and concurrent-create
  gaps; each now has a regression.
- Verification:
  - Node 22.23.1 and Node 24.12.0 pass frozen install, build, typecheck, lint,
    formatting and the full suite: 138 tests passed with six authoritative
    live-only gates skipped.
  - Twenty focused unit scenarios cover endpoint/nonce validation, bounded
    readiness and responses, all required commands, normalization, static
    provider fallbacks, malformed-session cleanup, delete retry semantics,
    cancellation, IPv6 and single-flight session creation.
  - The real embedded Tauri provider passes the required Windows integration
    under exception `USER-2026-07-27-WINDOWS-WSL` on stable MSVC: readiness,
    session, window/title/rect, script, element focus/click/clear/type/value,
    screenshot and deletion/cleanup.
- Impact Scan: the adapter remains internal and provider-independent; public
  package/MCP contracts, project integration and structural platform proofs
  remain green. Process ownership and create/delete lifecycle serialization
  across callers are assigned to RU2/U8.
- Correctness review: passed with no unresolved P0-P2 after fixes for the hard
  readiness deadline, IPv6 authority syntax, exact cancellation propagation,
  malformed-session compensation and provider-confirmed session deletion.
- Security review: passed with no unresolved P0-P2. Requests are restricted to
  loopback and same-origin paths with a 256-bit nonce, redirects disabled,
  streamed JSON capped at 4 MiB, fixed scripts, bounded identifiers and static
  public errors. Concurrent create calls issue only one provider request.
- Recorded provider quirks: the embedded provider does not implement window
  switching for its sole handle, window rect, displayed/enabled probes or
  element clear. The adapter uses the exact sole handle and fixed script
  fallbacks without accepting dynamic script input.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent review unit: RU2 / U8.

## RU2 Closeout

- Status: `review-passed`.
- Unit: U8.
- Changed surfaces: transactional idle/starting/ready/cleaning/failed state
  manager; retryable reverse-order cleanup; unpredictable or explicit provider
  port reservation; authenticated loopback proxy; tracked Windows/Linux
  process adapters; PID/start/command/session-nonce lease; native cleanup
  integration fixture.
- Test-first evidence: phase tests first exercised every absent lifecycle edge.
  Review and native runs then exposed snapshot capability leakage,
  create-vs-close serialization, post-spawn rollback, root PID reuse,
  provider-port takeover, owner drift and Windows authorization latency. Each
  now has a regression or bounded runtime correction.
- Verification:
  - Windows Node 22.23.1 and 24.12.0 pass frozen install, build, typecheck,
    lint, formatting and the full suite: 163 tests passed with six live-only
    gates skipped.
  - Twenty-five focused RU2 scenarios pass on Windows and Ubuntu 24.04 WSL:
    18 state/phase tests, four endpoint tests, two native process lease tests
    and one real multiprocess cleanup integration.
  - The native integration on both hosts owns a child provider, proves direct
    and proxy requests without the correct nonce fail, establishes the sole
    session/window, and releases the WebDriver session, proxy, provider port,
    process tree and prepared runtime resource.
  - The Windows full-suite load run identified the original 10-second request
    budget as too short for repeated CIM ancestry checks under contention; the
    managed client now uses a bounded 30-second budget and both Node matrices
    pass.
- Impact Scan: snapshots expose only state, mode, platform, window and the
  effective proxy port; WebDriver clients/nonces never enter public state.
  Existing MCP/package/project-integration contracts remain green. Platform
  mode overlays and focus/background diagnostics remain assigned to RU3/U9.
- Correctness review: passed with no unresolved P0-P2 after explicit snapshot
  projection, close-triggered launch cancellation, initial-inspection rollback,
  immediate pre-termination identity revalidation and endpoint-race tests.
- Security review: passed with no unresolved P0-P2. The proxy requires distinct
  256-bit session/provider nonces, exact method-plus-route allowlisting and a
  2 MiB request cap; it revalidates root lease and exact loopback provider
  ownership before every upstream command. Windows requires an exact IPv4
  listener and ancestry; Linux accepts only `127.0.0.1:<port>` and verifies
  `/proc` ancestry.
- Recorded platform semantics: Windows termination uses `taskkill /T /F` only
  after CIM identity revalidation; Linux launches a detached process group and
  terminates that owned group only after `/proc` identity revalidation.
  PID-reused replacements and externally occupied ports are never terminated.
- Environment note: switching the shared `node_modules` between WSL and Windows
  creates Linux reparse links that Windows cannot remove under this policy.
  Final gates therefore used clean host-specific temporary copies from the
  same lockfile; source artifacts remained in the canonical workspace.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent review unit: RU3 / U9.

## RU3 Closeout

- Status: `review-passed`.
- Unit: U9.
- Changed surfaces: safe per-session Tauri mode overlays; shell-free
  Windows/Linux launch adapters; allowlisted child environments; effective
  base plus platform-specific Tauri window configuration; continuous Windows
  foreground monitoring; Linux display isolation diagnostics; production
  visible/background mode evidence.
- Test-first and review evidence: live runs first exposed Corepack root-process
  replacement, cold-build readiness, optional Linux `xprop`, complete
  environment inheritance, RFC 7396 window-array replacement, platform-specific
  configuration, transient-focus blind spots, monitor fail-open/timeout behavior,
  overlay link races and platform label drift. Each has a focused regression or
  fail-closed implementation.
- Verification:
  - Node 22.23.1 and Node 24.12.0 pass build, typecheck, lint, formatting and
    the full suite: 183 tests passed with nine intentionally gated live tests
    skipped in the ordinary matrix.
  - Thirty-eight focused mode/configuration/diagnostic/session tests pass with
    one host-specific unit skipped. They cover package-manager normalization,
    base plus platform RFC 7396 configuration, effective labels, secret
    stripping, link-replacement cleanup, continuous-monitor failures and
    PreparedLaunch-to-WebDriver label propagation.
  - Ubuntu 24.04 WSL passes the real visible plus authenticated-Xvfb background
    Tauri sequence: one platform test in 20.86 seconds.
  - Windows 10 Pro 25H2 build 26200 on stable MSVC passes hidden-first and
    visible Tauri sequences with continuous 10 ms foreground observation: one
    platform test in 95.45 seconds.
- Impact Scan: internal PreparedLaunch gained an optional effective window
  label consumed by SessionManager; both platform adapters and session tests
  verify propagation to WebDriver selection and ready snapshots. The Tauri
  fixture proves title/URL/size/window arrays survive CLI merge overlays.
  Public package and MCP contracts remain unchanged.
- Correctness review: passed with no unresolved P0-P2 after complete
  base/platform window merging, effective-label propagation, X11-only
  certification consistency and continuous fail-closed foreground evidence.
- Security review: passed with no unresolved P0-P2 after post-create overlay
  confinement, link-safe cleanup checks, application/diagnostic environment
  allowlists, bounded monitor shutdown and unexpected-monitor-exit failure.
- Recorded platform semantics: Windows background certification requires a
  stable interactive desktop and Visual Studio MSVC environment. Ubuntu
  certification uses X11/XWayland for visible mode and a distinct authenticated
  Xvfb display for background mode; Wayland-only visible sessions are outside
  this prototype certification.
- Environment note: Windows and WSL remain separate usable hosts under
  exception `USER-2026-07-27-WINDOWS-WSL`. Host-specific clean dependency
  copies avoid unsafe mutation of WSL-created reparse links in the canonical
  workspace.
- Branch/base/PR/Jira: unavailable or intentionally omitted until the final
  release phase because the workspace is not a Git repository.
- Subsequent review unit: RDM-005 / RU1 / U10.

## Branch and PR Handoff Inputs

- Review unit: RU1, RU2, or RU3.
- Branch name: `feat/owned-tauri-runtime`.
- PR base: unresolved-final-release.
- Suggested commit grouping for this review unit: `feat(runtime): wrap the Tauri WebDriver provider`; `feat(runtime): own session and process cleanup`; `feat(platform): support visible and background modes`.
- PR title: Own isolated Tauri sessions across platforms
- PR body bullets:
  - Adds a replaceable WebDriver transport and exclusive lifecycle owner.
  - Supports equivalent visible and background operation on certified hosts.
- Verification results location: work-package closeout and platform evidence.
- Production/deployment notes: local processes only.
- Autonomous mutation request: none.

## Jira Handoff Inputs

- Jira policy: optional; standalone Tarea per RU.
- Suggested issue type: Tarea.
- Suggested subtask behavior: shared parent only for grouped final delivery.
- PR-to-Jira mapping: one task per RU.
- Jira summary: Gestionar sesiones Tauri aisladas en Windows y Linux
- Jira description: Implementar el transporte WebDriver, la propiedad exclusiva de recursos y los modos de ejecución.
- Optional-policy fallback: Jira omitted: no context/config.
