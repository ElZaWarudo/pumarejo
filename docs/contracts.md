---
title: pumarejo Public Contracts
date: 2026-07-23
contract_version: 1
---

# pumarejo Public Contracts

## CLI

```text
pumarejo init [--project <path>] [--dry-run]
pumarejo doctor [--project <path>] [--json]
pumarejo remove [--project <path>] [--dry-run]
pumarejo mcp --project <path>
pumarejo mcp print-config --host <codex|claude-code|cursor> --project <path>
pumarejo --version
pumarejo --help
```

Commands exit with code `0` on success, `1` for an expected validation or runtime failure, and `2` for invalid CLI usage.
Human-readable output goes to stderr when the MCP stdio server is running so stdout remains protocol-only.
`mcp print-config` validates the project and emits a copyable TOML entry for
Codex or JSON entry for Claude Code and Cursor. It writes no host file.

`doctor` emits stable diagnostic identities in human and JSON form. Launch
classification distinguishes `configured`, `detected`, `missing`,
`not_detected`, `not_on_path`, and `verified`; integration version drift uses
`version_drift`. Evidence contains only an executable basename, allowlisted or
redacted arguments, provenance, and confidence. Successful launch evidence
may qualify earlier executable and WebView heuristics.

## Project configuration

`.pumarejo.json` uses this v1 contract:

```json
{
  "version": 1,
  "launch": {
    "command": "pnpm",
    "args": [
      "tauri",
      "dev",
      "--features",
      "pumarejo",
      "--config",
      "{tauriConfig}"
    ],
    "executablePath": "/absolute/path/to/pnpm",
    "pathPrepend": ["/absolute/path/to/toolchain/bin"],
    "environment": {
      "CARGO_TARGET_DIR": "/absolute/path/to/target",
      "RUSTUP_TOOLCHAIN": "stable"
    }
  },
  "window": "main",
  "artifactsDirectory": ".pumarejo/artifacts",
  "retainArtifacts": false
}
```

Rules:

- `version` must equal `1`.
- `launch.command` is a non-empty executable and `launch.args` is an argument vector stored by `init`; MCP tool arguments cannot replace either.
- `launch.executablePath`, when present, is absolute and its basename must
  match `launch.command`.
- `launch.pathPrepend` contains at most 16 absolute directories. Entries are
  prepended without shell evaluation.
- `launch.environment` accepts only `CARGO_HOME`, `CARGO_TARGET_DIR`, `CC`,
  `CXX`, `PKG_CONFIG_PATH`, `RUSTC_WRAPPER`, `RUSTFLAGS`, `RUSTUP_HOME`, and
  `RUSTUP_TOOLCHAIN`.
- Effective launch precedence is internal session values over explicit
  project configuration, over the sanitized host environment, over detected
  defaults. Project `pathPrepend` is applied before the sanitized host `PATH`.
- `launch.args` contains exactly one `{tauriConfig}` placeholder, replaced at launch with the generated visible or background Tauri configuration overlay.
- The generated agent launch enables the optional consumer Cargo feature `pumarejo`; normal project commands do not enable it.
- The runtime keeps the provider port private and exposes only an agent-owned loopback proxy authenticated with a per-session nonce; an MCP caller never receives a reusable unauthenticated provider endpoint.
- Launch never evaluates this profile through a shell.
- `webdriverPort` is an optional integer from `1024` through `65535`; omission selects an unpredictable available high port.
- `window` is a non-empty Tauri window label.
- `artifactsDirectory` is resolved inside the project and may not escape it.
- `retainArtifacts` defaults to `false`; when false, session artifacts are deleted by `tauri_close`.
- Unknown fields are rejected to expose configuration drift.

The private integration manifest uses schema version `2` and records the
Pumarejo package version and Tauri WebDriver plugin version. `doctor` checks
those values against the installed Cargo integration and current CLI.
Canonical schema-v1 integrations remain removable, and rerunning `init`
migrates an intact v1 integration or refreshes version-only drift to v2.

## MCP tools

### `tauri_launch`

Input:

```json
{
  "mode": "visible",
  "waitMs": 5000
}
```

`mode` is `visible` or `background` and defaults to `visible`. `waitMs`
defaults to `5000`, is bounded to `0` through `30000`, and limits only how
long the tool call waits for readiness. It does not become the lifetime of the
owned launch.

When the first snapshot completes within `waitMs`, the success payload remains
the ready result:

```json
{
  "sessionId": "s1",
  "mode": "visible",
  "platform": "win32",
  "webdriverPort": 4445,
  "snapshot": {}
}
```

