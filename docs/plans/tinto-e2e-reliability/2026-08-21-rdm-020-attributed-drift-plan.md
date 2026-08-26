---
title: RDM-020 attributed integration drift implementation plan
artifact_contract: ce-plan/v1
artifact_readiness: implementation-ready
status: review-passed
artifact_status: artifacts-ready
date: 2026-08-21
initiative_id: tinto-e2e-reliability
roadmap_item: RDM-020
origin_requirements: docs/plans/tinto-e2e-reliability/initiative-requirements.md
origin_audit: docs/audits/2026-08-21-tinto-gap-audit.md
origin_roadmap: docs/product/roadmap.md
initiative_contract: docs/plans/tinto-e2e-reliability/initiative-requirements.md
observed_revision: 23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53
depends_on: [RDM-017]
units: [U28, U29]
open_decisions: []
---

# RDM-020 attributed integration drift implementation plan

## Outcome

Make `doctor` diagnose only Pumarejo-owned integration drift. A user may edit
unowned lines, Cargo values, ignore rules, or user-controlled configuration
without a false drift result. Deletion, mutation, duplication, malformed
content, unsafe links, or changes to an owned marker/entry/field still fail
closed. Full-file hashes remain bounded secondary evidence for the manifest,
not the authority that decides attribution.

This plan is implementation-ready and additive. It does not authorize edits in
the current artifact run.

## Inherited authority and constraints

- REL-012 and the approved gap audit are authoritative: attribution is the
  primary integration-health signal and full hashes are secondary evidence.
- RDM-017 owns project detection and portable runtime behavior. RDM-020 may
  consume its resolved project/config contract but must not edit
  `src/installer/project.ts` or `tests/unit/project-detection.test.ts` while
  those user-owned changes are dirty.
- Preserve the existing manifest schema compatibility for v1/v2, safe-file
  confinement, canonical parsing, one-session runtime behavior, and the
  existing `doctor` diagnostic IDs unless an additive diagnostic detail is
  required.
- Do not revert unrelated edits, repair user files, or introduce automatic
  restore/remove behavior. `doctor` remains read-only.
- Preserve generated capability isolation: the agent capability is a private
  `.pumarejo/agent-capability.json` overlay and must not be merged into a
  user's source capability.

## Resolved behavior (no product decision remains open)

### Attribution precedence

For every applied manifest entry, `doctor` performs a safe-file read and then
evaluates the attributed region or semantic projection. The result is:

1. Missing, symlinked, unsafe, duplicate, malformed, or altered owned content
   is integration drift/error.
2. A full hash match is a fast corroborating signal only; it never skips the
   owned-content check.
3. A full hash mismatch with valid owned content is an unrelated edit and does
   not set `manifestDrift` or fail the integration diagnostic.
4. An invalid manifest attribution is itself a manifest error, even if a
   caller forged `afterHash` to match the edited file.

The existing version-alignment, configuration-schema, and runtime diagnostics
remain independent checks. This change only prevents unrelated content from
being misclassified as integration drift.

### Exact owned projections

