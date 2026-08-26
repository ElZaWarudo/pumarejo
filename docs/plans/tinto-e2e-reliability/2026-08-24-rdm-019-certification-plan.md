---
title: RDM-019 complete Tinto end-to-end certification implementation plan
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
status: plan-review-passed
date: 2026-08-24
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-019
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-019-certification-requirements.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-019-certification
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-019-certification/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
units: [U37, U38, U39]
open_decisions: []
---

# RDM-019 complete Tinto end-to-end certification implementation plan

## Outcome

Build a certification-only harness that drives the actual Tinto application
through Pumarejo's public MCP client and produces reviewable Windows/Linux
evidence. The harness owns disposable setup, one-session journey sequencing,
provider-gated result projection, forced timeout/disconnect execution, cleanup
audits, and a sanitized retained-artifact manifest. It must consume the
accepted RDM-013–RDM-018 contracts; it does not implement or rename those
contracts and does not turn the existing mocked journey into a release claim.

This plan is implementation-ready for the test/harness slice. It does not
authorize product implementation in this artifact run.

## Constraints and inherited contracts

- Preserve local `stdio`, one public MCP client, one owned Tinto application
  session, exact current-generation refs, bounded output, and no generic
  desktop automation.
- Use a real pinned Tinto checkout and a disposable canonical copy. The
  operator checkout, shared live fixtures, capability manifests, lockfiles,
  and sibling worker changes are read-only inputs.
- Resolve launch environment, toolchains, provider identity, and display mode
  through RDM-017's accepted bounded resolver; no raw PATH/environment or
  arbitrary shell is available to the harness.
- Consume RDM-013 surface discovery/selection and coverage truth; RDM-014
  window/dialog outcomes and grant rules; RDM-015 sanitized diagnostic query
  and explicit retention; RDM-016 process custody/residue proof; and RDM-018
  sequence/generation semantics. Do not duplicate their algorithms.
- Run the archived conversation/composer/Send/access-selector flow only with
  public operations. A provider inability to enumerate, select, verify, or
  authorize yields a typed skip/outcome and never a fallback pass.
- Sanitize before storage and apply artifact limits before persistence. Raw
  Tinto content, tokens, credentials, full paths, environment, provider
  handles, PIDs, nonces, arguments, and nested causes remain absent.
- `production:unknown` remains the posture. No deployment, migration, release,
  Jira, or external mutation is part of this plan.

## Plan units

| Unit | Scope and deliverable | Dependencies | Primary surfaces | Focused proof |
| --- | --- | --- | --- | --- |
| U37 | Deterministic real-Tinto setup and successful public journey: disposable copy, initialization/configuration, one owned launch, dynamic surface discovery/selection, archived conversation, composer/Send, window postconditions, and unauthorized/authorized dialog path. | RDM-013, RDM-014, RDM-017, RDM-018; RDM-015 query boundary for phase evidence. | `tests/support/tinto-harness.ts`, `tests/support/tinto-config.ts`, `tests/integration/tinto-harness.test.ts`, `tests/contract/tinto-public-journey.test.ts`. | Pinned real Tinto launch, fresh refs, dynamic surface graph, semantic Send mutation, effective window state, dialog denial then one-shot authorized postcondition. |
| U38 | Real forced timeout/disconnect, bounded diagnostics, ownership-safe cleanup, unrelated-process safety, and idempotent close. | U37; RDM-015, RDM-016, RDM-017; RDM-018 generation/sequence outcomes. | `tests/support/tinto-failure-scenarios.ts`, `tests/integration/tinto-failure-cleanup.test.ts`, `tests/contract/tinto-diagnostics.test.ts`. | Deterministic fixture-controlled delay, client deadline/transport loss, sanitized phase/error evidence, zero owned residue or exact retryable residue, untouched sibling process. |
| U39 | Windows/Linux/provider matrix, truthful skip projection, retained-artifact manifest, and final certification report. | U37/U38; all RDM-013–RDM-018 gates; explicit retention policy from initiative/RDM-015/021. | `tests/platform/tinto-certification.test.ts`, `tests/platform/tinto-failure-matrix.test.ts`, `tests/support/tinto-evidence.ts`, `docs/evidence/rdm-019/README.md` (future retained output contract). | Separate platform/provider rows, stable skip reasons, sanitized JSON/manifest bounds, no pass claim on skipped required rows, platform residue proof. |

## Dependency and execution waves

1. **Wave 0 — contract readiness:** Seneschal confirms readable accepted
   outputs for RDM-013–RDM-018, including the public MCP schema, provider
   grants, diagnostic query, custody proof, toolchain profile, and generation
   matrix. If any contract is not accepted, U37/U38/U39 remain design-ready
   but no product certification claim starts.
2. **Wave 1 — RU1/U37 success journey:** implement the disposable Tinto
   harness and the public journey. Keep setup and assertions tied to one
   client/session, with fresh snapshots at every mutation and explicit
   provider outcomes. RU1 is independently reviewable as a real-use proof.
