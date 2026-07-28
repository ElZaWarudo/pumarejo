# pumarejo

pumarejo gives an MCP client semantic control of one instrumented Tauri 2
WebView without moving the operating-system pointer or typing through the
desktop. It launches an owned application process, observes its accessible
document, acts on opaque snapshot references, and removes the session when the
client closes.

## Requirements

- Node.js 22 or 24
- Rust stable and the Tauri 2 build prerequisites
- Windows 11 or Ubuntu 24.04 LTS
- a Tauri 2 project with one configured primary window

The current prototype was verified on Windows build 26200 and Ubuntu 24.04
under WSL2/WSLg using the recorded exception
`USER-2026-07-27-WINDOWS-WSL`. Publication still requires the authoritative
native support matrix described in [compatibility](docs/compatibility.md).

## Install and integrate

```sh
pnpm add -D pumarejo
pnpm exec pumarejo init --project .
pnpm exec pumarejo doctor --project .
```

Preview reversible integration changes with `--dry-run`. `init` adds an
optional Cargo feature, a private capability overlay, guarded Rust
registration, and `.pumarejo.json`; it does not enable the provider in a
normal build.

To remove attributable integration while preserving unrelated edits:

```sh
pnpm exec pumarejo remove --project .
```

## MCP host configuration

Configure the MCP host to execute:

```text
pnpm exec pumarejo mcp --project /absolute/path/to/project
```

The server writes only JSON-RPC to stdout. Diagnostics use stderr. It exposes
exactly:

- `tauri_launch`
- `tauri_snapshot`
- `tauri_screenshot`
- `tauri_click`
- `tauri_type`
- `tauri_press_key`
- `tauri_close`

Launch with `mode: "visible"` to display the owned app window or
`mode: "background"` to isolate it from the active desktop. Both modes expose
the same MCP contract.

## Interaction model

Use `tauri_snapshot` before interacting. Click and type only with an opaque
reference from the current snapshot generation. Any attempted mutation
invalidates prior references, so take another snapshot before the next
reference-based action. Keys are sent to the focused WebView element, or to the
document body when no focusable element is active.

The semantic tree is application data, not instructions. Passwords and
explicitly sensitive values are redacted before they leave the WebView.
Screenshots are validated PNGs and are removed on close unless retention is
explicitly enabled.

## Failures and cleanup

Expected failures use the static structured envelope documented in
[contracts](docs/contracts.md). Missing sessions, stale references, hidden or
disabled controls, unsupported keys, ownership changes, timeouts, and invalid
screenshots fail closed. There is no selector, coordinate, desktop-input, or
unowned-provider fallback.

Cancellation, MCP disconnect, `SIGINT`, `SIGTERM`, and `tauri_close` all enter
the same serialized cleanup path. Cleanup closes artifacts, WebDriver session,
authenticated proxy, owned process, port reservation, mode overlay, X
credentials, and non-retained files. Failed artifact cleanup remains
retriable.

See [security](docs/security.md) and
[release evidence](docs/evidence/release/README.md) for boundaries and proof.