| Entry | Owned authority | Unowned edits tolerated | Drift conditions |
| --- | --- | --- | --- |
| `src-tauri/src/lib.rs` or `src-tauri/src/main.rs` (`rust`) | Exactly one generated `// <pumarejo:begin>`/`// <pumarejo:end>` helper block and exactly one `pumarejo_builder(tauri::Builder::default())` wrapper, matching the attributed generated shape. | Rust comments, strings, formatting, and code outside the marker block/wrapper. | Missing/duplicated markers, edited helper/wrapper, wrong Rust target, or unsafe file. |
| `src-tauri/Cargo.toml` (`cargo`) | TOML semantics selected by attribution: optional `tauri-plugin-wdio-webdriver` at the generated version when dependency attribution is present; `pumarejo` feature contains `dep:tauri-plugin-wdio-webdriver`; `created` attribution requires that feature to contain only the generated value, while `value` attribution permits other values. | Other dependencies, features, comments, ordering, and whitespace. | Parse failure, missing/changed attributed dependency, missing attributed feature value, invalid attribution combination, or unsafe file. |
| `.gitignore` (`ignore`) | One marker block containing exactly `/.pumarejo/`, with line-ending normalization only. | Any lines outside the owned block, including unrelated ignore rules. | Missing/duplicated begin/end marker, changed entry, malformed block, or unsafe link. |
| `.pumarejo/agent-capability.json` (`capability`) | Parsed JSON object with exactly `identifier: "pumarejo-agent"`, one exact window label, and the ordered `AGENT_PERMISSIONS` list; no extra authority-bearing keys. | None inside the isolated generated file; source capability files are not compared by this unit. | Missing/extra keys, wrong identifier/window, missing/extra/reordered permission, malformed JSON, or unsafe link. |
| `.pumarejo.json` (`config`) | Only integration-owned fields: `version: 1`, `window` as the manifest's initialized window, generated artifact defaults (`artifactsDirectory: ".pumarejo/artifacts"`, `retainArtifacts: false`), and the launch argument contract containing exactly one `{tauriConfig}` plus the generated `pumarejo` feature/config arguments. | User-selected launch command/path/environment, optional `webdriverPort`, and unrelated valid profile values. Existing schema validation still rejects invalid/unknown config. | Missing/changed owned field, malformed config, invalid owned launch coupling, or unsafe link. |

The manifest attribution vocabulary is extended only as needed to represent
these projections. Canonical v2 config attribution uses this ordered set:
`field:version`, `field:window`, `field:artifactsDirectory`,
`field:retainArtifacts`, `launch:feature:pumarejo`, and
`launch:config-placeholder`. The expected window is read from the exact
isolated capability window label, not from an untrusted full-file hash. Existing
v1 `created:.pumarejo.json` attribution remains readable and maps to the same
projection; no migration rewrites user files during `doctor`.

## Plan units

| Unit | Scope and deliverable | Dependencies | Primary surfaces | Focused proof |
| --- | --- | --- | --- | --- |
| U28 | Implement a pure attributed-drift evaluator and wire it into integration diagnostics. Reuse the existing Rust/Cargo/capability/config parsers and safe-file boundary; add marker/field projection helpers rather than whole-file comparisons. | RDM-017 project/config contract; current manifest v1/v2 parser; existing installer attribution constants. | `src/installer/doctor.ts`, `src/installer/manifest.ts`, `src/installer/cargo.ts`, `src/installer/rust.ts`, `src/installer/capabilities.ts`, `src/installer/plan.ts`, `src/config/*`. | Unit tests for each projection, v1/v2 attribution, hash-secondary behavior, malformed/unsafe inputs, and exact capability schema. |
| U29 | Add regression fixtures and contract-facing evidence for unrelated edits versus owned mutations; update only maintained contract/security text needed to describe attribution precedence and isolated capability exactness. | U28 evaluator behavior; existing init/remove/doctor fixtures; RDM-017-owned project detection remains excluded. | `tests/unit/`, `tests/integration/doctor.test.ts`, `tests/integration/init.test.ts`, `tests/contract/`, `docs/contracts.md`, `docs/security.md`. | `pnpm test:unit`, `pnpm test:integration`, `pnpm test:contract`; explicit matrix proves tolerated unrelated edits and detected owned changes. |

## Execution order

1. **RU1 / U28:** define the projection result shape and implement the pure
   evaluators. Keep the existing `manifestDiagnostic` and
   `integration.debug-registration`/capability diagnostics additive and
   stable; only replace whole-file authority with attributed checks.
2. **RU2 / U29:** extend fixtures and tests after RU1's evaluator contract is
   stable, then update maintained contract/security documentation to match
   behavior proven by tests. No test or fixture should modify the dirty
   RDM-017-owned project-detection files.
