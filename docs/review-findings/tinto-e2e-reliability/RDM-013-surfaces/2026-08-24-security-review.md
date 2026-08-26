---
title: RDM-013 implementation security review
status: passed
date: 2026-08-24
run_id: tinto-e2e-rdm-013-surfaces
review_role: krt-security-sentinel
threshold: P0-P2
---

# RDM-013 implementation security review

Security status: pass.

## Scope

Reviewed the public MCP surface operations, session/generation ownership,
provider window/frame discovery and selection, snapshot metadata, screenshot
coverage evidence, tests, and maintained contract/architecture/security docs.
The review stayed read-only and did not run external scans, intrusive probes,
secret decoding, or production operations.

## Trust boundaries and evidence

- MCP input is validated by strict bounded Zod schemas before runtime dispatch.
- Surface refs are opaque hashes bound to the owned session and current graph
  generation; stale/foreign refs fail closed.
- Provider window/frame handles are kept in the manager's private map and are
  never serialized into graph output. Provider ports, nonces, URLs, and raw
  element IDs remain private.
- Capability results use only the explicit stable state matrix and bounded
  codes/evidence. Provider labels and application content remain data, not
  instructions or authority.
- Frame switching is available only through exact W3C commands and only after
  a positive provider reachability probe. Closed/cross-origin/unavailable
  contexts remain non-actionable.
- Snapshot selection advances the reference generation before fresh refs are
  published; interaction code continues to revalidate exact identity.
- Coverage output is bounded, surface-owned, sanitized, and explicitly
  `actionable: false`; inconclusive geometry becomes `coverage_unknown`.

## Findings

No P0, P1, or P2 finding.

Advisory P3: native Windows/Linux provider matrix entries require execution on
an authorized native provider host before publication. This is an evidence
gate, not a security defect; the implementation makes no support claim when
the host gate is unavailable.

## Required verification

- `tests/unit/surfaces.test.ts`: stale graph, unsupported context, bounds,
  disclosure, and conservative coverage checks.
- `tests/integration/surface-graph.test.ts`: dynamic discovery, exact frame
  selection, and restoration to the owning context.
- `tests/unit/snapshot-surface.test.ts`: selected-surface metadata and
  generation invalidation.
- `pnpm test:contract`: strict/additive schemas and untrusted-content framing.
- Native provider gate under `PUMAREJO_RUN_PROVIDER=1` on authorized Windows
  and Linux hosts before release publication.

## Residual risk

Native provider feasibility remains host-dependent. No release, deployment, or
authorization policy was changed by this child.
