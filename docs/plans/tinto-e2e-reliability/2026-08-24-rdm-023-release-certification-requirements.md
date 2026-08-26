---
title: RDM-023 final regression and release certification requirements
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: inherited-initiative
status: review-passed
date: 2026-08-24
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-023
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-023-release-certification
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-023-release-certification/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
open_decisions: []
---

# RDM-023 final regression and release certification requirements

## Goal capsule

RDM-023 is the final evidence-only gate after the RDM-019 Tinto journey and
the RDM-020, RDM-021, and RDM-022 hardening packages. It certifies that the
accepted capability composition, generated Rust formatting, supported Node
lines, Windows/Linux suites, package boundary, Tinto evidence, diagnostics,
artifact policy, self-doctor, and attributed-drift behavior compose into a
release-ready result.

This artifact defines the certification contract and its future focused checks.
The current nested run writes planning and orchestration documents only: it
does not edit product code, tests, fixtures, configuration, generated output,
Jira, Git, release evidence, or shipping state.

## Inherited authority and boundaries

- `docs/plans/tinto-e2e-reliability/initiative-requirements.md` is the binding
  product contract. Existing capability composition and rustfmt compatibility
  are regression gates, not new feature work.
- `docs/product/roadmap.md` makes RDM-019, RDM-020, RDM-021, and RDM-022 hard
  prerequisites for RDM-023 and describes this item as a standard evidence
  unit.
- `docs/audits/2026-08-21-tinto-gap-audit.md` identifies the missing Cargo
  fixture proof and fragmented full matrix that this item closes.
- RDM-019 owns real Tinto journey evidence; RDM-020 owns attributed drift;
  RDM-021 owns network/discovery/retention policy; RDM-022 owns self-doctor.
  RDM-023 consumes their accepted contracts and evidence, and does not
  redefine or reimplement them.
- The explicit retained-artifact policy is authoritative: absence of an
  operator-supplied bounded policy preserves retained artifacts. No release
  check may assume an implicit deletion default.
- Provider or environment uncertainty is reported as a typed non-pass result;
  a skipped row cannot be counted as passed or complete.

## Actors and outcome

- **Release evidence operator:** runs the bounded matrix in a clean checkout
  and records versions, platform identity, provider disposition, and command
  results without retaining secrets or raw Tinto content.
- **Pumarejo maintainer:** receives one deterministic evidence bundle and a
  blocking decision for every required release gate.
- **Security reviewer:** verifies capability authority, generated-code
  provenance, artifact cleanup policy, evidence sanitization, and truthful
  provider/environment outcomes.
- **Release Marshal:** consumes the reconciled, release-ready packet only after
  all required rows are passed and no blocking findings remain.

The outcome is a sanitized, reproducible certification bundle with per-lane
fingerprints, dependency receipts, explicit skips/failures, and a final
`ready | blocked | incomplete` disposition. The bundle is evidence, not merge
or publication authorization.

## Scope

The future certification implementation must:

1. Verify that RDM-019 through RDM-022 have review-passed contracts and
   attributable evidence before executing release claims.
2. Exercise JSON and TOML capability fixtures, existing capability composition,
   initialized-window isolation, wildcard-window rejection, malformed files,
   unsafe links/reparse points, and duplicate capability/permission IDs.
3. Generate a real temporary Cargo consumer fixture through the accepted
   Pumarejo generation path, run real `cargo fmt`/`rustfmt` against the
   generated Rust, and prove byte-level idempotence across two formatting
   passes. A hand-written Rust snippet or a mocked formatter is insufficient.
4. Run the repository formatting baseline and aggregate build/typecheck/lint/
   test/pack gates on the supported Node 22 and Node 24 lanes.
5. Run the supported Windows and Linux platform suites, retaining platform and
   provider identity, display/provider prerequisites, and ownership residue
   evidence.
6. Smoke the built package and dry-run tarball boundary, including package
   metadata, exports, CLI entrypoint, and the package allowlist.
7. Verify the RDM-019 real Tinto evidence receipt: public-MCP journey,
   unauthorized dialog decision, authorized decision, forced timeout or
   disconnect, sanitized diagnostics, and zero owned residue or exact owned
   retryable residue.
8. Require a focused security review of the complete matrix and evidence
   bundle, including capability composition, path/link handling, process
   ownership, sanitizer boundaries, and no implicit cleanup.
9. Consume RDM-020, RDM-021, and RDM-022 evidence for attributed drift,
   explicit-policy artifact cleanup, and self-doctor without changing their
   owners or duplicating their evaluators.
10. Emit a release blocking matrix and a handoff packet sufficient for
    `krt-release-marshal` to make its own release-plan decision.

## Non-goals

- Implementing or changing public MCP behavior, session ownership, provider
  capability vocabulary, native dialog authorization, toolchain resolution,
  cleanup policy, self-doctor, or attributed-drift semantics.