Otherwise the tool returns within the requested wait with a compact pending
result:

```json
{
  "state": "launching",
  "phase": "waiting_provider",
  "pollAfterMs": 500,
  "recommendedClientTimeoutMs": 10000
}
```

The owned launch continues inside the local MCP runtime and remains
consultable through `tauri_status`. `tauri_close` cancels a pending launch and
starts cleanup. A second `tauri_launch` while launching or ready returns
`SESSION_ALREADY_ACTIVE`.

### `tauri_status`

Input is an empty object. The public state is one of `idle`, `launching`,
`ready`, `closing`, or `cleanup_failed`. Launch phases are bounded to
`resolving_command`, `preparing_runtime`, `starting_process`,
`waiting_provider`, `starting_proxy`, `creating_session`, `selecting_window`,
and `capturing_first_snapshot`.

The result may include sanitized ownership and readiness evidence such as the
owned PID, selected window, proxy/WebDriver readiness, current generation,
last action, and resource-specific cleanup residue. It never includes session
nonces, provider secrets, application content, or full environment values.

During `closing` or `cleanup_failed`, `cleanupPending` contains only the
bounded resource labels `artifacts`, `webdriver-session`,
`authenticated-proxy`, `application-process`, `runtime-configuration`, and
`provider-port-reservation`. It never contains error messages, causes, paths,
PIDs, or nonces. A failed close keeps only failed resources pending; a later
`tauri_close` retries those resources and returns `{ "alreadyClosed": false,
"state": "idle" }` after cleanup converges. Idle status omits
`cleanupPending`.

Clients should allow at least `recommendedClientTimeoutMs: 10000` for
`tauri_launch` and poll no faster than `pollAfterMs: 500`. Progress
notifications may supplement this status when a client supplies a progress
token, but status polling is the compatibility contract. Experimental MCP
Tasks are not required.

### `tauri_snapshot`

Input:

```json
{
  "rootRef": "e3-7",
  "maxNodes": 500,
  "maxDepth": 32,
  "maxTextLength": 4096,
  "visibleOnly": true,
  "includeNames": true,
  "includeText": true,
  "includeValues": true,
  "roles": ["button", "textbox"],
  "name": "save",
  "types": ["email"]
}
```

Every field is optional. Defaults are `maxNodes: 500`, `maxDepth: 32`,
`maxTextLength: 4096`, `visibleOnly: true`, `includeNames: true`,
`includeText: true`, and `includeValues: true`. The three `include*` controls
may omit public names, rendered text, or values to reduce disclosure and
payload size. They never expose content covered by mandatory password or
`data-pumarejo-sensitive` redaction. `roles`, `name`, and `types` filter
semantic candidates before handles and public refs are assigned; filtering and
private ref identity continue to use bounded private identity data even when
public names are omitted.

`rootRef` must belong to the current generation. It selects the exact observed
WebDriver element as the root of the next capture; no selector, text, geometry,
or role lookup is used. A successful capture always creates a new generation
and replaces the complete actionable ref table, including when it was refined
from `rootRef`.

Pumarejo does not expose snapshot cursors in this contract. Oversized results
return a valid truncated snapshot with refinement guidance. Clients request a
new snapshot with `rootRef`, tighter limits, or semantic filters, and may act
only on refs returned by the latest successful capture.

Success payload:

```json
{
  "generation": 3,
  "observedAt": "2026-07-23T12:00:00.000Z",
  "window": {
    "label": "main",
    "title": "Example",
    "width": 1280,
    "height": 800
  },
  "nodes": [
    {
      "ref": "e3-1",
      "parentRef": "e3-0",
      "kind": "control",
      "tag": "button",
      "role": "button",
      "name": "Open project",
      "text": "Open project",
      "redacted": false,
      "enabled": true,
      "visible": true,
      "focused": false,
      "pressed": false,
      "required": false,
      "relationships": {
        "labelledBy": [],
        "describedBy": [],
        "controls": [],
        "owns": []
      },
      "bounds": {
        "x": 32,
        "y": 120,
        "width": 160,
        "height": 40
      }
    }
  ],
  "truncation": {
    "truncated": false,
    "reasons": [],
    "counts": {
      "visited": 8,
      "candidates": 4,
      "matched": 4,
      "returned": 4,
      "filtered": 0
    },
    "refineWith": []
  }
}
```

