# Release certification evidence

Status: implementation-complete candidate; publication not authorized.

## Matrix

| Gate                                                      | Windows                       | Ubuntu 24.04 WSL2/WSLg                                       | Result |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------ | ------ |
| Node 22 frozen install/build/types/lint/format/test/pack  | 22.23.1                       | 22.23.1                                                      | pass   |
| Node 24 frozen install/build/types/lint/format/test/pack  | 24.12.0                       | not required by package RU; Node behavior covered on Windows | pass   |
| Public MCP visible flow                                   | build 26200                   | 24.04.4                                                      | pass   |
| Public MCP background flow                                | build 26200                   | 24.04.4 authenticated Xvfb                                   | pass   |
| Artifact ACL/POSIX permissions and recovery               | pass                          | pass                                                         | pass   |
| Feature-enabled debug and featureless debug/release Cargo | stable MSVC                   | stable GNU                                                   | pass   |
| Correctness review                                        | independent RU1 review        | shared source                                                | pass   |
| Security review                                           | independent Security Sentinel | shared source                                                | pass   |

All OS claims in this table use exception
`USER-2026-07-27-WINDOWS-WSL`. A native Windows 11 and native/dedicated-VM
Ubuntu run remains a publication gate.

## Latest measured results

- Windows Node 22: build, typecheck, lint, format, ordinary suite and dry-run
  package inspection pass.
- Windows Node 24: the same matrix passes.
- Ubuntu Node 22: 276 ordinary tests pass and 13 host-gated tests are
  deliberately excluded from the ordinary suite.
- Real public MCP Windows: the prior visible/background matrix completes the
  public tool set and cleanup. RDM-012 adds a real independent-client journey
  covering the 12-tool contract, three exact viewports, ARIA semantics,
  redaction, focus-only behavior, native option selection, and repeated close.
- Real public MCP Ubuntu: visible and background complete the public tool set and
  cleanup; the final post-hardening run took 13.59 s and 19.15 s.
- RDM007 correctness and security reviews end with no unresolved P0-P2.
- RDM008 correctness and security re-reviews end with no unresolved P0-P2
  after adversarial scoring, provenance and publication-safety fixes.
- RDM012 setup and ten-criterion evidence is mapped in
  `docs/evidence/rdm-012/README.md`; native publication certification remains
  pending.

Exact command output remains in the Codex task execution record; no absolute
workspace paths, usernames, raw UI secrets, screenshots, or credentials are
checked into this evidence directory.

## Release-safety disposition

- Normal debug and release builds omit the optional provider feature.
- The npm tarball allowlist contains package metadata and built runtime files.
- MCP stdout is protocol-only; diagnostics are stderr-only.
- UI sensitive values and prompt-shaped fixture content are not copied into
  release evidence.
- The production dependency advisory audit reports no known vulnerabilities.
- Dependency audit must be rerun immediately before publication because
  registry advisories and transitive ranges are time-dependent.

## Agent-understanding protocol

The checked-in protocol under `tests/agent/` gives independent trials only a
redacted public MCP transcript, a fixed prompt, and a fixed response budget.
The rubric is withheld during trials and deterministically scored afterward.
The report records the agent, model, harness protocol version, per-trial input
receipts, raw-answer hashes, trial count, tool budget, threshold and scores.
The executable gate counts transcript events, requires two structured six-step
flows in semantic order, scopes rubric criteria to the relevant flow, and
proves that keyword soup scores zero. After adding an instruction-shaped canary
and derived scoring, three independent zero-retry trials scored 10/10 for an
aggregate 10/10, above the 9/10 threshold.
