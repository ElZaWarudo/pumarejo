---
title: Tauri Agent Product Requirements
date: 2026-07-23
validation_status: validated-from-confirmed-strategy
sources:
  - STRATEGY.md
  - docs/orchestration/2026-07-23-001-tauri-agent-readiness-report.md
  - user brief attached to the initiative
---

# Tauri Agent Product Requirements

## Problem and goal

Developers using coding agents with Tauri applications currently have to choose between giving the agent control of the whole desktop or withholding the live visual and interaction context it needs.
Tauri Agent shall let an MCP-capable agent observe and operate one local Tauri 2 application through its WebView while the developer keeps control of the operating system, mouse, keyboard, and other windows.

## Actors and stakeholders

- **Primary user:** a Tauri developer working with a coding agent.
- **Primary client:** an MCP host such as Codex that invokes Tauri Agent tools.
- **Consumer application:** a local Tauri 2 project instrumented for debug-only WebDriver access.
- **Approval authority:** the developer who owns the consumer project.

## Scope in

- One reusable npm package named `@cie/tauri-agent`.
- A CLI with initialization, diagnostics, removal, and MCP server entry points.
- Debug-only instrumentation of compatible Tauri 2 projects.
- One active application session and one configured primary window at a time.
- Visible and background execution modes.
- Semantic snapshots, screenshots, component click, text entry, key presses, and deterministic close.
- Certified behavior on Windows 11 and Ubuntu LTS.
- Compatibility with Tauri 2.x, supported Node.js LTS lines, and Rust stable.

## Scope out

- Operating-system mouse or keyboard injection.
- General desktop control.
- Autonomous exploration logic inside the server.
- Test recording, assertions, fixtures, mocks, IPC interception, or Rust/frontend log capture.
- Native Tauri API execution.
- A custom Rust crate or required frontend runtime.
- Multiple windows, multiple simultaneous sessions, macOS certification, or certification of Linux distributions other than Ubuntu LTS.
- Closed shadow roots, cross-origin iframes, canvas-only controls, secondary WebViews, native menus, tray menus, file pickers, permission prompts, and other operating-system dialogs.

## V1 compatibility profile

The supported interaction surface is the configured primary top-level WebView document.
Certification covers standard interactive HTML controls, contenteditable elements, controls represented with ARIA roles, keyboard-focusable custom controls, open shadow roots, and the meaningful semantic content listed in FR-016.
Applications remain responsible for exposing names, roles, states, relationships, and keyboard behavior when they use custom components.
Unsupported surfaces shall remain observable through screenshots when rendered, but they do not receive semantic interaction guarantees.

Each release publishes the exact tested matrix. The initial v1 matrix is:

- Windows 11 24H2 and Ubuntu 24.04 LTS.
- Node.js 22 LTS and Node.js 24 LTS.
- Tauri from the release's declared minimum supported 2.x version through the latest stable Tauri 2.x available at release validation.
- The latest stable Rust toolchain at release validation, with the exact toolchain version recorded in release evidence.

## Functional requirements

### Project integration

- FR-001. The CLI shall reject initialization unless the target contains a recognizable Tauri 2 project with `src-tauri/Cargo.toml` and Tauri configuration.
- FR-002. `init` shall add the embedded WebDriver dependency, register it only for debug builds, add the required capability permission, and create `.tauri-agent.json`.
- FR-003. `init` shall be idempotent: a second run shall report the existing integration without duplicating dependencies, Rust registration, permissions, or configuration.
- FR-004. When automatic Rust registration is unsafe because the project structure is unsupported or ambiguous, `init` shall stop without a partial Rust edit and return an actionable manual-integration instruction.
- FR-005. `doctor` shall report project detection, configuration validity, debug integration, capability permission, toolchain availability, platform prerequisites, port availability, and recoverable process residue.
- FR-006. `remove` shall remove only changes attributable to Tauri Agent and shall preserve unrelated project content.
- FR-007. Project-mutating commands shall support a dry-run that reports intended changes without writing them.

### MCP lifecycle

- FR-008. `mcp --project <path>` shall expose the Tauri tools over MCP stdio and shall resolve all project-relative configuration from the supplied path.
- FR-009. `tauri_launch` shall start the configured application command with an isolated loopback WebDriver endpoint, wait for readiness, create the only allowed WebDriver session, select the configured primary window, and return a first snapshot.
- FR-010. `tauri_launch` shall accept `visible` and `background` modes and shall report the effective mode and platform.
- FR-011. A second launch while a session is active shall fail with a stable `SESSION_ALREADY_ACTIVE` error rather than starting another process.
- FR-012. Launch failure shall terminate processes created by that launch attempt and report the failing phase.
- FR-013. `tauri_close` shall close the WebDriver session, terminate only processes started by Tauri Agent, release ports, and be safe to call after partial launch failure.

### Observation

