# Compatibility

## Declared v1 profile

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

## Prototype evidence

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

## Explicit exclusions

- macOS and non-Ubuntu Linux distributions
- mobile targets
- multiple simultaneous sessions or multiple controlled windows
- closed shadow roots, native menus, system dialogs, browser chrome, and
  out-of-process surfaces
- coordinate, selector, OCR, or operating-system input fallback
- isolation from malicious code already executing as the same OS user

Unsupported or ambiguous project layouts fail before mutation. Unsupported
interaction surfaces remain screenshot-observable when rendered but have no
semantic-action guarantee.
