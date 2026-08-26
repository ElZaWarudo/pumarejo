---
title: RDM-016 custody security gate
status: pass-with-platform-evidence-required
date: 2026-08-24
run_id: tinto-e2e-rdm-016-process-custody
scope: RU1/RU2
---

# RDM-016 custody security gate

Security Sentinel review covered the destructive process boundary, lease
filesystem, recovery ownership handoff, listener cleanup, native mechanism
selection, and sanitize-before-store evidence. No external scan, production
probe, secret decoding, or destructive operation outside deterministic test
children was performed.

## Trust boundaries and controls

- The destructive actor is the one local Pumarejo controller. Lease records
  bind its controller identity, PID, child PID, start time, command hash,
  session nonce, and mechanism.
- `CustodyLeaseStore` confines records to `.pumarejo/sessions`, rejects links
  and non-regular files, bounds bytes/count, writes owner-only temporary files,
  and uses atomic replacement. Recovery uses an exclusive marker and never
  overwrites an existing marker.
- `proveCustodyOwnership` requires the complete tuple plus mechanism and
  group/session facts; missing or incomplete observations are denied. Linux
  reattachment additionally reads the live `/proc/<pid>/environ` nonce.
- POSIX escalation sends TERM only to the recorded process group, waits a
  bounded grace period, revalidates, and sends KILL only when the proof is
  unchanged. Windows uses a probed Job Object seam or a validated-tree
  fallback; an unavailable probe does not become a Job Object claim.
- Startup repair checks controller liveness first, claims only dead-controller
  records, retains ambiguous/replaced/malformed records, and verifies process
  and provider-listener postconditions before removing a lease.
- Custody evidence is reduced to allowlisted mechanism/phase/code/state,
  retryability, bounded duration, and resource presence before the RDM-015
  diagnostic callback. PID, command text, path, nonce, ancestry, port, and raw
  causes are not emitted.

## Negative/security verification

- PID/start-time/command-hash/nonce replacement proof is denied and no
  termination is called.
- Incomplete group/tree proof returns retryable and blocks escalation.
- A linked lease file is rejected; the current Windows host skips the link
  fixture because it denies unprivileged symlink creation.
- Dead-controller orphan repair converges only after a fresh proof; a tuple
  replacement remains retryable and is not terminated.
- Repeated lease transitions/cleanup are idempotent and bounded.
- Public contract and integration suites pass without new MCP operations or
  vocabulary.

## Findings

No P0/P1/P2 findings. Residual P3 note: authoritative Windows Job Object and
provider matrix evidence requires the parent-owned `PUMAREJO_RUN_PROVIDER=1`
gate; until that runs, Windows fallback limitations must remain visible and no
cross-platform residue-zero claim is allowed.

## Security status

`pass-with-platform-evidence-required` for this child. Safe to hand to the
parent for aggregate Windows/Linux verification; not release approval.
