# Compatibility

## Declared v1 profile

Provider delivery is tarball-portable. A consumer installed from the packed
artifact receives the complete modified provider source and can initialize a
copied Tauri fixture without a repository `vendor` directory or an externally
published modified crate. The generated Cargo path is relative to the
consumer project and is valid on the supported Windows and Ubuntu profiles.

| Surface          | Supported profile                                                        |
| ---------------- | ------------------------------------------------------------------------ |
| Node.js          | 22.x and 24.x                                                            |
| Tauri            | 2.x; exact minimum/latest boundary must be recorded at publication       |
| Rust             | stable toolchain                                                         |
| Windows          | Windows 11, current supported image at publication                       |
| Linux            | Ubuntu 24.04 LTS native or dedicated VM at publication                   |
| Windows WebView  | WebView2 supplied by the certified Windows image                         |
| Linux WebView    | WebKitGTK supplied by Ubuntu 24.04                                       |
| Package managers | pnpm, npm, yarn, bun, deno tasks, or Cargo when detection is unambiguous |
| Tauri config     | JSON, JSON5, or TOML supported fixture shapes                            |
| Windows modes    | visible and monitored background window                                  |
| Linux modes      | visible X11/WSLg and authenticated owned Xvfb background display         |

Windows managed process custody requires the host's native Job Object APIs and
the packaged PowerShell/.NET bridge. Hosts that cannot pass the kill-on-close
capability probe are reported as custody-unavailable; the legacy validated-tree
raw-PID path is not release-grade. Linux retains its existing process-group
custody behavior. The bridge is package-portable and has no runtime download or
external modified-crate dependency. Managed Windows target stdin is an
EOF-capable non-control stream; stdout and stderr are bounded through the
bridge's tagged output seam while helper control remains available until
release. A target termination result is reported only after the held target
handle signals; helper exit alone is never treated as target exit.

## Prototype evidence

RDM-014 adds an optional bounded initial window size and verifies effective
dimensions after provider actions. The dedicated capability probe is
provider-dependent: the current vendored WebDriver fixture exposes browser
alert plumbing but not the RDM-014 Tauri-dialog boundary, so it is reported
truthfully as unsupported rather than promoted to native-dialog support.
Provider-specific supported dialog evidence requires a fixture implementing
the explicit capability, finite-metadata, decision, and postcondition routes.

The implementation matrix uses Node 22.23.1, Node 24.12.0, Rust stable MSVC on
Windows build 26200, and Ubuntu 24.04.4 WSL2/WSLg. The user-approved exception
is `USER-2026-07-27-WINDOWS-WSL`. It proves feasibility and cross-platform
behavior for this build; it does not broaden or replace the published support
claim.

The RDM-012 Windows run additionally certifies the independent public
12-tool journey on the real WebView: bounded/redacted semantics, ARIA
relationships and states, focus-only behavior, key chords, exact outer-window
sizes at 640×480, 800×600, and 1920×1032, native option selection, and
idempotent cleanup. This run remains prototype evidence under the same
exception; the native Windows and native/dedicated-VM Ubuntu publication gates
remain unchanged.

Launch resolution supports an explicit absolute executable, up to 16 absolute
`PATH` prefixes, and the documented Rust/C compiler environment allowlist.
No shell-based package-manager fallback is supported.

`build.devUrl` is read from JSON, JSON5, and TOML at the trusted configuration
boundary. Only sanitized HTTP loopback family/port facts are propagated to
launch comparison; credentials, paths, query strings, and raw configuration
values are never propagated.

## Explicit exclusions

- macOS and non-Ubuntu Linux distributions
- mobile targets
- multiple simultaneous sessions (multiple provider surfaces remain bounded to
  one owned session)
- closed shadow roots, native menus, system dialogs, browser chrome, and
  out-of-process surfaces
- coordinate, selector, OCR, or operating-system input fallback
- isolation from malicious code already executing as the same OS user

Unsupported or ambiguous project layouts fail before mutation. Unsupported
interaction surfaces remain screenshot-observable when rendered but have no
semantic-action guarantee.

RDM-013 surface evidence is additive to the 12-tool baseline. Discovery and
selection expose top-level provider windows plus provider-observable nested
panel/open-shadow contexts. Reachable iframe contexts are selectable only when
exact frame commands are available; closed, cross-origin, or otherwise
unreachable contexts remain explicit non-actionable gaps. Coverage diagnostics
use provider region maps and return `coverage_unknown` when geometry is
inconclusive.

RDM-018 adds `tauri_sequence` without changing any existing tool schema or
result. Sequence support composes only the effective semantic interaction
operations already available for the owned provider; unsupported operations
remain explicit failures and are never emulated with window, dialog,
coordinate, selector, JavaScript, shell, or operating-system input fallbacks.

## Artifact cleanup boundary

The explicit retention evaluator is supported when supplied a valid
RDM-016-backed proof that the candidate is owned and inactive. Missing,
malformed, active, conflicting, or failing proof preserves the candidate.

Without a native deletion adapter, non-retained quarantines are removed file by
file: only paths named by the quarantined manifest, each re-checked as a
regular file, never a recursive delete. A quarantine with unexpected content is
preserved and reported as residue; retained artifacts are never deleted
implicitly.
