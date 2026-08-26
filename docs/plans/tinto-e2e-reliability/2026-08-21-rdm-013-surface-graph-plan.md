---
title: RDM-013 nested semantic surface graph implementation plan
artifact_contract: ce-plan/v1
artifact_readiness: implementation-ready
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-013
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-013-surface-graph-requirements.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
compound_run_id: tinto-e2e-rdm-013-surfaces
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-013-surfaces/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
units: [U24, U25, U26, U27]
open_decisions: []
---

# RDM-013 nested semantic surface graph implementation plan

## Outcome

Add a truthful, bounded surface graph to the existing one-session observation
model. The graph lets an MCP client discover and select supported nested
contexts, keeps exact current-generation references tied to the selected
surface, and explains visible semantic coverage gaps without turning screenshots
or provider details into an automation bypass.

The plan is implementation-ready as a decomposition. The three brokered
public-contract/diagnostic decisions are canonically approved and their exact
answers are recorded in the initiative contract and requirements artifact.

## Constraints and inherited contracts

- Consume RDM-009's settled continuation/actionable-generation contract; do not
  change its package, state, or implementation surfaces.
- Preserve one owned session, local `stdio`, exact W3C handles, bounded output,
  mandatory redaction, authenticated loopback proxy, and provider ownership.
- Support only provider-proven windows/WebViews, open shadow roots, and
  provider-reachable iframes; closed roots and unreachable contexts become gaps.
- Stable semantic identifiers are correlation metadata only; they never
  authorize an action.
- Provider capability claims require a live or fixture-backed probe and a
  stable evidence code; static labels are insufficient.
- Public additions must be additive or explicitly approved as a compatibility
  change. Existing tools remain valid when no surface context is supplied.

## Plan units

| Unit | Scope and deliverable | Dependencies | Primary surfaces | Focused proof |
| --- | --- | --- | --- | --- |
| U24 | Surface graph domain model, bounded metadata, parent/child invariants, and generation/session binding. | RDM-009 observation contract; DR-013-001 for public shape. | `src/observation/`, `src/session/`, `src/mcp/`, `docs/contracts.md`, `docs/architecture.md`. | Unit/schema tests for graph invariants, metadata bounds, session ownership, and generation invalidation. |
| U25 | Dynamic discovery and active-surface selection; provider capability matrix and truthful typed outcomes. | U24; WebDriver window/context evidence; DR-013-002. | `src/webdriver/`, `src/session/`, `src/mcp/`, `src/shared/errors.ts`, compatibility/security docs. | Integration/contract tests for discovery, selection, stale/wrong-session refs, capability states, and provider denial/unavailability. |
| U26 | Provider-reachable traversal across Dockview-like nested panels, open shadow roots, iframes, and exposed windows/WebViews. | U24, U25; certified provider feasibility probes. | `src/observation/browser-traversal.ts`, `src/observation/snapshot.ts`, `src/webdriver/client.ts`, provider fixtures. | Browser/integration/platform tests for nested parentage, exact handles, dynamic children, open roots, and unsupported contexts. |
| U27 | Bounded screenshot-to-semantics coverage diagnostics, evidence schema, fixtures, and maintained docs. | U24-U26; DR-013-003. | `src/observation/screenshot.ts`, `src/observation/schema.ts`, `src/mcp/`, `tests/`, `docs/contracts.md`, `docs/compatibility.md`, `docs/security.md`. | Contract tests for proven gaps, unknown coverage, bounds, disclosure, and no actionable coordinate/OCR output. |

## Dependency and execution waves

1. **Wave 0 — decision and feasibility gate:** apply the canonical answers for
   DR-013-001 through DR-013-003; run provider probes read-only and record the
   resulting matrix before claiming provider support.
2. **Wave 1 — RU1 / U24-U25:** implement graph model, public discovery/selection
   contract, session/generation binding, and capability outcomes. This is one
   reviewable capability slice because its metadata and selection invariants
   must be reviewed together.
3. **Wave 2 — RU2 / U26-U27:** implement provider traversal and coverage
   diagnostics on RU1's selected-surface contract. Keep this as one stacked
   child PR so the reviewer sees traversal evidence and its gap reporting as a
   single provider-risk slice.
4. **Wave 3 — Seneschal aggregate:** run the root-owned aggregate fingerprint,
   then make RDM-014/RDM-015/RDM-018 consume the accepted surface contract.

No independent parallel mutation is safe for U24-U27 because the units touch
central public schemas, session/generation state, provider interfaces, and
shared fixtures. At most two open PRs may exist in the chain; at the cap, wait
for the parent to merge into `main` or collapse the pending child onto the
refreshed integration base.

## Detailed design and invariants

### U24 — graph model and metadata

- Define an internal graph record with a bounded opaque surface reference,
  stable non-actionable identity hint, parent identity, bounded metadata, and
  provider/runtime provenance.
- Keep parent/child edges deterministic and cycle-free. The selected surface
  must always belong to the current owned session and graph generation.
- Include only bounded label/title/dimensions/state/capability evidence; omit
  provider ports, nonces, URLs, raw WebDriver IDs, and sensitive app content.
- Project the selected surface context into snapshots/interactions without
  changing existing no-surface behavior.
- Treat graph publication as an observation boundary: malformed provider data
  yields a typed partial/unsupported result, never a fabricated child.

### U25 — discovery, selection, and capabilities

- Enumerate provider windows/contexts through the existing authenticated
  WebDriver boundary; never expose a raw provider endpoint or arbitrary handle.
- Detect a dynamic child after launch by an explicit bounded refresh and return
  a new graph observation; do not launch another app session.
