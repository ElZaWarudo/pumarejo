---
title: RDM-015 bounded runtime observability requirements
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-015
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
compound_run_id: tinto-e2e-rdm-015-observability
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-015-observability/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: [DEC-2026-08-21-003, DEC-2026-08-21-004]
---

# RDM-015 bounded runtime observability requirements

## Context and inherited authority

The Tinto proving journey needs enough sanitized evidence to identify a failed
phase without opening a second automation or data-exfiltration path. The
initiative contract is authoritative for one local `stdio` MCP session, one
owned application session, bounded output, sanitize-before-boundary rules,
exact current-generation references, and explicit retention opt-in.

RDM-013 is the upstream owner of surface identity, session/surface binding,
and the capability-state vocabulary. Its public discovery/selection shape and
capability vocabulary remain unresolved in DEC-2026-08-21-003 and
DEC-2026-08-21-004. This item therefore defines an internal observability
architecture and literal acceptance evidence, but it must not invent public
tool names, public field names, or a competing capability vocabulary.

RDM-010 supplies the accepted launch/status phase model and cleanup state
ownership. RDM-009 supplies the mandatory redaction and actionable-generation
contract. RDM-015 consumes both contracts and does not reopen them.

This document is planning input only. It does not authorize product-code,
test, configuration, public-contract, Jira, branch, commit, PR, or release
changes during the artifact-only run.

## Scope

RDM-015 establishes a bounded diagnostic pipeline with these responsibilities:

- sanitize console, process, invocation, phase, and error evidence before it
  enters any buffer or durable sink;
- keep deterministic in-memory ring buffers with finite entry, field, and byte
  budgets, oldest-first eviction, stable ordering, and explicit truncation or
  eviction evidence;
- capture WebView console evidence only through a provider-supported,
  capability-gated adapter, and report an unsupported or unavailable source
  truthfully when the provider cannot supply it;
- capture owned process stdout/stderr through the existing tracked-process
  ownership boundary without exposing raw command lines, full paths, PIDs,
  nonces, or unsanitized output;
- record bounded invocation outcomes, launch phase history, duration,
  retryability, stable error code, ownership context, and recovery suggestion;
- retain the last sanitized error per owned process or supported surface,
  scoped to the active owned session and current surface identity where that
  identity is available;
- compose one bounded, read-only query boundary from those sources, after the
  RDM-013 public shape and capability vocabulary are canonical;
- preserve truthful unsupported, unavailable, denied, and failed outcomes by
  mapping provider/source evidence through the accepted RDM-013 vocabulary;
- keep diagnostic retention memory-only by default; allow durable diagnostic
  retention only through an explicit, bounded opt-in that reuses the existing
  protected artifact root and does not infer a new deletion policy; and
- provide security, disclosure, ownership, compatibility, and deterministic
  eviction tests for the complete pipeline.

## Non-goals

- unbounded streaming, subscriptions, polling loops, or a network diagnostic
  service;
- raw environment/PATH dumps, raw process command lines, arbitrary invocation
  arguments, provider endpoints/nonces, screenshot bytes, or unredacted causes;
- arbitrary JavaScript, shell, WebDriver, Tauri-command, selector, XPath,
  coordinate, OCR, or operating-system passthrough;
- a second application session or cross-session diagnostic lookup;
- changing the RDM-009 redaction/generation contract, the RDM-010 lifecycle
  state model, or the RDM-013 surface graph/capability contract;
- deciding the public diagnostics tool/schema shape before DEC-2026-08-21-003;
- introducing a new public capability-state vocabulary before
  DEC-2026-08-21-004;
- automatic durable retention, age/count/byte deletion, artifact cleanup, or
  recovery policy owned by RDM-021;
- process custody, Job Objects, process groups, leases, orphan repair, or
  termination policy owned by RDM-016;
- Windows environment reconstruction/toolchain resolution owned by RDM-017;
- Tinto certification owned by RDM-019; or
- implementation, test, release, Jira, or external mutation in this run.

## Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| OBS-001 | Every diagnostic source is sanitized before storage. | A seeded corpus containing credentials, tokens, marked-sensitive application content, unsafe paths, command arguments, provider identifiers, and nested error causes produces only bounded safe records in memory and at the query boundary. |
| OBS-002 | Diagnostic records have one bounded internal envelope. | Console, stdout/stderr, invocation, phase, and error records preserve source, bounded timestamp/order, phase when known, stable error code when known, duration when known, retryability when known, ownership context, and a concrete recovery suggestion without raw causes. |
| OBS-003 | Ring buffers are deterministic and finite. | Given the same event sequence and limits, records, eviction order, truncation markers, and query ordering are byte-for-byte deterministic; entry, field, and total-byte limits are enforced before insertion. |
| OBS-004 | Buffer scope follows owned-session and surface ownership. | Events from another session, stale ownership lease, or unrelated process are rejected or safely isolated; a closed non-retained session does not remain queryable from a later session. |
| OBS-005 | WebView console capture is provider-gated. | A provider-supported console source yields bounded sanitized records; a missing, denied, incompatible, or unimplemented provider path yields the corresponding accepted RDM-013 capability outcome and never fabricates console data or invokes arbitrary script. |
| OBS-006 | Owned process output is bounded at the process boundary. | Windows and Linux stdout/stderr producers feed the sink with finite chunks and deterministic tail behavior; raw command lines, full paths, PIDs, nonces, and unrelated child output are not retained or exposed. |
| OBS-007 | Invocation and launch phase evidence is complete enough to diagnose failure. | A launch, status, snapshot, screenshot, interaction, or close operation records start/end or bounded duration, phase/action context, outcome/error envelope, and recovery suggestion; launch phases align with the accepted RDM-010 phase model. |
| OBS-008 | Last-error views are truthful and bounded. | The latest sanitized error is available per eligible owned process or supported surface, distinguishes known stable code/phase/retryability, and omits a field rather than inventing details when evidence is unavailable. |
| OBS-009 | The query boundary is read-only, bounded, and capability-composed. | After the public decisions are canonical, a client can request a finite diagnostic result scoped to the current owned session/surface; result size, source count, and record count are capped, ordering is stable, and unsupported source queries return the accepted RDM-013 outcome vocabulary. |
| OBS-010 | Retention is explicit and bounded. | With no explicit retention opt-in, diagnostic bytes exist only in memory for the active session and are cleared on close; with opt-in, only bounded sanitized records enter the protected artifact boundary and no implicit age/count/byte deletion policy is introduced. |
| OBS-011 | Public compatibility remains additive and honest. | Existing launch/status/error behavior remains valid without diagnostic querying; exact public operation, field, and capability vocabulary changes are reviewed only after DEC-2026-08-21-003/004 are persisted. |
| OBS-012 | Security and disclosure regressions fail closed. | Tests prove no seeded secret/path/content/argument/cause crosses storage, serialization, or retained-artifact boundaries, and ownership/session/surface mismatches cannot reveal another scope. |
| OBS-013 | Platform differences are explicit. | Windows and Linux producer adapters preserve the same bounded sanitized contract; provider or platform gaps are reported as truthful unsupported/unavailable evidence rather than normalized to success. |

## Internal evidence model (public shape deferred)

The implementation may use package-local types for a sanitized event, source
kind, ownership context, phase transition, error projection, and ring-buffer
snapshot. These are internal names only. A record may carry a bounded
correlation identity, but it must not carry raw provider handles, full paths,
PIDs, nonces, selectors, arbitrary arguments, or application content that the
RDM-009 boundary marks sensitive.

The event pipeline is ordered:

```text
producer -> normalize/allowlist -> sanitize -> bounded record validation
         -> session/surface ownership check -> in-memory ring buffer
         -> optional explicit retained sink -> public query projection
```