- FR-014. `tauri_snapshot` shall return the configured window title and viewport dimensions plus a structured semantic view of meaningful visible content and interactive elements.
- FR-015. Each snapshot node shall include a session-scoped `ref`, an optional `parentRef`, semantic kind, tag, role when known, accessible name when known, visible text when relevant, current value when relevant, redaction state, enabled state, visibility state, focus state, bounds, relevant label or ownership relationships, and applicable interactive states (`checked`, including `mixed`, `selected`, `expanded`, `pressed`, `required`, `invalid`, `readOnly`, and `current`). Nodes shall be emitted in deterministic DOM preorder while preserving containment across forms, dialogs, lists, tables, and open shadow roots.
- FR-016. Snapshot discovery shall include native interactive HTML elements, elements exposed through `role` or keyboard focus, and meaningful non-interactive content including headings, labels, descriptions, validation messages, status and alert text, dialogs, lists, tables, and their semantic relationships.
- FR-016a. Password fields and elements marked `data-tauri-agent-sensitive="true"` by the application shall never expose their current value or value-bearing text; snapshots shall return a redaction marker instead, including inside open shadow roots.
- FR-017. `tauri_screenshot` shall capture the current primary WebView and return image content suitable for an MCP client plus the artifact path and dimensions.
- FR-018. Observation commands shall not mutate the application. Each snapshot and screenshot result shall include an observation timestamp and current snapshot generation; autonomous application changes between sequential observations are permitted.

### Interaction

- FR-019. `tauri_click` shall activate the element referenced by the latest valid snapshot without generating operating-system pointer input.
- FR-019a. A successful click shall follow the WebView's native focus behavior and the following snapshot shall identify the focused node.
- FR-020. `tauri_type` shall optionally clear an editable element and enter the requested text without generating operating-system keyboard input.
- FR-021. `tauri_press_key` shall dispatch a supported WebDriver key to the active DOM element in the current WebView, or to the document body when no focusable element is active, without generating operating-system keyboard input.
- FR-022. After a referenced element is detached, its reference table is replaced, or its snapshot-time semantic identity (kind, role, accessible name, input type, or stable ownership context) changes in place, interaction shall fail with `STALE_ELEMENT_REF` and instruct the client to take a new snapshot.
- FR-023. Interaction with a missing, hidden, disabled, incompatible, or unsupported target shall return the common structured error envelope, a stable typed error code, and recovery guidance; it shall never fall back to desktop automation.

### Execution modes

- FR-024. In visible mode, the application window may be displayed while all agent interaction remains WebDriver-based.
- FR-025. In background mode, the application shall remain observable and interactive to the agent without presenting its controlled window on the developer's active desktop.
- FR-026. Both modes shall support the same MCP observation and interaction tool contract.
- FR-027. Failure to provide background behavior on either certified platform shall block v1 completion rather than silently downgrade the mode.

## Non-functional requirements

- NFR-001. Tauri Agent shall generate zero operating-system mouse and keyboard input during all supported actions.
- NFR-002. The developer shall remain able to use other applications during an active visible or background session.
- NFR-003. WebDriver instrumentation shall be registered only in debug builds and shall not be present in release behavior.
- NFR-004. The MCP server and WebDriver session shall be local to the developer machine; Tauri Agent shall not provide a network-facing remote-control mode.
- NFR-005. Configuration and tool schemas shall be versioned and validated before use.
- NFR-006. All created child processes, ports, temporary configuration, and artifacts shall have explicit ownership and cleanup behavior.
- NFR-007. The package shall run on every Node.js LTS line declared supported by the release and shall be tested on Windows 11 and Ubuntu LTS.
- NFR-008. Project edits shall preserve existing formatting where practical and shall never overwrite an ambiguous source transformation.
- NFR-009. Screenshots and other session artifacts shall be created with current-user-only access before content is written (owner modes on Linux and a current-user-only DACL on Windows), deleted by default when the session closes, and retained only through explicit project configuration. Permission setup failure shall fail closed. A durable manifest shall allow a later MCP startup to remove stale non-retained artifacts left by hard termination without following links outside the artifact root.
- NFR-010. Snapshot text, screenshot pixels, accessible names, values, and all other rendered application content shall be treated as untrusted data, kept structurally separate from tool instructions, and documented to MCP clients as non-authoritative.

## Business rules

- BR-001. One MCP server process owns at most one active Tauri session in v1.
- BR-002. A `ref` belongs to one session and one snapshot generation; taking a new snapshot replaces the previous reference table.
- BR-003. Tauri Agent may terminate only the application process tree it started.
- BR-004. Without an explicit `webdriverPort`, launch shall select an unpredictable available high port and report the effective port.
- BR-005. An explicitly requested port that is unavailable shall produce `PORT_UNAVAILABLE` rather than selecting a different port silently.
- BR-006. Generated artifacts remain inside the configured artifacts directory.
- BR-007. The consumer project is trusted local input; Tauri Agent shall not execute commands received from MCP tool arguments other than the project-approved application command.
- BR-008. Release, publication, commits, PRs, and Jira work are deferred until all implementation units pass review and verification.
- BR-009. The embedded WebDriver endpoint shall bind only to loopback behind an agent-owned authenticated proxy with a per-session nonce; the provider port remains private to the child process, the proxy accepts only the nonce-bearing agent connection, and launch fails when authenticated exclusive session control cannot be established.
- BR-010. Snapshot references map only to opaque WebDriver element handles returned by the observation script for that generation; actions shall not re-query the DOM by labels, selectors, or position after a snapshot.