- Treating mocked domain ports, generic platform fixtures, screenshots, OCR,
  coordinates, or arbitrary shell/WebDriver/Tauri commands as Tinto evidence.
- Generating a second application session, approving a native dialog by
  timeout, following an unproven link, or terminating an unowned process.
- Introducing a default age/count/byte policy that deletes retained artifacts.
- Publishing a package, creating a PR, transitioning Jira, pushing a branch,
  merging, requesting reviewers, or mutating release state.

## Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| CERT-023-001 | Certification is dependency-gated. | The run refuses a complete disposition until RDM-019, RDM-020, RDM-021, and RDM-022 each provide a review-passed artifact/evidence receipt on the same reconciled revision; an absent or stale receipt is `blocked`. |
| CERT-023-002 | Capability composition remains additive and least-authority. | Real JSON and TOML fixtures retain the consumer capability while adding only the isolated Pumarejo capability; wildcard windows, duplicate IDs/permissions, malformed syntax, unexpected authority, and unsafe links fail closed. |
| CERT-023-003 | Generated Rust is rustfmt-idempotent from a real fixture. | A temporary consumer fixture is generated through the real generation path; after `cargo fmt` twice, generated Rust hashes are identical, `cargo fmt --check` is clean, and the fixture's original capability/config content remains composed. |
| CERT-023-004 | The formatting baseline is explicit. | `pnpm format:check` passes against the configured source, tests, fixtures, and generated-input baseline; a formatting-only failure is attributed to the lane and blocks rather than hidden by a skip. |
| CERT-023-005 | Node 22 and Node 24 package lanes are independently evidenced. | Each supported Node line records exact version, frozen install result, build/typecheck/lint/format/test/pack results, package fingerprint, and sanitized command receipts. A missing required Node lane is `blocked`, not `passed`. |
| CERT-023-006 | Windows and Linux platform behavior is evidenced. | Supported Windows and Linux lanes run their platform gate and platform suite with host/provider/display identity, ownership residue proof, and per-test result; an unavailable prerequisite is a named `skipped` row that cannot complete the release. |
| CERT-023-007 | Package and pack smoke remain safe. | The built CLI starts from the packed boundary, exports resolve, `npm pack --dry-run --json` contains only the allowlisted files, and no source/test/evidence secret enters the tarball. |
| CERT-023-008 | Real Tinto evidence is consumed without weakening authenticity. | The receipt names a pinned Tinto revision/profile and independent public-MCP client, one owned session, dynamic surfaces, composer/Send, dialog denial then one-shot authorization, timeout/disconnect, sanitization, and residue outcome. Mocked or generic evidence yields `blocked`. |
| CERT-023-009 | Security review covers the release boundary. | `krt-security-sentinel` (or an approved fallback) reviews capability authority, generated Rust, links/paths, process cleanup, dialog evidence, artifact retention, and redaction; unresolved P0/P1 findings and security-relevant P2 findings block. |
| CERT-023-010 | Provider and environment outcomes are truthful. | Every lane is `passed`, `failed`, `skipped`, or `blocked` with observed identity, stable reason, prerequisite, consequence, and rerun instruction; `skipped` never increments a pass count and never yields `ready`. |
| CERT-023-011 | Artifact cleanup honors explicit policy only. | With an explicit bounded policy, only owned in-scope retained artifacts are evaluated/cleaned and the result is fingerprinted; with no policy, artifacts are preserved and the evidence proves no implicit deletion. Unowned or ambiguous residue blocks. |
| CERT-023-012 | Self-doctor and attributed drift are regression consumers. | RDM-022 healthy and known broken-install diagnostics remain bounded/read-only with safe guidance; RDM-020 tolerates unrelated edits while detecting owned mutation/deletion/duplication/malformed/unsafe content. |
| CERT-023-013 | Evidence is bounded, sanitized, and reproducible. | Canonical lane records and dependency receipts have SHA-256 fingerprints over sanitized sorted data; no secret, full path, token, PID, nonce, provider handle, raw Tinto content, raw environment, or unredacted screenshot is retained. |
| CERT-023-014 | Release blocking is deterministic. | The final report has one matrix row per required gate, a disposition algorithm, blockers grouped by lane/severity, and a readiness checklist that Release Marshal can verify without inferring missing evidence. |

## Matrix status contract

Each row has exactly one status:

- **`passed`** — the prerequisite was present and the assertion plus its
  postcondition/evidence passed.
- **`failed`** — the prerequisite was present, the assertion or postcondition
  failed, or the lane exposed a regression. This is release-blocking.
- **`skipped`** — a declared optional environment/provider capability is absent
  or incompatible before the claim starts. The row records identity, stable
  reason, prerequisite, and rerun command. It is not a pass and cannot produce
  overall `ready`.
