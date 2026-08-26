---
title: RDM-017 portable runtime security gate
status: pass-with-platform-evidence-required
date: 2026-08-24
run_id: tinto-e2e-rdm-017-portable-runtime
scope: RU1/RU2
---

# RDM-017 portable runtime security gate

Security Sentinel review covered environment-source trust, portable expansion,
PATH and explicit candidate provenance, executable/link boundaries, Windows
shim parsing, fixed version probes, timeout/output cleanup, ownership-bound
evidence, and sanitize-before-store behavior. No production executable,
credential, registry command, arbitrary shell, or destructive provider action
was authorized by this review.

## Trust boundaries and controls

- Launch environment input is allowlisted before merge. Windows keys are
  case-normalized, secret-like keys and values are rejected, portable expansion
  is bounded, and missing minimum values remain an explicit incomplete result.
- Candidate sources are finite and ordered: explicit configuration, effective
  child PATH, documented platform roots, and host PATH for comparison only.
  Candidate count, probe time, output, and shim bytes are bounded.
- Candidates require the expected basename/extension, regular-file state,
  Linux executable mode where applicable, successful realpath, allowed-root
  containment when configured, and immediate pre-probe revalidation.
- Symlinks, explicit reparse points, canonical-path changes, broken paths,
  directories, outside-root targets, wrong tools, malformed probes, timeouts,
  and unavailable cleanup receive distinct fail-closed outcomes.
- Windows `.cmd`/`.bat` shims never run through a shell. They must resolve a
  fixed absolute Node target and an npm/pnpm/corepack-identifying CLI target;
  both targets pass the same path and reparse checks before execution.
- Probe buffers truncate before append. Timeout/overflow requests termination
  and does not return success before close; failure to confirm cleanup becomes
  `probe-unavailable` residue.
- Evidence exposes bounded basename, hashed identity, source, file kind,
  normalized version, outcome/rejection, and value-free environment categories.
  It excludes raw PATH, full paths, environment values, arguments, output, and
  causes and drops wrong-session/wrong-surface ownership.

## Negative/security verification

- Wrong-tool executable output and generic wrong-tool shim targets are rejected
  before acceptance.
- Broken links, injected reparse points, non-executable Linux files,
  outside-root realpaths, probe timeout/failure/malformed output, and candidate
  starvation/source drift are covered.
- Secret/unresolved/cyclic/NUL/oversized portable inputs are rejected without
  mutating input.
- Throwing or rejecting evidence sinks are isolated and counted as dropped.
- Resolver-driven Windows/Linux fixtures prove normalized evidence without
  relying on host-installed Node, npm, pnpm, Cargo, or rustc.

## Findings and residual risk

The security review originally identified P1 findings in shim target
validation, Windows reparse handling, and probe cleanup. The local apply loop
corrected the safe code-level findings and added regression coverage. An
independent second pass confirmed probe cleanup now fails closed with explicit
residue and confirmed opaque Windows reparse tags remain unresolved.

Residual platform risk: Node's standard `fs.Stats` does not expose every
non-symlink Windows reparse tag, and `spawn` cannot pin the already-validated
file handle. The current adapter rejects explicit reparse metadata and any
realpath/canonical change and revalidates immediately before the probe. This is
a truthful fail-closed reduction, not complete native proof. A native Windows
adapter or authoritative provider proof remains required before release can
claim full reparse-tag and handle-pinning coverage.

## Security status

`pass-with-platform-evidence-required` for RDM-017. Safe for downstream
RDM-020/RDM-022 integration and parent aggregate verification. This is not
release approval and must not be represented as complete Windows native proof.
