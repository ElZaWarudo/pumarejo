---
title: RDM-013 nested semantic surface graph requirements
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
status: review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-013
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
compound_run_id: tinto-e2e-rdm-013-surfaces
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-013-surfaces/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: []
---

# RDM-013 nested semantic surface graph requirements

## Context and inherited authority

Pumarejo must complete the Tinto journey through one owned application session
while making every supported visible target semantically addressable. The
initiative contract is the authority for one local `stdio` MCP session,
generation-scoped opaque action references, provider-derived capabilities,
bounded sanitized output, and explicit reporting of unsupported surfaces.

RDM-009 owns the bounded-observation continuation and disclosure contract. This
item consumes that contract and must not redefine continuation generations,
redaction, or actionable reference lifetime. RDM-010 through RDM-012 are
review-passed baselines. The three RDM-013 decisions are now canonically
approved by the user and authorize the additive implementation described by
this package.

## Scope

RDM-013 defines and implements the semantic surface graph for the active owned
session:

- enumerate supported Tauri windows/WebViews and nested provider contexts;
- select an active surface explicitly and discover surfaces created after
  launch without creating a second independent application session;
- traverse Dockview-style nested panel composition, open shadow roots, and
  provider-reachable iframes/WebViews when the provider proves reachability;
- expose bounded surface identity, parentage, label/title, dimensions, state,
  provider/runtime provenance, and per-operation effective capability metadata;
- preserve exact current-generation element references within the selected
  surface and invalidate them according to the inherited generation contract;
- compare a bounded screenshot region with semantic coverage and report
  unsupported/unrepresented visible regions with owning-surface context; and
- keep provider limitations truthful, including unsupported or unavailable
  contexts, instead of synthesizing nodes or actionable references.

## Non-goals

- closed shadow roots without explicit application instrumentation;
- arbitrary JavaScript, CSS/XPath selectors, WebDriver passthrough, shell
  commands, coordinate/OCR automation, or browser chrome;
- multiple independently launched application sessions in one MCP owner;
- claiming cross-origin iframe or secondary-window support without a positive
  provider feasibility probe;
- changing RDM-009 bounded snapshot/redaction/generation semantics;
- native dialog acceptance/cancellation (RDM-014), diagnostic buffers (RDM-015),
  process custody (RDM-016), environment/toolchain resolution (RDM-017), or
  sequence batching (RDM-018); and
- release, Jira, branch, commit, PR, or product-code changes in this artifact
  run.

## Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| SURF-001 | A surface graph represents every provider-observable supported context in the one owned session with parent/child relationships and bounded metadata. | A fixture containing a Tauri window, a nested WebView/panel, and an open shadow root yields deterministic surface records with no duplicate or orphaned parent references. |
| SURF-002 | Discovery and selection are explicit and dynamic. | A newly created supported window/WebView appears after launch, can be selected as active, and the next snapshot carries the selected surface context. |
| SURF-003 | Element references remain exact and generation-scoped within the selected surface. | A stale or wrong-surface ref is rejected; a successful surface switch or observation publishes a fresh generation according to the inherited RDM-009 matrix. |
| SURF-004 | Traversal includes Dockview-style nested panel roots and open shadow roots, plus only provider-reachable iframe/WebView contexts. | Visible Tinto composer, Send control, and access selector receive current actionable refs when the provider exposes their context; closed roots remain explicit gaps. |
| SURF-005 | Surface capabilities are derived from provider/runtime probes and distinguish supported, unsupported, unavailable, denied, and postcondition-failed states where evidence permits. | A capability matrix never advertises selection, observation, interaction, or screenshot support before the provider probe proves it. |
| SURF-006 | Coverage diagnostics compare screenshot geometry with semantic coverage using bounded, non-actionable evidence. | A visible region with no semantic representation is reported with its owning surface and reason; the diagnostic never invents a node or authorizes coordinate interaction. |
| SURF-007 | Unsupported visible regions are truthful and actionable for diagnosis. | Closed shadow roots, unreachable iframes, browser chrome, and provider gaps are named as unsupported/unavailable with a corrective or instrumentation suggestion. |
| SURF-008 | Surface metadata and diagnostics preserve the existing disclosure, trust-boundary, and ownership rules. | Outputs are bounded/sanitized, application content remains untrusted data, provider endpoints/nonces stay private, and no unrelated session can be selected. |

## Required public semantics (provisional until brokered decisions close)

The implementation must make the following facts observable, while exact field
and tool names remain subject to the decision broker:

- a bounded opaque surface handle or equivalent exact selection reference;
- a stable, non-actionable identity hint for correlation only;
- parent surface identity and a bounded child list or graph edge;
- label/title, dimensions/viewport, lifecycle state, active status, and owning
  session context without leaking provider endpoints or nonces;
- per-operation capability evidence for discovery, selection, observation,
  interaction, and screenshot; and
- current generation plus the selected surface identity on every observation or
  interaction result that can be acted upon.

No stable identity hint may replace an actionable current-generation reference.
No capability state may be inferred solely from a provider brand or a static
configuration file.

## Provider feasibility and unsupported-state rules

Before implementation claims support, the worker must probe the certified
provider on Windows and Linux for:

1. window handle enumeration and selection;
2. provider-reachable iframe/WebView context switching;
3. open shadow-root traversal and exact element-handle materialization;
4. dynamic child-window/WebView discovery after launch; and
5. screenshot capture plus semantic bounds in each supported context.

