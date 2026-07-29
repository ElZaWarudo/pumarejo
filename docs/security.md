# Security model

## Trust boundary

pumarejo is a local developer tool for a project and OS account the operator
trusts. It does not claim isolation from a malicious process already running as
the same user. Project UI content, including instruction-shaped text, is
untrusted data and never changes tool descriptions, error guidance, commands,
or policy.

## Provider and process ownership

The optional provider is compiled and registered only with the private
`pumarejo` Cargo feature. The agent reserves a loopback port, launches one
tracked child with a private mode overlay, authenticates proxy and upstream
requests with separate random nonces, and verifies listener ancestry and
process identity before use and termination. Direct provider access is
rejected.

Windows helpers are invoked from absolute `SystemRoot` paths. Ubuntu helpers
are invoked from fixed system paths or are resolved canonically outside the
project. Child processes never use a shell, and their environment is an
allowlist that excludes credentials and unrelated variables.

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
public tools.

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
visibility, enabled state, role, kind, and input compatibility. Mutations
invalidate references. No OS input, coordinates, selectors, text search, or
desktop automation is used.

When the embedded provider cannot serialize element handles nested inside the
semantic payload, Pumarejo reconstructs them from a separately bounded W3C
handle list in provider traversal order. Window mutation fallbacks execute
fixed Tauri API scripts, compensate for native frame decoration, and confirm
the effective WebDriver rectangle. Native option selection uses a fixed script
that validates its owning visible/enabled select before dispatching input and
change events.

## Artifacts

PNG data is checked for canonical base64, signature, chunks, CRC, dimensions,
decoded-pixel budget, and size before return or persistence. The store is
confined to the configured canonical root and rejects links and replacement
races. Directories/files use POSIX 0700/0600 or a protected Windows DACL with
only the current SID. Manifests are size-bounded and durable; interrupted
stores are recovered on the next start.

Default close deletes screenshots and temporary artifacts. Retained artifacts
remain only under the configured artifact root with the same permissions.

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
- only the configured top-level WebView and open shadow roots receive semantic
  guarantees.