- **`blocked`** — an accepted dependency, required environment, security gate,
  evidence receipt, or policy decision is missing or stale. No runtime claim is
  made. This is release-blocking.

An environment skip is not an assertion failure: it may be retained as
diagnostic evidence when a lane is explicitly non-required by the current
compatibility/workflow contract. A required lane that cannot start is
`blocked`, not `skipped`. A lane that starts and then cannot satisfy its
postcondition is `failed`, even when the symptom looks like provider
incompatibility. The report must state whether the row is `required` or
`advisory`; advisory skips remain non-pass evidence and may not be described as
full-matrix coverage.

## Release blocking matrix

| Gate family | Required rows | `passed` | `failed`/`blocked` | `skipped` disposition |
| --- | --- | --- | --- | --- |
| Dependency receipts | RDM-019, RDM-020, RDM-021, RDM-022, shared revision | Receipt fingerprint and review status agree. | Blocks all release claims. | Not allowed for a required dependency. |
| Capability composition | JSON, TOML, wildcard, malformed, duplicate, unsafe-link fixtures | All required fixtures pass and preserve consumer authority. | Blocks release; security review required. | Only a fixture explicitly unsupported by the accepted contract may be advisory, never complete. |
| Cargo formatting | Real generated Cargo fixture, two `cargo fmt` passes, `--check` | Hashes stable and format check clean. | Blocks release. | Missing `cargo`/`rustfmt` is blocked on a supported lane; no formatter skip for the required proof. |
| Formatting baseline | `pnpm format:check` | Clean baseline. | Blocks release. | Never silently skipped. |
| Node package lanes | Node 22 and Node 24 supported lanes | Frozen install and aggregate package gates pass. | Blocks the affected lane and release. | Only a lane explicitly non-required in the current support contract may be advisory; record the gap. |
| Platform suites | Supported Windows and Linux platform rows | Gate, suite, provider/display, and residue evidence pass. | Blocks affected required platform. | Missing optional provider/display is non-pass; overall readiness stays incomplete. |
| Package/pack smoke | Build, exports, CLI, tarball dry-run | Allowlist and executable smoke pass. | Blocks release. | Not allowed. |
| Tinto evidence | RDM-019 real journey and forced failure receipts | Authenticity, sanitizer, authorization, and residue checks pass. | Blocks release. | Not allowed; generic/mocked evidence is blocked. |
| Security review | Matrix/bundle review | No unresolved blocking findings. | Blocks release. | Not allowed. |
| Artifact policy | Explicit-policy cleanup and no-policy preservation | Both policy branches are evidenced. | Blocks release on deletion, scope, or residue mismatch. | Not allowed; absent policy must be tested as preserve. |
| Self-doctor/drift | RDM-022 and RDM-020 receipts | Consumer behavior remains compatible and bounded. | Blocks release on regression or unsafe false negative. | Not allowed for the required regression fixtures. |

## Evidence bundle contract

The future implementation emits a bounded bundle under the release evidence
root chosen by the parent/release owner. This planning run does not create or
modify that root. The canonical sanitized index contains:

- bundle ID, schema version, run ID, source revision, package version, and
  creation timestamp;
- required/advisory lane matrix with status, command ID, platform/Node/provider
  identity, stable reason, and dependency receipt fingerprints;
- per-gate assertion result, postcondition result, cleanup disposition, and
  redaction count without raw output;
- SHA-256 fingerprints of canonical sorted lane records, dependency receipts,
  generated-Rust file set, capability fixture set, command manifest, and final
  index; and
- a blocker list, advisory list, skipped-row list, security review reference,
  and exact rerun commands.

Fingerprints are evidence of the sanitized record, not authority to bypass a
failed live check. They must be recomputed from the current source revision
and environment; a copied or stale fingerprint is `blocked`.

## Success criteria

1. All required dependency, capability, Cargo, formatting, Node, package,
   platform, Tinto, security, cleanup-policy, self-doctor, and drift rows are
   `passed`.
2. No row is silently omitted, converted from `failed` to `skipped`, or
   counted as pass because a provider or environment was unavailable.
3. The generated Cargo fixture proves real formatter idempotence, not merely
   a Prettier or text-normalization check.
4. The evidence bundle is sanitized, bounded, fingerprinted, reproducible, and
   sufficient for Release Marshal to verify readiness and remaining advisories.
5. No product, shared state, tenant/auth, retention, or public contract is
   changed by the certification itself.

## Escalation boundaries

Return a brokered decision request instead of inferring when a proposal would:

- make an advisory environment required or remove a supported environment;
- change capability composition, dialog authorization, cleanup ownership, or
  public contract behavior;
- add an implicit artifact-deletion default;
- treat an unsupported provider as equivalent to a supported pass;
- retain raw Tinto content, secrets, paths, environment values, authority
  material, or unbounded screenshots; or
- alter Release Marshal's branch, Jira, PR, merge, publication, or approval
  contract.