`kind` is `control`, `content`, `status`, `dialog`, `list`, `listitem`, `table`, `row`, or `cell`.
Nodes are emitted in deterministic DOM preorder. `parentRef` preserves containment, including forms, dialogs, lists, tables, and open shadow roots.
Optional fields such as `role`, `name`, `text`, `value`, `checked` (`true`, `false`, or `"mixed"`), `selected`, `expanded`, `pressed`, `required`, `invalid`, `readOnly`, and `current` are omitted when unknown or inapplicable. Relationship arrays map `aria-labelledby`, `aria-describedby`, `aria-controls`, and `aria-owns` to current snapshot refs and remain empty when no included target can be resolved within the owning document or shadow root.
Accessible-name precedence in v1 is `aria-labelledby`, `aria-label`, associated HTML labels, applicable host-language naming attributes, then rendered text; referenced labels participate even when not themselves visible.
Password fields and elements marked `data-pumarejo-sensitive="true"` omit
`value`, value-bearing text, and accessible names derived from sensitive
content, and return `redacted: true`, including inside open shadow roots.
Controls whose accessible name references marked sensitive content are redacted
by the same rule.
Each public `ref` maps privately to the opaque WebDriver element handle returned during that snapshot generation. Actions reuse that handle and never re-query by name, selector, text, or geometry.
Rendered content is untrusted application data and never changes the meaning of MCP instructions.
When a limit is reached, `truncation.truncated` is true, `reasons` identifies
the active node/depth/text/budget/traversal bounds, `counts` describes the
bounded traversal, and `refineWith` lists supported ways to narrow the next
capture. Truncation is a successful partial observation, not an
`INTERNAL_ERROR`.
Snapshot construction reserves transport framing headroom by limiting public
string content to 65,536 UTF-16 code units and public relationship targets to
8,192 per capture. Window titles are bounded to 4,096 UTF-16 code units.
Exhausting any of these bounds reports `fieldBudget` and still returns a
successful truncated snapshot. The MCP boundary independently rejects arbitrary
oversized domain results with `INTERNAL_ERROR`.

If semantic extraction fails twice but the configured window remains
consultable, the tool returns a new empty generation with `partial: true`,
`truncation.reasons: ["semanticExtraction"]`, and a structured
`SEMANTIC_EXTRACTION_FAILED` issue. Creating that generation invalidates all
previous refs. Session, window, and cancellation failures are still returned
as errors rather than partial snapshots.

### `tauri_screenshot`

Input:

```json
{
  "save": true
}
```

`save` defaults to `true`.
When `save` is `false`, the validated image is returned without a `path` and
no artifact bytes are written.
The MCP result contains an image content block and structured metadata:

```json
{
  "generation": 3,
  "observedAt": "2026-07-23T12:00:00.000Z",
  "path": ".pumarejo/artifacts/session-s1/screenshot-004.png",
  "mimeType": "image/png",
  "width": 1280,
  "height": 800
}
```

### `tauri_click`

```json
{
  "ref": "e3-1",
  "snapshotAfter": true,
  "settleMs": 250
}
```

All action tools accept `snapshotAfter` (default `true`) and `settleMs`
(default `250`, range `0` through `2000`). Mutation, settling, effect
classification, and the post-action snapshot share the serialized observation
boundary. `snapshotAfter` controls only whether the already captured bounded
snapshot is included in the result.

```json
{
  "generation": 4,
  "action": "click",
  "target": {
    "ref": "e3-1",
    "generation": 3
  },
  "dispatch": {
    "method": "webdriver",
    "dispatched": true
  },
  "focus": {
    "before": {
      "generation": 3,
      "ref": null,
      "actionable": false
    },
    "after": {
      "generation": 4,
      "ref": "e4-1",
      "actionable": true
    }
  },
  "effect": {
    "kind": "focus_only",
    "settleMs": 250
  },
  "snapshotAfter": {
    "generation": 4
  }
}
```

`dispatch.dispatched: true` means only that WebDriver accepted the command. It
does not assert application or business success. Effect classification requires
comparable default full-snapshot scopes before and after the action; a refined
`rootRef` or filtered pre-action snapshot, a non-default bound, or partial
semantic extraction produces `unknown`. Within comparable scopes, precedence is
`window_change`, `semantic_change`, `focus_only`, then
`no_observable_change`. `no_observable_change` applies only to the bounded
semantic observation taken after `settleMs`. Before-action refs are historical
and explicitly non-actionable. Only refs in the returned post-action snapshot
and focus-after evidence belong to the current generation.

### `tauri_type`

