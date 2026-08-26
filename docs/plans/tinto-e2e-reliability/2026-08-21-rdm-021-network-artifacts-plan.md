---
title: RDM-021 loopback diagnostics and artifact hygiene implementation plan
artifact_contract: ce-plan/v1
artifact_readiness: implementation-ready
status: plan-review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-021
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-021-network-artifacts-requirements.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-021-network-artifacts
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-021-network-artifacts/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
units: [U30, U31]
open_decisions: [DR-021-001]
---

# RDM-021 loopback diagnostics and artifact hygiene implementation plan

## Outcome

Make loopback failures explainable across IPv4 and IPv6 and make repository
discovery/retained-artifact maintenance deterministic without weakening the
existing ownership, containment, permission, or bounded-output model. A Tinto
launch should identify whether the observed listener matches the declared
family/port and `build.devUrl`, while a diagnostic or cleanup pass should never
walk a runtime copy, follow a link, delete unknown content, or leak raw local
details.

The plan is implementation-ready for the pure models, evaluators, tests, and
RDM-015/RDM-016 adapter points. Automatic deletion of retained artifacts with a
new product-wide default remains behind `DR-021-001`; absent a canonical answer,
the safe implementation is an explicit policy input and no implicit deletion.

## Constraints and inherited contracts

- Consume, do not redefine, RDM-015's sanitize-before-store bounded diagnostic
  sink and RDM-016's process/listener ownership and cleanup authority.
- Preserve authenticated loopback proxy behavior, private provider port and
  nonce, one owned application session, no shell/OS passthrough, and no
  non-loopback binding.
- Keep `build.devUrl` parsing strict and bounded. Treat `localhost` as an
  ambiguity to diagnose, not as permission to resolve arbitrary DNS.
- Use `lstat`, canonical-path checks, regular-file/directory checks, and
  revalidation before every read, rename, or delete. A link or replacement race
  fails closed and never touches the link target.
- Keep existing `retainArtifacts` behavior compatible until the brokered
  retention-default decision is canonical. A pure cleanup evaluator may be
  implemented and tested before runtime wiring.
- The current run changes documentation only. Implementation and product tests
  belong to a later `mode:execute` run after parent reconciliation.
- Production posture is `unknown`; additive behavior and compatibility proof
  are required, and no deployment/rollback assumptions are invented.

## Plan units

| Unit | Scope and deliverable | Dependencies | Primary surfaces | Focused proof |
| --- | --- | --- | --- | --- |
| U30 | Family-aware loopback model, reservation/readiness observation, strict `build.devUrl` comparison, typed correction, and bounded RDM-015 evidence adapter. | RDM-015 bounded diagnostics; RDM-016 listener ownership; `DR-021-001` not required for the network slice. | `src/platform/loopback.ts` (new pure model), `src/session/endpoint.ts`, `src/platform/tracked-process.ts`, existing Tauri-config parser in `src/platform/mode-config.ts`, Windows/Linux launch seams, `src/shared/errors.ts`, `tests/unit`, `tests/integration`, `tests/platform`, maintained contract/security docs. | Deterministic parser and fake-listener tests, IPv4/IPv6 readiness tests, ownership/refusal tests, and platform probes where the family exists. |
| U31 | Shared discovery exclusion predicate, explicit-fixture policy, retained-session cleanup evaluator, containment/link-race defenses, owner-only permissions, and bounded RDM-015 evidence. | Existing `ArtifactStore` manifest/permission/recovery invariants; RDM-015 sink; RDM-016 active-session/cleanup state. Automatic default activation waits for `DR-021-001`. | `src/artifacts/store.ts` or a package-local policy module, `src/artifacts/permissions.ts`, runtime initialization/cleanup adapter, `src/config` retention policy input, `tests/unit`, `tests/integration`, `tests/platform`, security/compatibility docs. | Fake-clock policy tests, manifest/link-race tests, exclusion/fixture tests, permissions tests, crash recovery, and deterministic repeated cleanup. |

