---
title: RDM-017 portable runtime implementation closeout
status: implementation-review-passed-with-platform-gap
date: 2026-08-24
run_id: tinto-e2e-rdm-017-portable-runtime
roadmap_item: RDM-017
package: docs/work-packages/RDM-017-portable-runtime/2026-08-21-017-portable-runtime-work-package.md
state: docs/orchestration/compound-master/tinto-e2e-rdm-017-portable-runtime/state.md
---

# RDM-017 portable runtime implementation closeout

RDM-017 now reconstructs allowlisted child environments, retains explicit incomplete Windows state, resolves Node/npm/pnpm/Cargo/rustc through finite truthfully sourced candidates, validates no-shell Windows shim targets, bounds probe time/output, and projects ownership-bound sanitized evidence.

## Evidence

- Focused matrix: 43 passed; incomplete-launch refusal: 1 passed.
- Contract: 58 passed. Integration: 71 passed, 5 provider/fixture skips.
- Unit: 350 passed, 3 skipped, with 5 unchanged host/baseline failures.
- Typecheck, targeted lint/format, and diff check: pass.
- Code review: eight findings resolved; opaque Windows reparse proof retained as a native-platform gap after independent validation.
- Security: pass with platform evidence required.

## Handoff

Downstream RDM-020 and RDM-022 may consume the internal result/evidence model. Release certification must not claim full Windows reparse-tag, handle-pinning, or residue-zero proof without a native adapter or authoritative platform evidence. Seneschal owns aggregate reconciliation; Release Marshal alone owns commit, push, PR, and reviewer mutations.
