# RDM-023 release-readiness packet

Status: `blocked`  
Source revision: `23fe76ecce1b3cbe8bd58e79ef31518e2d3b8f53` plus the reconciled initiative worktree  
Observed: `2026-08-24T15:21:03Z`

This packet is sanitized release evidence. It records command identities,
bounded outcomes, stable blocker IDs, and fingerprints only; raw output,
workspace paths, environment values, process identifiers, credentials, and
provider handles are excluded.

## Blocking reducer

The reducer returns `blocked` because required rows failed or are unavailable.
No failed, skipped, advisory, or missing row is counted as pass.

| Lane                                 | Required | Result                   | Stable reason                                                                                                                                                      |
| ------------------------------------ | -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RDM-019 real Tinto dialog journey    | yes      | blocked                  | `BLK-2026-08-24-007`: Tinto has not adopted the opt-in Pumarejo dialog broker.                                                                                     |
| RDM-020 attributed drift receipt     | yes      | passed-with-host-gaps    | Independent review/security passed; current host aggregate gaps remain separately recorded.                                                                        |
| RDM-021 network/artifact receipt     | yes      | passed-with-platform-gap | Containment and explicit-policy behavior pass; native identity-bound recursive deletion is unavailable and quarantine remains retryable.                           |
| RDM-022 self-doctor/resolver matrix  | yes      | passed                   | 79 tests pass with two platform skips on the final source state.                                                                                                   |
| RDM-022 correctness review           | yes      | passed                   | Independent final review reports no P0-P2.                                                                                                                         |
| Capability JSON/TOML composition     | yes      | passed                   | Current integration/Cargo suites cover malformed, duplicate, wildcard, authority-expanding, and generated capability cases.                                        |
| Real generated Cargo/rustfmt fixture | yes      | passed                   | Real `init` on a disposable `pnpm-json` consumer, two `cargo fmt` passes, identical Rust SHA-256, then `cargo fmt -- --check` pass.                                |
| Release bundle security review       | yes      | passed                   | Independent Security Sentinel reports no P0-P2 and confirms the blocked packet is sanitized and truthful.                                                          |
| Frozen Node 22 aggregate             | yes      | blocked                  | No current Node 22 frozen-install receipt exists on this source state.                                                                                             |
| Frozen Node 24 aggregate             | yes      | failed                   | Host Node 24.13.0 build/typecheck/lint/pack pass, but required format and test rows are red.                                                                       |
| Build                                | yes      | passed                   | `pnpm build` exited zero.                                                                                                                                          |
| Typecheck                            | yes      | passed                   | `pnpm typecheck` exited zero.                                                                                                                                      |
| Lint                                 | yes      | passed                   | `pnpm lint` exited zero.                                                                                                                                           |
| Package smoke                        | yes      | passed                   | `pnpm pack:check` exited zero; dry-run package contains 335 allowlisted entries.                                                                                   |
| Repository formatting                | yes      | failed                   | `pnpm format:check` reports 101 inherited CRLF/baseline files. RDM-022 focused formatting passes.                                                                  |
| Aggregate tests                      | yes      | failed                   | 639 pass, 19 skip, 7 known host/baseline failures: two certification hashes, one unavailable PowerShell Security module, and four Node executable-path mismatches. |
| Current Windows platform matrix      | yes      | blocked                  | No current authoritative clean Node 22/24 platform receipt on this source state.                                                                                   |
| Current Ubuntu platform matrix       | yes      | blocked                  | Required native/dedicated Ubuntu lane is unavailable in this run.                                                                                                  |
| Cleanup residue                      | yes      | incomplete               | Native recursive identity-bound deletion is unavailable; owned quarantine is preserved and retryable rather than claimed deleted.                                  |

## Release Marshal audit

- Branch: `codex/tinto-e2e-reliability`; base: `main`; no existing remote branch
  or PR.
- Jira policy resolves explicitly to `none`/skip.
- Scope guardrail: 20,788 human-authored lines, 13 generated lines, 9,539
  orchestration-document lines, and 150 untracked files. The oversized mixed
  initiative diff is blocking without an explicit split/oversized decision.
- The active autonomy ledger permits branch push and PR creation in scope, but
  its `required_checks_not_green` stop condition applies to this matrix.
- Release Marshal result: validation-only blocked. No staging, commit, rebase,
  push, PR, reviewer request, merge, Jira mutation, publication, or deployment
  occurred.

## Cargo proof

The disposable consumer was initialized through the real built CLI. The
generated Rust hash after both formatter passes was:

`bca77384c9e3396de20fd0c3eed064591f98a205117f3cc3f6c9c51673e7f500`

The shared repository fixture was not modified.

## RDM-022 fingerprint

Canonical sorted source/test hash bundle:

`5da23bbf8b1f26172b5e53fc87e2a4d115372369b0cdcae73436f7aa5d9ccecb`

The self-doctor is read-only, does not probe `PATH` or start toolchain
processes, preserves all six host/child dispositions, and returns `unknown`
when accepted RDM-017 evidence is unavailable. Windows native handle identity
remains a warning/platform limitation.

## Dependency receipt fingerprints

- RDM-019 artifact receipt:
  `b0f646489c37c205beccbe6cbe26cb5aa1169b73d8d83922d6a0fb8af5a48d12`
- RDM-020 aggregate receipt:
  `e3f4bf28be2b9b5d4d25dbe1d33ca45fd13e9a8d6829c4e53a42959a613886bb`
- RDM-021 product-input receipt:
  `f6c7885288ff5c67b6b225b44252ad149b3f110035ecdfd5d6e12383bd010eb6`
- RDM-022 source/test receipt:
  `5da23bbf8b1f26172b5e53fc87e2a4d115372369b0cdcae73436f7aa5d9ccecb`
- Canonical sorted receipt-set fingerprint:
  `a6eab3504e9dc9d7ba0c282a3e01fbc0eeadd26046645e725e3b232c826d35dc`

RDM-019's receipt is artifact-only and remains blocked by
`BLK-2026-08-24-007`; its hash proves the consumed packet, not runtime passage.

## Exact unblock actions

1. Update Tinto's confirmation call site to use the opt-in Pumarejo dialog
   broker in test mode, then rerun the real no-mock journey.
2. Re-run the frozen Node 22/24 aggregate matrix from an LF-clean checkout.
3. Run the supported Windows and native/dedicated Ubuntu platform suites on
   the reconciled source revision.
4. Provide a certified native identity-bound deletion adapter or retain the
   explicit retryable quarantine limitation in the release decision.
5. Recompute this packet and all fingerprints; only an all-required-pass
   result may be handed to Release Marshal as release-ready.