## Dependency and execution waves

1. **Wave 0 — contract and adapter inventory:** confirm the reviewed RDM-015
   diagnostic sink and RDM-016 listener/active-session evidence. Resolve the
   exact Tauri config extraction handoff and broker `DR-021-001`. Read-only
   inspection may continue while the retention decision is pending.
2. **Wave 1 — RU1/U30 network:** implement the pure endpoint/devUrl model and
   wire it through reservation/readiness without changing the public MCP shape.
   Add Windows/Linux adapters only through existing process/ownership seams.
3. **Wave 2 — RU2/U31 artifacts:** implement exclusions, explicit fixture
   validation, policy evaluation, and retention/recovery integration. Keep
   policy ordering and evidence generation independent from file deletion.
4. **Wave 3 — parent reconciliation:** run the root aggregate fingerprint and
   reconcile any overlap with RDM-020, RDM-022, and RDM-023 before release
   planning. No child invokes release or Jira.

U30 and U31 can be reviewed as independent slices, but implementation changes
to `src/config`, shared platform helpers, or shared fixtures serialize. Do not
open more than two review units in the chain.

## Detailed design

### U30 — loopback diagnostics

1. Add a pure `LoopbackEndpoint`/observation model with `family: ipv4|ipv6`,
   canonical host (`127.0.0.1` or `::1`), bounded port, and bracketed URL
   rendering. Do not accept wildcard, external, or DNS-resolved hosts.
2. Refactor provider reservation/readiness seams so the declared family is
   probed explicitly. A dual-stack platform still records each family
   separately; a successful IPv4 connection must not satisfy an IPv6 request.
3. Return a typed observation for `available`, `occupied`, `refused`,
   `timeout`, `wrong-family`, and `ownership-unproven`. Use RDM-016's process
   identity/port owner proof before reporting readiness; do not add termination
   or repair behavior here.
4. Parse the Tauri configuration's bounded `build.devUrl` at the existing
   `src/platform/mode-config.ts` parser boundary (the same JSON/JSON5/TOML
   source used to build the runtime overlay), and pass only a sanitized summary
   into the Windows/Linux launch seams. Compare scheme/host-family/port with the
   observed listener. For `localhost`, wildcard, malformed, or non-loopback values,
   produce a stable mismatch/invalid code and a correction using explicit
   loopback syntax. Never include the raw URL, credentials, filesystem path,
   or parser cause in public evidence.
5. Adapt the result to RDM-015's sanitize-before-store input. The bounded
   record includes phase, stable code, family, port-presence/fact, listener and
   ownership state, duration bucket, retryability, and a short suggestion. Keep
   raw causes local for logging only if the RDM-015 contract permits it after
   sanitization.

### U31 — discovery, retention, and containment

1. Centralize a pure default exclusion predicate. Apply it before opening a
   directory and before queueing children. The default set is `.git`,
   `.worktrees`, `.pumarejo`, `node_modules`, `target`, and configured owned
   runtime/artifact roots; the predicate is case-aware according to the host
   filesystem and has deterministic precedence.
2. Treat an explicit fixture selection as an intent signal, not a security
   bypass. Normalize it under an allowed root, reject links/junctions and
   canonical escapes, require regular-file/directory type, and revalidate just
   before reading. An explicitly selected path that is a default-excluded
   directory may be read only when it passes these checks.
3. Define a pure retention evaluator accepting `now`, closed manifest metadata,
   and explicit finite age/count/byte limits. Sort by canonical creation time
   then stable session ID; preserve active sessions, valid in-policy sessions,
   malformed/foreign manifests, and unmanifested content. The evaluator returns
   a deletion plan, not filesystem side effects.
4. Apply a deletion plan through existing `ArtifactStore` containment and
   manifest validation. Revalidate root, session directory, each manifest
   entry, and canonical identity immediately before deletion/rename. Unknown
   files, links, races, and permission failures are retained and yield a
   retryable bounded evidence record.
