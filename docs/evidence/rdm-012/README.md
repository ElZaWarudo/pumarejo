# RDM-012 actionable setup and real-usage evidence

Status: implementation evidence; release publication not authorized.

This directory records sanitized, reproducible claims only. Exact command
output remains in the Codex task record. No username, absolute workspace path,
application transcript, token, nonce, screenshot, or credential is stored
here.

## Setup and diagnostics

- Doctor integration tests cover missing, not detected, not on effective
  `PATH`, explicitly configured, and successful-launch-verified states.
- Human and JSON diagnostics share stable identities and redact secrets and
  full executable paths.
- Config tests cover absolute executable validation, bounded `PATH` prefixes,
  environment allowlisting, and precedence.
- CLI integration tests snapshot copyable stdout-only configuration for Codex,
  Claude Code, and Cursor and prove no host settings are written.
- Integration tests detect drift among CLI, manifest schema v2, Cargo plugin,
  and generated capability permissions.

## Ten-criterion trace

| Criterion                                     | Sanitized proof surface                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. Massive content remains bounded            | browser/snapshot budget tests, independent MCP contract journey, real Windows public journey |
| 2. Sensitive content is redacted              | browser taint/redaction tests and real public journey                                        |
| 3. Launch may exceed 30 seconds               | pending/status lifecycle tests keep the owned launch alive beyond the public wait bound      |
| 4. Cancel, repeated close, zero owned residue | session cleanup tests and real idempotent close                                              |
| 5. Tab and modified key chord                 | interaction tests and real `CONTROL+SHIFT+D` journey                                         |
| 6. Three viewports                            | real confirmed 640×480, 800×600, and 1920×1032 outer rectangles                              |
| 7. Focus-only action                          | real action result is `focus_only` with no semantic mutation                                 |
| 8. ARIA state and relationships               | real current/pressed/controls/described-by snapshot assertions                               |
| 9. Successful launch qualifies doctor         | launch-verification reconciliation integration tests                                         |
| 10. Atomic action plus fresh references       | interaction generation tests, independent MCP journey, and real native-option selection      |

Structured error contracts separately exercise snapshot limits, launch
timeout, missing window, stale reference, no bounded observable effect, and
partial cleanup while preserving bounded evidence.

## Platform disposition

The real RDM-012 public journey and raw semantic extractor proof pass on the
recorded Windows prototype environment with Rust stable MSVC and the fixture
WebView. Existing Node 22/24 and Ubuntu prototype evidence remains under
`USER-2026-07-27-WINDOWS-WSL`. Native Windows and native/dedicated-VM Ubuntu
certification remain publication gates and are not claimed by this document.

## Local closeout

- Build, typecheck, lint, and formatting checks pass.
- The complete Node 24 suite passes with 406 tests and 16 expected
  platform-gated skips.
- Package contents pass `npm pack --dry-run --json`; npm was supplied through
  a temporary `pnpm dlx` because the bundled workspace runtime does not include
  an npm executable.
- The independent Windows public journey and raw semantic extractor proof both
  pass after review fixes.
- The post-run audit found no live owned process and no current runtime
  directory. Three stale pre-validation runtime directories were removed.
