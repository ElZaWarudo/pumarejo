---
title: RDM-017 portable runtime and toolchain resolution implementation plan
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
status: plan-review-passed
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-017
origin_requirements: docs/plans/tinto-e2e-reliability/2026-08-21-rdm-017-portable-runtime-requirements.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_roadmap: docs/product/roadmap.md
gap_evidence: docs/audits/2026-08-21-tinto-gap-audit.md
compound_run_id: tinto-e2e-rdm-017-portable-runtime
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-017-portable-runtime/state.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
units: [U34, U35, U36]
open_decisions: []
applied_decisions: [DEC-2026-08-21-003, DEC-2026-08-21-004]
---

# RDM-017 portable runtime and toolchain resolution implementation plan

## Outcome

Make every owned child launch receive a deterministic, minimum, secret-safe
environment and make runtime/toolchain failures explainable without exposing
local paths or executing arbitrary commands. The implementation introduces a
pure Windows environment builder, a shared host/child difference model, and a
canonical resolver for Node, npm, pnpm, Cargo, and rustc on Windows and Linux.
The resolver retains bounded accepted and rejected candidates, canonical
identity, version observation, provenance, and broken-link reasons for internal
diagnostics; only a sanitized projection may enter RDM-015.

The plan is implementation-ready for the internal platform slice. It does not
add a public MCP operation. The parent decisions for additive public discovery
and the explicit capability-state matrix are already canonical and are
constraints for any downstream RDM-015/RDM-022 public projection. Actual
implementation remains sequenced after RDM-015's internal evidence contract is
accepted by Seneschal.

## Constraints and inherited contracts

- Preserve local `stdio`, one owned application session, bounded output, and
  the initiative's no-shell/no-arbitrary-OS-passthrough boundary.
- Preserve the current allowlist and launch-profile precedence in
  `src/platform/launch-environment.ts`, existing display overlays, approved
  launch command validation, and the bounded Windows shim grammar in
  `src/platform/windows/launch.ts`.
- Treat the effective child environment—not the parent process's accidental
  environment—as the authority for resolution. Keep host and child snapshots
  separately comparable.
- Use fixed, injected filesystem and process seams. Any version probe is
  `shell: false`, has fixed arguments, finite output, a timeout, and an
  allowlisted executable identity.
- Sanitize candidate/provenance/rejection evidence before it enters the
  RDM-015 ring or any retained artifact. Full paths, PATH entries, values,
  arguments, stderr, and causes remain internal or are dropped.
- Consume RDM-015's internal event envelope and ownership/session checks;
  consume RDM-016 process identity without defining custody or termination.
- RDM-020 owns attributed project-integration drift and shared `doctor`
  wiring; RDM-022 consumes the resolver for self-doctor. Neither consumer is
  implemented in this package.
- `src/installer/project.ts` and `tests/unit/project-detection.test.ts` are
  user-owned/worker-owned surfaces outside this package. Do not edit, reset,
  or infer their isolated main-checkout changes.
- `production:unknown` is the working posture. Behavior is additive and
  compatibility-preserving; no deployment or migration is planned.

## Plan units

| Unit | Scope and deliverable | Dependencies | Primary surfaces | Focused proof |
| --- | --- | --- | --- | --- |
| U34 | Pure Windows child-environment reconstruction, bounded portable-variable expansion, source/provenance tracking, and sanitized host-versus-child difference categories. Preserve Linux allowlist/overlay behavior. | Initiative REL-008; existing launch-environment/profile behavior; RDM-015 internal sanitizer contract. | `src/platform/launch-environment.ts`, new RDM-017-owned Windows environment helper under `src/platform/windows/`, `tests/unit/windows-environment.test.ts`, `tests/unit/launch-environment.test.ts`. | Deterministic Windows/Linux builder matrix, missing-essential reconstruction, precedence, expansion rejection, denylist, no mutation, and sanitized diff output. |
| U35 | Canonical candidate enumeration, canonical identity/file-kind checks, bounded broken-link/reparse handling, fixed no-shell version probes, and safe npm/pnpm shim resolution for Node/npm/pnpm/Cargo/rustc. | U34 effective child environment; existing Windows shim and Linux command helpers; process ownership remains RDM-016. | New `src/platform/toolchain-resolver.ts`, narrow adapters in `src/platform/windows/launch.ts` and `src/platform/linux/launch.ts` only where required, `tests/unit/toolchain-resolver.test.ts`. | Candidate ordering/deduplication, identity, source, version, rejection, broken-link, shim, timeout, malformed output, and required-tool matrix on both platforms using injected seams. |
| U36 | Sanitized internal evidence adapter and cross-platform integration fixtures. Project only bounded candidate summaries and host/child difference categories into RDM-015; no public query or new vocabulary. | U34/U35; accepted RDM-015 internal event envelope; canonical DEC-003/004 constraints. | New RDM-017-owned evidence adapter under `src/platform/`, `tests/integration/toolchain-resolution.test.ts`, `tests/contract/toolchain-resolution.test.ts`, `tests/platform/toolchain-resolution-proof.test.ts`. | Sanitization-before-store, ownership loss, stable normalized Windows/Linux output, host-only/child-only/mismatch/unknown outcomes, and no raw path/environment/argument leakage. |

