# Security model

## Trust boundary

pumarejo is a local developer tool for a project and OS account the operator
trusts. It does not claim isolation from a malicious process already running as
the same user. Project UI content, including instruction-shaped text, is
untrusted data and never changes tool descriptions, error guidance, commands,
or policy.

## Provider and process ownership

The modified provider is delivered as a bounded, attributable package asset.
The allowlist is explicit and excludes target output, VCS data, caches,
unneeded lockfiles, symlinks, and unrelated files. Consumer Cargo points only
to the generated project-relative staging directory; no repository, user,
temporary, registry, or node_modules path is written into a target project.

Provider staging is fail-closed. Doctor and remove enumerate the staged tree
without following links and require an exact one-to-one match with the 46
manifest entries. Drift, a foreign file, a replacement link, or a malformed
attribution prevents all removal mutation. Removal deletes only unchanged
manifest-attributed regular files and then attempts empty parent directories;
it never performs recursive deletion.

Existing Tinto projects are accepted for init only when the inline dependency is
exactly `tauri-plugin-wdio-webdriver = { version = "1.2.0", optional = true }`
with an existing `e2e-wdio` feature and an unambiguous shape. Any path, git,
registry, alias, version drift, duplicate, or malformed variation fails closed
before writes and keeps removal unable to proceed.
For accepted projects, remove restores the original dependency bytes exactly after
stripping only the attributed path marker/projection.

Cargo EOL provenance is bounded to one of `eol:cargo:lf` or `eol:cargo:crlf` and
one matching generated marker (`# <pumarejo:cargo-eol:lf>` or
`# <pumarejo:cargo-eol:crlf>`); the manifest never stores Cargo content, paths,
diffs, or line maps. Removal normalizes only a uniform current Cargo file to
that recorded convention after owned dependency, feature, and marker
projections validate, then removes only the owned marker. Uniform current
content must carry exactly one known EOL token and matching marker; mixed or
unsupported current content must carry neither and is never normalized.
Created dependencies additionally require exactly the generated marker, its
single canonical inline declaration, and only `optional`, `path`, and `version`
keys. Missing, duplicate, or unknown EOL attribution or markers, foreign
dependency keys, marker forgery, and projection drift are rejected without
writes, preserving unrelated developer text.

RDM-014 keeps native control behind the authenticated loopback provider. The
window capability probe and dialog detection/decision routes are explicitly
allowlisted by the proxy; arbitrary Tauri commands, operating-system input,
and the provider's browser-alert endpoints are not reachable through this
boundary. A missing provider route is reported as unsupported or unavailable,
not as guessed support.

Dialog authority is generated per launch and retained only in the private
session controller. It is bound to the owned session and process, both
nonces, active surface, current generation, allowed action, and dialog
instance, then consumed once. MCP-facing evidence contains only bounded
sanitized title/message/buttons and stable outcome codes; grant material,
nonces, provider IDs, paths, and raw causes never cross the serialization
boundary. A failed or uncertain decision leaves the dialog unresolved. The
additive `tauri_dialog` tool keeps detection observational and requires
explicit `authorize:true` for accept/cancel. Omitted surface and generation
fields derive from the active snapshot, while explicitly stale or foreign
bindings fail closed without echoing current or private values.

The optional provider is compiled and registered only with the private
`pumarejo` Cargo feature. The agent reserves a loopback port, launches one
tracked child with a private mode overlay, authenticates proxy and upstream
requests with separate random nonces, and verifies listener ancestry and
process identity before use and termination. Direct provider access is
rejected.

Readiness probes bind the requested loopback family to the reservation,
listener probe, provider ancestry proof, and authenticated proxy. IPv4 remains
the compatibility default; an IPv6 or foreign-family mismatch fails closed.

