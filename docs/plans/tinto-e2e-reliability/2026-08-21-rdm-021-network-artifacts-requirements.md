---
title: RDM-021 loopback diagnostics and artifact hygiene requirements
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: inherited-initiative
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-021
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-021-network-artifacts
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-021-network-artifacts/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: [DR-021-001]
---

# RDM-021 loopback diagnostics and artifact hygiene requirements

## Context and inherited authority

The initiative contract requires a local `stdio` MCP owner, one owned
application session, bounded sanitized evidence, and ownership-safe cleanup.
RDM-021 is the Phase 2 hardening item for REL-013 and REL-014. It consumes the
diagnostic buffer/query contract from RDM-015 and the process/listener ownership
contract from RDM-016; it must not redefine either contract or terminate
processes on its own.

The gap audit identifies two concrete gaps: listener reservation/readiness is
IPv4-only and does not explain a Tauri `build.devUrl` mismatch, while retained
artifacts have no age/count cleanup policy despite already having strong
containment, link rejection, permission, and crash-recovery primitives.
This artifact is planning input only. It authorizes no product-code, test,
configuration, Jira, branch, PR, or release mutation in the current run.

## Scope

RDM-021 defines and implements two bounded slices:

- a shared loopback endpoint/readiness model that treats IPv4 and IPv6 as
  separate explicit families, verifies listener state and ownership, compares
  the observed endpoint with the configured Tauri `build.devUrl`, and emits an
  actionable correction when the families or ports disagree; and
- a default discovery exclusion predicate plus deterministic retained-artifact
  policy that preserves explicit user-selected fixtures, refuses traversal or
  deletion through links, maintains owner-only permissions, and emits only
  bounded sanitized evidence through the RDM-015 diagnostic sink.

The network slice may reuse RDM-016's ownership probe and RDM-015's evidence
writer. The artifact slice may reuse the current `ArtifactStore` manifest,
permission, and recovery invariants, but adds policy evaluation and shared
discovery exclusions rather than a second artifact store.

## Non-goals

- A network service, remote binding, wildcard listener, DNS discovery, or
  non-loopback access.
- Replacing the authenticated proxy, exposing provider ports/nonces, or
  terminating an unowned process; those remain session/process-custody rules.
- Creating a competing RDM-015 public diagnostic tool or storing raw stdout,
  causes, URLs, environment values, or application content.
- Generic repository indexing, recursive traversal outside owned roots, or
  bypassing an exclusion merely because a path is a symlink/junction.
- Automatic deletion or reinstallation of dependencies (RDM-022), integration
  attribution (RDM-020), or final certification (RDM-023).
- Selecting new public configuration defaults, retention deletion thresholds,
  or a new public MCP shape without the brokered decision in this package.
- Product implementation, product tests, commits, staging, Jira, PRs, release,
  or external mutation during this artifact-only child run.

## Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| NET-021-001 | Loopback endpoint identity is explicit and family-aware. | IPv4 `127.0.0.1` and IPv6 `::1` are represented without DNS resolution or wildcard binding; IPv6 URLs use bracketed host syntax and all ports are validated/bounded. |
| NET-021-002 | Reservation and readiness probe the declared loopback family and preserve listener ownership evidence. | Deterministic fixtures cover available, occupied, refused, timeout, and wrong-family listeners; a readiness success cannot be reported for a listener that RDM-016 cannot attribute to the owned process tree. |
| NET-021-003 | Tauri `build.devUrl` is parsed and compared with the observed listener. | A host-family, host, or port mismatch yields a stable diagnostic code and a concrete correction (for example, use an explicit `127.0.0.1` or `[::1]` URL with the observed port); credentials, paths, and raw URLs are not emitted. |
| NET-021-004 | Network evidence is bounded and sanitized before it reaches RDM-015. | Records contain only phase, stable code, loopback family, bounded port facts, listener state, ownership state, duration, retryability, and suggestion; count/byte limits and redaction tests pass. |
| ART-021-001 | Discovery excludes repository/runtime and owned artifact roots before recursive enumeration. | `.git`, `.worktrees`, `.pumarejo`, `node_modules`, `target`, and configured owned runtime/artifact roots are skipped deterministically; excluded directories are never opened or followed. |
| ART-021-002 | Explicitly selected fixtures can be inspected only after the same root, regular-file, canonical-path, and permission checks. | An explicit fixture under an allowed root is discoverable even if its name matches a default exclusion; a fixture through a symlink/junction, path escape, or replacement race is rejected without touching its target. |
| ART-021-003 | Retained artifacts have a deterministic, bounded cleanup evaluator. | A policy supplied by the owning runtime orders closed retained sessions deterministically, enforces finite age/count/byte bounds, preserves active sessions and valid in-policy entries, and never removes unknown or malformed content. |
| ART-021-004 | Cleanup and recovery remain containment- and permission-safe. | POSIX directories/files are owner-only (`0700`/`0600`) and Windows uses the current SID/DACL; permission establishment precedes content writes; canonical path and link checks are repeated before delete/rename. |
| ART-021-005 | Artifact-policy evidence is bounded and sanitized. | Cleanup reports counts, stable reason codes, bounded relative labels, and retryability through RDM-015; it never retains or serializes raw causes, absolute paths, link targets, secrets, or application content. |
| ART-021-006 | Existing non-retained recovery and explicit-retention compatibility remain intact. | Existing `ArtifactStore` tests for crash recovery, non-retained close, retained close, manifest canonicality, link refusal, and permissions remain green; no-surface MCP behavior is unchanged. |

## Security and compatibility invariants

- Bind and probe only explicit loopback addresses. A mismatch is diagnostic
  evidence, not permission to fall back to a different family or wildcard.
- Listener ownership, PID/start-time/command identity, nonce, ancestry, and
  port revalidation remain RDM-016 authority. RDM-021 may consume evidence but
  never kills a process or repairs an ownership lease.
- `build.devUrl` is treated as untrusted project configuration. Parsing is
  strict, URLs are bounded, and public output uses a family/port summary rather
  than raw URLs or local paths.
- Exclusion and cleanup operate only inside a canonical configured root. Every
  path component is checked with `lstat`/canonical identity and regular-file or
  directory checks; a link or replacement race fails closed.
- Retained artifact cleanup is only for closed manifests and policy-approved
  sessions. Active, malformed, foreign, unmanifested, or ambiguous content is
  preserved and reported as a bounded failure.
- Sanitization happens before evidence enters memory or a persistent manifest;
  RDM-021 does not create a raw-error side channel around RDM-015.
- Additive compatibility is required. Existing IPv4-only callers remain valid
  when their declared endpoint is explicit; no existing public field or error
  code is removed without an approved contract change.

## Determinism and test expectations

Tests must use fake clocks, fake listener/ownership adapters, fixed session IDs,
and sorted fixture names where possible. Host integration tests may be skipped
only when the platform cannot provide the loopback family, and must record a
specific CI-only gap rather than silently treating IPv6 as IPv4. Required
future evidence includes:

- parser/model unit tests for IPv4, IPv6, bracketed URLs, `localhost`, invalid
  schemes/ports, family mismatch, and actionable correction text;
- listener/readiness unit and integration tests for both families, ownership
  refusal, reservation races, timeout bounds, and stable sanitized records;
- discovery unit tests for every default exclusion, explicit fixture override,
  path escape, junction/symlink, broken link, and replacement race;
- retention integration tests with fake time for age/count/byte ordering,
  active-session preservation, malformed/foreign manifest preservation, crash
  recovery, and deterministic repeated cleanup; and
- Windows and Linux permission/link tests plus the existing artifact, session,
  and platform suites.

## Brokered decision request

`DR-021-001` asks whether the owning runtime should enable automatic retained
artifact cleanup with a product-wide default policy (age/count/bytes), or only
expose the deterministic evaluator behind an explicit operator-supplied
policy. The recommendation is the explicit-policy evaluator first, with no
automatic deletion when no policy is supplied; this preserves existing
retention behavior while allowing RDM-023 or a later product decision to enable
safe defaults. Until resolved, the implementation can complete the pure policy,
validation, and tests, but must not wire deletion of retained artifacts to a
new implicit default.