## Key technical decisions

### D1 — Explicit source precedence and minimum environment

`buildChildEnvironment` consumes injected host values, an operating-system
source snapshot, the validated launch profile, and internal runtime overlays.
It merges case-insensitively on Windows in this order: allowlisted OS baseline,
allowlisted host values, profile overrides, bounded `pathPrepend`, then internal
owned overlays. A profile/overlay cannot add a key outside the existing
allowlist. The builder supplies a minimum Windows set (`SystemRoot`, `ComSpec`,
`PATHEXT`, `Path`, temporary directories, user profile roots, and configured
Cargo/rustup roots) only when the source is proven; a missing source is retained
as `incomplete` evidence, never replaced with a guessed user path.

The builder returns the child map for execution plus an internal provenance map
and a sanitized comparison summary. The provenance map is never serialized.
Linux continues to use `:` separators, existing display overlays, and the
current allowlist; only the shared comparison type is added.

### D2 — Bounded portable expansion

Windows values expand `%NAME%` against the merged case-insensitive map with a
finite pass count, maximum value length, NUL rejection, and cycle/unresolved
detection. Expansion applies only to allowlisted environment values and
configured path entries; it does not parse arbitrary command text. A value that
cannot be proven safe becomes a candidate/environment rejection with a stable
reason code. Provenance records whether a value came from host, OS machine,
OS user, profile, internal overlay, or a portable expansion, while evidence
contains only the category.

### D3 — Deterministic candidate model

The resolver accepts a logical tool and an effective environment, then emits a
bounded ordered candidate list. Source precedence is explicit configuration,
effective child PATH, documented platform roots, and (for comparison only) the
host PATH. Candidate paths are normalized for the platform, checked with
`lstat`/realpath and the platform's executable-kind rules, and deduplicated by
canonical internal identity. Evidence exposes only a safe basename, tool kind,
source label, bounded identity token, version, confidence, acceptance state,
and stable rejection code.

The initial required matrix is Node, npm, pnpm, Cargo, and rustc. Existing
yarn/bun/deno launch profiles remain accepted by current schema/launch paths;
RDM-017 does not remove them or silently broaden their detection. Tauri CLI
version compatibility remains project/package metadata owned by project
detection and downstream doctor consumers.

### D4 — Fixed probes and Windows shims

Version probes use fixed `--version` arguments for Node/npm/pnpm/Cargo/rustc
through injected non-shell runners. Output is bounded before parsing and
normalized to a version or a stable timeout/non-zero/invalid-output reason.
Windows `.cmd` candidates reuse the existing bounded quoted-token and `%~dp0`/
variable expansion grammar. Only a recognized Node-plus-CLI target can be
accepted; dynamic shell constructs, unresolved variables, oversized content,
wrong-tool targets, links, and reparse uncertainty are rejected. The resolver
returns all candidates so a skipped candidate is diagnosable rather than
silently disappearing.

### D5 — Evidence adapter without public projection

U36 converts the internal result to the RDM-015 event envelope only after
session/ownership validation and source-side sanitation. It sends bounded tool
kind, safe identity/basename, source category, version (if proven), outcome,
rejection code, confidence, and host/child difference categories. It never sends
full paths, PATH, environment values, arguments, stdout/stderr, provider data,
or causes. Public diagnostics query and capability-state projection consume
the canonical DEC-003/004 decisions downstream and are not authored here.

## Dependency and execution waves

