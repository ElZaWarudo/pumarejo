---
title: RDM-015 bounded runtime observability implementation plan
artifact_contract: ce-plan/v1
artifact_readiness: implementation-ready
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-015
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-requirements.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
compound_run_id: tinto-e2e-rdm-015-observability
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-015-observability/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
units: [U28, U29, U30, U31]
open_decisions: [DEC-2026-08-21-003, DEC-2026-08-21-004]
---

# RDM-015 bounded runtime observability implementation plan

## Outcome

Introduce a bounded, sanitize-before-store diagnostic pipeline for one owned
Pumarejo session. The pipeline accepts provider console evidence, owned process
stdout/stderr, runtime invocation outcomes, launch phases, and last errors;
normalizes them into deterministic in-memory ring buffers; and projects a
finite read-only result only after the upstream public decisions are canonical.

The plan is implementation-ready as an internal decomposition. RU1 can proceed
with pure sanitization, bounded storage, and producer adapters. RU2's public
query composition is explicitly decision-gated by DEC-2026-08-21-003 and
DEC-2026-08-21-004. Exact public operation names, field names, and capability
states are intentionally absent from this plan until the canonical decisions
are persisted.

## Constraints and inherited contracts

- Preserve local `stdio`, one owned application session, current session and
  surface ownership checks, and no arbitrary WebDriver/Tauri/script passthrough.
- Sanitize before storing in memory. Serialization-time redaction is only a
  secondary defense.
- Preserve RDM-009 mandatory sensitive-content protection and current-
  generation/actionable-reference semantics; diagnostics never authorize an
  action or revive a stale reference.
- Consume RDM-010 launch phases, status, cleanup labels, and last-failure
  envelope. Do not rename or broaden its public state model locally.
- Consume the accepted RDM-013 surface identity and capability vocabulary.
  Until DEC-2026-08-21-003/004 are canonical, keep public RU2 wiring blocked.
- Keep provider console capture capability-gated and provider-supported; do
  not add arbitrary script, selector, or browser-log passthrough.
- Keep diagnostic buffers memory-only by default. Durable retention requires an
  explicit bounded opt-in and existing protected artifact containment;
  RDM-021 owns any retention cleanup policy.
- Preserve MCP transport framing limits and existing status/error compatibility.
- `production:unknown` is the working posture; all future behavior must be
  additive and compatibility-preserving until a release owner decides otherwise.

## Plan units

| Unit | Scope and deliverable | Dependencies | Primary surfaces | Focused proof |
| --- | --- | --- | --- | --- |
| U28 | Internal sanitized event envelope, source allowlists, redaction-before-store pipeline, deterministic ring buffers, bounded ordering/eviction, and ownership/session/surface scoping. | RDM-009 redaction/generation; RDM-010 status context; no public decision needed for pure core. | `src/observability/` (new internal boundary), `src/shared/`, focused unit tests, security docs. | Pure tests prove bounds, deterministic eviction, byte accounting, malformed input refusal, redaction, and scope isolation. |
| U29 | Producer adapters for WebView console, owned process stdout/stderr, invocation lifecycle, phase history, and last-error projection. | U28; RDM-010 launch phases; RDM-013 provider/surface capability evidence; DEC-2026-08-21-004 for public outcome mapping only. | `src/platform/tracked-process.ts`, `src/platform/windows/`, `src/platform/linux/`, `src/webdriver/`, `src/session/`, `src/mcp/runtime.ts`. | Unit/integration/platform fixtures prove source-specific bounds, provider gaps, ownership loss, duration/error evidence, and no raw producer leakage. |
| U30 | Bounded read-only query projection composed with the accepted RDM-013 surface/capability contract, finite filters/limits, stable ordering, and MCP framing. | U28/U29; RDM-013 public shape; DEC-2026-08-21-003/004. | `src/mcp/domain-ports.ts`, `src/mcp/schemas.ts`, `src/mcp/runtime.ts`, `src/mcp/server.ts`, `docs/contracts.md`, `docs/compatibility.md`. | Contract tests prove current-session/surface scoping, unsupported states, bounded serialization, existing tool compatibility, and no disclosure. |
| U31 | Explicit retention adapter and security/compatibility evidence, including memory-only default, protected retained records, and handoff notes for RDM-021. | U30; existing `ArtifactStore` permission/containment contract; RDM-021 cleanup policy; DEC-2026-08-21-003/004 for public wiring. | `src/artifacts/` (narrow adapter only), `src/config/` if already accepted, `docs/security.md`, `docs/architecture.md`, focused integration/contract/platform tests. | Integration/security fixtures prove no-retention cleanup, explicit opt-in only, protected bytes, bounded retained records, and no implicit deletion. |

