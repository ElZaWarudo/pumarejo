---
title: Pumarejo reliable Tinto end-to-end validation
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
status: approved
date: 2026-08-21
initiative_id: tinto-e2e-reliability
---

# Pumarejo reliable Tinto end-to-end validation

## Intent

Make Pumarejo a trustworthy end-to-end validation tool for complex Tauri applications. The proving journey is Tinto: launch it, open an archived conversation, send a message, change its access mode, explicitly confirm the native dialog, close the application, and prove that no owned process remains. Every failure must retain enough sanitized evidence to diagnose the failed phase without external desktop automation.

This contract extends the accepted real-usage hardening input in `docs/audits/2026-07-28-pumarejo-usage-feedback.md`. It does not reopen behavior already implemented and review-passed in RDM-010 through RDM-012 unless the Tinto evidence contradicts the published capability.

## Actors and stakeholders

- **Test operator or coding agent:** drives a bounded public MCP surface and needs truthful outcomes and fresh references.
- **Tauri application maintainer:** opts the application into Pumarejo and grants explicit capabilities.
- **Security reviewer:** protects native confirmations, secrets, process ownership, local paths, and logs.
- **Platform maintainer:** owns Windows and Linux lifecycle, environment, toolchain, WebDriver, and WebView behavior.
- **Pumarejo maintainer:** accepts public contracts, compatibility changes, and release evidence.

## Terminology

- **Surface:** an independently addressable semantic and interaction context: Tauri window, WebView, iframe, or supported nested panel root.
- **Active surface:** the surface targeted by observation and interaction when no explicit surface identifier is supplied.
- **Surface graph:** the current set of discovered surfaces and their parent/child relationships.
- **Coverage gap:** a visible region that Pumarejo can prove was not represented in the semantic snapshot.
- **Effective capability:** an action that is both permitted and demonstrably implemented by the active provider/runtime.
- **Owned process:** a process whose lease, creation identity, command identity, owner nonce, and ancestry tie it to the current Pumarejo generation.
- **Native Tauri dialog:** a dialog opened through an explicitly supported Tauri dialog integration; it is not arbitrary operating-system UI.
- **Generation:** the snapshot epoch that scopes ephemeral interaction references.
- **Stable semantic identifier:** a non-actionable identity hint derived from durable accessible attributes; it never replaces generation-scoped handles.

## Global scope

### Semantic surfaces

- Enumerate and select supported windows, WebViews, iframes, open shadow roots, and nested panel roots without pretending unsupported provider contexts are controllable.
- Traverse visible controls inside supported nested surfaces, including Dockview-style panel composition.
- Report surface identity, parentage, label/title, dimensions, state, capability matrix, and semantic coverage gaps.
- Compare captured visual regions with semantic coverage and retain a bounded diagnostic result.
- Detect surfaces created after launch while one owned application session remains active.

### Truthful desktop controls and native dialogs

- Advertise resize, maximize, restore, selection, and surface switching only when the active provider can execute and verify them.
- Distinguish permission denial, incompatible provider/plugin, unimplemented operation, and failed postcondition.
- Support an explicit initial window size and verify the effective size after launch and window changes.
- Detect supported Tauri dialogs and expose only their sanitized title, message, finite buttons, and owning surface.
- Require an independent capability and explicit per-test authorization before accepting or cancelling a native dialog; record the decision as test evidence.

### Observability

- Expose bounded, sanitized WebView console logs, owned process stdout/stderr, Tauri invocation traces, launch phase history, and the last error per process or surface.
- Preserve phase, stable error code, duration, ownership context, retryability, and a concrete recovery suggestion.
- Redact secrets, sensitive arguments, application content marked sensitive, and unsafe path details before data crosses the MCP boundary.

### Lifecycle and environment

- Converge cleanup after normal close, cancellation, client timeout, or transport loss, using Windows Job Objects and Linux process groups where available.
- Recover or report orphaned owned sessions on the next MCP startup and offer a bounded, ownership-proven repair operation.
- Reconstruct a valid minimum Windows environment from operating-system sources, expand portable system variables, and preserve required non-secret runtime variables.
- Resolve Node, package managers, Cargo/rustc, Tauri CLI, WebView/provider dependencies, and their versions with explicit provenance and rejection reasons.

### Efficient interactions and reference semantics

- Execute a bounded sequence of clicks, typing, keys, and waits with one final stabilization and fresh snapshot.
- Permit focused typing only after proving that the focused target is editable.
- Publish which operations advance the generation, which rejected operations preserve it, and when a fresh snapshot is returned.
- Stable semantic identifiers may help correlate surviving controls but must never authorize an action without a fresh opaque reference.