1. **Wave 0 — prerequisite contract:** Seneschal confirms the RDM-015 internal
   sanitize-before-store event envelope and the shared revision. Public
   DEC-003/004 are already canonical; no RDM-017 decision gate remains.
2. **Wave 1 — RU1 / U34:** implement and review the pure environment builder
   and host/child comparison. This is the primary Windows security boundary
   and can be verified without a resolver implementation.
3. **Wave 2 — RU2 / U35-U36:** implement the resolver, fixed probes, shim
   handling, and sanitized RDM-015 adapter against the accepted U34 contract.
   Keep the resolver and evidence adapter together for review so candidate
   claims cannot outrun their disclosure proof.
4. **Wave 3 — aggregate:** Seneschal serializes any shared launch/runtime
   edits, then runs the platform matrix and root gates. RDM-019/RDM-022/RDM-020
   consume the accepted internal contract; RDM-023 owns final certification.

No parallel mutable implementation is planned within this child: U35 consumes
U34, and U36 consumes both. The open review stack target is one pending PR,
hard maximum two.

## Detailed design by unit

### U34 — Windows environment reconstruction and host/child differences

1. Extract the current allowlist and merge semantics into a pure builder with
   injected `host`, `osSource`, `profile`, `internalOverlay`, platform, and
   bounded clock/limits inputs. Keep the runtime-facing map separate from the
   diagnostic projection.
2. Normalize Windows key identity case-insensitively while preserving one
   stable execution key for `Path`/`PATHEXT`. Preserve all existing approved
   common, Windows, Linux, display, and Pumarejo keys; reject undefined values
   and denylisted keys before merge.
3. Read only the fixed operating-system environment snapshot through a narrow
   platform seam. Do not accept arbitrary command text or registry paths from a
   launch profile. If the source is unavailable, return `environment-incomplete`
   with the missing-key categories and continue only when the requested launch
   can be proven safe.
4. Expand approved Windows portable variables with finite passes and classify
   unresolved, cyclic, overlong, NUL, and outside-boundary values. Do not
   expand arbitrary arguments or evidence text.
5. Compare host and child key presence/value shape without retaining values.
   Emit stable categories (`missing-in-child`, `added-to-child`, `changed`,
   `path-order-changed`, `portable-expanded`, `source-reconstructed`) and
   bounded counts. Full paths and values are not part of the projection.

Focused scenarios: missing `SystemRoot`/`ComSpec`/`PATHEXT` reconstruction;
machine-vs-user-vs-host precedence; profile path prepend; case-duplicate
`Path`; nested expansion and cycles; secret-key and secret-value filtering;
missing OS source; Linux `:`/display preservation; input immutability; and
deterministic host/child diff ordering.

### U35 — Canonical executable resolver

1. Define typed internal candidate/result models with finite bounds. Candidate
  identity contains the canonical path only inside the execution layer; the
  projection receives a safe basename and bounded identity token. Every
  candidate gets a source, sequence, file-kind result, version result, and
  acceptance/rejection code.
2. Generate explicit-config, child-PATH, platform-root, and host-comparison
   candidates in fixed order. Use Windows `PATHEXT` case-insensitively and
   Linux executable-mode checks. Do not recurse beyond the documented fixed
   roots or follow a link whose target cannot be canonicalized safely.
3. Reuse the current Windows package-manager shim parser through a narrow
   adapter, keeping shell execution disabled. Reject malformed, dynamic,
   unresolved, wrong-tool, oversized, symlinked, junctioned, or reparse-
   uncertain shims with separate reasons.
4. Probe versions with a fixed runner, fixed argument tuple, bounded output,
   timeout, and no caller-controlled command. Normalize semver-like versions
   without treating malformed output as healthy. Preserve candidate records
   for failed, timed-out, or unavailable probes.
5. Resolve Node, npm, pnpm, Cargo, and rustc with the same result schema. Keep
   launch command materialization separate from evidence serialization so
   internal paths remain available to the child but never cross RDM-015.

Focused scenarios: candidate ordering and canonical dedupe; explicit path
precedence; Windows PATH/PATHEXT; Linux PATH and standard roots; regular file
versus broken symlink/junction/reparse; npm/pnpm shim variants; Node/npm/pnpm/
Cargo/rustc version success/failure/timeout/malformed output; wrong-tool and
outside-root rejection; and all-candidate reporting when no candidate wins.

### U36 — Sanitized evidence and cross-platform proof