## Key flows

### F1. Instrument a project

1. The developer runs `tauri-agent init` in a Tauri 2 project.
2. The CLI validates the project and previews or applies attributable changes.
3. The CLI writes a versioned configuration and reports the MCP configuration snippet.
4. The developer can run `doctor` to confirm readiness.

### F2. Explore in visible mode

1. The MCP host starts `tauri-agent mcp --project .`.
2. The agent calls `tauri_launch` with `mode: visible`.
3. Tauri Agent returns a semantic snapshot.
4. The agent alternates snapshots, screenshots, and semantic interactions.
5. The developer continues using the desktop independently.
6. The agent calls `tauri_close`.

### F3. Explore in background mode

1. The agent launches with `mode: background`.
2. Tauri Agent starts the application in an isolated hidden or virtual display appropriate to the certified platform.
3. The same observation and interaction tools remain available.
4. Closing the session removes the hidden or virtual execution resources.

### F4. Recover from stale UI state

1. The agent obtains a snapshot and keeps an element reference.
2. The application replaces or removes the referenced element.
3. The agent attempts an interaction and receives `STALE_ELEMENT_REF`.
4. The agent takes a new snapshot and continues with a new reference.

## Acceptance criteria

- AC-001. On Windows 11 and Ubuntu LTS, a fixture Tauri 2 project can be initialized twice without duplicate modifications.
- AC-001a. Release validation records and exercises every operating-system, Node.js, Tauri boundary, and Rust toolchain entry in the published support matrix.
- AC-002. On both certified platforms, `doctor` distinguishes a ready project from each missing prerequisite covered by FR-005.
- AC-003. On both certified platforms, visible mode completes launch, initial snapshot, screenshot, click, type, key press, follow-up snapshot, and close.
- AC-004. On both certified platforms, background mode completes the same sequence without presenting the controlled window on the developer's active desktop.
- AC-005. During AC-003 and AC-004, automated verification detects no operating-system input injection.
- AC-006. Snapshot references target the exact WebDriver element handle observed in that generation, are never re-queried heuristically, become invalid after the reference table is replaced, and fail stale when an attached or virtualized node changes semantic identity.
- AC-006a. A representative fixture snapshot exposes headings, labels, status and validation messages, lists or tables, control relationships, and the focused element well enough for an MCP agent to describe the documented workflow and its state transitions without source-code access.
- AC-006b. A representative fixture containing password and explicitly sensitive inputs returns redaction markers and no sensitive values.
- AC-007. A failed launch leaves no owned application process, WebDriver session, reserved port, or temporary runtime configuration.
- AC-008. `remove` restores each supported fixture project to its pre-init semantic state while preserving unrelated edits.
- AC-009. A release build of an initialized fixture does not register or expose the embedded WebDriver integration.
- AC-010. An MCP client can start the stdio server, enumerate all seven v1 tools, validate their schemas, and complete the reference flow without private APIs.
- AC-011. After exploring representative fixture flows through public MCP tools only, an MCP-capable agent can accurately summarize the observed workflow and propose a compatible new flow; both are checked against a fixture-owned rubric covering states, transitions, validation, and user-visible outcomes. Release evidence records the exact agent/model, fixed prompt, tool budget, retry/trial policy, hidden-rubric boundary, deterministic scoring procedure, and aggregate pass threshold.
- AC-012. Closing a default session removes its screenshots and temporary artifacts; enabling artifact retention preserves them inside the configured directory with restrictive permissions where the platform supports them.
- AC-013. The fixture suite covers every included v1 compatibility-profile surface on both certified platforms and confirms that excluded surfaces fail with documented typed errors rather than falling back to desktop automation.

## Assumptions and open questions

- **Validated assumption:** the primary window and one active session are sufficient for v1.
- **Validated assumption:** agent reasoning remains outside the MCP server.
- **Validated assumption:** both visible and background modes are release requirements.
- **Planning risk:** the reliable Windows background mechanism requires an early feasibility proof; the product requirement remains fixed even if the internal mechanism changes.
- **Release-only decision:** repository base branch, remote, PR granularity, and registry publication credentials remain unresolved until the final Release Marshal phase.

## Validation status

Validated against the user-confirmed `STRATEGY.md` and initiative brief.
The requirements are ready for roadmap generation; the Windows background mechanism is a technical risk, not an unresolved product decision.
