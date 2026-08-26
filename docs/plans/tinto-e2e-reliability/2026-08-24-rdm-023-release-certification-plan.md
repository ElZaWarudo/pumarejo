---
title: RDM-023 final regression and release certification implementation plan
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
status: plan-review-passed
date: 2026-08-24
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-023
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-24-rdm-023-release-certification-requirements.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
origin_gap_audit: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-023-release-certification
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-023-release-certification/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
units: [U54, U55, U56, U57]
open_decisions: []
---

# RDM-023 final regression and release certification implementation plan

## Outcome

Create one evidence-oriented certification slice that closes the final gap
between review-passed RDM-019–RDM-022 artifacts and a Release Marshal-ready
release plan. The slice assembles existing contracts and future focused checks;
it does not introduce product behavior or relax the security/compatibility
contracts.

The implementation must stop at the first missing required dependency or
required environment. It may retain advisory skip evidence, but it must never
turn a skip into a pass or claim complete support for an unexecuted matrix row.

## Constraints and design rules

- Use the real generated Cargo fixture and real `cargo fmt` executable. The
  formatter proof must hash the generated Rust file set before/after two
  passes and also run `cargo fmt --check`.
- Use disposable fixture copies and a protected evidence root. Never normalize,
  delete, or write the user's Tinto checkout or shared fixture source.
- Reuse RDM-019's sanitized Tinto manifest and RDM-020/021/022 evidence
  contracts. The certification layer only validates receipts and composes the
  final matrix.
- Preserve the initiative's explicit-policy cleanup rule: no policy means
  preserve, explicit bounded policy means evaluate only owned in-scope
  artifacts, and ambiguous ownership is a blocker.
- Keep evidence records canonical and sanitized before hashing or persistence.
  Hashes do not authorize a missing or stale live check.
- Keep the current package Node engine contract (`>=22 <25`) and compatibility
  rows from `docs/compatibility.md`/`docs/delivery-workflow.md`; do not infer a
  new platform support promise from local availability.
- Treat `production` as unknown. This is a compatibility-preserving release
  gate, not a deployment or publication action.

## High-level design

The future runner has four layers:

1. **Readiness resolver:** validates RDM-019–RDM-022 receipts, shared source
   revision, accepted cleanup policy, required Node/platform profiles, and
   required tool/provider identities before a claim starts.
2. **Fixture and lane executors:** run isolated capability/Cargo/format/package
   checks, consume the real Tinto and hardening receipts, and return typed
   `passed | failed | skipped | blocked` lane records.
3. **Evidence normalizer:** removes raw output and authority material, applies
   bounded fields, sorts canonical records, computes per-lane and bundle
   fingerprints, and writes only the approved sanitized index.
4. **Blocking reducer and handoff adapter:** evaluates the release matrix,
   classifies blockers/advisories, and emits the exact context Release Marshal
   needs without invoking it from this child.

The reducer must be monotonic: adding an unexecuted, failed, stale, or
security-blocked row cannot improve the final disposition. A required skip is
`blocked` for readiness purposes even when the environment failure itself is
truthfully recorded as `skipped` in the diagnostic lane record.

## Implementation units

### U54 — dependency closure and deterministic evidence identity

Validate review-passed RDM-019–RDM-022 receipts, shared revision, source
fingerprints, package version, accepted explicit-policy cleanup disposition,
and required lane inventory. Define canonical lane/result schemas and the
sanitized hashing algorithm. Reject stale, copied, malformed, or incomplete
receipts before running release claims.

Dependencies: RDM-019–RDM-022 artifact/review states and the shared initiative
contract. This unit does not edit those artifacts.

### U55 — capability composition and real Cargo formatter proof

Run the existing capability JSON/TOML composition matrix, including consumer
capability preservation, isolated Pumarejo capability shape, wildcard and
duplicate rejection, malformed syntax, unsafe links/reparse points, and
permission/identifier authority checks. Generate a temporary consumer through
the actual Pumarejo generation path, run real `cargo fmt` twice, hash the
generated Rust file set after each pass, and run `cargo fmt --check`.

