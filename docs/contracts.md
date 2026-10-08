---
title: pumarejo Public Contracts
date: 2026-07-23
contract_version: 1
---

# pumarejo Public Contracts

## Provider staging contract

The published package contains one explicit provider bundle. Initialization is
read-only in planning and dry-run modes. Apply creates only regular files
inside `.pumarejo/provider/tauri-plugin-wdio-webdriver`; every file is bounded,
canonical, and attributed as
`provider:tauri-plugin-wdio-webdriver:<source-relative-path>`.

The Cargo integration is optional and debug-feature gated. Its path is always
the project-relative `../.pumarejo/provider/tauri-plugin-wdio-webdriver`; an
absolute path or an unproven external provider is not a valid integration.
Repeated init, doctor, and remove require the complete ordered manifest and
reject missing, changed, linked, malformed, or foreign provider content.

When a Tinto dependency already exists as
`tauri-plugin-wdio-webdriver = { version = "1.2.0", optional = true }`, init adds
only the attributed relative path projection and marker so the original dependency
bytes and the existing `e2e-wdio` feature are preserved byte-for-byte. On remove,
the same bytes are restored exactly when unchanged, and only foreignly attributed
or drifted sections block removal.

Cargo attribution may also contain one bounded EOL token: `eol:cargo:lf` or
`eol:cargo:crlf`. Init records it only when the source Cargo file uses one
uniform style and adds exactly one matching removable marker,
`# <pumarejo:cargo-eol:lf>` or `# <pumarejo:cargo-eol:crlf>`. A uniform current
file must retain exactly one known token and its matching marker, while mixed or
unsupported line endings receive neither. A created dependency attribution is
valid only with the single generated Cargo marker immediately followed by one
canonical inline declaration containing exactly `path`, `version`, and
`optional` keys. After an external whole-file normalization, remove accepts a
uniform current file, removes only the attributed projections and EOL marker,
and restores the recorded style. Missing, duplicate, or unknown EOL tokens or
markers on uniform files, EOL tokens or markers on mixed files, foreign
dependency keys, missing markers, and changed owned projections fail closed.

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
  "initialWindow": { "width": 1280, "height": 800 },
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
- Loopback readiness is family-aware. IPv4 (`127.0.0.1`) remains the default;
  IPv6 uses bracketed `::1` URLs and is accepted only when reservation,
  listener probing, and process ownership proof agree on IPv6.
- `window` is a non-empty Tauri window label.
- `initialWindow`, when present, is an additive bounded `{width,height}`
  request from `200` through `8192`; launch reports the requested and
  observed effective dimensions. Omission preserves existing behavior.
- `artifactsDirectory` is resolved inside the project and may not escape it.
- `retainArtifacts` defaults to `false`; when false, `tauri_close`
  quarantines session artifacts and completes deletion only through an
  identity-bound native adapter. Without one, cleanup remains retryable and
  bytes are preserved.
- Recovery preserves active, unclosed, foreign, malformed, and ownership-unproven
  manifests. Non-retained crash residue is deleted only after an explicit
  orphan/non-active ownership proof; retained cleanup requires an explicit
  finite policy and affirmative ownership metadata.
- Unknown fields are rejected to expose configuration drift.

The private integration manifest uses schema version `2` and records the
Pumarejo package version and Tauri WebDriver plugin version. `doctor` checks
those values against the installed Cargo integration and current CLI.
Canonical schema-v1 integrations remain removable, and rerunning `init`
migrates an intact v1 integration or refreshes version-only drift to v2.

`doctor` treats the attributed projections in the applied manifest as the
authority for integration drift. Unrelated edits outside the generated Rust
marker/wrapper, attributed Cargo dependency or feature values, the marked
`.gitignore` entry, and the integration-owned `.pumarejo.json` fields remain
ready; the recorded full-file hashes are secondary evidence. Missing,
duplicated, malformed, linked, or otherwise unsafe owned content is reported
as drift/error and is never repaired by `doctor`. The isolated
`.pumarejo/agent-capability.json` must contain exactly the generated
`pumarejo-agent` identifier, the initialized window label, and the ordered
permissions in the current `AGENT_PERMISSIONS` list (including
`wdio-webdriver:allow-request-dialog`); wildcard windows, extra or reordered
permissions, and extra keys are rejected.

