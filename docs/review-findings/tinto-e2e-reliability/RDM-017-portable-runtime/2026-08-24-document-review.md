---
title: RDM-017 portable runtime and toolchain resolution document review
status: passed
date: 2026-08-24
roadmap_item: RDM-017
compound_run_id: tinto-e2e-rdm-017-portable-runtime
compound_state_path: docs/orchestration/compound-master/tinto-e2e-rdm-017-portable-runtime/state.md
review_mode: non-interactive
review_role: ce-doc-review
security_role: krt-security-sentinel-design-gate
---

# RDM-017 portable runtime and toolchain resolution document review

## Review scope and result

Reviewed the requirements, implementation plan, dependency/overlap map, and
work package as one artifact set:

- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-017-portable-runtime-requirements.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-017-portable-runtime-plan.md`
- `docs/plans/tinto-e2e-reliability/2026-08-21-rdm-017-portable-runtime-dependency-map.md`
- `docs/work-packages/RDM-017-portable-runtime/2026-08-21-017-portable-runtime-work-package.md`

The packet is coherent and passes the artifact gate. It maps REL-008/REL-009
to U34-U36, separates environment reconstruction from resolver/evidence
projection, preserves the user-owned installer boundary, and keeps all public
DEC-004 semantics downstream through RDM-015. No product decision remains
open. Implementation remains conditional on acceptance of the RDM-015 internal
event envelope and Seneschal serialization of shared launch surfaces.

## Evidence inspected

- Initiative contract and canonical DEC-004 resolution:
  `docs/plans/tinto-e2e-reliability/initiative-requirements.md` and
  `docs/swarm/blockers.yaml`.
- Roadmap and dependency order: `docs/product/roadmap.md`.
- Gap evidence: `docs/audits/2026-08-21-tinto-gap-audit.md`.
- RDM-015 internal evidence boundary and RDM-016 custody ownership plans.
- Sibling ownership and reserved child runs:
  `docs/swarm/swarm-startup.md` and `docs/swarm/queue-state.yaml`.

## Findings and routing

| ID | Severity | Finding | Route | Resolution/evidence |
| --- | --- | --- | --- | --- |
| DR-017-001 | P1 upstream contract gate (resolved for artifacts) | Toolchain evidence must use the accepted RDM-015 sanitize-before-store envelope; no competing public diagnostics shape is safe. | Seneschal implementation prerequisite | Requirements, plan, map, and package name RDM-015 as the sole evidence boundary and defer U36 wiring until its internal envelope is accepted. |
| F-017-002 | P1 disclosure security | Host environment, PATH, full executable paths, arguments, probe output, and credentials could leak through resolver evidence. | Required implementation/security verification | U34 keeps private provenance separate; U35/U36 project only bounded safe fields and require sanitizer-before-store tests. |
| F-017-003 | P1 command execution security | A shim or version probe could execute dynamic shell content or an unintended target. | Required implementation/security verification | Fixed `--version` arguments, injected non-shell runners, bounded shim grammar, and explicit rejection reasons are required. |
| F-017-004 | P1 filesystem/link security | Broken links, junctions, or reparse points could be accepted as trusted candidates. | Required implementation/security verification | Canonical identity/file-kind proof, bounded roots, link/reparse refusal, and all-candidate rejection records are specified. |
| F-017-005 | P2 ownership overlap | Existing installer project-detection edits and shared doctor wiring are outside this child. | Apply/local boundary | The package excludes `src/installer/project.ts`, `tests/unit/project-detection.test.ts`, `src/installer/doctor.ts`, and shared live fixtures; RDM-020/RDM-022 consume later. |
| F-017-006 | P2 platform parity | Local hosts may not provide Windows/Linux capabilities or toolchains. | Required implementation/CI verification | Injected deterministic fixtures and exact host-skip reporting are required; no local product pass is claimed in artifact mode. |

No finding requires another artifact rewrite. Findings F-017-002 through
F-017-006 remain implementation and security inputs. DR-017-001 is a normal
upstream sequencing gate, not an open product decision.

## Security and public-contract gate summary

- The child environment is built from an allowlist and bounded sources; raw
  values and private provenance do not cross the evidence boundary.
- Candidate selection is deterministic, fixed-root, link-safe, and preserves
  rejected candidates for diagnosis instead of silently dropping them.
- Version probes are fixed, bounded, injected, and `shell: false`; arbitrary
  shell or operating-system passthrough is excluded.
- RDM-017 adds no MCP operation, public schema, capability synonym, installer
  repair, process custody, or doctor integration.
- DEC-2026-08-21-004 is canonical in the initiative contract: downstream
  public projections use exactly `supported`, `unsupported`, `unavailable`,
  `denied`, and `failed`, with stable codes and bounded sanitized evidence.

## Mechanical verification

```text
python C:\Users\User\.agents\skills\krt-compound-master\scripts\check_work_package.py docs/work-packages/RDM-017-portable-runtime/2026-08-21-017-portable-runtime-work-package.md
```

Result: `work package review-unit checks passed`.

Product tests were intentionally not run: this is `mode:artifacts`, and the
delegated scope forbids product-code/test/config edits. `git diff --check` on
the owned artifact paths is required at closeout.

## Review handoff

- Artifact status: ready for Seneschal reconciliation; no open product
  decisions.
- Reviewability: RU1/U34 is an independently verifiable environment slice;
  RU2/U35-U36 keeps resolver claims and disclosure proof together. Stack target
  one, hard maximum two.
- Security status: design gate acceptable with required implementation tests;
  formal implementation/security review remains pending.
- No sibling/shared files, product files, Jira, release, branch, commit, PR,
  push, reviewer request, or external mutation action was performed.
