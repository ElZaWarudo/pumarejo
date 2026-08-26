---
title: Tinto reliability implementation gap audit
date: 2026-08-21
status: accepted-planning-input
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
---

# Tinto reliability implementation gap audit

## Purpose

This audit maps REL-004 through REL-016 to current implementation evidence before the RDM-014 through RDM-023 packages are written. RDM-009 observation changes were intentionally treated as transient and are not claimed as baseline evidence here.

## Evidence matrix

| Requirement                 | Existing evidence                                                                                                                                                                    | Missing behavior                                                                                                                                   | Reviewable ownership                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| REL-004 truthful windows    | `tauri_window` has finite schemas and `src/webdriver/client.ts` verifies effective size after W3C or Tauri fallback.                                                                 | Tool discovery is unconditional; permission, incompatibility, unimplemented behavior, and failed postcondition collapse into `UNSUPPORTED_ACTION`. | Add launch-scoped effective capability probing and typed outcomes before changing tool advertisement. Serialize MCP/provider changes. |
| REL-005 native dialogs      | HTML `<dialog>` is semantically observable.                                                                                                                                          | No native Tauri bridge, permission, launch-scoped grant, accept/cancel tool, or audit evidence.                                                    | Split Rust/capability/grant boundary from MCP adapter/evidence; require security review.                                              |
| REL-006 diagnostics         | Public error envelopes omit causes; status has sanitized `lastFailure`; structured MCP output and child output tails are bounded.                                                    | No queryable console, process, invocation, or phase-history buffers; capture is not sanitized before storage.                                      | Build a sanitize-before-store ring buffer, add producers, then one bounded query surface.                                             |
| REL-007 process custody     | PID/start-time/command-hash/nonce identity is revalidated; Linux uses process groups; Windows uses validated `taskkill /T /F`; close is retryable and transport shutdown is handled. | No Windows Job Object, durable lease, orphan recovery, or verified POSIX TERM→KILL convergence after owner crash.                                  | Separate durable lease, Windows Job Object, Linux convergence, and startup repair review units.                                       |
| REL-008 Windows environment | Launch environment is allowlisted, case-normalized, deterministic, and secret keys are excluded.                                                                                     | Missing essential variables are not reconstructed; portable values are not expanded; provenance and value-pattern filtering are absent.            | Add a pure Windows environment builder before integration.                                                                            |
| REL-009 toolchains          | Doctor resolves explicit executables or PATH/PATHEXT and reports basename/provenance/confidence.                                                                                     | Boolean probes omit candidates, canonical identity, version, rejection reasons, broken links, and host-versus-child differences.                   | Introduce a structured resolver and adapt doctor afterward.                                                                           |
| REL-010 sequences           | Actions are serialized; settle time is bounded; exact editable typing and stale-ref rejection exist.                                                                                 | No bounded sequence tool, action/time budget, single final stabilization, or focused-editable typing action.                                       | Build a typed internal executor, then expose one strict tool after generation rules settle.                                           |
| REL-011 generations         | Successful observations replace refs; partial observations advance; dispatch failures clear refs; concurrent ref reuse is prevented.                                                 | No outcome matrix; uncertain failures can clear refs without incrementing the numeric generation; proven no-change success still advances.         | Encode and test a pure outcome→generation table before sequences.                                                                     |
| REL-012 drift               | Manifest attribution exists and init preserves unrelated Cargo, capability, and ignore content.                                                                                      | Doctor still treats whole-file hashes as authority for several entries.                                                                            | Check owned Rust/ignore markers, Cargo semantics, isolated capability security schema, and owned config fields separately.            |
| REL-013 network             | WebDriver accepts IPv4 and IPv6 loopback hosts.                                                                                                                                      | Readiness, reservation, and listener ownership are IPv4-only; no `devUrl` mismatch correction exists.                                              | Add a shared loopback observation model with separate Windows/Linux parser tests.                                                     |
| REL-014 discovery/artifacts | Artifact confinement, link rejection, permissions, size/count limits, crash recovery, and non-retained cleanup are strong.                                                           | No shared default discovery exclusions; retained artifacts lack age/count cleanup.                                                                 | Split exclusion predicate from retained-artifact policy; preserve the existing artifact security core.                                |
| REL-015 self doctor         | Project doctor has stable IDs and safe guidance.                                                                                                                                     | `doctor --self` and install/dependency/junction/lockfile/postinstall checks are absent.                                                            | Create an independent read-only self-doctor and reuse only formatting/resolution primitives.                                          |
| REL-016 regression          | Capability composition/security and generated Rust shapes have broad unit/integration coverage.                                                                                      | No fixture proves `cargo fmt` idempotence; the full matrix is fragmented and Cargo proof is opt-in.                                                | Keep RDM-023 evidence-only unless certification reveals a production defect.                                                          |

## RDM-019 certification gap

`tests/contract/real-usage-journey.test.ts` exercises mocked domain ports rather than Tinto. Live fixtures prove generic W3C actions and normal owned cleanup, but there is no complete public-MCP Tinto journey, rejected dialog authorization, seeded diagnostic-secret corpus, forced timeout/disconnect descendant cleanup, or cross-platform residue evidence.

## Recommended decomposition

1. RDM-014a effective window capabilities; RDM-014b native dialog grant and bridge.
2. RDM-015a sanitizer/ring buffer; RDM-015b producers and bounded query.
3. RDM-016 durable leases, Windows Job Object, Linux convergence, and owned recovery as separate review units.
4. RDM-017 Windows environment builder, then structured executable resolver.
5. RDM-018 generation matrix, then bounded sequences and focused typing.
6. RDM-019 public Tinto and forced-failure evidence.
7. RDM-020 attribution; RDM-021 network and discovery/retention; RDM-022 self-doctor.
8. RDM-023 certification-only matrix.

Do not mutate `src/mcp/server.ts`, `src/mcp/schemas.ts`, `src/mcp/domain-ports.ts`, `src/mcp/runtime.ts`, `src/session/manager.ts`, capability manifests, or shared live fixtures concurrently.
