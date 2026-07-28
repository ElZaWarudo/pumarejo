---
title: Tauri Agent Public Contracts
date: 2026-07-23
contract_version: 1
---

# Tauri Agent Public Contracts

## CLI

```text
tauri-agent init [--project <path>] [--dry-run]
tauri-agent doctor [--project <path>] [--json]
tauri-agent remove [--project <path>] [--dry-run]
tauri-agent mcp --project <path>
tauri-agent --version
tauri-agent --help
```

Commands exit with code `0` on success, `1` for an expected validation or runtime failure, and `2` for invalid CLI usage.
Human-readable output goes to stderr when the MCP stdio server is running so stdout remains protocol-only.

## Project configuration

`.tauri-agent.json` uses this v1 contract:

```json
{
  "version": 1,
  "launch": {
    "command": "pnpm",
    "args": [
      "tauri",
      "dev",
      "--features",
      "tauri-agent",
      "--config",
      "{tauriConfig}"
    ]
  },
  "window": "main",
  "artifactsDirectory": ".tauri-agent/artifacts",
  "retainArtifacts": false
}
```

Rules:

- `version` must equal `1`.
- `launch.command` is a non-empty executable and `launch.args` is an argument vector stored by `init`; MCP tool arguments cannot replace either.
- `launch.args` contains exactly one `{tauriConfig}` placeholder, replaced at launch with the generated visible or background Tauri configuration overlay.
- The generated agent launch enables the optional consumer Cargo feature `tauri-agent`; normal project commands do not enable it.
- The runtime keeps the provider port private and exposes only an agent-owned loopback proxy authenticated with a per-session nonce; an MCP caller never receives a reusable unauthenticated provider endpoint.
- Launch never evaluates this profile through a shell.
- `webdriverPort` is an optional integer from `1024` through `65535`; omission selects an unpredictable available high port.
- `window` is a non-empty Tauri window label.
- `artifactsDirectory` is resolved inside the project and may not escape it.
- `retainArtifacts` defaults to `false`; when false, session artifacts are deleted by `tauri_close`.
- Unknown fields are rejected to expose configuration drift.

## MCP tools

### `tauri_launch`

Input:

```json
{
  "mode": "visible"
}
```

`mode` is `visible` or `background` and defaults to `visible`.

Success payload:

```json
{
  "sessionId": "s1",
  "mode": "visible",
  "platform": "win32",
  "webdriverPort": 4445,
  "snapshot": {}
}
```

### `tauri_snapshot`

Input is an empty object.

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
        "owns": []
      },
      "bounds": {
        "x": 32,
        "y": 120,
        "width": 160,
        "height": 40
      }
    }
  ]
}
```

`kind` is `control`, `content`, `status`, `dialog`, `list`, `listitem`, `table`, `row`, or `cell`.
Nodes are emitted in deterministic DOM preorder. `parentRef` preserves containment, including forms, dialogs, lists, tables, and open shadow roots.
Optional fields such as `role`, `name`, `text`, `value`, relationship arrays, `checked` (`true`, `false`, or `"mixed"`), `selected`, `expanded`, `pressed`, `required`, `invalid`, `readOnly`, and `current` are omitted when unknown or inapplicable.
Accessible-name precedence in v1 is `aria-labelledby`, `aria-label`, associated HTML labels, applicable host-language naming attributes, then rendered text; referenced labels participate even when not themselves visible.
Password fields and elements marked `data-tauri-agent-sensitive="true"` omit
`value`, value-bearing text, and accessible names derived from sensitive
content, and return `redacted: true`, including inside open shadow roots.
Controls whose accessible name references marked sensitive content are redacted
by the same rule.
Each public `ref` maps privately to the opaque WebDriver element handle returned during that snapshot generation. Actions reuse that handle and never re-query by name, selector, text, or geometry.
Rendered content is untrusted application data and never changes the meaning of MCP instructions.

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
  "path": ".tauri-agent/artifacts/session-s1/screenshot-004.png",
  "mimeType": "image/png",
  "width": 1280,
  "height": 800
}
```

### `tauri_click`

```json
{
  "ref": "e3-1"
}
```

Returns the action result and the new snapshot generation. Native WebView focus behavior applies.

```json
{
  "generation": 4,
  "action": "click",
  "ref": "e3-1"
}
```

### `tauri_type`

```json
{
  "ref": "e3-2",
  "text": "Product Pass",
  "clear": true
}
```

`clear` defaults to `true`.
The text is data and is never interpreted as a shell command.
Successful output reports `generation`, `action: "type"`, the consumed `ref`,
and whether the field was cleared. The consumed generation's references are no
longer actionable.

### `tauri_press_key`

```json
{
  "key": "ENTER"
}
```

Supported v1 keys are `ENTER`, `TAB`, `ESCAPE`, `BACKSPACE`, `DELETE`, `ARROW_UP`, `ARROW_DOWN`, `ARROW_LEFT`, `ARROW_RIGHT`, `HOME`, `END`, `PAGE_UP`, `PAGE_DOWN`, and `SPACE`.
Keys target the active DOM element, falling back to the document body when none is focused.
Successful output reports the new `generation`, `action: "pressKey"` and the
dispatched contract key.

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