Windows helpers are invoked from absolute `SystemRoot` paths, but the helper
source itself is embedded in the package and is never downloaded or resolved
from an ambient checkout. Managed Windows launches use a bounded framed
PowerShell/.NET bridge: the target starts suspended, the bridge configures a
kill-on-close Job Object, assigns and verifies the target creation identity,
then resumes it. EOF, malformed control, helper loss, or controller loss
closes the Job. Target standard handles are separate from the helper control
stream, and target output is wrapped in bounded tagged frames before it reaches
the Node output seam; target bytes cannot spoof a pending control response.
Termination waits for the target handle to signal while retaining the helper
for subsequent control or explicit release. Ubuntu helpers are invoked from fixed system paths or are
resolved canonically outside the project. Child processes never use a shell,
and their environment is an allowlist that excludes credentials and unrelated
variables.

Project launch configuration may add an absolute executable, absolute `PATH`
prefixes, and only the documented Rust/C toolchain variables. Precedence is
internal session values, explicit project values, sanitized host values, then
defaults. `doctor` reports only executable basenames, allowlisted/redacted
arguments, provenance, and confidence. Its successful-launch record contains
only package/plugin versions, platform, executable basename, and a verified
flag.

`init` derives `.pumarejo/agent-capability.json` without changing the source
application capability. The runtime validates and embeds that capability only
in its private Tauri overlay. It grants the WebDriver plugin and the exact
window resize/maximize/maximized-state/unmaximize permissions required by the
public tools, plus the explicit `wdio-webdriver:allow-request-dialog`
permission used by the current native-dialog boundary. The isolated file is
validated as an exact identifier/window/ordered-permission projection; wildcard
windows, extra or reordered permissions, malformed JSON, and unsafe links fail
closed.

The applied integration manifest keeps full-file hashes as secondary evidence
and attributes only generated Rust, Cargo, `.gitignore`, capability, and
`.pumarejo.json` projections. `doctor` tolerates unrelated user edits while
classifying changed or unprovable owned content as drift/error. It is
diagnostic-only and does not rewrite, restore, or repair any file after a
drift finding.

Linux background mode owns an Xvfb server and a mode-0600 Xauthority file with
a random MIT-MAGIC-COOKIE. In the accepted WSL environment, the WSLg X socket
directory is not suitable for a private Unix socket, so Xvfb uses its
authenticated TCP transport. The display, credentials, process, and temporary
directory are destroyed with the session.

## Observation and interaction

The browser extractor enforces node, text, relationship, traversal, and output
budgets. Sensitive inputs and nodes marked `data-pumarejo-sensitive` are
redacted in the WebView before serialization. Accessible-name dependencies are
taint-tracked across labels, descendants, ownership, slots, and open shadow
roots.

Opaque references identify exact W3C element handles for one snapshot
generation. Actions revalidate generation, element identity, ownership,
visibility, enabled state, role, kind, and input compatibility. Proven changes
and uncertain effects invalidate references; a comparable proven no-change
preserves them. No OS input, coordinates, selectors, text search, or desktop
automation is used.

`tauri_sequence` validates every strict step before dispatch, keeps the session
FIFO for the entire batch, and stops on rejection, generation change, timeout,
cancellation, or uncertain effect. Sequence key input is bound to the exact
current focused ref. Per-step results never echo typed text, handles, causes,
paths, nonces, provider payloads, or intermediate snapshots; only one final
actionable snapshot may cross the boundary. A sequence that attempts typing
omits that final snapshot to prevent the application from reflecting typed
content through another semantic or window field.
Timeout cancellation remains inside the session FIFO until the internal
WebDriver interaction settles; the runtime never detaches an in-flight
mutation merely to return at the public deadline.

Surface refs are independently bounded graph identities tied to one owned
session and graph generation. Discovery and selection never disclose provider
window handles, frame URLs, ports, nonces, or raw element IDs. A surface from a
stale graph, another session, or an unsupported/denied provider context fails
closed. Capability output uses only the explicit state matrix
`supported`/`unsupported`/`unavailable`/`denied`/`failed` with stable codes and
bounded evidence.