3. **Wave 2 — RU2/U38-U39 failure and matrix evidence:** after RU1's parent
   review/merge or a reconciled integration base, add forced failure,
   cleanup/diagnostic assertions, and platform/provider evidence. Keep failure
   injection in the real Tinto fixture/profile boundary, never in mocked
   domain ports. The evidence manifest and report stay with this integrated
   unit so cleanup and disclosure cannot be reviewed separately from failure
   claims.
4. **Wave 3 — Seneschal aggregate:** reconcile RDM-019's evidence fingerprint
   with RDM-020–RDM-022 and then RDM-023. Root owns `pnpm validate` and the
   aggregate regression matrix; this child does not create a release claim.

Shared public MCP schemas, central session/generation state, provider
interfaces, capability manifests, and shared fixtures are serialized by
Seneschal. The certification harness uses new isolated test support and
evidence paths; any required edit to an existing shared fixture returns to the
parent for sequencing.

## High-Level Technical Design

### U37 — real Tinto harness and success journey

- `tinto-config` accepts a pinned checkout/revision, lockfile/toolchain
  fingerprint, Pumarejo launch profile, display/provider mode, bounded fixed
  inputs, and protected evidence root. It rejects missing, linked, mutable,
  or out-of-root inputs before any launch.
- `tinto-harness` creates a disposable canonical copy, runs the existing
  supported init/configure contract with attributable manifesting, and starts
  one independent MCP client over `stdio`. It exposes phase-scoped helpers
  that assert session/process/nonce/generation ownership without exposing
  those values in output.
- The journey first waits for readiness/status, then calls the accepted
  discovery operation, selects the archived-conversation surface, and repeats
  discovery after the access panel appears. Snapshot helpers require a fresh
  actionable generation for composer, Send, and access selector; continuation
  or unsupported surfaces are evidence only.
- Window helpers request initial dimensions and each supported action, then
  compare returned effective dimensions/state. The helper records a provider
  skip only when the capability probe is explicit and preserves the canonical
  outcome vocabulary.
- The dialog helper executes two separate cases: no grant (assert denial and
  unresolved dialog) and a fresh exact-action grant (assert postcondition,
  audit evidence, one-shot consumption, and replay rejection). It never uses a
  timeout or generic native input as a decision.
- Assertions use a fixed non-sensitive message and fixture account/access
  values. They do not assert raw Tinto transcript text or personal data; only
  stable semantic roles, bounded state, and provider evidence are retained.

### U38 — forced failure, diagnostics, and cleanup

- The failure scenario uses a real Tinto/provider delay controlled by the
  disposable fixture profile and a bounded client deadline. The delay is
  deterministic and owned by the launch profile; it is not a fake domain port,
  arbitrary JavaScript call, or a second process.
- The client records the timeout or transport-loss phase, requests the
  accepted status/diagnostic path when still connected, and then exercises the
  normal cleanup/recovery contract. If the transport is gone, only the
  RDM-016 owner/repair path may converge resources.
- The harness starts a separately identified unrelated sibling process only
  when the custody contract permits a deterministic ownership test. It proves
  that cleanup does not terminate or alter that process and never includes
  its identity or command in retained output.
- Diagnostic assertions query bounded launch phase, invocation, console or
  process, and last-error projections. A seeded corpus is checked at the
  in-memory/store boundary and in the serialized artifact; useful stable code,
  phase, duration bucket, retryability, and recovery guidance remain.
- Close is idempotent. Post-close probes verify owned descendants, ports,
  Job Object/process-group state, runtime directories, and disposable copy
  cleanup using RDM-016 identity proof. Ambiguous ownership remains an exact
  retryable residue and fails certification; it never triggers broad cleanup.

### U39 — matrix, skips, and retained evidence

- A matrix runner executes the same semantic scenario for accepted Windows and
  Linux host/provider profiles. It records sanitized host family, provider
  capability summary, toolchain outcome, display mode, result status, and
  stable reason codes; raw host paths and environment are excluded.
- The matrix distinguishes `passed`, `failed`, `skipped`, and `blocked`.
  Provider/platform skips include an observed prerequisite and rerun command or
  input, are excluded from the pass numerator, and make the overall result
  incomplete when the row is required.
- `tinto-evidence` writes only bounded sanitized records: manifest, phase
  summary, surface/capability summary, dialog/window outcomes, diagnostics,
  failure/cleanup summary, and matrix disposition. It uses explicit opt-in
  retention and existing protected artifact limits; it does not implement
  implicit age/count deletion owned by RDM-021.
- The future `docs/evidence/rdm-019/README.md` describes reproducible claims
  and platform disposition without usernames, absolute paths, screenshots
  containing app data, transcript bodies, credentials, tokens, nonces, or raw
  logs. It is emitted only after the manifest passes sanitization and bounds.

## Security and compatibility invariants

- Trust path: pinned Tinto/disposable profile -> allowlisted launch -> owned
  session/provider -> current semantic refs/dialog grant -> sanitize-before-
  store diagnostics -> protected bounded artifact.
- No harness helper can construct an actionable ref from a name, selector,
  screenshot, or stale generation; no diagnostic record can authorize action.
- Grant/session/process/surface/generation mismatch is fail-closed. The
  unauthorized dialog assertion proves the dialog remains unresolved before
  the authorized case is attempted.