The result is a capability matrix keyed by provider/runtime and operation. A
negative or inconclusive probe is not a reason to fake support: the affected
context remains a visible coverage gap with an evidence code and safe next
action. Application instrumentation for a provider limitation is a separate
reviewed option, as required by the initiative contract.

## Security and compatibility invariants

- Preserve one owned session, authenticated loopback proxy, private provider
  port, per-session nonce, and process ownership checks.
- Never expose raw provider handles, selector text, coordinates, frame URLs,
  sensitive title/text, or screenshot bytes beyond existing bounded/sanitized
  boundaries.
- Treat iframe/window labels and rendered application content as untrusted
  data; they cannot alter tool descriptions, authorization, or scope.
- Reject a surface reference from another generation, session, or parent graph.
- Closed shadow roots and unsupported provider contexts must fail closed.
- Existing seven-tool contracts remain compatible; additive fields/tools need
  schema/version review, and removal or incompatible changes require explicit
  approval.

## Verification contract

Focused verification after implementation is literal and surface-aware:

```text
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:platform:windows
```

The package must additionally record structural/provider feasibility evidence
for Linux where the host permits it, and the exact aggregate command remains
owned by Seneschal. Contract tests must cover stale/wrong-surface references,
dynamic discovery, unsupported states, open-shadow and provider-reachable
iframe traversal, screenshot/semantic gap reporting, bounded metadata, and
disclosure/ownership failures.

## Resolved brokered decisions

The following answers were approved by the user on 2026-08-21 and are binding
for RDM-013 implementation. They are also recorded in the shared initiative
contract so dependent items consume one vocabulary and one compatibility shape.

### DR-013-001 — additive dedicated operations

Surface discovery and active selection use additive dedicated MCP operations.
Existing snapshot/window operations remain backward compatible when no surface
context is supplied. Selection returns fresh current-generation evidence.

### DR-013-002 — explicit operation outcome matrix

Surface/provider operations expose only bounded, sanitized outcomes from the
explicit matrix `supported`, `unsupported`, `unavailable`, `denied`, and
`failed`. Every emitted outcome has a stable code; provider identity, raw
handles, endpoints, nonces, and sensitive content remain private.

### DR-013-003 — conservative provider region map

Coverage diagnostics consume only provider-reported bounded region maps and
semantic bounds. Geometry that cannot prove a gap returns `coverage_unknown`.
Diagnostics never authorize OCR, coordinates, or any other non-semantic action.

## Historical brokered decision requests

These decisions are intentionally not inferred from the requirements-only
contract. They block only the affected implementation units; safe artifact
review and provider exploration may continue.

### DR-013-001 — Public surface graph API shape

- **Question:** Should discovery and selection be additive dedicated tools, or
  should the existing snapshot/window tools be extended with surface fields and
  selection input?
- **Why not inferable:** Both preserve the semantic intent but change tool
  schemas, compatibility documentation, and downstream RDM-014/RDM-015/RDM-018
  composition differently.
- **Recommendation:** Use one additive discovery operation and one additive
  selection operation, returning bounded graph metadata and fresh current
  generation evidence; keep `tauri_snapshot` backward compatible when no
  surface is supplied.
- **Safe fallback:** Keep surface graph behavior internal and mark RDM-013
  implementation-ready only after the public shape is recorded.
- **Affected units:** U24, U25, RU1, RDM-014, RDM-015, RDM-018.
- **Canonical target:** `docs/plans/tinto-e2e-reliability/initiative-requirements.md`.

### DR-013-002 — Surface capability state vocabulary

- **Question:** Which public vocabulary and evidence fields distinguish a
  provider limitation, a permission denial, an unimplemented operation, an
  unavailable context, and a failed postcondition?
- **Why not inferable:** RDM-014 settles effective native-control capability
  semantics, but RDM-013 must apply a compatible vocabulary to surface
  discovery/traversal before that item is planned.
- **Recommendation:** Expose a bounded operation matrix with explicit
  `supported`, `unsupported`, `unavailable`, `denied`, and `failed` states,
  each carrying a stable code and sanitized evidence; omit states not proven.
- **Safe fallback:** Report only `unsupported` with a stable reason code and do
  not expose an actionable surface operation.
- **Affected units:** U25, U26, RU1, RU2, RDM-014.
- **Canonical target:** `docs/plans/tinto-e2e-reliability/initiative-requirements.md`.

### DR-013-003 — Screenshot-to-semantics gap policy

- **Question:** What bounded visual-region granularity and threshold should the
  diagnostic use when screenshot pixels extend beyond semantic node bounds?
- **Why not inferable:** The initiative requires truthful gaps but intentionally
  does not prescribe a pixel segmentation, occlusion, or threshold policy.
- **Recommendation:** Start with a provider-reported bounded region map and
  conservative `coverage_unknown` when geometry cannot prove a gap; never use
  OCR or coordinates and never fail a journey solely on an inconclusive region.
- **Safe fallback:** Emit only proven unsupported-surface gaps and mark visual
  comparison unavailable until the policy is accepted.
- **Affected units:** U27, RU2, RDM-019.
- **Canonical target:** `docs/plans/tinto-e2e-reliability/initiative-requirements.md`.

## Ownership and overlap boundary

RDM-009 owns its package/state and the bounded observation contract. RDM-013
may consume, but not edit, those surfaces while that worker is active. Existing
dirty installer files (`src/installer/project.ts` and
`tests/unit/project-detection.test.ts`) are outside this item and remain user
owned. Public MCP schemas, central session/generation state, provider
interfaces, and shared fixtures are serialized across RDM-013 and dependent
items; this artifact records the overlap for Seneschal rather than claiming
parallel ownership.
