---
title: RDM-013 surface graph dependency and overlap map
status: reviewed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-013
compound_run_id: tinto-e2e-rdm-013-surfaces
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-013-surfaces/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
---

# RDM-013 surface graph dependency and overlap map

## Dependency graph

```text
RDM-009 bounded observation contract
        |
        v
U24 graph model + metadata ----> U25 discovery/selection + capabilities
                                      |
                                      v
                         U26 provider traversal
                                      |
                                      v
                         U27 coverage diagnostics
                                      |
                                      v
               RDM-014 native control / RDM-015 observability
                                      |
                                      v
                             RDM-018 sequences/refs
```

RDM-019 consumes all downstream evidence. RDM-009 is the only upstream
implementation owner for its bounded observation package; RDM-013 does not
edit that package or its per-run state.

## Sibling ownership and protected surfaces

| Surface | RDM-013 ownership | Sibling owner/relationship | Coordination rule |
| --- | --- | --- | --- |
| `src/observation/browser-traversal.ts`, `browser-entry.ts` | U26 nested surface traversal and graph parentage. | RDM-009 owns current bounded/redacted traversal contract; RDM-018 later consumes generation behavior. | Read RDM-009 output; serialize changes to traversal and refs. |
| `src/observation/snapshot.ts`, `schema.ts`, `refs.ts` | U24/U26 graph context and selected-surface validation. | RDM-009 owns bounded observation semantics; RDM-018 owns sequence/reference composition. | No redefinition of continuation/actionability; central generation changes serialized. |
| `src/webdriver/client.ts`, `protocol.ts`, `endpoint.ts` | U25/U26 bounded provider context discovery/switch/probes. | RDM-014 may consume provider capability interfaces; RDM-015 may add diagnostics. | Keep provider port/nonce/private handle boundaries unchanged; one integrator. |
| `src/session/state.ts`, `manager.ts`, `runtime.ts` | U24/U25 active-surface/session binding. | RDM-014 native control, RDM-015 observability, RDM-016 process custody, and RDM-018 sequences depend on central state. | Public/session state changes serialize across the entire wave. |
| `src/mcp/domain-ports.ts`, `schemas.ts`, `server.ts`, `runtime.ts`, `tools/index.ts` | RU1 additive graph discovery/selection contract after DR-013-001. | RDM-014, RDM-015, and RDM-018 add adjacent public operations. | No parallel edits; preserve strict schemas and existing seven-tool behavior. |
| `src/observation/screenshot.ts`, `schema.ts` | RU2 bounded non-actionable coverage evidence. | RDM-019 consumes evidence; RDM-015 owns logs/errors. | Keep screenshot retention and image validation unchanged. |
| `docs/contracts.md`, `docs/architecture.md`, `docs/compatibility.md`, `docs/security.md` | RU1/RU2 maintained contract updates only for proven behavior. | All downstream public/security items rely on these docs. | Keep docs with the semantic review unit; no docs-only branch. |
| Shared fixtures under `tests/fixtures/` and platform helpers | Nested/surface/gap fixtures. | RDM-009 and all provider/runtime items use shared fixtures. | Add only attributable fixtures; serialize edits and run focused suites. |
| `src/installer/project.ts`, `tests/unit/project-detection.test.ts` | **None.** | User-owned dirty installer changes; RDM-017/RDM-020/RDM-022 concern them. | Do not read-modify-reset or include in this package. |
| RDM-009 package/state | **None.** | Worker `/root/...rdm009...` owns `docs/work-packages/RDM-009-*` and its state. | Do not edit, stage, or reconcile sibling state from this run. |

## Review/merge order

- RU1 is the parent semantic contract slice and must be reviewed/merged before
  RU2 is retargeted or handed off.
- RU2 is the only child slice and must not exceed one open child on top of RU1;
  the total chain is capped at two open PRs.
- RDM-014 and RDM-015 may plan in parallel after the RU1 contract is accepted,
  but implementations that touch `src/mcp`, central session state, provider
  interfaces, or shared fixtures serialize against RDM-013.
- RDM-018 remains dependent on the accepted generation/surface matrix and must
  carry any downstream-fix trace if it addresses an earlier review finding.

## Decision and verification gates

- DR-013-001 gates public MCP schema ownership across RU1 and downstream items.
- DR-013-002 gates capability/error vocabulary used by RU1 and RU2.
- DR-013-003 gates the diagnostic contract used by RU2 and RDM-019.
- Provider feasibility probes are read-only and may continue while decisions
  are brokered; they cannot authorize unsupported behavior.
- Product tests are not run in this artifact-only phase. The package's literal
  focused checks are `pnpm test:unit`, `pnpm test:integration`,
  `pnpm test:contract`, and `pnpm test:platform:windows`, followed by the
  Seneschal-owned aggregate commands.