## MCP tools

### Tool set and context budget

`pumarejo mcp` exposes ten tools by default: `tauri_launch`, `tauri_status`,
`tauri_snapshot`, `tauri_screenshot`, `tauri_diagnostics`, `tauri_click`,
`tauri_type`, `tauri_press_key`, `tauri_select_option`, and `tauri_close`.
`--tools all` adds `tauri_surface_discover`, `tauri_surface_select`,
`tauri_surface_coverage`, `tauri_dialog`, `tauri_window`, `tauri_pointer`,
`tauri_scroll`, and `tauri_sequence`. The server sends usage instructions in
the MCP `initialize` result and marks observation tools `readOnlyHint: true`.

Results are sized for an agent's context. The text content of
`tauri_snapshot` and `tauri_launch` is an indented outline; the text content
of click, type, key, and option actions lists what changed. Their
`structuredContent` carries metadata (generation, window, truncation, node and
change counts) but not the node list. `format: "json"` on `tauri_snapshot`
returns the full node data described below.

### Reference stability

Each snapshot offers the current table's element handles back to the browser
collector, which reports which elements are the same DOM objects. Those
elements keep their public ref (for example `e3-7` stays `e3-7` at generation
5); new elements receive refs named after the generation that created them.
Matching uses object identity only, never labels, selectors, or geometry, and
every action still re-checks the element's semantic identity before
dispatch. A ref whose element is gone fails with `STALE_ELEMENT_REF`. After a
full page reload, previous handles no longer exist and every element receives
a new ref.

### Truthful native control (RDM-014)

The runtime probes the authenticated provider's dedicated
`/pumarejo/window-capabilities` route before treating initial sizing as
effective. A window action is successful only after a fresh window-rect read
verifies the postcondition. Provider absence, denial, incompatibility, or
uncertainty remains a bounded capability state; static tool presence is not
capability evidence.

Native dialog detection and decisions use a separate authenticated provider
boundary. Existing WebDriver alert endpoints are not treated as Tauri-dialog
support. Metadata is bounded before evidence projection, and a private random
launch-scoped grant binds an explicit accept/cancel decision to the current
session, process, nonce, surface, generation, and dialog instance. The grant
is consumed once; timeout, replay, mismatch, and provider uncertainty never
choose a button. The additive `tauri_dialog` operation exposes only the bounded
detection/decision projection. `detect` is observational; `accept` and
`cancel` require `authorize:true` and an effective current `surfaceRef` and
`generation` binding. Omitted binding fields derive from the active snapshot;
explicit stale or foreign bindings fail closed without returning current or
private binding values.

### `tauri_dialog`

Input is `{ "action": "detect|accept|cancel", "surfaceRef"?,
"generation"?, "authorize"? }`. The strict schema rejects unknown fields and
keeps action, reference, generation, and authorization bounds explicit. The
result contains only capability state, a stable bounded code, the requested
action for decisions, and sanitized dialog title/message/buttons. Provider
identifiers, grants, nonces, paths, and raw causes are never returned.

The original observation and interaction tools remain compatible. RDM-013 adds
three bounded surface operations for the one owned session; clients that do
not call them continue to observe the configured primary window as before.

### `tauri_surface_discover`

Input is `{ "refresh": true }`; `refresh` defaults to `true`. The result is a
bounded graph with an opaque `surfaceRef`, non-actionable correlation
`identity`, parentage, lifecycle, dimensions, active state, and per-operation
capability evidence. Capability states are limited to `supported`,
`unsupported`, `unavailable`, `denied`, and `failed`, each with a stable code
and bounded sanitized evidence. Provider ports, nonces, URLs, raw handles, and
application-sensitive content never cross the MCP boundary. Refreshing
discovery increments graph generation.

### `tauri_surface_select`

Input is `{ "surfaceRef": "s1-...", "graphGeneration": 1 }`. Selection
requires a current graph generation and a surface whose selection capability is
`supported`; stale, foreign, denied, unavailable, or unsupported surfaces fail
closed. A successful selection returns the graph and a fresh snapshot whose
`surface` field contains only the bounded surface reference, identity, and kind.
All element refs from the prior surface are invalidated before the fresh
generation is published.