Sanitization and validation happen before the in-memory write. Query-time
redaction is defense in depth, not the primary control. A producer that cannot
prove ownership, source capability, or safe normalization contributes an
unsupported/unavailable/error evidence record according to the accepted
vocabulary, not raw diagnostic input.

## Acceptance and verification contract

The future implementation must provide focused evidence for:

- deterministic ring-buffer insertion, eviction, per-record bounds, total-byte
  limits, empty/overflow behavior, and concurrent producer ordering;
- seeded secret, token, credential, path, marked-sensitive content, argument,
  provider-identifier, and nested-cause redaction before storage;
- process stdout/stderr chunking and stream separation through Windows and
  Linux adapters, including process exit and ownership-loss behavior;
- provider-supported, unavailable, denied, incompatible, and unimplemented
  console-source outcomes mapped through RDM-013 without arbitrary script;
- invocation and phase duration/error/retryability/recovery evidence,
  including failures before a session is ready and during cleanup;
- last-error scoping by owned process/surface and rejection of wrong-session,
  stale-surface, and post-close queries;
- finite read-only query output, stable ordering, MCP framing limits, and
  existing status/error compatibility; and
- memory-only defaults, explicit retention opt-in, protected artifact
  permissions/containment, and absence of implicit retention deletion.

The focused implementation commands are:

```text
pnpm test:unit
pnpm test:integration
pnpm test:contract
```

The aggregate platform and release-certification commands remain owned by
Seneschal/root. Platform-specific evidence should be added when the provider
and host permit it; a skipped platform check must name the exact host reason.

## Brokered decision requests

These inherited decisions are intentionally not inferred locally:

### DEC-2026-08-21-003 — Public discovery/selection and diagnostic query shape

- **Question:** Should the bounded diagnostics query compose as an additive
  public operation or extend an existing status/snapshot operation, following
  the public shape chosen for RDM-013 discovery/selection?
- **Why not inferable:** The choice changes compatibility, schema ownership,
  query scoping, and composition with RDM-013/RDM-014/RDM-018.
- **Recommendation:** Follow the canonical RDM-013 decision and expose only a
  bounded read-only composition point; do not name or implement an alternative
  public operation in this run.
- **Safe fallback:** Keep RU2 public wiring blocked and retain only internal
  producer/sink evidence.
- **Affected units:** U30, U31, RU2, RDM-013, RDM-014, RDM-018, RDM-019.
- **Canonical target:** `docs/plans/tinto-e2e-reliability/initiative-requirements.md`.

### DEC-2026-08-21-004 — Public capability-state vocabulary

- **Question:** Which accepted RDM-013 vocabulary and bounded evidence fields
  distinguish supported, unsupported, unavailable, denied, and failed source
  operations?
- **Why not inferable:** RDM-015 must preserve truthful source failures, but
  inventing a second vocabulary would create public drift and misrepresent
  provider capability.
- **Recommendation:** Consume the canonical RDM-013 vocabulary through an
  internal adapter; omit unproven fields and never coerce unknown evidence to
  success.
- **Safe fallback:** Keep public source-query wiring blocked and expose only
  internal sanitized evidence in implementation tests.
- **Affected units:** U29, U30, U31, RU1, RU2, RDM-014, RDM-019.
- **Canonical target:** `docs/plans/tinto-e2e-reliability/initiative-requirements.md`.

## Ownership and overlap boundary

RDM-015 owns the diagnostic sink, producer adapters, query projection, and
diagnostic disclosure tests. It consumes RDM-009 redaction/generation,
RDM-010 phase/status, and RDM-013 surface/capability contracts. RDM-016 owns
process custody and repair; RDM-017 owns environment/toolchain resolution;
RDM-019 owns end-to-end certification; RDM-021 owns loopback/artifact
retention and cleanup policy. Shared MCP schemas, runtime/domain ports,
session state, process adapters, WebDriver/provider interfaces, config, and
fixtures are serialized across these workers by Seneschal.

During this artifact-only child, no product code, test, config, shared swarm
state, autonomy ledger, or sibling unit file is edited.