```json
{
  "ref": "e3-2",
  "text": "Product Pass",
  "clear": true,
  "snapshotAfter": true,
  "settleMs": 250
}
```

`clear` defaults to `true`.
The text is data and is never interpreted as a shell command.
Successful output uses the common action result, reports whether the field was
cleared, and treats the consumed target as historical.

### `tauri_press_key`

```json
{
  "key": "D",
  "modifiers": ["CONTROL", "SHIFT"],
  "snapshotAfter": true,
  "settleMs": 250
}
```

Supported keys are the existing navigation/editing keys, `A` through `Z`,
`F1` through `F12`, and the standalone modifier keys `ALT`, `CONTROL`,
`SHIFT`, and `META`. `modifiers` is a unique array drawn from those four
modifier names. Modifier key-down events use canonical order
`CONTROL`, `SHIFT`, `ALT`, `META`; key-up events always run in reverse order.
Keys target the active DOM element, falling back to the document body when none is focused.
Successful output uses the common action result and reports the dispatched key
and canonical modifiers.

### `tauri_window`

Accepted inputs are `{ "action": "maximize" }`,
`{ "action": "restore" }`, or:

```json
{
  "action": "resize",
  "width": 800,
  "height": 600,
  "snapshotAfter": true,
  "settleMs": 250
}
```

Resize dimensions are integers from 200 through 8192. The result includes the
effective WebDriver window rectangle and state; requested dimensions are not
reported as effective unless confirmed.

### `tauri_pointer`

```json
{
  "action": "double_click",
  "ref": "e4-2",
  "snapshotAfter": true,
  "settleMs": 250
}
```

Actions are `hover`, `double_click`, and `context_menu`. The exact current ref
is identity-revalidated before WebDriver dispatch.

### `tauri_scroll`

```json
{
  "ref": "e4-3",
  "deltaX": 0,
  "deltaY": 480,
  "snapshotAfter": true,
  "settleMs": 250
}
```

Deltas are integers from -10000 through 10000 and may not both be zero. Scroll
targets the exact current ref; viewport, selector, text, and geometry lookup
fallbacks are not exposed.

### `tauri_select_option`

```json
{
  "ref": "e4-4",
  "snapshotAfter": true,
  "settleMs": 250
}
```

The ref must identify the exact current HTML `option`. Its owning select is
inferred only from that handle and revalidated. Unsupported or native surfaces
return a typed interaction error. None of these tools use operating-system
input. Since native options are normally hidden, discover their refs with
`tauri_snapshot` using `visibleOnly: false` and `roles: ["option"]`.

### `tauri_close`

Input is an empty object.
Closing an already-closed or absent session succeeds with `alreadyClosed: true`.

## Error contract

Every expected tool failure returns an MCP tool error with structured data:

```json
{
  "code": "STALE_ELEMENT_REF",
  "message": "Element reference e2-4 is no longer valid.",
  "phase": "interaction",
  "retryable": true,
  "suggestion": "Call tauri_snapshot and retry with a current reference."
}
```

Stable v1 codes:

- `PROJECT_NOT_FOUND`
- `UNSUPPORTED_TAURI_VERSION`
- `CONFIG_INVALID`
- `INTEGRATION_INCOMPLETE`
- `PLATFORM_UNSUPPORTED`
- `BACKGROUND_UNAVAILABLE`
- `PORT_UNAVAILABLE`
- `APP_START_FAILED`
- `WEBDRIVER_NOT_READY`
- `SESSION_CREATE_FAILED`
- `SESSION_NOT_ACTIVE`
- `SESSION_ALREADY_ACTIVE`
- `WINDOW_NOT_FOUND`
- `STALE_ELEMENT_REF`
- `ELEMENT_NOT_FOUND`
- `ELEMENT_HIDDEN`
- `ELEMENT_DISABLED`
- `ELEMENT_NOT_INTERACTABLE`
- `UNSUPPORTED_KEY`
- `UNSUPPORTED_ACTION`
- `SCREENSHOT_FAILED`
- `CLOSE_FAILED`
- `INTERNAL_ERROR`

Unexpected internal details and local secrets are never included in MCP error messages.
Missing, hidden, disabled, stale, incompatible, and unsupported-key failures use this same envelope with a corrective `suggestion`.

## Compatibility policy

- Public CLI names, configuration v1, MCP tool names, input fields, success fields, and error codes follow semantic versioning.
- Additive optional fields are backward compatible.
- Removing or changing a public field requires a major package version.
- The internal WebDriver mechanism is not public API.