### Operational hardening

- Diagnose only Pumarejo-owned drift, keep full-file hashes as secondary evidence, and preserve unrelated user edits.
- Diagnose IPv4/IPv6 binding mismatches between the dev server and `build.devUrl` with an actionable correction.
- Exclude repository/runtime/artifact directories from discovery by default and apply documented retention, cleanup, and permission policies.
- Add `doctor --self` checks for dependency resolution, broken symlinks/junctions, lockfile/install coherence, postinstall binaries, Node, and package-manager compatibility.

## Global non-goals

- Generic desktop automation, screen-coordinate clicking, OCR-driven interaction, or implicit approval of native prompts.
- Inspection of closed shadow roots without explicit application instrumentation; such regions must be reported as unsupported coverage gaps.
- Arbitrary JavaScript, selector, XPath, shell, WebDriver, Tauri-command, or operating-system command passthrough.
- Multiple independent application sessions in one MCP owner; the initiative supports multiple surfaces within one owned application session.
- Unbounded log streaming, full environment dumps, full PATH disclosure, or retention of raw sensitive application data.
- Terminating processes whose ownership cannot be revalidated.
- Replacing local `stdio` MCP transport with a network service.

## Requirements

| ID      | Requirement                                                                 | Acceptance signal                                                                                                                |
| ------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| REL-001 | Supported visible controls in nested surfaces appear in semantic snapshots. | Tinto composer, Send control, and access selector receive current-generation refs and are interactable.                          |
| REL-002 | Surface discovery and selection are explicit and dynamic.                   | A newly created supported window/WebView appears with metadata and can become active.                                            |
| REL-003 | Semantic coverage gaps are truthful.                                        | A screenshot-to-semantics diagnostic identifies visible unsupported or unrepresented regions without inventing nodes.            |
| REL-004 | Window operations expose effective support.                                 | Tool discovery and results distinguish denied, incompatible, unimplemented, and failed verification states.                      |
| REL-005 | Native Tauri dialog control is explicit and auditable.                      | Authorized accept/cancel works; absent capability or authorization fails closed and records no implicit choice.                  |
| REL-006 | Logs and errors are bounded and sanitized.                                  | Console, process, invocation, phase, and last-error queries preserve useful codes and contain no seeded secrets.                 |
| REL-007 | Process cleanup is ownership-safe and convergent.                           | Normal close, timeout, cancellation, and transport loss leave zero owned descendants and ports, or exact retryable residue.      |
| REL-008 | Windows child environments are valid and secret-safe.                       | Essential variables are inherited/reconstructed, portable values expanded, and denylisted credentials absent.                    |
| REL-009 | Toolchains resolve portably.                                                | Each candidate reports path identity, source, version, acceptance/rejection reason, and MCP-versus-child environment difference. |
| REL-010 | Interaction sequences are bounded and atomic at the public boundary.        | Limits on actions and duration are enforced and one final stabilization returns only fresh refs.                                 |
| REL-011 | Generation behavior is deterministic.                                       | Rejected no-change actions preserve refs; mutating/uncertain actions advance generation according to the published matrix.       |
| REL-012 | Integration drift is attribution-based.                                     | Unrelated edits outside owned markers/entries do not make `doctor` fail.                                                         |
| REL-013 | Network diagnostics cover both loopback families.                           | Binding/devUrl mismatches yield the observed listener and a concrete IPv4/IPv6 correction.                                       |
| REL-014 | Discovery and artifact hygiene prevent recursive self-testing.              | Default discovery excludes `.git`, `.worktrees`, `.pumarejo`, `node_modules`, `target`, and owned artifact/runtime roots.        |
| REL-015 | Self-diagnostics explain broken local installs.                             | A broken junction or missing transitive dependency produces a specific repair instruction.                                       |
| REL-016 | Existing capability composition and rustfmt compatibility remain protected. | JSON/TOML/wildcard/security fixtures and format-idempotence regressions pass unchanged.                                          |

## Success criteria

1. The complete Tinto proving journey runs only through Pumarejo's public MCP tools.
2. Every visible, supported target in that journey has a fresh semantic ref before interaction.
3. The access-mode confirmation requires an explicit authorized dialog decision and leaves an audit record.
4. A forced client timeout during the same journey is recoverable without killing unrelated processes.
5. Logs and diagnostic artifacts identify the failed phase while passing seeded secret/path redaction tests.
6. The suite verifies zero owned processes and owned listening ports after close on supported Windows and Linux environments.
7. All existing public contract, integration safety, capability-composition, rustfmt, and package validation gates remain green.