### `tauri_surface_coverage`

Input is an empty object. The operation compares validated screenshot size with
provider-reported bounded surface regions and current semantic coverage. It
returns `covered`, `gap`, or conservative `coverage_unknown` status plus a
bounded list of surface-owned non-actionable gap evidence. It never returns
OCR, selectors, coordinates, screenshot bytes, or an interaction fallback.

### `tauri_diagnostics`

This additive read-only operation queries finite sanitized evidence for the
currently owned session. Its input is an optional `sources` array (limited to
`console`, `process_stdout`, `process_stderr`, `invocation`, `phase`, and
`last_error`), an optional current `surfaceRef`, and bounded `maxRecords` and
`maxBytes` limits. The result contains stable chronological records, a latest
error projection, explicit capability outcomes, and truncation/eviction
metadata. Capability states are exactly `supported`, `unsupported`,
`unavailable`, `denied`, and `failed`, with stable codes and bounded evidence.

Diagnostic records are sanitized before entering the in-memory ring buffer;
secrets, sensitive content, paths, provider identifiers, arguments, and raw
causes are never stored or returned. The console source reports
`unsupported` unless an approved provider console boundary is proven. A
foreign surface returns `denied` with no records. Existing tools remain
unchanged when this query is not called.

The buffer has finite count and byte limits and evicts oldest records first.
Buffers are memory-only and cleared when the owned session closes. Retention
requires an explicit bounded opt-in sink and never infers a cleanup or deletion
policy.

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
  "maxDepth": 128,
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

`format` (`"outline"` or `"json"`, default `"outline"`) and `maxChars`
(`500` through `60000`, default `8000`) control presentation only. The outline
renders one line per node, such as
`- textbox "Message" [e3-2] (focused, required): "Hello"`, shows only states
that differ from the default, omits bounds, and drops text spans that repeat
their parent's label. When it exceeds `maxChars`, subtrees collapse from the
leaves upward into one line:
`- list "History" [e1-9] … 120 items, 0 controls hidden (expand: rootRef "e1-9")`.
Dialogs, alerts, and status regions collapse last.

Every field is optional. Defaults are `maxNodes: 500`, `maxDepth: 128`,
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
  "snapshotAfter": false,
  "settleMs": 250
}
```

All action tools accept `snapshotAfter` (default `false`) and `settleMs`
(default `250`, range `0` through `2000`). Mutation, settling, effect
classification, and the post-action snapshot share the serialized observation
boundary. The result always includes `changes` when both observations are
comparable: added and removed node lines plus changed fields per surviving
ref, capped at 40 lines with a count of the rest. Redacted values never appear
in changes. `snapshotAfter: true` also returns the full post-action outline.

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
semantic observation taken after `settleMs`. Refs of elements that survive the
action keep their names and remain actionable in the new generation; refs of
removed elements fail with `STALE_ELEMENT_REF`.

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
{ "ref": "e5-14", "label": "Claude Code" }
```

Snapshots list every `option` of a visible `select` as a child node with its
own ref, label, value, and `selected` state, even though a closed select lays
out no option boxes. Pass either an option ref, or the select's ref with
exactly one of `value` (exact option value) or `label` (exact visible label).
A select ref without a match fails with `ELEMENT_NOT_FOUND`; a value or label
on an option ref fails with `ELEMENT_NOT_INTERACTABLE`.

The option is selected and the select then dispatches bubbling `input` and
`change` events, as a user choice does, so framework listeners such as React's
`onChange` update their state. Hidden or disabled selects and options fail with
typed errors. None of these tools use operating-system input.

### `tauri_sequence`

`tauri_sequence` is additive. It accepts a starting `generation`, one to 32
strict steps, `maxSteps` (default 8), and one wall-clock `timeoutMs` (default
10000, maximum 30000). Step kinds are `click`, `type`, `pressKey`, `pointer`,
`scroll`, `selectOption`, and bounded `wait`. Target actions require an exact
current ref; sequence key dispatch additionally requires the ref to be the
current actionable focus. Window and dialog operations are excluded.

