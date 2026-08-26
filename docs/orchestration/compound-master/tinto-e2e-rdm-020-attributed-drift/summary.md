---
title: RDM-020 attributed drift implementation closeout
status: implementation-review-passed-with-host-gaps
artifact_status: implemented
date: 2026-08-24
run_id: tinto-e2e-rdm-020-attributed-drift
roadmap_item: RDM-020
package: docs/work-packages/RDM-020-attributed-drift/2026-08-21-020-attributed-drift-work-package.md
state: docs/orchestration/compound-master/tinto-e2e-rdm-020-attributed-drift/state.md
dependency: RDM-017
open_decisions: []
blockers: []
---

# RDM-020 attributed drift implementation closeout

RDM-020 is implemented and independently reviewed. `doctor` now treats
Pumarejo-owned semantic projections as authoritative and full-file hashes as
secondary evidence, so unrelated edits remain healthy while owned deletion,
mutation, duplication, malformed content, forged hashes, and unsafe links fail
closed.

## Result

- Rust attribution ignores marker-like text in comments and strings and removal
  targets the exact executable wrapper.
- Cargo, ignore, isolated capability, and owned config coupling have explicit
  semantic projections.
- Capability/config JSON rejects duplicate keys and capability permissions must
  match exactly.
- Diagnosis is read-only and exposes no raw content or private path material.
- Final independent review and Security Sentinel passed with no open P0-P2
  finding.

## Evidence

- Focused RDM-020 regression: 54/54 passed.
- Integration: 89 passed, 5 skipped.
- Contract: 66/66 passed.
- Typecheck, focused lint/format, and diff validation: passed.
- Aggregate fingerprint:
  `e3f4bf28be2b9b5d4d25dbe1d33ca45fd13e9a8d6829c4e53a42959a613886bb`.
- Aggregate build, typecheck, lint, and pack check: passed.
- Aggregate format/test retain only known Windows checkout/host gaps: CRLF
  normalization, two CRLF-sensitive evidence hashes, unavailable Windows
  PowerShell Security module, and four Node executable-path mismatches. The
  aggregate test result was 562 passed, 17 skipped, and 7 failed.

No stage, commit, push, PR, Jira, merge, or release mutation was performed.