The fixture is disposable and must be removed only by the fixture harness;
release retained-artifact policy is not inferred from this temporary cleanup.

### U56 — supported matrix execution and hardening receipts

Run the formatting baseline, Node 22/24 package lanes, Windows/Linux platform
suites, package/pack smoke, and RDM-019 Tinto evidence verification. Consume
RDM-020 attributed-drift and RDM-022 self-doctor receipts and verify both
branches of RDM-021 cleanup behavior (explicit policy and policy absent).

Each lane records exact tool/platform/provider versions, command IDs, status,
postcondition, cleanup status, skip/failure reason, and fingerprint. A lane
that starts but violates its assertion is `failed`; a required lane that cannot
start is `blocked`; only a declared optional prerequisite gap may be retained
as `skipped`.

### U57 — release reducer, security gate, and Marshal packet

Apply the release blocking matrix, attach security review findings, verify that
all required fingerprints are current, and emit a sanitized readiness packet
with commands, evidence paths, blockers, advisories, and exact rerun steps.
The packet says `ready for Release Marshal` only when all required rows pass,
security review passes, and no unexplained owned residue remains. It never
requests or performs a merge, PR, Jira transition, push, publication, or
release mutation.

## Verification contract

The following commands are future implementation gates; none runs in this
artifact-only child:

### Focused certification and compatibility checks

```text
pnpm exec vitest run tests/release/release-safety.test.ts
pnpm exec vitest run tests/contract/cli.test.ts tests/contract/exports.test.ts tests/contract/package.test.ts tests/contract/mcp-server.test.ts tests/contract/real-usage-journey.test.ts
pnpm exec vitest run tests/integration/doctor.test.ts tests/integration/artifact-store.test.ts tests/integration/init.test.ts tests/integration/remove.test.ts tests/integration/session-cleanup.test.ts tests/integration/surface-graph.test.ts
pnpm test:agent
pnpm test:platform:structural
pnpm test:platform:windows
pnpm test:platform:linux
```

### Real Cargo fixture proof

Run the actual generation flow against a temporary copy of a consumer fixture,
then use the fixture's manifest rather than a hard-coded source snippet:

```text
<real generation command> --fixture <temporary-consumer-copy>
cargo fmt --manifest-path <temporary-consumer-copy>/src-tauri/Cargo.toml
sha256(<generated Rust file set>) -> rustfmt_pass_1
cargo fmt --manifest-path <temporary-consumer-copy>/src-tauri/Cargo.toml
sha256(<generated Rust file set>) -> rustfmt_pass_2
cargo fmt --manifest-path <temporary-consumer-copy>/src-tauri/Cargo.toml -- --check
```

The concrete generation command must be the accepted CLI/API path discovered
by the implementation worker; placeholders in this plan are a guard against
inventing a command before the RDM-020/RDM-022 installer contracts reconcile.
The proof fails if `rustfmt_pass_1 != rustfmt_pass_2`, if `--check` is dirty,
if generation changes consumer-owned capability content, or if the fixture is
not a real Cargo project.

### Aggregate gates per required Node lane

After a frozen install on Node 22 and Node 24, run:

```text
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack:check
pnpm validate
```

`pnpm validate` is the repository's declared aggregate script. Individual
commands remain listed so a failure can be attributed to one surface and so a
partial rerun does not disguise a red aggregate result. Use the exact
supported platform command on Windows/Linux rather than substituting a generic
unit suite.

## Environment and provider disposition

The matrix records `required` versus `advisory` independently from runtime
status. The current repository evidence requires Node 22/24 package lanes and
the supported Windows/Linux platform suites. Existing delivery documentation
identifies Windows Node 22/24 and Ubuntu Node 22 as established lanes; any
Linux Node 24 lane must be labeled according to the reconciled support/CI
contract instead of being silently inferred from package engines.

- A required environment absent before launch is `blocked` for release.
- A declared optional provider/display/toolchain unavailable before launch is
  `skipped` with observed identity, stable reason, and exact rerun prerequisite;
  the overall disposition remains `incomplete`/not ready.