5. Keep permission establishment before writes and preserve POSIX `0700`/`0600`
   plus current-SID Windows DACL behavior. Verify permissions on directories,
   manifests, temporary files, and final files. Do not broaden the artifact
   root or create a second recovery journal.
6. Route cleanup counts and refusal reasons through RDM-015's bounded sink.
   Only stable codes, relative labels from an allowlisted vocabulary, counts,
   byte totals, retryability, and suggestions may cross the trust boundary.

## Ownership and overlap controls

| Surface | RDM-021 use | Other owner/relationship | Rule |
| --- | --- | --- | --- |
| `src/session/endpoint.ts`, `src/platform/tracked-process.ts` | U30 family-aware reservation/readiness seams. | RDM-016 owns process custody and listener ownership proof. | Consume RDM-016 evidence; no termination, lease, or ownership policy rewrite. |
| `src/platform/mode-config.ts` plus Windows/Linux launch seams | U30 reads the already-owned bounded JSON/JSON5/TOML parser and passes a sanitized `build.devUrl` summary. | RDM-020/RDM-022 own installer/doctor surfaces. | Keep extraction in the platform parser; do not edit `src/installer/project.ts`, installer drift, or self-doctor code. |
| `src/artifacts/store.ts`, `src/artifacts/permissions.ts` | U31 policy/evaluator and revalidation. | RDM-016 owns process cleanup; RDM-022 owns self-doctor links. | Artifact-root-only changes; no process repair or dependency diagnostics. |
| RDM-015 diagnostic sink | Sanitized records as a consumer. | RDM-015 owns public diagnostic buffers/query. | Use the accepted adapter; no competing public tool or raw buffer. |
| `src/config` / shared fixtures | Explicit policy input and focused fixtures. | Central contract surfaces serialize across siblings. | One integrator; preserve unrelated dirty changes and fixture ownership. |
| `docs/contracts.md`, `docs/compatibility.md`, `docs/security.md` | Proven additive semantics only. | Shared maintained docs used by all items. | Update only with implementation evidence; package planning docs remain this run's writable scope. |

## Verification ladder

The artifact run executes only the package checker and document review. Future
implementation must use the narrowest useful checks first, then the natural
affected suite, then the parent aggregate:

```text
pnpm exec vitest run tests/unit/loopback.test.ts tests/unit/artifact-discovery.test.ts tests/unit/artifact-retention.test.ts
pnpm exec vitest run tests/unit/session-endpoint.test.ts tests/unit/webdriver-client.test.ts tests/unit/artifact-permissions.test.ts
pnpm exec vitest run tests/integration/artifact-store.test.ts tests/integration/session-cleanup.test.ts tests/integration/doctor.test.ts
pnpm test:platform:windows
pnpm test:platform:linux
pnpm test:unit
pnpm test:integration
pnpm test:contract
```

The exact new test filenames may follow repository conventions, but the
behavioral cases in the requirements are mandatory. Platform commands are
skipped only with a recorded host/toolchain reason. The root owner additionally
runs build, typecheck, lint, format, full test, and pack checks.

## Impact and security gates

The implementation requires an Impact Scan because it changes provider
readiness, config parsing, artifact policy, file cleanup, and test fixtures.
Search consumers for `reserveProviderPort`, `waitUntilProviderReady`,
`retainArtifacts`, `ArtifactStore.recover`, `artifactsPath`, `build.devUrl`,
`localhost`, `127.0.0.1`, `::1`, `lstat`, `realpath`, `symlink`, and cleanup
status/error codes. The scan must list consumers and contract-drift tests before
code review.

Security Watch is required during execution. `krt-security-sentinel` must review
the final implementation for loopback exposure, family confusion, URL/path
disclosure, symlink/junction races, deletion scope, DACL/mode handling,
manifest tampering, and diagnostic injection. P0/P1 findings or any P2 finding
affecting ownership, secrets, public output, or destructive cleanup block the
review handoff.