## Dependency and execution waves

1. **Wave 0 — inherited contract gate:** Seneschal brokers DEC-2026-08-21-003
   and DEC-2026-08-21-004 through the RDM-013 owner and persists canonical
   answers in the initiative contract. In parallel, read-only feasibility may
   inspect provider console support and existing process output seams. No
   public query/schema code starts before the decisions are canonical.
2. **Wave 1 — RU1 / U28-U29:** implement and test the pure sink plus producer
   adapters. Keep the internal sink independent of MCP naming and map provider
   gaps through an adapter boundary. This slice is reviewable without public
   API decisions, but shared runtime/session/provider files serialize with
   sibling workers.
3. **Wave 2 — RU2 / U30-U31:** after Wave 0 decisions, compose the finite query
   boundary, accepted RDM-013 capability states, explicit retention adapter,
   public contract/docs, and security/compatibility fixtures. Keep query and
   retention together because splitting them would hide the disclosure and
   lifecycle policy in a deferred consolidation.
4. **Wave 3 — Seneschal aggregate:** reconcile RDM-013/RDM-014 public schema
   changes, RDM-016 custody evidence, RDM-017 environment evidence, and the
   RDM-019 certification plan before aggregate commands.

No independent parallel mutation is safe for U29-U31: they overlap central
runtime/domain ports, session state, provider adapters, config, artifacts, and
shared fixtures. Keep the chain at two review units; at the cap, wait for the
parent merge into `main` or collapse the pending child onto the refreshed
integration base.

## Detailed design

### U28 — sanitize-before-store and bounded buffers

- Define an internal event record with source category, bounded sequence/time,
  optional phase, stable error projection, duration/retryability, safe recovery
  guidance, and an ownership/surface correlation context.
- Accept only allowlisted scalar fields and finite arrays/objects. Apply the
  existing mandatory redaction rules plus secret/path/token/credential and
  provider-identifier filtering before constructing the record.
- Exclude raw command lines, arbitrary arguments, full paths, PIDs, nonces,
  provider handles, screenshots, stack/cause objects, and untrusted object
  keys from the record. A producer cannot bypass the sanitizer by supplying a
  pre-shaped object.
- Use deterministic limits for record count, per-field length, record bytes,
  aggregate bytes, and producer chunk size. Evict oldest records first with a
  stable sequence and bounded eviction evidence. Reject malformed or
  over-budget input rather than storing an oversized value.
- Bind each buffer to the current owned session and, where available, the
  RDM-013 surface identity. Clear non-retained buffers when the session closes.
- Keep the implementation pure/injectable for fake clocks and deterministic
  tests; do not add a public API in this unit.

### U29 — producer adapters

- **Console:** use only a provider-supported log/event boundary. Normalize
  levels and bounded messages, sanitize before insertion, and attach a surface
  correlation hint only after ownership validation. If the provider does not
  prove console support, record a bounded capability/error observation and do
  not execute arbitrary JavaScript to obtain logs.
- **Process streams:** adapt `createTrackedProcessAdapter`'s existing bounded
  stdout/stderr capture into the sink. Preserve Windows/Linux process identity
  and lease checks; do not expose the existing internal tail as a raw public
  field. Stream chunks are sanitized and bounded independently before the
  ring-buffer write.
- **Invocation:** wrap the serialized runtime operation boundary so start/end,
  duration, action/phase, and projected `ErrorEnvelope` facts are recorded on
  success, failure, cancellation, and timeout. Never retain an `Error.cause`
  or caller-supplied argument object.
- **Phases:** use the existing launch phase callback and lifecycle transitions
  to record deterministic phase entries. Avoid inventing new public phases;
  unknown internal failures carry no phase rather than a guessed one.