- A provider available but unable to prove a required operation is `failed` or
  typed `unsupported` according to the provider contract, and blocks any row
  whose acceptance depends on that operation.
- A command that starts and returns a non-zero exit, assertion failure,
  residue, sanitizer leak, or formatting drift is `failed`, never `skipped`.
- No provider fallback, mocked Tinto, screenshot-only result, or host-only
  evidence may upgrade a missing platform row.

## Release blocking matrix and reducer

The reducer consumes one row per gate in the requirements matrix. It evaluates
in this order:

1. malformed/stale dependency receipt or missing required lane -> `blocked`;
2. security review P0/P1 or security-relevant P2 -> `blocked`;
3. any required row `failed` -> `blocked`;
4. any required row absent, `skipped`, or advisory-only -> `incomplete`;
5. all required rows passed and fingerprints recompute -> `ready`.

An overall `ready` result additionally requires explicit evidence that absent
cleanup policy preserves retained artifacts and that all owned residue is zero
or an exact bounded retryable residue with ownership proof. A required skip is
retained with `skip_reason` but is never collapsed into an advisory pass.

## Evidence and fingerprint design

Each sanitized lane record contains only:

```text
schema, lane_id, requiredness, source_revision, package_version,
platform_identity, node_version, provider_identity, command_ids,
status, stable_reason, assertion, postcondition, cleanup_status,
dependency_receipt_ids, rerun_command_ids
```

The index stores SHA-256 fingerprints for the canonical sorted lane record,
dependency receipt set, capability fixture set, generated-Rust file set,
command manifest, and complete sanitized bundle. Raw stdout/stderr, paths,
tokens, credentials, PIDs, nonces, provider handles, Tinto content, and
unredacted screenshots remain outside the retained index. The bundle records
redaction/bound counters and evidence locations, not the sensitive values.

## Impact and consumer scan

- **Changed API/contracts/bindings/auth/tenant:** none intended; this is a
  release evidence and test harness boundary. Existing public contracts are
  consumed and checked, not changed.
- **Future implementation surfaces:** `tests/release/`, focused contract and
  integration fixtures, platform gate composition, temporary Cargo fixture
  generation, and the approved release-evidence index. No such files are
  edited in this child.
- **Consumer scan patterns:**
  `rg "capabilit|Cargo|cargo fmt|rustfmt|format:check|pack:check|Tinto|tinto|doctor|drift|retain|cleanup|provider|unsupported|node" src tests docs package.json`.
- **Contract drift searched:** capability identifier/window/permission
  allowlists, wildcard and duplicate handling, generated Rust markers,
  package exports/files/bin, diagnostic IDs/statuses, explicit cleanup policy,
  provider outcome vocabulary, and Tinto evidence authenticity.
- **Product tests in this child:** intentionally skipped because the delegated
  contract is artifact-only and forbids product/test edits.

## Review and security gates

- Document review must pass before implementation.
- Future implementation code review threshold is P0-P2; no blocking finding
  may remain after the work/review loop.
- Security review is required after the work-review loop because this matrix
  crosses capability authority, generated code, file/link boundaries, process
  ownership, dialog grants, sanitization, and explicit cleanup.
- Security verification must include seeded secrets/paths, capability
  authority expansion, unsafe links/reparse points, unrelated-process safety,
  no-policy artifact preservation, explicit-policy bounded cleanup, and
  fingerprint recomputation from sanitized data.

## Definition of done

- U54–U57 are implemented in one independently reviewable certification slice
  with no product contract decision left open.
- The real generated Cargo fixture proves rustfmt idempotence and capability
  composition without mutating shared fixtures.
- Node 22/24, required Windows/Linux, formatting, package/pack, Tinto,
  security, cleanup-policy, self-doctor, and drift rows have explicit results.
- Every environment/provider skip or failure is attributed and cannot be
  counted as pass.
- The sanitized bundle and fingerprints reproduce on the same source revision.
- The final packet is either `ready for Release Marshal` with no unresolved
  blockers or a precise blocked/incomplete report with owner and rerun command.

