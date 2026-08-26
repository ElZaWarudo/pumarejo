---
run_id: tinto-e2e-rdm-015-observability
roadmap_item: RDM-015
review: krt-security-sentinel
mode: focused-implementation
threshold: P0-P2
status: passed
date: 2026-08-24
---

# RDM-015 focused security review

## Trust boundaries reviewed

The review examined producer input from owned stdout/stderr and runtime error
envelopes, the in-memory diagnostic store, the additive MCP query, session and
surface ownership checks, explicit retention, MCP serialization, and close
cleanup. Sibling process-custody, environment, installer, and artifact-cleanup
responsibilities were not expanded.

## Controls verified

- Sanitization and allowlisting happen before a record enters the ring. Secret
  patterns, bearer/basic material, common credential assignments, paths, and
  control characters are redacted; sensitive producer content can be omitted;
  raw causes/arguments/provider handles have no record fields.
- Records have bounded fields and deterministic IDs. The ring enforces both a
  maximum record count and UTF-8 aggregate byte budget with oldest-first
  eviction. Latest-error projection is separately capped and cleared with the
  store, so no unbounded stream or map is introduced.
- Store append rejects a session mismatch. Runtime diagnostics require an
  active owned session; a foreign surface returns `denied` capability evidence
  with an empty record projection. Post-close queries fail with the existing
  inactive-session envelope.
- Capability states are an explicit allowlist: `supported`, `unsupported`,
  `unavailable`, `denied`, and `failed`. Console support is truthful
  `unsupported` until an approved provider boundary is proven; no arbitrary
  JavaScript or provider passthrough was added.
- Memory-only is the default. Retention is inert unless callers explicitly set
  `enabled: true` and provide a sink; retained input is the bounded sanitized
  query projection. Close clears memory and does not infer deletion policy.
- MCP input is strict and caps sources, records, bytes, and surface references;
  the operation is additive and existing tool framing remains unchanged.

## Verification

- `tests/unit/diagnostics.test.ts`: sanitize-before-store, deterministic
  count/byte eviction, capability vocabulary, latest-error bounds, and
  memory-only/explicit retention tests passed.
- `tests/unit/mcp-runtime.test.ts`: active-session projection, denied scope,
  close clearing, and error non-disclosure tests passed.
- `tests/contract/mcp-server.test.ts`: strict schema, tool enumeration,
  dispatch, and existing-tool compatibility tests passed.
- Focused review command: 4 files, 61 passed tests; natural journey: 5 files,
  67 passed tests. Typecheck, build, lint, integration (67 passed/5 skipped),
  and contract (49 passed) passed.

## Residual limitations and verdict

The provider has no approved console capture boundary in this run, so console
evidence remains `unsupported`; this is a truthful capability gap, not a
security bypass. Full-unit host/sibling failures are recorded in state and do
not involve RDM-015. No P0, P1, or P2 security finding was identified.

`passed` for the focused changed slice. Parent Seneschal retains aggregate
platform/provider verification and release authority.