## Invariants

- Pumarejo acts only through exact current-generation WebDriver handles or a purpose-built, capability-gated Tauri dialog bridge.
- Visual evidence never silently substitutes for missing semantic coverage.
- Capability declarations are derived from effective provider/runtime probes and explicit grants.
- Native confirmations are never accepted by default, by timeout, or by sequence convenience.
- A failed action that proves no state or surface change does not invalidate references; uncertainty advances the generation and says why.
- All output is bounded before leaving its trust boundary and sanitized before persistence or MCP serialization.
- Cleanup and repair affect only revalidated owned resources.
- Existing application capabilities are composed, never replaced; generated Rust is format-idempotent.
- Full-file hashes are evidence, not sole authority for attributed integration health.

## Settled decisions

- Preserve local MCP over `stdio`, one owned application session, and a small explicit tool surface.
- Support multiple surfaces inside that owned session rather than concurrent independent applications.
- Treat open shadow roots, same-origin/provider-reachable iframes, and provider-exposed windows/WebViews as support candidates; report the rest as coverage gaps.
- Native automation is limited to the Tauri dialog bridge and requires both capability and explicit test authorization.
- Sequences have finite action-count and wall-clock limits and return one final bounded snapshot.
- Stable semantic identifiers are correlation metadata only.
- The two already corrected behaviors—capability composition and rustfmt-compatible generation—remain regression gates, not new feature work.

## Approved decisions and escalation boundaries

1. **Continuation generations:** continuation pages are non-actionable evidence. Interaction requires a separately refreshed actionable snapshot with a new generation.
2. **Dialog authorization shape:** native dialog accept/cancel requires a random launch-scoped grant naming the allowed actions. It cannot be reused by another session. Decisions are retained only as bounded sanitized session evidence unless artifact retention is explicitly enabled.
3. **Provider surface limit:** if a provider cannot enumerate or switch a visible WebView, the release contract reports it unsupported. Application instrumentation remains a separately reviewed option.
4. **Log retention defaults:** diagnostic buffers are bounded and memory-only by default. Explicitly retained artifacts follow the configured bounded retention and sanitization policy.
5. **Supported self-repair:** `doctor --self` recommends exact safe repairs but does not delete or reinstall dependencies automatically.
6. **Surface API shape:** discovery and selection use additive dedicated MCP operations. Existing snapshot and window calls remain backward compatible; selection produces fresh actionable generation evidence.
7. **Capability vocabulary:** surface and native operations use the explicit `supported`, `unsupported`, `unavailable`, `denied`, and `failed` state matrix with stable codes and bounded sanitized evidence.
8. **Coverage-gap policy:** screenshot-to-semantics diagnostics use a conservative provider-reported bounded region map and return `coverage_unknown` when geometry is inconclusive. They never authorize OCR or coordinate interaction.
9. **Retained-artifact cleanup:** cleanup runs only when the operator supplies an explicit bounded policy. In the absence of that policy, retained artifacts are preserved; no implicit deletion default is introduced.
10. **Public dialog operation:** expose the existing authorized native-dialog controller as the additive public MCP tool `tauri_dialog`, retaining the strict `action`, `surfaceRef`, `generation`, and `authorize` boundary.
11. **Portable provider delivery:** ship the modified provider as an attributable bundled source and make init/configuration select it through a portable package-relative mechanism; releases must not depend on an absolute development-machine path or an unpublished ambient checkout.
12. **Windows process custody:** complete the existing Windows Job Object seam with a portable native identity-bound backend. The raw-PID validated-tree fallback must not be used to make a supported release-grade cleanup claim.

Approved by the user on 2026-08-21 for autonomous execution through release handoff. Decisions 6–9 were approved at `2026-08-21T12:04:48Z` after artifact review exposed their concrete alternatives. Decisions 10–12 were approved by the user on `2026-08-25` after final convergence isolated the remaining public-contract, provider-delivery, and Windows-custody release gates.

## Source context

- User proposal, 2026-08-21, based on the Tinto end-to-end trial.
- `docs/audits/2026-07-28-pumarejo-usage-feedback.md`.
- `docs/roadmaps/2026-07-28-001-real-usage-hardening-roadmap.md`.
- `docs/work-packages/RDM-009-bounded-observation/2026-07-28-009-bounded-observation-work-package.md`.
- Review-passed baselines RDM-010, RDM-011, and RDM-012.