3. **Wave/root gate:** run the three focused commands and hand aggregate build,
   typecheck, lint, format, pack, and release certification to Seneschal/root.

The units are disjoint by primary ownership but serialize through the shared
`doctor` result contract and installer fixtures. Keep one implementation PR
per RU; no stacked chain is needed.

## Detailed design

### U28 / RU1 — attributed evaluator

- Extract an internal `evaluateAttributedEntry(entry, source)` result with
  `owned: "intact" | "drifted"`, `hashMatched`, and a bounded reason code for
  diagnostics. It must not return source content, paths outside the project,
  capability values, nonces, or secrets.
- Validate manifest attribution with the existing canonical manifest guard,
  then evaluate every entry even when `afterHash` matches. A forged manifest
  cannot turn a changed owned region into a ready result.
- Reuse `cargoPluginIntegration`, TOML parsing, `planCargoRemoval` semantics,
  `planRustRemoval`/marker constants, `AGENT_PERMISSIONS`, and the project
  config schema where they provide the same projection. Factor pure helpers
  only when the current function is too destructive or broad for read-only
  diagnosis.
- For Rust, ignore occurrences in comments/string literals when proving the
  executable wrapper; marker block multiplicity and exact generated helper
  shape remain strict.
- For Cargo, compare parsed dependency/feature values, not serialized TOML.
  Preserve extra feature members and dependency keys as unowned; malformed
  TOML is an error because ownership cannot be proven safely.
- For `.gitignore`, parse marker-delimited lines and tolerate CRLF/LF and
  unrelated surrounding content while requiring one exact owned block.
- For the generated capability, parse JSON and require an exact object shape;
  `windows` must be the one initialized label, and permissions must equal
  `AGENT_PERMISSIONS` in order. Do not use substring checks.
- For config, check only the listed owned coupling fields and let existing
  config validation report malformed/user-owned invalid profiles separately.
  Resolve the expected window from the exact isolated capability projection.
  Do not silently accept an unknown field or an invalid launch argument.
- Preserve `manifestDrift` as a semantic-owned result. A hash mismatch that
  passes the projection may be included only as bounded secondary evidence if
  an existing diagnostic field can carry it without changing readiness.

### U29 / RU2 — regression and maintained contract evidence

Use one fixture builder that starts from `tests/fixtures/tauri-app` and applies
one mutation at a time. The matrix must include:

- unrelated `.gitignore` line, Cargo comment/dependency/feature addition,
  Rust comment/string/code outside the owned marker, valid user launch command
  or environment edit, and valid optional port edit — all remain ready;
- deleting, editing, duplicating, or moving each owned marker/block;
- removing or changing the attributed Cargo dependency/feature, malformed
  Cargo TOML, and forged attribution combinations;
- capability JSON with missing, extra, reordered, or authority-bearing keys,
  wrong window, wrong permission, malformed JSON, and symlinked target;
- config with changed owned coupling fields, malformed JSON, unknown fields,
  and invalid launch coupling;
- full-hash changes with owned projections intact versus updated/forged hashes
  with owned projections changed; and
- missing files, duplicate manifest entries, unsafe links, and canonical v1
  and v2 manifests.

Assertions must distinguish the manifest diagnostic from independent config or
toolchain diagnostics. They must prove `doctor` remains read-only and does not
revert unrelated edits.

## Dependency and overlap map

