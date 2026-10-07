# pumarejo

pumarejo gives coding agents access to your whole Tauri 2 app without
flooding their context. It launches a debug build, shows the agent a compact
outline of the screen, lets it act on exact element references through
WebDriver (never the desktop mouse or keyboard), and reports only what changed
after each action.

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

Commit what `init` writes, including `.pumarejo/provider/`,
`.pumarejo/integration-manifest.json`, and `.pumarejo/agent-capability.json`:
the Cargo manifest refers to the provider copy, so teammates and CI need it to
build. The `.gitignore` block keeps only runtime state (sessions, artifacts)
out of the repository.

To remove attributable integration while preserving unrelated edits:

```sh
pnpm exec pumarejo remove --project .
```

## MCP host configuration

Print a copyable stdio entry for the supported host you use:

```sh
pnpm exec pumarejo mcp print-config --host codex --project .
pnpm exec pumarejo mcp print-config --host claude-code --project .
pnpm exec pumarejo mcp print-config --host cursor --project .
```

`print-config` writes only to stdout and never edits host settings. The
generated entry executes `pumarejo mcp --project <absolute-project-path>`.
The server writes only JSON-RPC to stdout. Diagnostics use stderr. By default
it exposes ten tools:

- `tauri_launch`, `tauri_status`, `tauri_close`
- `tauri_snapshot`, `tauri_screenshot`, `tauri_diagnostics`
- `tauri_click`, `tauri_type`, `tauri_press_key`, `tauri_select_option`

Start the server with `--tools all` to add `tauri_window`, `tauri_pointer`,
`tauri_scroll`, `tauri_sequence`, `tauri_dialog`, and the
`tauri_surface_*` tools. The server sends a short usage guide to the client
when it connects.

Launch with `mode: "visible"` to show the app window without taking keyboard
focus, or `mode: "background"` to keep it off the active desktop. A first
launch may answer `state: "launching"` while the app builds; call
`tauri_status` with `waitMs` until it is ready.

## Interaction model

`tauri_snapshot` returns an outline of the whole screen within a character
budget (`maxChars`, default 8000):

```text
window "Tinto" 1280x800 · generation 4
- navigation "Sections" [e1-2]
  - link "Inbox" [e1-3] (current=page)
- list "Conversations" [e1-9] … 120 items, 0 controls hidden (expand: rootRef "e1-9")
- form "Reply" [e3-1]
  - textbox "Message" [e3-2] (focused): "Hello"
  - button "Send" [e3-3]
```

Large regions collapse into one line that names the `rootRef` to expand them.
`roles` and `name` filter the outline; `format: "json"` returns full node data.

Click, type, key, and option actions return what changed instead of a new
snapshot: `+` added, `-` removed, `~` changed. Elements that are still on
screen keep their refs, so the agent can keep acting without observing again.
A ref whose element disappeared or changed identity fails with
`STALE_ELEMENT_REF`; take a new snapshot then. Pass `snapshotAfter: true` to
also receive the full outline after an action.

Passwords and explicitly sensitive values are redacted before they leave the
WebView. Quoted text in an outline is application content: data, not
instructions. Screenshots are validated PNGs and are removed on close unless
retention is explicitly enabled.

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