- **Last error:** update the per-process/per-surface projection only with the
  sanitized stable code, phase, retryability, and suggestion. Preserve absence
  when a fact is not proven.
- Ensure producer races are serialized through the sink and that events after
  ownership loss are dropped or represented as a bounded ownership failure,
  never attributed to a new session.

### U30 — query projection and capability composition

- Compose a finite, read-only projection from selected sources with explicit
  max-record/max-byte limits and stable chronological ordering. Do not expose
  an unbounded stream, subscription, raw buffer, or arbitrary source filter.
- Validate current owned session and the selected RDM-013 surface context
  before returning records. A missing/unsupported/unavailable source maps to
  the canonical RDM-013 outcome vocabulary; no local synonym is introduced.
- Preserve existing launch/status/error calls when the diagnostics query is
  not requested. Exact public operation/schema names and response fields are
  selected only by DEC-2026-08-21-003/004 and then added with compatibility
  fixtures.
- Enforce MCP serialization headroom independently of internal ring limits.
  If a result cannot fit, return a bounded truncation/unsupported evidence
  result rather than falling through to raw JSON or `INTERNAL_ERROR`.
- Keep all application content untrusted. Diagnostic text cannot alter tool
  descriptions, authorization, source selection, or tenant/session scope.

### U31 — explicit retention and security evidence

- By default, the diagnostic sink is memory-only and clears at close. The
  existing `retainArtifacts` contract may be consumed only as an explicit
  opt-in after a bounded diagnostic retention policy is accepted; do not add a
  hidden default or silently persist diagnostic records.
- Route retained records through the existing artifact-root containment,
  owner-only permission, canonical manifest, size/count, and recovery checks.
  Store only the sanitized bounded projection, never raw producer payloads.
- Do not add automatic age/count/byte deletion. RDM-021 owns explicit cleanup
  policy and must consume this adapter rather than the sink's internal state.
- Add seeded disclosure, wrong-session/surface, ownership-loss, retention,
  malformed-provider, and transport-framing fixtures. Keep provider-gated
  platform checks explicit and record skips with reasons.

## Security and compatibility invariants

- The only trust path is owned runtime/session -> provider/process adapters ->
  sanitizer -> bounded buffer -> optional protected retained sink -> MCP
  projection. No stage may bypass sanitize-before-store.
- Process output is attributable only while the lease, session nonce, command
  identity, and provider ownership remain valid; raw identity values stay
  internal and are not serialized.
- Surface correlation is non-actionable metadata. Diagnostic records cannot
  authorize an interaction or select a surface.
- Capability outcomes are evidence-backed and composed from RDM-013. Provider
  absence, denial, incompatibility, unimplemented behavior, and failed
  postconditions never become a successful record.
- Existing seven-tool behavior, bounded status/error envelopes, local `stdio`,
  and mandatory redaction remain compatible when the new query is absent.

## Verification strategy

| Gate | Commands/evidence | Pass criterion |
| --- | --- | --- |
| Pure sink | Focused observability unit files plus `pnpm test:unit` | Deterministic bounds/eviction/redaction/ownership tests pass. |
| Producer integration | Focused runtime/process/provider tests plus `pnpm test:integration` | Source adapters preserve ownership, phase/error evidence, and provider gaps without leakage. |
| Public contract | Focused MCP contract tests plus `pnpm test:contract` | Canonical public shape is additive, finite, capability-composed, and transport-safe. |
| Retention/security | Artifact/retention integration, seeded disclosure corpus, Windows/Linux platform checks where available | Memory-only default, explicit opt-in, protected retained bytes, and no raw secrets/paths/causes. |
| Aggregate | Seneschal-owned wave fingerprint and CI-equivalent matrix | Cross-item schema/session/provider consumers remain green; no local claim before root evidence. |

No product verification is run during this artifact-only child. The package
records literal commands for the future implementation lane and the root-owned
aggregate gate.

## Decision gates

- **DEC-2026-08-21-003:** public operation/schema composition; blocks U30/U31
  and RU2 public wiring. Safe work: U28/U29 internal sink and producer tests.
- **DEC-2026-08-21-004:** capability vocabulary/evidence projection; blocks
  U30/U31 and any provider-source public outcome. Safe work: internal source
  result adapter and conservative unsupported evidence without a public label.