| Surface | RDM-020 ownership | Sibling/worker ownership | Coordination rule |
| --- | --- | --- | --- |
| `src/installer/doctor.ts` | RU1 owns attribution-based integration diagnostics. | RDM-017 owns project detection/runtime resolution; RDM-022 later owns self-doctor. | Do not edit project detection; serialize doctor diagnostics with downstream installer work. |
| `src/installer/cargo.ts`, `rust.ts`, `capabilities.ts`, `manifest.ts`, `plan.ts` | RU1 may add pure attribution/projection helpers and manifest compatibility mapping. | RDM-017 may touch project/config detection; current RDM-009/RDM-013 workers do not own installer surfaces. | Preserve existing removal/init semantics; no broad installer refactor. |
| `.pumarejo` consumer fixtures and generated manifest | RU2 owns attributable test fixtures only. | User-owned dirty installer project files are outside this package. | Use temporary copies; never mutate or normalize the shared dirty files. |
| `docs/contracts.md`, `docs/security.md` | RU2 maintains exact public/ security wording after tests prove behavior. | RDM-023 consumes certification evidence; no sibling owns these docs in this run. | Keep changes additive and limited to attribution precedence and isolated capability schema. |
| RDM-009 package/code/state | None. | RDM-009 worker owns observation files/package/state. | Do not edit, stage, or reconcile RDM-009 artifacts. |
| RDM-013 artifacts | None. | RDM-013 worker owns surface graph plan/package. | Do not edit RDM-013 files. |
| RDM-022 self-doctor | None beyond consuming stable evaluator helpers. | Future RDM-022 planner/implementer. | Do not add dependency/install/junction diagnostics here. |

## Impact and consumer scan

- API/contract impact: no new MCP tool or external endpoint. `doctor` JSON may
  retain its stable diagnostic IDs and only correct readiness classification.
- Data impact: integration manifest attribution gains explicit projection
  semantics; v1/v2 parsing remains compatible and hashes remain present.
- Consumer scan: `src/cli/doctor.ts`, `src/installer/doctor.ts`,
  `src/installer/remove.ts`, `src/installer/plan.ts`, `src/installer/write.ts`,
  `tests/integration/doctor.test.ts`, `tests/integration/remove.test.ts`,
  `tests/integration/init.test.ts`, `tests/platform/cargo-proof.test.ts`,
  and `docs/contracts.md`.
- Security impact: generated capability authority is narrowed to the exact
  isolated schema; no source capability is changed, and no secret/path detail
  is added to doctor output.
- Compatibility: additive diagnostic evidence only; existing CLI commands,
  manifest versions, config schema, and removal safeguards remain valid.

## Verification matrix

| Risk | Required command/evidence | Pass signal |
| --- | --- | --- |
| Unrelated edits false-positive | `pnpm test:integration` focused doctor matrix | Unowned edits change full hashes but do not set integration drift. |
| Owned mutation false-negative | `pnpm test:unit` and focused doctor integration tests | Every owned deletion/mutation/duplication/malformed/unsafe case is non-ready and actionable. |
| Cargo semantic drift | `pnpm test:integration` and `pnpm test:contract` | Dependency/version/optional/feature semantics are checked independent of TOML formatting/order. |
| Capability authority expansion | `pnpm test:unit` and contract fixtures | Exact isolated JSON shape and permission order are enforced; extras fail closed. |
| Config compatibility | `pnpm test:integration` | User-owned valid profile changes remain valid; owned coupling changes remain detected. |
| Hash forgery/secondary evidence | Unit fixture with updated `afterHash` | Owned projection still fails when the hash is forged; valid projection survives unrelated hash changes. |
| Aggregate regression | Seneschal/root aggregate gate | `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm pack:check` are recorded by the wave owner. |

Focused commands for implementation are literal:

```text
pnpm test:unit
pnpm test:integration
pnpm test:contract
```

No product command is run during this artifact-only planning run.

## Definition of done

- RU1 and RU2 each have a bounded, independently reviewable scope with no
  unresolved product decision.
- Unrelated edits outside owned markers/entries/fields do not produce
  integration drift, while owned changes, malformed files, duplication, and
  unsafe links fail closed.
- Cargo dependency/features, Rust/ignore markers, exact isolated capability
  schema, and owned config fields are checked semantically.
- Full hashes remain present and are explicitly secondary evidence.
- Existing init/remove/version/config contracts remain compatible; no automatic
  repair or reverting of user edits is introduced.
- The focused commands pass in implementation, `check_work_package.py` passes
  for the package, and document review records no unresolved P0-P2 issue.