The runtime validates the complete request before dispatch and retains the
session FIFO for the whole sequence. A rejection stops by default; a state
change or uncertain effect stops immediately and marks later steps `not_run`.
The result reports only bounded status/effect/reason/timing evidence and at
most one final `snapshotAfter`. Typed text, provider handles, raw causes, and
intermediate snapshots are never returned. After any attempted `type` step the
final snapshot is omitted as well, so application reflection cannot echo the
typed value through text, values, accessible names, or the window title.
Deadline signals propagate through the internal interaction port; the runtime
keeps its FIFO until that port confirms completion or cancellation, so a timed
out mutation cannot continue after the sequence response.

### `tauri_close`

Input is an empty object.
Closing an already-closed or absent session succeeds with `alreadyClosed: true`.

For non-retained artifacts, `tauri_close` first moves the owned session
manifest and bytes into a private quarantine, then deletes exactly the files the
quarantined manifest names, one at a time, after re-checking each identity. It
never deletes recursively. A quarantine holding anything unexpected (extra
entries, links, unmanifested files) is preserved and reported as residue:

```json
{
  "alreadyClosed": false,
  "state": "idle",
  "residue": [
    {
      "resource": "artifacts",
      "path": ".pumarejo/artifacts/.quarantine-AbC123",
      "reason": "Quarantined artifacts contain unexpected content and were preserved."
    }
  ]
}
```

Artifact residue never blocks close or the next launch; the next MCP start
retries it, and `doctor` reports any quarantine that remains. A process,
listener, proxy, or WebDriver session that cannot be released fails with
`CLOSE_FAILED` and a `pending` list naming each held resource; the reason is
recorded in `tauri_diagnostics` (`session_cleanup_failed`). `tauri_launch`
retries that cleanup before starting and fails with the same `CLOSE_FAILED`
while it is still pending.

## Self-diagnostic CLI

`pumarejo doctor --self [--json]` is additive and independent from project
doctor mode. It emits the ten stable `self.*` diagnostic identities for package
metadata, paths/links, dependency and lock/bin coherence, Node/package-manager
compatibility, host/child comparison, and shared bounds. The command is
read-only: actions are manual guidance and never run an install, repair,
lifecycle script, or cleanup.

Toolchain diagnostics consume only already-resolved, structured RDM-017
evidence. When effective child evidence is absent—or Windows cannot prove the
required identity—the result remains `warn`/unknown and is never promoted to
ready. Human and JSON projections contain bounded logical subjects, versions,
sources, counts, reason codes, and actions; executable paths, environment
values, command arguments, and raw subprocess output are excluded.

Windows process custody is an internal launch contract. The packaged bridge
creates the target suspended, configures and assigns a kill-on-close Job Object,
verifies the expected creation identity, and resumes only after that barrier is
complete. Cleanup uses the retained opaque Job handle and bounded framed
control. The helper control stream is isolated from target stdin/stdout/stderr;
target output is emitted as bounded, tagged diagnostic frames and cannot resolve
a control request. The helper remains live across inspect and termination and
waits on the target handle for convergence; helper exit is not target-exit
evidence. Explicit release or helper EOF/controller loss closes the Job. Native capability is
supported only after a successful probe. Raw-PID validated-tree cleanup is
diagnostic-only, never a release-grade support claim, and PID-based reattach is
not permitted after an ambiguous controller loss.

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

Window-action failures preserve the legacy top-level `code: "UNSUPPORTED_ACTION"`
and add one optional `windowActionCode` discriminator:

- `WINDOW_ACTION_UNSUPPORTED`
- `WINDOW_ACTION_DENIED`
- `WINDOW_ACTION_UNAVAILABLE`
- `WINDOW_ACTION_FAILED`
- `WINDOW_ACTION_POSTCONDITION_FAILED`

## Compatibility policy

- Public CLI names, configuration v1, MCP tool names, input fields, success fields, and error codes follow semantic versioning.
- Additive optional fields are backward compatible.
- Removing or changing a public field requires a major package version.
- The internal WebDriver mechanism is not public API.