- Cleanup never follows an unproven path or kills an unowned PID/group; an
  unrelated sibling process is an explicit negative control.
- Provider/platform uncertainty is not a success fallback. Required skips keep
  the run incomplete and carry exact stable evidence.
- Existing public tools and compatibility behavior remain valid when the
  certification harness is absent; no new public operation or capability
  synonym is introduced by this plan.

## Verification strategy

| Gate | Exact command/evidence | Pass criterion |
| --- | --- | --- |
| Harness setup | `pnpm exec vitest run tests/integration/tinto-harness.test.ts` | Pinned/disposable setup, init/config manifest, link safety, allowlisted profile, no operator-checkout mutation, and deterministic cleanup pass. |
| Public success contract | `pnpm exec vitest run tests/contract/tinto-public-journey.test.ts` | Real independent MCP client completes discovery, selection, composer/Send, window, dialog deny/grant, fresh refs, and bounded result assertions. |
| Diagnostics/cleanup | `pnpm exec vitest run tests/contract/tinto-diagnostics.test.ts tests/integration/tinto-failure-cleanup.test.ts` | Seeded values are absent after sanitize-before-store; timeout/disconnect evidence is bounded; ownership cleanup and unrelated-process safety pass. |
| Windows matrix | `pnpm exec vitest run --no-file-parallelism tests/platform/tinto-certification.test.ts tests/platform/tinto-failure-matrix.test.ts` | Real Windows Tinto/provider rows pass or emit explicit non-pass skips; no residue remains. |
| Linux matrix | `pnpm exec vitest run --no-file-parallelism tests/platform/tinto-certification.test.ts tests/platform/tinto-failure-matrix.test.ts` | Real Linux Tinto/provider/display rows pass or emit explicit non-pass skips; process-group/listener proof is retained. |
| Evidence integrity | `pnpm exec vitest run tests/support/tinto-evidence.test.ts` | Manifest ordering, byte/count limits, permissions/containment, explicit retention, seeded redaction, and no raw path/env/authority data pass. |
| Root aggregate | `pnpm validate` | Build, typecheck, lint, format, ordinary tests, and package checks remain green with the certification slice. |
| Parent release regression | `pnpm build`; `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm test`; `pnpm pack:check` | Root-owned aggregate fingerprint is green after all RDM-013–RDM-018 and RDM-019 surfaces are serialized. |

The two platform commands are intentionally identical at the file level; the
host/provider configuration is supplied by the approved certification
harness, not by a command-line branch that could silently exercise a mock.
Each unavailable host/provider must emit the exact sanitized skip artifact and
the command/output owner before the parent can classify it.

## Ownership and overlap boundary

| Surface | RDM-019 use | Owner/coordination rule |
| --- | --- | --- |
| `src/mcp/*`, session, provider, capabilities | Public consumer only | RDM-013–RDM-018 own contract/implementation; no edits from this package. |
| Shared live Tinto/fixture projects | Read-only input | Seneschal serializes any required changes; this run must use a disposable copy. |
| `tests/contract/real-usage-journey.test.ts` | Baseline comparison only | Mocked-port journey is not certification evidence and is not rewritten here. |
| `tests/platform/public-journey.test.ts` | Live generic pattern only | Existing generic fixture remains separate; RDM-019 adds explicit Tinto tests. |
| `tests/support/tinto-*`, certification tests | RDM-019 ownership | New isolated harness/evidence paths; review RU1/RU2. |
| `docs/evidence/rdm-019/` | RDM-019 retained report contract | Only sanitized bounded output; RDM-021 owns cleanup policy. |

Any request to change a public MCP schema, provider interface, shared fixture,
capability manifest, process-custody rule, diagnostic field, retention policy,
or Tinto checkout itself returns to Seneschal as a brokered scope/contract
decision; it is not inferred inside the certification harness.

## Risks and mitigations

| Risk | Mitigation and required evidence |
| --- | --- |
| The suite silently reverts to mocks or generic fixtures. | Assert the independent public MCP transport, real Tinto process identity, pinned revision, and non-mock provider; fail setup if a domain-port double is present. |
| Provider cannot enumerate a visible nested panel or native dialog. | Keep separate capability/coverage rows, emit canonical unsupported/unavailable evidence, and mark required certification incomplete. |
| Authorization assertion accidentally accepts the dialog. | Run denial first, assert unresolved state, bind a fresh exact-action grant, assert postcondition, and test replay/scope mismatch. |
| Timeout cleanup kills an unrelated process. | RDM-016 owner identity/ancestry/nonce/command proof, explicit negative-control process, bounded convergence, and retryable residue on ambiguity. |
| Diagnostics leak seeded secrets or personal paths. | Seed corpus, sanitize-before-store assertion, artifact re-read, path/env/authority denylist, and protected manifest limits. |
| Windows/Linux availability causes false confidence. | Matrix rows carry host/provider/toolchain/display disposition; skip is non-pass and overall complete requires required rows. |
| Retention cleanup deletes operator evidence. | Explicit opt-in only; RDM-021 owns cleanup policy; no implicit deletion in RDM-019. |



