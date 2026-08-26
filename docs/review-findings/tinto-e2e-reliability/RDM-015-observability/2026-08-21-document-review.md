---
title: RDM-015 bounded observability document review
status: passed-with-decision-gates
date: 2026-08-21
roadmap_item: RDM-015
compound_run_id: tinto-e2e-rdm-015-observability
review_mode: non-interactive
review_role: ce-doc-review
security_role: krt-security-sentinel-design-gate
---

# RDM-015 bounded observability document review

## Review scope and coverage

The non-interactive review covered the focused requirements, implementation
plan, dependency/overlap map, and work package as one delivery packet:

- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-requirements.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-plan.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-015-observability-dependency-map.md`
- `docs/work-packages/RDM-015-observability/2026-08-21-015-bounded-runtime-observability-work-package.md`

Review lenses:

- coherence reviewer (always-on): requirements, units, gates, and package
  alignment;
- feasibility reviewer (always-on): current runtime/session/provider/artifact
  seams, tests, and execution sequencing;
- product lens: sensitive observability outcome, public compatibility, and
  downstream RDM-016/017/019/021 value;
- scope guardian: 13 requirements, four units, two review units, and explicit
  non-goals/ownership boundaries;
- adversarial reviewer: new sanitize-before-store abstraction, public query
  decision gates, provider capability ambiguity, and retention boundary; and
- security lens: secrets, application content, process output, provider data,
  ownership/session/surface scope, and optional durable retention.

The review was performed inline in the serial artifact lane. No product-code,
mutating reviewer, or external service was used; the result is durable here
and records all unresolved decisions for Seneschal.

## Evidence inspected

- Initiative contract: `docs/plans/tinto-e2e-reliability/initiative-requirements.md`
  (approved requirements-only contract; bounded sanitized observability and
  explicit memory-only/default retention rules).
- Gap audit: `docs/audits/2026-08-21-tinto-gap-audit.md` (REL-006 missing
  queryable console/process/invocation/phase buffers and sanitize-before-store).
- Roadmap: `docs/product/roadmap.md` RDM-015 and dependency graph.
- RDM-009 package/state: accepted redaction, generation, and bounded
  observation contract.
- RDM-010 package: accepted launch phase/status and cleanup ownership.
- RDM-013 requirements/plan/package/state/review: surface binding and the
  open DEC-2026-08-21-003/004 public decision gates.
- Existing seams: `src/mcp/domain-ports.ts`, `src/mcp/runtime.ts`,
  `src/mcp/schemas.ts`, `src/mcp/server.ts`, `src/session/manager.ts`,
  `src/session/state.ts`, `src/platform/tracked-process.ts`, Windows/Linux
  process adapters, `src/webdriver/client.ts`, `src/shared/errors.ts`, and
  `src/artifacts/store.ts`.
- Shared artifact bundle: `sha256:b0f646489c37c205beccbe6cbe26cb5aa1169b73d8d83922d6a0fb8af5a48d12`.
- Mechanical work-package check: `work package review-unit checks passed`.

## Review result

**The artifact gates pass with two explicit inherited decision gates.** The
packet defines an internal sanitize-before-store ring-buffer architecture,
source-specific producers, finite query composition, explicit retention
opt-in, ownership/security tests, dependency waves, and a two-unit review
stack. It does not invent public operation names or capability vocabulary.

No finding requires an artifact rewrite before handoff. RU1 is safe for future
internal implementation after Seneschal scheduling; RU2 public wiring remains
blocked until the canonical decisions are persisted.

## Findings and routing

| ID | Severity | Finding | Route | Resolution/evidence |
| --- | --- | --- | --- | --- |
| DEC-2026-08-21-003 | P1 contract gate | Public diagnostics query composition must follow the RDM-013 public shape; additive operation versus extension is not inferable locally. | Brokered decision; blocks U30/U31 and RU2 public wiring. | Requirements, plan, dependency map, package, state, and summary carry the inherited decision, recommendation to consume RDM-013, and safe fallback. |
| DEC-2026-08-21-004 | P1 contract/security gate | Source capability outcomes must use the canonical RDM-013 vocabulary and bounded evidence fields; a local synonym would overstate provider support. | Brokered decision; blocks provider-source public projection in U29/U30/U31 and RU2. | Artifacts require an internal adapter, conservative unknown handling, provider-gated capture, and no invented public label. |
| F-015-003 | P1 security design note | Sanitizing only at serialization would leave secrets in memory or retained artifacts. | Required implementation/security verification. | All artifacts require sanitize-before-store, allowlisted fields, seeded corpus tests, and protected retained projections. |
| F-015-004 | P1 provider/security note | Console capture cannot use arbitrary script or provider-brand inference when logs are unavailable. | Required provider feasibility and implementation tests. | U29 requires provider-supported capability evidence and truthful unsupported/unavailable fallback. |
| F-015-005 | P2 retention boundary | Durable diagnostics can create sensitive persistence and cleanup ambiguity. | Required explicit-policy review; RDM-021 owns cleanup. | Memory-only default, explicit bounded opt-in, existing artifact protections, and no inferred age/count/byte deletion are repeated across all artifacts. |
| F-015-006 | P2 compatibility note | Existing status/error calls and MCP framing must remain valid when query is absent or bounded output is exhausted. | Required contract regression tests. | OBS-011, U30, verification gate, and impact scan require additive compatibility and framing evidence. |
| F-015-007 | P2 ownership note | Process/surface records could leak across sessions or survive lease loss. | Required implementation/security tests. | U28/U29 bind events to owned session/surface, reject stale ownership, clear non-retained buffers on close, and test wrong-session/surface queries. |
| F-015-008 | P3 scope note | Shared MCP/session/provider/config/artifact files are claimed as future surfaces by multiple workers. | Seneschal serialization; no artifact blocker. | Dependency map lists each overlap and forbids concurrent mutation; this child changed only owned docs. |

## Security/public-contract gate summary

- Trust boundary preserved: owned process/provider/session -> sanitizer ->
  bounded memory -> optional protected retained projection -> MCP.
- Authorization/ownership preserved: records are scoped to the current owned
  session and RDM-013 surface context; diagnostic data never authorizes action
  or surface selection.
- Disclosure preserved: secrets, marked-sensitive content, unsafe paths,
  arbitrary args, causes, provider identifiers, full process identity, and
  environment/PATH details are excluded before storage.
- Provider safety preserved: console capture is capability-gated and does not
  add arbitrary script or raw WebDriver access.
- Retention safety preserved: memory-only default, explicit bounded opt-in,
  existing artifact containment/permissions, no inferred cleanup policy.
- Public compatibility preserved: exact query operation/fields and capability
  state vocabulary are deferred to DEC-003/004; existing status/error/MCP
  framing remain regression gates.

## Mechanical verification

```text
python C:\Users\User\.agents\skills\krt-compound-master\scripts\check_work_package.py docs/work-packages/RDM-015-observability/2026-08-21-015-bounded-runtime-observability-work-package.md
```

Result: `work package review-unit checks passed`.

Product tests were intentionally not run: this is `mode:artifacts`, and the
delegated scope forbids product-code/test/config edits. Future implementation
must run `pnpm test:unit`, `pnpm test:integration`, and `pnpm test:contract`,
with applicable platform/provider evidence and the Seneschal aggregate gate.

## Review handoff

- Artifact status: ready for Seneschal reconciliation with two brokered
  decisions recorded as blockers.
- Internal implementation status: RU1 may be scheduled after parent confirms
  serialized ownership; no public RU2 wiring until DEC-003/004 are canonical.
- Security status: design gate acceptable with required implementation tests;
  formal implementation Security Sentinel review remains pending.
- Shipping status: disabled; no commit, stage, push, PR, reviewer request,
  Jira, merge, or release action was performed.