- Selection validates session ownership, graph generation, parentage, and
  provider reachability before changing active context.
- Record operation-level capability evidence for discovery, selection,
  observation, interaction, and screenshot. A capability is effective only when
  permission and postcondition evidence both succeed.
- Distinguish a provider-known unsupported operation from unavailable context,
  denied permission, and failed postcondition according to DR-013-002; unknown
  evidence remains conservative and non-actionable.
- Ensure a failed/uncertain switch advances or preserves generation exactly as
  the accepted RDM-009 matrix requires, with no stale ref reuse.

### U26 — traversal and nested providers

- Extend the existing deterministic browser traversal to preserve Dockview
  panel ownership and open-shadow boundaries in the surface graph.
- Traverse same-origin/provider-reachable iframe or WebView contexts only after
  an explicit provider capability probe. Keep frame/window identity bounded and
  avoid URL or document-content disclosure.
- Materialize exact provider element handles for supported nested contexts;
  unsupported or closed contexts produce gap records and no actionable refs.
- Preserve semantic parentage and relationship resolution within each owning
  document/shadow root; do not merge unrelated roots into one fake tree.
- Add fixtures that create/destroy nested contexts after launch and verify the
  graph refresh is deterministic and bounded.

### U27 — visual coverage diagnostics

- Accept only an existing bounded PNG/screenshot result plus semantic bounds;
  do not add OCR, pixel-driven interaction, or coordinate fallback.
- Compare only what geometry can prove. Return a bounded list of surface-owned
  gap records with reason/evidence codes and a conservative
  `coverage_unknown` state when occlusion, provider bounds, or clipping make a
  conclusion uncertain.
- Keep diagnostics non-actionable: gap records can guide a new semantic
  snapshot or instrumentation review but cannot be passed to click/type APIs.
- Sanitize labels/text through the existing observation boundary and preserve
  screenshot retention limits; never persist a raw diagnostic payload by
  default.
- Update maintained contract/compatibility/security docs only with behavior
  proven by tests and provider evidence.

## Impact and consumer map

| Contract/surface | Planned impact | Consumers to scan | Ownership/serialization |
| --- | --- | --- | --- |
| Snapshot schema and generation table | Add selected-surface context and graph-aware refs while preserving no-surface compatibility. | `src/observation/*`, `src/interaction/*`, `tests/unit/snapshot*.test.ts`, `tests/integration/*`, `tests/contract/*`. | RDM-009 contract is upstream; RDM-013 consumes it. Serialize with RDM-018. |
| WebDriver context operations | Add bounded discovery/switch/probe capability only within authenticated client. | `src/webdriver/*`, `src/session/*`, `tests/integration/webdriver-provider.test.ts`, `tests/platform/provider-*`. | RDM-013 owns surface provider extension; RDM-014/RDM-015 consume interfaces. |
| MCP public tools/schemas | Additive surface discovery/selection or snapshot extensions per DR-013-001. | `src/mcp/domain-ports.ts`, `src/mcp/schemas.ts`, `src/mcp/server.ts`, `src/mcp/runtime.ts`, contract tests. | Public contract serialized across RDM-013/RDM-014/RDM-015/RDM-018. |
| Coverage diagnostic schema | New bounded evidence fields per DR-013-003. | `src/observation/screenshot.ts`, `src/observation/schema.ts`, `tests/contract`, `tests/integration`. | RDM-013 owns; RDM-019 consumes evidence. |
| Maintained docs | Document truthful support/gaps and compatibility additions. | `docs/contracts.md`, `docs/architecture.md`, `docs/compatibility.md`, `docs/security.md`. | Keep with the related review unit; no separate docs-only branch. |
| Shared fixtures | Nested panel/shadow/iframe/window and gap fixtures. | `tests/fixtures/tauri-app`, `tests/fixtures/accessibility`, platform helpers. | Serialize fixture edits with all surface consumers. |

See the standalone overlap map for explicit sibling ownership and protected
surfaces: `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-013-surface-graph-dependency-map.md`.

## Verification matrix

| Risk | Required check | Evidence expected |
| --- | --- | --- |
| Public schema drift | `pnpm test:contract` | Existing seven-tool calls pass; new surface calls validate strict bounds, stable errors, and additive compatibility. |
| Graph/generation confusion | `pnpm test:unit` | Parent/child, stale/wrong-surface, session ownership, and uncertain-switch tests pass. |
| Provider traversal | `pnpm test:integration` | Owned fixture proves open shadow, nested panels, reachable iframe/WebView, dynamic discovery, and cleanup. |
| Platform/provider truthfulness | `pnpm test:platform:windows` plus Linux structural/provider evidence when available | Capability matrix records actual provider result; unsupported contexts remain gaps. |
| Disclosure/authority | unit/contract redaction and ownership tests | No provider nonce/port/raw handle/URL/sensitive content crosses MCP; gap data remains untrusted and non-actionable. |
| CI break prevention | Seneschal aggregate `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm pack:check` | Root-owned fingerprint after both review units, with any CI-only gap explicitly recorded. |

## Definition of done

- DR-013-001, DR-013-002, and DR-013-003 have canonical brokered answers in the
  initiative contract and requirements artifact.
- RU1 and RU2 each have an independently reviewable scope, focused evidence,
  and no unresolved P0-P2 correctness/security finding.
- Provider feasibility is recorded per operation/context; no unsupported
  provider behavior is claimed.
- Every supported visible Tinto control has a fresh actionable ref after the
  relevant selection/snapshot; every unsupported visible region has bounded
  owning-surface gap evidence.
- Existing contracts, security invariants, and capability composition remain
  green; product implementation and focused evidence are included in this
  execution run.
