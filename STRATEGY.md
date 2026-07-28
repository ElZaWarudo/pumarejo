---
name: pumarejo
last_updated: 2026-07-23
---

# pumarejo Strategy

## Target problem

Tauri application developers who work with coding agents cannot give them direct access to the application interface without surrendering control of the entire desktop.
That prevents parallel work and leaves the agent without the visual and functional context needed to understand existing flows or propose meaningful new ones.

## Our approach

Build a small, reusable semantic bridge between any compatible Tauri 2 application and any MCP-capable agent.
The agent will observe and interact with WebView components, as it would through a browser MCP, without using the system mouse or keyboard and without coupling the product promise to a specific WebDriver mechanism.

## Who it's for

**Primary:** Tauri developers who work with coding agents. They use pumarejo so the agent can freely inspect the application, understand its flows, and ground proposed changes while they continue using the computer.

## Key metrics

- **Usable sessions** - Percentage of attempts that reach a first interactive snapshot on the certified Windows 11 and Ubuntu LTS matrix.
- **Completed journeys** - Percentage of reference journeys the agent completes through semantic observation, clicking, typing, and keyboard input without human intervention.
- **Flow comprehension** - Percentage of reference flows the agent correctly identifies and describes after exploring the application.
- **Actionable proposals** - Percentage of agent-proposed flows that fit observed behavior without requiring conceptual correction from the developer.
- **Desktop interruptions** - Percentage of sessions that inject system input or prevent the developer from continuing to work; the acceptable target is zero.

## Tracks

### Faithful semantic observation

Maintain a stable, verifiable representation of what the user sees and the components they can interact with.

_Why it serves the approach:_ Flow comprehension depends on snapshots, screenshots, and references reflecting the application's actual state.

### Isolated interaction

Enable visible and hidden sessions that operate on the WebView without controlling system input devices.

_Why it serves the approach:_ The product solves the original problem only if the developer keeps control of the desktop while the agent works.

### Reusable integration

Support guided, reversible installation for Tauri 2.x on current Node.js LTS lines and stable Rust.

_Why it serves the approach:_ The tool must work across different projects without copied logic, custom integration maintenance, or production-build changes.

### Verifiable compatibility

Certify the complete flow on Windows 11 and Ubuntu LTS, including visible and hidden modes.

_Why it serves the approach:_ The promise must depend on tested behavior on target platforms, not assumptions about WebDriver or the WebView.

## Not working on

- Remote desktop control or system mouse and keyboard injection.
- An intelligent explorer inside the MCP server; intelligence and journey selection belong to the agent.
- A QA platform with test recording, assertions, fixtures, mocks, IPC interception, or log capture.
- Instrumentation of native Tauri APIs, the frontend runtime, or a custom Rust crate during v1.
- Certified support for macOS, other Linux distributions, multiple windows, or concurrent sessions during v1.

## Marketing

**One-liner:** A reusable MCP that turns any instrumented Tauri 2 application into an agent-observable and controllable interface.

**Key message:** The agent sees and interacts with the same application as the developer, but does so through WebView components.
The developer keeps the mouse, keyboard, and the rest of the desktop available for parallel work.