1. Validate current owned session/lease and optional RDM-013 surface context
   before producing an RDM-015 event. A lost owner produces a bounded drop or
   ownership-failure observation and cannot be attributed to a later session.
2. Project only the bounded safe fields from U34/U35. Apply RDM-015's
   sanitize-before-store path before buffering; test both in-memory input and
   any retained projection to prove no path/value/argument bypass exists.
3. Add deterministic injected Windows and Linux fixtures that compare the
   same logical tool matrix, normalize platform-specific source labels and
   rejection reasons, and record a skipped-platform reason when a real host
   lacks the provider. Do not rely on installed local Node/npm/pnpm/Cargo/rustc.
4. Keep any eventual public diagnostics composition additive and downstream;
   this unit records only internal event compatibility with the canonical
   public decisions.

Focused scenarios: sanitized candidate lists; path/PATH/argument/secret corpus;
wrong session/surface and ownership loss; host-only/child-only/consistent/
version-mismatch/environment-mismatch/unknown; stable ordering and bounds;
Windows and Linux fixtures with equivalent outputs; and evidence-sink failure
without changing launch success semantics.

## Verification strategy

| Gate | Commands/evidence | Pass criterion |
| --- | --- | --- |
| Pure environment | `pnpm exec vitest run tests/unit/windows-environment.test.ts tests/unit/launch-environment.test.ts` | Windows reconstruction/expansion/provenance categories and Linux compatibility are deterministic and secret-safe. |
| Resolver core | `pnpm exec vitest run tests/unit/toolchain-resolver.test.ts` | Candidate order, identity, versions, rejection/broken-link reasons, shim safety, and tool matrix pass with injected seams. |
| Integration/evidence | `pnpm exec vitest run tests/integration/toolchain-resolution.test.ts` | Launch-facing adapter uses effective child env, emits bounded RDM-015-compatible internal evidence, and preserves existing launch behavior. |
| Contract projection | `pnpm exec vitest run tests/contract/toolchain-resolution.test.ts` | Internal result/projection bounds and additive compatibility are stable; no public operation is invented. |
| Platform matrix | `pnpm exec vitest run --no-file-parallelism tests/platform/toolchain-resolution-proof.test.ts` | Windows and Linux fixture cases prove platform-specific path/link/probe behavior or record an exact host skip. |
| Aggregate | `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm pack:check` | Root-owned aggregate remains green after serialized implementation. |

No product verification is run during this artifact-only child. Platform
commands listed above are future implementation gates, not current pass claims.

## Risks and mitigations

- **Environment values leak through evidence:** keep execution env and evidence
  projection separate, sanitize before RDM-015 insertion, and use seeded path,
  token, and credential fixtures in both in-memory and retained paths.
- **Windows shim or version probe executes unintended code:** parse a bounded
  grammar, use fixed arguments and `shell: false`, reject dynamic content, and
  inject runners in tests.
- **A broken link or reparse point is mistaken for a valid candidate:** require
  canonical identity/file-kind proof immediately before acceptance and retain a
  distinct rejection reason.
- **Child differs from host in a way that is silently missed:** compare the
  effective child map after all overlays and expansion; report stable category
  differences rather than raw values.
- **Sibling installer edits are overwritten or misattributed:** exclude
  `src/installer/project.ts` and `tests/unit/project-detection.test.ts`, keep
  resolver modules under `src/platform`, and serialize any shared launch edits.
- **RDM-015 or public consumers drift:** version the internal event adapter,
  consume canonical DEC-003/004 decisions, and block consumer claims until the
  parent reconciles the shared revision.

## Definition of done

- U34-U36 are implemented on the designated semantic branch after RDM-015's
  internal evidence contract is accepted and shared launch ownership is
  serialized.
- Windows child environment reconstruction preserves the allowlist, fills only
  proven minimum keys, expands portable values safely, and produces sanitized
  host/child differences.
- Node/npm/pnpm/Cargo/rustc resolution is deterministic on Windows/Linux with
  accepted and rejected candidates, canonical identity, bounded versions,
  broken-link reasons, and no shell/arbitrary probes.
- RDM-015 receives only sanitized internal toolchain evidence; no public MCP
  operation or capability synonym is added by this item.
- Focused unit/integration/contract/platform tests and root aggregate commands
  pass, with platform-only skips named and owned.
- Security review has no unresolved P0-P2 finding for environment, path/link,
  probe, evidence, or compatibility behavior.