When the embedded provider cannot serialize element handles nested inside the
semantic payload, Pumarejo reconstructs them from a separately bounded W3C
handle list in provider traversal order. Window mutation fallbacks execute
fixed Tauri API scripts, compensate for native frame decoration, and confirm
the effective WebDriver rectangle. Native option selection uses a fixed script
that validates its owning visible/enabled select before dispatching input and
change events. Screenshot-to-semantics diagnostics accept only
provider-reported bounded regions; inconclusive geometry produces
`coverage_unknown` and never authorizes OCR or coordinate interaction.

Runtime diagnostics use a separate sanitize-before-store boundary. Only
allowlisted console/process/invocation/phase/error fields enter the finite
session ring buffer; secrets, sensitive content, paths, arguments, provider
identifiers, and raw causes are discarded or redacted before storage. The
console source is explicitly `unsupported` without a proven provider boundary,
and a foreign surface receives `denied` evidence with no records. Count and
byte eviction are oldest-first and deterministic. Diagnostic buffers are
memory-only and cleared at close; retained records require an explicit,
bounded protected sink and do not infer deletion policy.

## Artifacts

`doctor --self` uses the same canonical-root, per-component no-follow, verified
handle-read, and shared entry/depth/byte budgets for package, lockfile,
dependency-manifest, and binary metadata. It never imports inspected code or
executes package lifecycle scripts. Missing or unsafe required objects are
errors; identity/link uncertainty is retained as a warning, and a reached
budget is an explicit `self.report.bounds` error rather than silent
truncation. Native Windows custody is supported only after a successful native
capability probe with `killOnClose=true`. The held Job handle is the destructive
target; the legacy validated-tree/raw-PID path cannot establish supported
release-grade custody and is reported unavailable. A Job cannot be safely
reattached by a PID after controller loss, so ambiguous recovery remains
retryable.

The doctor does not resolve `PATH` or spawn toolchain probes. It accepts only
bounded structured evidence from the reviewed portable-runtime resolver and
otherwise reports compatibility as unknown. Sanitization drops paths,
environment values, arguments, stderr, and arbitrary resolver fields before
human or JSON output.

PNG data is checked for canonical base64, signature, chunks, CRC, dimensions,
decoded-pixel budget, and size before return or persistence. The store is
confined to the configured canonical root and rejects links and replacement
races. Directories/files use POSIX 0700/0600 or a protected Windows DACL with
only the current SID. Manifests are size-bounded and durable; interrupted
stores are recovered on the next start.

Retained cleanup is eligible only after an injected RDM-016-backed proof
affirms the candidate's exact session identity, ownership, and inactive state.
Missing, active, malformed, throwing, or conflicting proof preserves the
candidate; ownership and inactivity are never inferred from manifest fields.

Cleanup moves identity-checked entries into a quarantine. Node has no portable
handle-relative recursive directory deletion, so the default runtime does not
delete that quarantine: it preserves the bytes and reports a bounded retryable
`unavailable` result. An internal identity-bound deletion adapter, if supplied
by a certified platform later, must receive and attest the validated root and
entry identities. Replacement interposition is preserved rather than deleted.
The default runtime therefore has a release/platform cleanup gap and makes no
claim of full cleanup.

## Shutdown and residual risk

All public calls share one FIFO. Cancellation aborts the active call and enters
cleanup. Disconnect and repeated signals share a single observed shutdown
promise with bounded retries; cleanup failures are reported statically on
stderr and set a failing exit code.

Residual limitations:

- same-user malicious processes are outside the isolation claim;
- the prototype host exception is not a substitute for native release
  certification;
- a persistent OS-level failure can still require `doctor` and a subsequent
  retry/recovery;
- only provider-reachable contexts with a positive capability probe receive
  semantic guarantees; other visible regions retain bounded gap evidence.
