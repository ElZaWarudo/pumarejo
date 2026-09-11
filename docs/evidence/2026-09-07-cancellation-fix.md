# Snapshot cancellation repair — 2026-09-07

Baseline: `C:/Users/User/Documents/personal/pumarejo`, `main`, HEAD
`41db8368e48b11b8fb79b2d980a93e42f4e1dc35`, clean before edits and on resumed
scope check. No applicable ancestor/root AGENTS.md found; accessible subtree
scan found none (unrelated fixture artifacts directory denied access).
Only this repository was edited. No Tinto edits, native acceptance, host
close/restart, installs, agents, branch changes, commits, or pushes were performed.

## Change and evidence

The adjacent Tinto diagnosis at
`../tinto/docs/orchestration/2026-09-07-daily-use-bounded-diagnosis.md` identifies
SDK timeout -> caller AbortSignal -> runtime `run` -> `closeNow` -> manager owned
process cleanup. The previous test deliberately asserted this destructive policy.
This patch opts only `snapshot` into retaining the session on caller-only
cancellation. Internal close/shutdown cancellation wins, including simultaneous
caller cancellation. FIFO rejection/release and all other operation policies
remain in place. It does not add a readiness claim or recover a dead provider.

Tests exercise direct cancellation, actual in-memory SDK `callTool` timeout and
server AbortSignal delivery, same owned PID and diagnostics session, fresh shallow
snapshot, skipped queued cancellation, close/shutdown races, cleanup failure/retry,
non-snapshot cleanup, and no ref publication from an aborted provider capture.
Existing session-manager ownership cleanup coverage also passes.

The controller reported another 65000 ms timeout and idle old driver in
`%TEMP%/tinto-daily-readiness-20260907/039-tauri_status.json`, with Agent session
`b8c5f36b` archived. That report is not a captured timeout-to-process-exit trace;
historical incident attribution remains conditional. Native continuity is untested.

## Validation

All commands used the available Node `v24.19.0` and existing local CLIs; npm is
unavailable. Detailed logs remain in `%TEMP%/pumarejo-cancellation-*.log`.

- Test-first runtime check: **30 passed, 2 failed / 32**; failures were artifact
  closure and the SDK follow-up snapshot returning an error.
- Final targeted suite: **83 passed, 0 failed, 0 skipped / 3 files**:
  runtime **33**, snapshot **17**, session manager **33**.
  `node node_modules/vitest/vitest.mjs run tests/unit/mcp-runtime.test.ts tests/unit/snapshot.test.ts tests/unit/session-manager.test.ts --no-cache --configLoader runner`
- Typecheck: **exit 0**, `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`.
- Targeted ESLint: **exit 0**, `node node_modules/eslint/bin/eslint.js src/mcp/runtime.ts tests/unit/mcp-runtime.test.ts tests/unit/snapshot.test.ts`.
- Acceptance script syntax: **exit 0**, `node --check docs/evidence/2026-09-07-cancellation-acceptance.mjs`.
- Manual diff review and `git diff --check`: passed. Broader refactoring/review
  dispatch was omitted under the user's minimal patch/no-agents scope.

## Build blocker — do not switch controllers to this incomplete dist

**3 of 4 build stages passed:** `node scripts/clean.mjs`,
`node node_modules/typescript/bin/tsc -p tsconfig.build.json`, and
`node scripts/build-provider-bundle.mjs`. The resolved clean target was verified
as this repo's canonical `dist`; no tracked dist files existed.

**Browser bundle failed (exit 1):** `node scripts/build-browser-bundle.mjs`.
esbuild reports `Cannot read directory "../../..": Acceso denegado.` and cannot
resolve the local browser entry. Explicit CLI tsconfig, absolute entry/working
directory, and preserve-symlinks invocations also failed at the same boundary.
No permissions were broadened and no build scripts were patched.
The compiled runtime contains the fix, but clean removed the old browser bundle
and `dist/observation/snapshot-browser.js` is absent. A complete build is required
from a controller scope where the existing esbuild resolver can read its required
directories; then rerun the standard four stages above. Logs:
`%TEMP%/pumarejo-cancellation-build.log` and
`%TEMP%/pumarejo-cancellation-browser-*.log`.

### Invocation-only recovery probe (still blocked)

The exact inaccessible ancestor is `C:/Users/User` (`../../..` from this cwd).
Node `readdirSync` confirmed `EPERM / scandir` there, while this workspace,
`C:/Users/User/Documents/personal`, and `C:/Users/User/Documents` were readable.
The browser entry itself was readable (28456 bytes).

An additional supported Node API invocation used absolute `absWorkingDir`, entry
and output paths, plus `tsconfigRaw` parsed directly from the workspace's
`tsconfig.json`, retaining every browser build flag. It failed with the same
ancestor error. Log: `%TEMP%/pumarejo-browser-recovery-raw.log`.
[esbuild 0.28.1 resolver source](https://github.com/evanw/esbuild/blob/v0.28.1/internal/resolver/resolver.go#L1422)
shows `dirInfoUncached` recursively obtains parent metadata before listing the
requested directory; resolver initialization also uses that cache for Yarn PnP
discovery. Supplying tsconfig does not bound that traversal. No invocation-only
equivalent that avoids it was established; no resolver/plugin workaround was added.

Controller requirement: from this repo in an environment where the existing
resolver's ancestor directory reads succeed, run
`node scripts/build-browser-bundle.mjs` and require a nonempty
`dist/observation/snapshot-browser.js`. The other three build stages already
passed; no source changed during recovery. `node dist/cli/index.js --help`,
`node --check dist/mcp/runtime.js`, and the acceptance client's syntax check all
returned **exit 0**. Browser artifact remains **missing**; build and native
readiness remain **blocked**. The 83 passing tests were not repeated.

## Controller-owned acceptance

Script: [2026-09-07-cancellation-acceptance.mjs](2026-09-07-cancellation-acceptance.mjs).
Prepared and syntax checked only. After completing the build and safely saving
active work, use a separate disposable native Tinto session and the controller's
working launch environment. Prepare the supported no-watch launch configuration
as described by the diagnosis. Do not disconnect the currently owning MCP
transport to swap JavaScript: transport shutdown still owns cleanup.

From this repository, the controller runs:

```powershell
node docs/evidence/2026-09-07-cancellation-acceptance.mjs --run-disposable-native C:/Users/User/Documents/personal/tinto
```

The script uses public MCP over stdio: launch, ready/PID, diagnostics, snapshot
with `client.callTool({ name, arguments: args }, undefined, { timeout: 100 })`,
status, diagnostics, shallow snapshot, equal PID/session checks, explicit close,
then idle. It preserves raw responses/errors, outbound cancellation notification,
server stderr, build hashes and launch config under a timestamped `%TEMP%`
directory (optional third argument overrides it). It refuses to connect when the
browser bundle is missing. Failure still explicitly closes its disposable session.

A timeout that was not induced is a failure, not a pass. Review the evidence to
establish cancellation reached an active observation. Separately verify the same
Tinto/provider OS processes and Agent session/thread survive and complete work
without archival/resume; cold launch alone does not establish long-history Agent
continuity. Confirm actual owned-process cleanup after explicit close. No native
acceptance or live continuity claim is made by this patch's unit tests.

Modified files: `src/mcp/runtime.ts`, `tests/unit/mcp-runtime.test.ts`,
`tests/unit/snapshot.test.ts`, this note, and the acceptance script. Generated
ignored `dist` was rebuilt partially as described above.

## Full-access build recovery — 2026-09-07

This later pass supersedes the incomplete-build status above; earlier observations
remain historical facts. Cwd and Git root were verified as
`C:/Users/User/Documents/personal/pumarejo`, branch `main`. Effective session
instructions are `danger-full-access`, unrestricted filesystem, network enabled,
and approval policy `never`. The controller confirmed **Acceso completo** in Tinto.
PowerShell read every ancestor through `C:/`; Node `readdirSync` also successfully
read the previously blocked `C:/Users/User` (118 entries).

Resolved executables: Node `C:/nvm4w/nodejs/node.exe` (v24.13.0), npm
`C:/nvm4w/nodejs/npm.ps1` (11.6.2), Git `C:/Program Files/Git/cmd/git.exe`.
These are this pass's observations, not corrections to the prior restricted scope.

**Normal `npm run build`: exit 0**, completing clean, TypeScript, browser bundle,
and provider bundle. Before clean, canonical `dist` was verified inside Pumarejo
and no tracked dist files were found. `dist/observation/snapshot-browser.js` now
exists and is nonempty (**24616 bytes**). `node dist/cli/index.js --help` loaded
successfully (exit 0); runtime and acceptance-client syntax checks also exited 0.
Build log: `%TEMP%/pumarejo-cancellation-full-access-build.log`.

Unexpected build side effect: the existing `pnpm clean` invocation automatically
performed dependency reconciliation, reporting five packages added from cache,
zero downloaded, and an up-to-date lockfile (pnpm 11.19.0). No separate install
command was invoked; this pass cannot claim that no installation activity occurred.
No new tracked package/lockfile changes appeared in Pumarejo status.

No source patch changes were needed, so the prior **83 passing tests were not
repeated**. Existing Pumarejo/Tinto/ICook work was retained; edits in this pass are
limited to this evidence and the two existing Tinto orchestration records, plus
normal generated build output and the dependency side effect above. No commits,
pushes, release, other Agents, provider staging, Tinto launch/close, or active
controller transport swap occurred.

### Controller-reported computer-use fallback and remaining acceptance

The controller used **sky** to reach Tinto controls and the native permission
dialog because the missing browser bundle broke Pumarejo semantic extraction.
`tauri_dialog` falsely reported `provider_dialog_absent`. This is computer-use
fallback evidence, **not Pumarejo capability proof**; the successful build does
not establish that native dialog detection is repaired.

Native acceptance remains **pending the controller run**. From Pumarejo, after
saving active work and preparing the separate disposable no-watch launch:

```powershell
node docs/evidence/2026-09-07-cancellation-acceptance.mjs --run-disposable-native C:/Users/User/Documents/personal/tinto
```

Arguments are the required `--run-disposable-native` flag, required Tinto project
path, and optional final evidence-directory path (default: timestamped
`%TEMP%/pumarejo-native-cancellation-*`). The unchanged client starts the patched
MCP CLI over stdio, launches its disposable visible session, checks ready/PID and
diagnostics, induces a 100 ms snapshot timeout (depth 100, 64 nodes, status role),
then checks status, diagnostic session identity and a fresh depth-4 snapshot.
It requires a cancellation notification and stable owned PID/session; failure to
induce timeout fails acceptance. It explicitly closes its disposable session even
on failure after a launch attempt and checks idle, retaining raw responses/errors,
wire cancellation, stderr, build hashes and launch configuration.

Controller review must still prove cancellation reached an active observation,
the actual Tinto/provider processes and same Agent thread survive and finish work
without archival/resume, and explicit close removes owned OS resources. The client
has not been run here; CLI loading and build completion are not native acceptance.


## Native runtime-session acceptance reconciled — 2026-09-07

**PASS: native runtime-session cancellation acceptance.** This resolves the earlier
build-blocked and pending-runtime-acceptance status; the historical attempts above
remain intact. The controller ran the unchanged acceptance client after the full
build and reported exit 0. Independently inspected source receipts are under
`C:/Users/User/AppData/Local/Temp/tinto-full-access-native-20260907`.
`protocol-checks.json` and `explicit-close.json` both report `passed: true`;
there is no separate exit-code receipt in that directory.

- Wire request 9 called snapshot with a 100 ms SDK timeout. Raw error is
  `-32001`; `notifications/cancelled` for request 9 was sent at
  `2026-09-07T10:40:37.927Z` (114 ms after the outbound request).
- Before, after cancellation, and after the fresh snapshot, `ownedPid: 23940`
  stayed `ready`. Diagnostic runtime session
  `f25ba4fca6a45a321cadd8862580e063` remained the same and readable.
- Fresh snapshot generation 2 returned one visible real status node,
  “Observación de archivos activa” / “● observando”. `maxDepth: 4` truncation
  is expected, not empty extraction or a full-interface coverage claim.
- Explicit close returned `alreadyClosed: false`, `state: idle`; subsequent
  status was idle with no owned PID. No close or launch was performed by this
  reconciliation Agent.

**Limits:** no active Agent task/thread continuity, long-history performance or
long-session maturity is proven. Diagnostics include `internal_error` and an
invocation labelled `diagnostics` with duration 121 ms, followed by a snapshot
record; they do not conclusively attribute cancellation to an active observation.
The saved launch configuration has no `--no-watch` and diagnostics report
watching for changes. Thus this run does not validate the previously proposed
no-watch preparation. The sky/native permission-dialog fallback and false
`provider_dialog_absent` remain historical computer-use evidence, not Pumarejo
capability proof or evidence that dialog detection is fixed.

An independent read-only Win32_Process query at
`2026-09-07T10:45:44.4923905Z` found **no process with PID 23940**. This supports
its absence at that later instant only. No acceptance-time OS creation identity
or complete descendant/resource inventory was captured here; PID reuse is
possible, and complete owned-resource cleanup is not independently proven. No
process was killed. The saved process-check receipt retains these limits.

Twelve relevant raw/summary files plus the process-check receipt were copied into
the established Tinto evidence area. Source/copy SHA-256 values were verified;
[hash manifest](../../../tinto/docs/orchestration/evidence/2026-09-07-full-access-native-manifest.json)
records provenance, byte counts and hashes. Build hashes in `build.json` match
the prior completed build's runtime and browser hashes.

### Reconciliation scope and preservation

Before edits, cwd/Git root were reverified as
`C:/Users/User/Documents/personal/pumarejo`, branch `main`; effective
instructions remain `danger-full-access`, unrestricted filesystem, network
enabled and approval policy `never`. Node again read `C:/Users/User` (118
entries). Node/npm/Git resolve to the same paths recorded in build recovery.

Pre-edit dirty inventory: Pumarejo **5** entries (3 modified source/test files,
2 untracked evidence/client files); Tinto **24** (16 modified existing files,
2 untracked orchestration docs, 6 earlier evidence receipts); adjacent Windows
ICook **580** dirty/untracked entries. No claim extends to a WSL checkout.
All 609 pre-existing dirty files were hashed before edits; preservation is checked
excluding only these three authorized document updates. Baseline:
`%TEMP%/pumarejo-native-reconciliation-preservation.json`.

The previous build-triggered cached dependency reconciliation remains recorded:
five packages added, zero downloaded, no separate install command and no new
tracked Pumarejo package/lockfile changes. Ignored dist/dependency state is not
represented by Git's dirty counts. This evidence-only pass performs no source
fixes, tests, builds, installs, commits, pushes, releases, app restart or other
Agent dispatch. The controller owns closing the current session.

Preservation verification completed: **606/606** pre-existing dirty files outside
the three authorized docs retain their pre-edit SHA-256 values. Final dirty counts
are Pumarejo **5** (3 modified, 2 untracked), Tinto **38** (16 modified, 22
untracked), Windows ICook **580** (all untracked). All 13 copied/generated receipt
hashes and both current build hashes match their recorded provenance.


## Remaining daily-use gaps — diagnosis update, 2026-09-07

See [Tinto bounded diagnosis](../../../tinto/docs/orchestration/2026-09-07-daily-use-bounded-diagnosis.md#remaining-daily-use-gaps--bounded-diagnosis-2026-09-07)
for receipts, exact patch/test scope, no-watch launch args and controlled Agent
continuity acceptance. Prior cancellation 83 tests/build/native runtime pass stands.
Confirmed implementation gaps: restore checks maximization but never unminimizes;
runtime diagnostics capture the previous operation name; synchronous WSL enumeration
and browsing block IPC, and readiness/queue deadlines do not bound all blocking work.
Their contribution to each 30-second observation failure remains unproven.

Fresh controller evidence: sky twice saw MINIMIZED; public restore and screenshots
failed at 30s; sky activation restored the window, but a subsequent snapshot still
timed out at 65s. Raw 014 status is ready, PID 20724; controller reports the same
active Agent continues without archive/resume. This is positive active-continuity
observation, not the full task-completion/identity/cleanup acceptance. Sky is fallback.

WSL list/basic exec passed in 149/716 ms; ICook registered Linux path resolves.
Plain login lacks node/codex but the actual profile/NVM resolver exceeds the bounded
8-second probe, so native tool availability and the specific slow environment stage
remain unresolved. No distro reset/install is justified. Profile/COM/lock/DOM stage
attribution precedes optimization. Current watch-enabled host must be safely isolated
by the controller using supported --no-watch config before Rust/provider edits;
frontend Vite remains live. No source edits or native control occurred this turn.

Diagnosis preservation check: 620/620 pre-existing dirty files outside the
three authorized documents retain their baseline hashes. Dirty counts remain
Pumarejo 5, Tinto 38, Windows ICook 580; no new repository artifacts.


## Focused gap implementation and handoff — 2026-09-07

This update supersedes the earlier snapshot-only cancellation policy and diagnosis-only status; historical failures and receipts above remain intact. Actual cwd/git root is C:/Users/User/Documents/personal/pumarejo. Effective instructions specify danger-full-access, approval never, unrestricted filesystem and network. Before source edits, OS identity verified the fresh chain node 20124 (tauri.js dev --no-watch --features pumarejo --config runtime-QqLie2/mode-overlay.json) -> cargo 25324 -> cargo 27248 -> Tinto 6544. The same chain remained alive at final verification; Tinto creation is 2026-09-07T11:13:59Z. Configuration remains npm run tauri -- dev --no-watch --features pumarejo --config {tauriConfig}; Vite remains live. No frontend edits or host restart/close occurred.

Controller reported ENTER timeout killing the previous session and archive 1b067776. Raw no-watch 011 status is idle with lastAction screenshot: preserve that distinction rather than rewriting it as an ENTER receipt. Computer-use/sky submission, restore and native permission-dialog handling remain fallback, not Pum capability proof; earlier tauri_dialog provider_dialog_absent was a false report.

Implemented:
- Runtime caller cancellation now preserves app/session for actions and observations. Mutating requests record lastCancellation outcome uncertain, caller_cancelled is nonretryable, and there is no redispatch. A late success after abort cannot be returned as success. Explicit close/shutdown retains cleanup authority; launch lifecycle is unchanged. Existing interaction invalidation protects uncertain action references.
- Canonical native POST /session/{session_id}/pumarejo/window/restore unminimizes and unmaximizes the owned window, waits up to one second for a usable native rectangle, and crosses the existing authenticated provider boundary. No suspended WebView JavaScript is needed. Unsupported older providers return WINDOW_ACTION_UNAVAILABLE rather than JavaScript fallback. Restore invalidates semantic refs and returns the native result without automatic semantic refresh, including when snapshotAfter was requested; request a fresh snapshot separately.
- Runtime attribution uses the current operation. Bounded queue-wait diagnostics and Windows screenshot dispatch/callback/deadline plus script-lock wait timings aid attribution. They do not establish the cause of past observation stalls or remove pending WebView work.
- Tinto enumeration uses a five-second owned-subprocess deadline, bounded output, and child cleanup. Enumeration/directory queries and Agent binary/readiness probes run off the async runtime through spawn_blocking. Existing directory timeout policy remains. This fixes concrete blocking and unbounded enumeration; pooled helper mutex/write waits and intermittent resolver/profile stalls are not claimed solved.

Exact source/test changes this turn (relative to each repository):
- Pum: src/mcp/runtime.ts, src/interaction/engine.ts, src/session/endpoint.ts, src/webdriver/client.ts; tests/unit/mcp-runtime.test.ts, interaction.test.ts, webdriver-client.test.ts, provider-source.test.ts, session-endpoint.test.ts; vendor/tauri-plugin-wdio-webdriver/src/platform/windows.rs, src/server/router.rs, src/server/handlers/window.rs.
- Tinto: src-tauri/src/windows_process.rs, src-tauri/src/workbench/commands.rs, src-tauri/src/agent_console/commands.rs.
- Documentation: this file and the existing Tinto native-hardening-reconciliation and daily-use-bounded-diagnosis documents. The earlier snapshot.test.ts and acceptance client were preserved unchanged.

Bounded WSL recheck: the actual profile/bashrc/NVM resolver completed every instrumented stage in 1094 ms (exit 0) and found /home/teb/.nvm/versions/node/v24.13.0/lib/node_modules/@openai/codex/bin/codex.js. Existing helper handshake and agent_binary_available completed in 1534 ms, exit 0, available true, empty stderr. Receipts: %TEMP%/tinto-gap-fixes-resolver-stages-20260907.json and tinto-gap-fixes-wsl-helper-20260907.json. No distro edits/reset/install or AI task launch occurred. Current helper health does not explain the earlier bounded timeout or prove the native ICook route/task; plain login PATH was not the full resolver oracle.

Validation:
- 242/242 TypeScript tests across eight files: mcp-runtime 36, snapshot 17, session-manager 33, webdriver-client 31, provider-source 4, interaction 105, sequence 11, session-endpoint 5. Includes public SDK ENTER cancellation, uncertain outcome/no redispatch, close cleanup, native restore without JS/semantic refresh, and current-operation attribution.
- Invocation: process-local NODE_OPTIONS='--preserve-symlinks --preserve-symlinks-main'; node node_modules/vitest/vitest.mjs run tests/unit/mcp-runtime.test.ts tests/unit/snapshot.test.ts tests/unit/session-manager.test.ts tests/unit/webdriver-client.test.ts tests/unit/provider-source.test.ts tests/unit/interaction.test.ts tests/unit/sequence.test.ts tests/unit/session-endpoint.test.ts --no-cache --configLoader runner. Normal startup was blocked by existing empty nested cached debug dependencies, not a test assertion failure. Log: %TEMP%/pumarejo-gaps-verified-tests.log.
- Typecheck passed. Build stages passed: node node_modules/typescript/bin/tsc -p tsconfig.build.json; node scripts/build-browser-bundle.mjs; node scripts/build-provider-bundle.mjs. CLI --help loads. No package-manager install/hook ran this turn. Historical build-triggered five cached dependency additions remain preserved, not reversed. Browser bundle exists (24616 bytes), SHA256 71e1851330d3ca912ffaeb964146e86d27d71b349f7dfdd34f1041e4bfe5b31d; dist/mcp/runtime.js SHA256 385e8b1c309b9ad2083049e5e53f51f2fab12a084837c06dc234758c23b3cb05.
- Tinto cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features pumarejo --lib wsl -- --test-threads=1: 89 passed, including runtime responsiveness during a stalled query. Separate bounded_output_preserves_exit_and_bounds_stalled_child test: 1 passed. The initial feature-less command hit existing wdio-webdriver UnknownManifest; corrected feature build passed.
- Canonical provider cargo check AND cargo build passed offline using a temporary path-dependency harness with Tauri 2.11.2 and the existing target cache. No staged provider replacement or live executable relink occurred. Logs: %TEMP%/pumarejo-gaps-provider-check.log and pumarejo-gaps-provider-build.log. Tinto executable remains SHA256 FABEF07FF17004F1059EB73B7A4D92107D105303921A05CDC3455BED54B1309F, last write 08:08:45 UTC. Only trailing blank-line cleanup followed compilation; provider bundle regenerated afterward.
- ESLint is blocked before linting by pre-existing dependency resolution: ESLint 9.39.5 requires Ajv ^6.14.0, root resolves Ajv 8.20.0 and cannot find ajv/lib/refs/json-schema-draft-04.json. No install or dependency repair attempted. Typecheck/tests do not replace that missing lint result.

Controller native acceptance (new fixes are compiled, not yet accepted in the live host):
1. Save active work and explicitly close the owning session/transport after this task ends; inventory owned processes by PID AND creation time. Stage the updated canonical provider through supported init, first reviewing: node dist/cli/index.js init --project C:/Users/User/Documents/personal/tinto --dry-run. Then apply the reviewed init plan, preserving the approved no-watch argv and existing work. Rebuild/link Tinto with features pumarejo only after the old host is closed. Start a fresh Pum MCP process and native Tinto; verify actual --no-watch and absence of Watching. Vite is still live.
2. On a disposable target, controller OS minimization is setup/fallback. Public tauri_window arguments {action:'restore',settleMs:0,snapshotAfter:false} must yield usable native geometry; independently confirm nonminimized/nonmaximized state and unchanged app/provider/session identities. Then request fresh screenshot and shallow snapshot separately. Capture the new queue/lock/callback diagnostics for any remaining stall; do not infer causes from duration alone.
3. Public SDK action cancellation: with known harmless focus, call client.callTool({name:'tauri_press_key',arguments:{key:'ENTER'}},undefined,{timeout:100}). Require actual cancellation of an in-flight request, timeout -32001, same ready runtime/provider/app identity, lastCancellation action pressKey/outcome uncertain, and no automatic retry. Observe the resulting state before any later action. Explicit close must still clean up; never retry ENTER merely because its result is uncertain.
4. Real Agent continuity: start a known bounded task producing progress before/during a 100ms public snapshot cancellation, record exact Agent/thread/turn, provider/session and app PID/creation identities, and require later progress plus task completion without archive/resume. Capture action cancellation separately if needed; no intentional ENTER against an unsafe active task. Verify explicit close/status idle and owned-process cleanup with PID reuse caveats. Prior runtime acceptance and controller-visible ongoing Agent progress are positive but do not prove this full acceptance or long-session maturity.
5. Existing runtime-only client command: node docs/evidence/2026-09-07-cancellation-acceptance.mjs --run-disposable-native C:/Users/User/Documents/personal/tinto C:/Users/User/AppData/Local/Temp/tinto-gap-fixes-native-20260907. It launches a disposable session, cancels a snapshot, verifies runtime continuity/fresh snapshot, and explicitly closes. It does not perform active-Agent or ENTER acceptance.
6. Exercise native WSL enumeration/browsing and Ubuntu 24.04 ICook availability while local UI remains responsive. If the route fails, retain exact helper/profile stage and request identity as an external-route diagnosis; no distro shutdown/reset/install. Full native WSL Agent task remains pending.

Preservation baseline: %TEMP%/tinto-gap-fixes-baseline-20260907.json records all three roots, porcelain status and dirty-file hashes. All 619 pre-existing dirty files outside the two intentionally extended Pum source/test files and three evidence docs retain their baseline bytes. Three baseline-clean generated provider permission files incurred only Cargo line-ending churn; that churn was removed after checking no substantive diff. Final dirty entries: Pum 15, Tinto 42, ICook 580. No commit/push/release/install/other Agent or host lifecycle operation occurred.


## Fresh recovery staging — 2026-09-07

**STAGING_READY (offline preparation; native daily-use acceptance remains pending).**
This supersedes the earlier suggestion that ordinary `init --dry-run` can stage this
particular dirty integration. It does not supersede the prior 242 TS + 90 Rust
results, earlier runtime-only native acceptance, or their stated limitations.

Scope remained Pumarejo cwd/root, unrestricted filesystem/network, approval never.
No other Agents, installs, release, project commit/push, host close/restart, frontend
edit, or live executable/DLL replacement. Existing command tests created commits
only inside their disposable temporary Git fixtures. All implementation work for
this replay correction is in a temporary source copy and the reviewed patch below.
The fresh tools did not expose the controller's owning Pum stdin handle; an async
request for that handle was made, but no live UI action/reproduction was issued.
The existing public 012 host and its provider were left running.

### Integration diagnosis and reviewed source staging

`node dist/cli/index.js init --project ../tinto --dry-run` reproduced
`ALREADY_INTEGRATED_MODIFIED`. `plan.ts:202` permits unrelated full-file differences
for Rust/Cargo/ignore, but not config. The intentional no-watch config still hashes
`782aa3eb3ff15e6cd1c9df433613f1dc2013f0b01e84ee1af8f0cf7c13bab7b7`, versus recorded
`8ec711697bec2c64c02b9ace71934529497a64120ab01c33e360aafd282363f6`.
Its attributed integration fields are intact. Cargo.toml and lib.rs also have
intact owned projections with unrelated full-file differences; preserve both.

Exactly three staged provider sources still match their old recorded hashes but
differ from the current canonical bundle: `src/platform/windows.rs`,
`src/server/handlers/window.rs`, `src/server/router.rs`. Doctor's registration
message includes provider staging integrity, so its Cargo/Rust wording did not
establish damaged Cargo/Rust registration.

[Bounded staging helper](2026-09-07-stage-tinto-provider.mjs) dry-run passed. It
pins the reviewed old/new hashes, preserves config/Cargo/Rust, refuses a running
Tinto/Tauri launcher, backs up originals, copies only the three source files, and
updates only the manifest hashes corresponding to those real copies. It never
writes an executable/DLL. It is intentionally not a generic installer repair and
is not applied here. The no-watch config fingerprint is **not** rewritten;
ordinary init remains expected to reject it even after staging. Do not work around
that rejection with invented hashes or remove/re-init of the user's integration.

A complete copied fixture with canonical provider staging reported all four
integration diagnostics ready, including manifest and debug-registration. Only
external toolchain/platform probes were stubbed. The initial incomplete fixture
lacked package-lock.json and could not infer the primary window; its capability
error was fixture setup, not a live target defect. Cargo generated three additional
line-ending changes inside the disposable provider copy; they were normalized
there only. The live provider directory was not modified.

### Recorded-history bottleneck and offline patch

Archive `7f935ca3-96aa-4b00-8bf6-0b7708ce4f73` has 10,208 events (9,903 command-output
chunks), approximately 2.44 MB of event JSON. Resumed
`4ee1d4a6-df95-4ba2-8cc5-f5c91cbb711f` now contains the copied history plus one
lifecycle event, not a newly submitted follow-up. Both point to provider thread
`01a07b6c-9aa9-7713-8500-5dae2b6d81fd`. Its last task completion remains
`2026-09-07T11:51:16.986Z`, turn `01a07b9a-10e0-7303-bb4a-9e03b1f63790`.
Persisted `running` journal status alone is not process/task liveness evidence.
The follow-up never reached that provider; sky submission remains fallback.

Causal path: TerminalPanel.tsx waits for `resumeAgentJournalSession` before calling
`writeAgentSessionInput`. commands.rs previously re-recorded each archived item,
cloned a session projection for each, issued individual SQLite writes, and emitted
one UI event per item before returning. The 10,208-event recorded journal portion
reached only 4,762 items in 10,000 ms and failed its bounded regression, before any
WebView event processing was included. This is a reproduced backend bottleneck;
it does not fully attribute the historical blank screen or lock-related stall.

[Reviewed replay patch](2026-09-07-tinto-replay.patch) changes only Tinto
`src-tauri/src/agent_console/commands.rs` and `journal.rs`, retaining their prior
uncommitted work. It batches archived persistence in one transaction on a blocking
worker, takes one session snapshot, and uses the existing final session refresh
instead of thousands of history-as-live UI notifications. It also covers the same
history-copy loop when branching from an edited message. Provider input is not
retried. Failed persistence rolls back and uses existing failed-resume cleanup.
The journal retains all ordered events; the established in-memory tail limit stays.
No frontend patch is needed for this correction, so Vite HMR is untouched.

Validation: original recorded regression failed as above; patched replay persisted
all 10,208 events in 779 ms, and the final run with the canonical provider in the
copy took 1,237 ms (two-second budget). 18 journal tests and 36 command tests passed;
journal tests include ordered full history, duplicate preservation and rollback of
mixed-session input. `git -C ../tinto apply --check` passed against the current dirty
source. Targeted manual review only; broad simplification was skipped because both
source files contain pre-existing work. No whole-UI performance or successful live
resume/dispatch result is claimed. The independent earlier 022 snapshot at
`%TEMP%/tinto-gaps-no-watch-20260907` took 61,983 ms and had empty semantic extraction;
its lock/blank cause remains unresolved by this journal measurement.

### Acceptance client and precise controller sequence

The [existing acceptance client](2026-09-07-cancellation-acceptance.mjs) now accepts
an optional final `--daily-use`. It performs native minimization as explicitly
labelled setup, public SDK restore with native geometry/state checks, separate
screenshot/snapshot, public focus of a controller-selected harmless search/filter
textbox, and one ENTER with a 100 ms SDK timeout (2,000 ms settle, no snapshot).
It checks the exact wire cancellation ID, uncertain/non-retried action outcome,
stable runtime/OS identity, and observes state before further action.

The controller supplies a bounded read-only task and exact Tinto session, provider
thread/turn, provider PID/creation identity, readable journal/rollout paths, and
expected hash. The client requires two progress messages before snapshot
cancellation, later progress in the same provider turn and Tinto journal, six
numbered hash results and exact task_complete. Missing IDs, a non-induced timeout,
wrong provider, or a follow-up without task_started fails acceptance. It records
Windows-owned descendants by PID AND creation time and checks their absence after
its explicit disposable-session close. It does not kill arbitrary/reused PIDs.
Five parser checks and four SDK-wire oracle checks passed; both scripts parse.
A read-only Win32 geometry query passed without minimizing/restoring this host.
The extended native flow has **not** run. WSL Linux provider identity/cleanup is
unsupported by this Windows oracle, and active native-dispatch attribution still
requires the matching provider receipt. Native confirmation/navigation/submission,
including full-access dialogs and the failed-resume sky submission, is fallback,
not Pum capability proof. Runtime continuity is not task-submission capability proof.

Controller steps, from the Pumarejo root, only after this repair turn has completed:

1. Save active work. Through the existing owning controller/Pum connection, close
   the current session after recording owned PIDs and creation times. This Agent
   must not be asked to terminate its own host. Ensure no Tinto/Tauri dev launcher
   remains before any application/linking step.
2. Compare the two Tinto source preimage hashes in
   [staging receipt](2026-09-07-recovery-staging.json). If they changed, review/rebase
   the small patch; do not overwrite. Run `git -C ../tinto apply --check
   ../pumarejo/docs/evidence/2026-09-07-tinto-replay.patch`, then the same command
   without `--check`. No checkout, reset, stash, commit or push is needed.
3. Run `node docs/evidence/2026-09-07-stage-tinto-provider.mjs` for the review, then
   `node docs/evidence/2026-09-07-stage-tinto-provider.mjs --apply-after-close`.
   Run `node dist/cli/index.js doctor --project ../tinto`. Expect intact integration
   projections; preserve any unrelated custody warning and investigate separately.
   Do not rerun init/remove to force away the deliberate config fingerprint drift.
4. Only after close/apply, link the real host:
   `cargo build --offline --locked --manifest-path ../tinto/src-tauri/Cargo.toml
   --features pumarejo --bin tinto`. This is the controller's build, not done here.
   Existing Pum dist is unchanged and already contains the prior runtime fix.
5. Start a fresh owning Pum transport and verify actual Tauri argv includes
   `dev --no-watch --features pumarejo --config ...`; config text alone is not proof.
   On a separate disposable acceptance run with no repair task hosted inside it:
   `node docs/evidence/2026-09-07-cancellation-acceptance.mjs --run-disposable-native
   C:/Users/User/Documents/personal/tinto
   C:/Users/User/AppData/Local/Temp/tinto-recovery-native-20260907 --daily-use`.
   The command above is one line. Answer its two JSON setup prompts within their
   120-second bounds; obtain creation timestamps in the same UTC ISO format as
   owned-processes.json. Use the exact requested six numbered hash markers. If a
   route needs native setup, record that route honestly. Do not run this client
   against the active repair host: it launches and explicitly closes its own target.
6. Separately reopen the recorded long history and send one bounded follow-up
   THROUGH Tinto. Capture resume latency, composer responsiveness, exact new
   task_started/turn ID at the provider, later progress and task_complete. Do not
   resubmit on an uncertain response. Retain fresh queue/lock/callback diagnostics
   for any remaining blank/lock stall. Source staging and Rust tests are not this
   acceptance. A WSL route needs its own Linux identity/cleanup oracle.

Recorded replay fixture, baseline hashes and detailed test/fixture receipts remain
in `%TEMP%/tinto-fresh-recovery-20260907`. The original history is read through a
read-only SQLite connection; only the disposable fixture DB is written by tests.
The patch's ignored recorded-history test uses `TINTO_REPLAY_FIXTURE` pointing to
`recorded-timeline.json` there. Final test command used `cargo test --offline
--locked --manifest-path <temporary-copy>/src-tauri/Cargo.toml --features pumarejo
--lib agent_console::journal::tests -- --include-ignored --nocapture
--test-threads=1`, with CARGO_TARGET_DIR set to Tinto's existing target cache.
Only library test artifacts were built, not the running executable/DLL.

The current live chain is repair client 6060 -> MCP 25436 -> launcher 19584 ->
Tauri 26124 (--no-watch) -> Cargo 780/11836 -> Tinto 18500, created
2026-09-07T12:47:15.7118480Z. Live tinto.exe last write is 12:40:39.4533987Z,
SHA-256 `a31aaf14129e38f638f53f2ff681c20e15ceed8e43ec7fcbc35267af3a3fd0d0`.
This is the controller's rebuilt public 012 host, not the historical earlier hash.
Artifact/source hashes and final preservation counts are in the staging receipt.


## Native recovery verified; focused WSL transport repair — 2026-09-07

Controller applied the tested replay patch and three staged provider sources after clean close, reported doctor allready and completed an offline native build. The prior staging-pending statements are historical. The native receipt at %TEMP%/tinto-recovery-native-20260907/verified-native-checks.json (SHA256 b185b85485d958009d0499a5986ead7734d67bd0459872f723c1f28aaec3c8aa) verifies session 4065d799-7ef0-4d82-820d-4dde9a69e58a, provider session 01a07b6c-9aa9-7713-8500-5dae2b6d81fd and task 01a07c12-f3b2-71f0-a2d0-af969a498a66. Tinto PID 25952 was created 13:28:42.5158170Z; provider PID 19228 at 13:33:29.2162890Z.

Public 014 clicked minimize; 015 native restore passed in 2348 ms, 016 screenshot in 95 ms and 017 full snapshot in 3610 ms. Harmless ENTER request 009 timed out at the SDK and 013 retained ready state with lastCancellation pressKey/uncertain and no replay. One public follow-up 023 reached the resumed 10,208-event history. After 100ms snapshot cancellation 024, the same task completed all six package.json hash reads and task_complete at 13:35:47.646Z. Screenshot 028 is final evidence. These actions used the thin public SDK, with no native-action fallback. Read-only journal and OS identity checks are independent observation fallback. This is bounded same-turn active-Agent continuity/completion plus native restore/action-cancellation proof; large-transcript observations still take 9–26 seconds and full maturity is not established. No explicit-close acceptance was performed in this repair turn because the host remains active.

Do NOT run the earlier --daily-use acceptance extension: its direct Windows ShowWindow setup bypasses the required sky computer-use route. Its earlier suggested command is superseded. Controller used thin public SDK actions instead. Any future OS setup must use the approved computer-use API and be labelled setup/fallback.

Current repair preflight independently verified actual Pumarejo/Tinto git roots, danger-full-access with approval never, Node/npm/git/wsl tools, and live chain Tauri node 22780 (--no-watch) -> cargo 29652 -> cargo 28344 -> Tinto 25952. No frontend source was changed, and Vite remains live. Baseline %TEMP%/tinto-wsl-repair-baseline-20260907.json contains hashes of all 640 pre-existing dirty files: Pum 18, Tinto 42, ICook 580.

### Remaining WSL failure and proven scope

Raw 034 is a successful public click dispatch with unknown effect (7994 ms), not a tool error envelope. Snapshot 035 then reports Ubuntu-24.04:ICook child_exit, helper stdout closed, exit 1, stderr unavailable; it also contains a separate earlier timeout alert. Controller found no newly recorded WSL Agent. No AI task was redispatched here.

A bounded local probe of the exact managed bash -lc helper launch, with protocol-v1 handshake followed by agent_binary_available(codex), returned handshake ok/available true in 1984 ms, exit 0, empty stderr. The helper path is /home/teb/.local/share/tinto/agents/0.1.0/tinto-agent. The first probe used the wrong handshake field agent_version and returned a structured malformed_response; the corrected request used client_version. Neither probe launched an AI provider. No distro reset/install or checkpoint mutation was performed. Current helper availability does not locate the historical exit or prove ICook startup.

Source inspection and deterministic failing tests proved two pool lifecycle defects: (1) exchange released its I/O lock after timeout before the wrapper retired the helper, allowing a queued request to consume the first request's late reply or race its cleanup; (2) cleanup removed the pool entry by key even when it was a newer replacement. Original regression run: 22 passed, 2 failed, including an actual stale late-first-response and lost replacement identity. These are concrete transport defects. Receipt 034 lacks operation-stage/cleanup correlation, so attributing that specific exit to these races would be inference, not a proven native causal chain.

Changed only Tinto src-tauri/src/wsl_agent/launcher.rs and src-tauri/src/agent_console/mod.rs plus these three existing handoff docs. Failed exchanges now mark their stream unusable and clean up under the I/O lock, before queued callers can dispatch. Stale cleanup removes only the identical Arc entry and cannot kill another request while it owns I/O. Checkpoint mutations remain non-retryable; no new AI replay/retry policy was introduced. Startup errors retain their category and identify binary_check, checkpoint_create or provider_spawn, distinguishing helper preflight from provider launch. Tests verify failed provider startup records no session and performs one spawn attempt.

No retrospective stderr detail was invented. Existing stderr capture remains bounded/redacted; unavailable is a snapshot of collected data, not proof the Linux process wrote nothing. Pooled mutex acquisition and stdin writes still lack a total deadline; this narrow change does not claim to solve every WSL stall or large-transcript latency.

Validation: launcher suite 24/24 passed after both regression failures; broader WSL suite 92/92 passed, including the three new regressions. Exact command from Pum root: cargo test --offline --locked --manifest-path ../tinto/src-tauri/Cargo.toml --features pumarejo --lib wsl -- --test-threads=1. Logs: %TEMP%/tinto-wsl-repair-red.log, tinto-wsl-repair-green.log, tinto-wsl-repair-suite.log. Rust library test compilation passed; no host executable was linked or restarted. Prior TypeScript/cancellation/replay test results stand and were not repeated. Targeted manual diff review was used because unrelated work is present; no broad simplification, commit, push or release.

Source SHA256:
- src-tauri/src/wsl_agent/launcher.rs: 4ea4451d5cfe9969924b7564a5ce2491dde169d670a080ef3f56adfa79876af5
- src-tauri/src/agent_console/mod.rs: cdd0601206c93ff65aa5a290a3be114557edb4c0b8c55ae077c71c9f61245e31

The live executable on disk is SHA256 c78b356d897c63ca3b1775bcbb2b04e08712dc876a7a98dd93548046298de7ba, last write 13:28:39.7202076Z, predating this repair baseline at 13:41:48Z. native-binary.json was written at 13:27:47Z and therefore describes the earlier pre-link file; its older hash is preserved as history. Live app/provider creation identities and no-watch ancestry remain unchanged.

### Controller acceptance after this turn

1. Preserve current work and verify no uncertain WSL task exists using session records and Linux PID/start-time identity; absence from the session list alone is not process cleanup proof. Do not re-click an uncertain start. Controller owns Pum handle 71337 and all host lifecycle actions.
2. After this turn completes, close the owning host cleanly. Link the two Windows backend source changes with cargo build --offline --locked --manifest-path ../tinto/src-tauri/Cargo.toml --features pumarejo --bin tinto. No Linux helper install/rebuild is required for these Windows transport changes. Start the approved fresh --no-watch route and verify OS argv and identities. No additional Pum/provider staging is needed for this change.
3. Through the thin public SDK, observe Ubuntu-24.04:ICook readiness and click Iniciar Codex exactly once only after the no-uncertain-task check. Capture the new startup error stage/category if it fails. On success require exactly one Tinto session, provider identity including Linux PID/start time, an acknowledged bounded task and its completion while Windows UI remains responsive. Do not interpret click-dispatched as provider-started and do not automatically retry.
4. Capture fresh status/screenshot/snapshot separately, noting latency. If failure recurs, use the reported binary_check/checkpoint_create/provider_spawn stage to probe that step without redispatch; retain exit/status and bounded redacted stderr. Current probes show no distro-health blocker, but native cause 034 and successful ICook startup remain pending.
5. At the controller's chosen end, explicitly close the disposable WSL session and verify its Linux process group/provider cleanup by identity, plus Windows-owned helpers; do not substitute a Windows-only cleanup oracle. No WSL shutdown/reset is authorized.

Preservation final: 637/637 pre-existing dirty files outside the three updated handoffs retain their baseline SHA256. Dirty entries: Pum 18, Tinto 44, ICook 580. Both changed Rust files were clean at this turn’s baseline. Source hashes above are final; existing replay, provider, frontend and cached-dependency work was preserved.


## WSL readiness/start route — 2026-09-07

This supersedes the previous native-pending status for the pool race build, while preserving historical facts. Controller linked that build, explicitly closed the old host through public 041, and public 042 reported idle/lastAction close. %TEMP%/tinto-recovery-native-20260907/explicit-close-process-check.json passed with survivors [] at 13:55:35.7967145Z. Controller's Linux post-close observation found no Tinto helper/app-server; unrelated older Codex/headroom processes are not part of that cleanup claim.

New supported launch 001 is in %TEMP%/tinto-wsl-native-20260907. Independently verified Pum cwd/root C:/Users/User/Documents/personal/pumarejo, Tinto root C:/Users/User/Documents/personal/tinto, effective danger-full-access/approval never, and Tauri node 28236 with --no-watch (created 13:58:47.7547480Z), hosting Tinto 20200 (14:00:46.1918300Z). The same identities remain at completion. Executable last write 14:00:42.9896828Z predates this repair. The full dirty baseline is %TEMP%/tinto-wsl-route-baseline-20260907.json: Pum 18, Tinto 44, ICook 580. No host lifecycle or live frontend operation was performed.

Native facts: snapshot 004 initially disabled startup while checking; 005 enabled it but showed background WSL scan timeouts. One public click 006 dispatched in 5954 ms at 14:02:56.991Z. Snapshot 009 and image 11-0.png show the persistent generic start-failure message; no new WSL journal session was recorded. ICook scanning did finish with 580 files. Dashboard 013 was checking availability again. linux-start-processes.json records helper 174620 and unrelated Codex/headroom processes originating at 05:43; none were killed, restarted or used for this repair. No start was repeated.

### Confirmed route defects, rather than an inferred native exception

The exact path is RepoAgentLauncher.runLaunch -> RepoPanel onLaunch -> bus/client.startAgentSession -> Tauri start_agent_session -> known-repo resolution -> registry binary_check -> checkpoint_create -> provider_spawn. The initial readiness call only runs AgentBinaryAvailable. It is not an acceptance of checkpoint creation or provider startup. RepoPanel then lists sessions/open terminal after startup, so rejection of its combined callback does not itself prove no session started.

RepoCard.reportActionFailure unconditionally discarded the backend category/message and replaced it with the screenshot's generic text. This directly explains why the previously added stage labels never appeared. The original click-006 rejection was only sent to console.error and is absent from the supplied semantic snapshots/diagnostics. A controller console capture was requested without redispatch; no such capture was available at completion. We cannot retrospectively name that exception or attribute it to the previous pool races.

Two additional defects on this same shared-helper path were reproduced before changes:
- Pooled exchange acquired io.lock and performed blocking stdin.write_all before starting its response timeout. A nominal 30 ms queue wait took 506.3727 ms in the deterministic test; a 40 ms write deadline took 4.0336742 seconds with a non-reading child. Background scans, readiness and startup use this pool.
- Availability cache expiry started at request creation, so a still-pending probe stopped being shared after ten seconds; forced replacements could also be evicted by an older rejection. Both failures were reproduced in offline tests. They permit duplicate requests while scans hold the helper. They do not identify the precise historical click-006 exception.

The no-commit checkpoint hypothesis was checked without mutation: ICook's 580 nonignored files total 26,033,983 bytes, below the default 100 MiB checkpoint limit. Source handles unborn HEAD through filesystem snapshots. A bounded read-only Linux check found no checkpoint directory modified in the relevant launch window; absence alone does not establish the failed stage. No checkpoint or Agent task was created as a probe.

### Changes and validation

Live backend source changed only in Tinto src-tauri/src/wsl_agent/launcher.rs, extending the earlier preserved race fixes. One exchange deadline now covers I/O-lock admission, asynchronous writer completion and stdout response; safe read-only retry attempts use the remaining request budget. Queue expiry returns a not-sent timeout without retiring/removing the helper owned by another request. A dispatched write timeout is uncertain and retires the stream under the I/O lock; mutations are not replayed. Existing bounded stderr and identity-checked cleanup remain. This bounds the previously demonstrated waits; process creation/installation and OS cleanup are not advertised as preemptible by that exchange deadline.

Frontend changes are staged OFFLINE, not applied to live Tinto:
- src/panels/agentAvailability.ts shares pending probes until settlement, starts the result TTL after settlement, and only evicts the same failed promise.
- src/panels/RepoCard.tsx displays a bounded allowlisted category and startup stage. It says the start could not be confirmed and instructs checking sessions before another attempt. It does not expose arbitrary backend error text or automatically retry.
- src/panels/RepoCard.test.tsx covers pending deduplication, stale rejection identity and safe stage/error display with one launch call.

The three-file patch is [2026-09-07-wsl-route-frontend.patch](2026-09-07-wsl-route-frontend.patch), SHA256 6499ab7db4d76a621c37a2aec3062738a9ad86139e35e18c911f506528b57778. Preimage/final source SHA256 values, tested temporary workspace and backend hash are in the new wslRoute member of the [existing staging receipt](2026-09-07-recovery-staging.json); prior receipt members remain historical and intact. Final launcher SHA256 is 420fb564f3472ca29dc1eb0b28114c94f1e0f455daca0bc493c4d0b4d046dc38. Patch apply-check against the live checkout passed without applying it; all three live frontend files still match their preimages.

Validation: two Rust deadline regressions failed before the fix; launcher suite 26/26 and broader WSL suite 94/94 passed afterward. Exact broader command from Pum root: cargo test --offline --locked --manifest-path ../tinto/src-tauri/Cargo.toml --features pumarejo --lib wsl -- --test-threads=1. Logs: %TEMP%/tinto-wsl-route-red.log, tinto-wsl-route-green.log, tinto-wsl-route-suite.log. This compiled Rust library tests, not the running executable.

Offline frontend tests initially failed all three new cases (26 old cases passed). Then RepoCard/RepoPanel/DashboardPanel suites passed 64/64, and final focused checks passed after removing unrelated formatting from the staged patch. Typecheck and Vite production build passed in %TEMP%/tinto-wsl-route-frontend-20260907, using the existing node_modules through a junction, with no installs. The first isolated typecheck lacked an unchanged tauri.conf.json test fixture; copying that fixture corrected it. Logs: %TEMP%/tinto-wsl-route-ui-{red,green,final,typecheck,build}.log. Generated UI dist remains in the temporary workspace. Source review was manual and limited to this change because unrelated work is present. git diff --check and patch apply-check passed.

### Exact controller handoff

1. Do not repeat the uncertain start on this host. First reconcile journal/session records and Linux process identities; preserve all unrelated 05:43 Codex/headroom processes. Controller owns Pum 84090 and lifecycle. After this turn ends, close the owning host/dev launcher cleanly and verify recorded ownership cleanup. Vite remains live despite --no-watch, so frontend application must wait until the active host is closed.
2. From Pum root, compare each live frontend source hash to wslRoute.sources[].beforeSha256 in the receipt. Stop/rebase if any differs. Run git -C ../tinto apply --check ../pumarejo/docs/evidence/2026-09-07-wsl-route-frontend.patch, then the same command without --check. Verify afterSha256. Preserve the existing no-watch config; do not rerun init/remove or install a helper.
3. Link the already-edited Windows backend after close: cargo build --offline --locked --manifest-path ../tinto/src-tauri/Cargo.toml --features pumarejo --bin tinto. For a production UI build, run the existing Tinto build only after patch application/close; offline tsc and Vite validation above already passed. No Linux helper rebuild/install is needed. Start fresh supported Pum/Tinto, verify actual --no-watch and doctor/integration without rewriting existing custody/config history.
4. Through the thin public SDK, observe ICook readiness while background scans run. A pending readiness check must remain shared, and an expired queue request must not kill the helper serving a scan. Once ready, and only after the no-uncertain-task check, issue ONE public Iniciar Codex click. Capture its visible category/stage if it fails; a dispatched click alone is not a started provider. Do not retry on uncertainty.
5. Success requires exactly one new Tinto session, exact Linux provider PID/start-time identity, an acknowledged bounded task and completion, with Windows UI still responsive. If failure remains, use binary_check/checkpoint_create/provider_spawn (or a pre-start category) plus bounded logs to investigate that exact step. Do not infer the failure cause from timing. At the controller's chosen end, explicitly close the disposable session and verify Windows and Linux owned-process cleanup, excluding unrelated processes.

Native WSL task acceptance remains pending. Bounded native restore/cancellation/large-history follow-up continuity and previous close cleanup remain verified. Large-transcript observations still take roughly 9–26 seconds; no full-maturity claim. No extended --daily-use/ShowWindow helper, direct Windows UI API, other Agent, install, distro reset, commit, push or release was used.

Final preservation: 637/637 pre-existing dirty files outside the five authorized baseline paths retain their SHA256. Dirty entries Pum 19, Tinto 44, ICook 580. All three live frontend preimage hashes still match; backend and staged patch/source hashes match the receipt. Existing replay, pool race, provider, ICook and dependency work was preserved.


## Recovered click006 checkpoint exception — 2026-09-07

The original rejection is now known; earlier statements that the backend exception was unavailable are superseded by %TEMP%/tinto-wsl-native-20260907/native-console-fallback.json (SHA256 f081344f9f74367fd7985673dd21187e49b5121cf64fcb2a7077469b6632b34d). Controller observed the existing native DevTools entry read-only via Computer Use, executed no code and retried no start. Category: child_exit. Exact message: WSL startup [checkpoint_create]: agente WSL retirado tras fallo de transporte; solicitud no enviada. This inspection is fallback, not Pum capability proof. Public tauri_type020 returned STALE_ELEMENT_REF and sent nothing; no second launch is inferred.

Workspace/full-access and no-watch were reverified: actual Pum/Tinto roots are unchanged, danger-full-access/approval never remains effective, and Tauri 28236 (--no-watch, creation 13:58:47.7547480Z) still owns Tinto 20200 (14:00:46.1918300Z). Baseline %TEMP%/tinto-retired-checkpoint-baseline-20260907.json captured all 643 dirty files (Pum 19, Tinto 44, ICook 580) before this change. No host lifecycle or provider launch occurred.

The recovered stage proves binary preflight had progressed to checkpoint creation. That request acquired an already-retired pooled helper and returned before reaching its writer. The registry therefore did not reach provider spawn/session insertion for this start. The previous safe-but-conservative mutation policy refused a fresh helper even in this proven-not-sent case. Queue/write deadlines and frontend cache/error display fixes alone did not cover that rejection. Which earlier request retired the helper remains unidentified; no timing-based attribution to a particular scan is made.

Narrow additional fix in Tinto src-tauri/src/wsl_agent/launcher.rs: ExchangeFailure carries a private retired_before_dispatch flag, set only under the I/O lock when the stream is already unusable, before this request reaches exchange_locked/the writer. The wrapper may replace that helper once, subject to the existing shared deadline/two-attempt limit, even for checkpoint creation. It does not infer safety from error text/category. All attempted writes, lost responses, malformed responses and other possibly dispatched mutation failures retain no-retry behavior. Queue expiry still leaves the busy owner's helper intact; expired total budgets do not spawn a new helper. Existing prior pool race fixes are preserved.

Deterministic tests drive the real persistent-request wrapper with bounded local protocol fixtures (no WSL or AI provider). Before the fix, the retired checkpoint case failed with the exact recovered message (15 tests passed, 1 failed); the lost-response mutation test passed. After the fix, the retired case receives a valid fresh-helper response with exactly one recorded dispatch, while a helper that reads the request and exits without a reply still records exactly one dispatch and no retry. Full command: cargo test --offline --locked --manifest-path ../tinto/src-tauri/Cargo.toml --features pumarejo --lib wsl -- --test-threads=1. Result: 96 passed. Logs: %TEMP%/tinto-retired-checkpoint-red.log and tinto-retired-checkpoint-green.log. An initial fixture quoting compile error was corrected before the failing regression run; it was not counted as regression evidence.

Final backend SHA256: 0c79d0eb4a65d09473222f200dc59dd6d4ac8512d7fdc298d37588c23d19e96d. The existing staging receipt's wslRoute member is updated with this hash, recovered evidence and tests. Frontend patch SHA256 remains 6499ab7db4d76a621c37a2aec3062738a9ad86139e35e18c911f506528b57778; all three live frontend preimages and offline staged sources are unchanged. Prior 64 UI tests/typecheck/Vite build stand; no frontend build was repeated for this backend-only addition. Rust library tests compiled; running Tinto was not linked/restarted.

Controller steps from Pum root after this turn ends: close the owning host/dev launcher cleanly; verify frontend preimage hashes in wslRoute.sources; run git -C ../tinto apply --check ../pumarejo/docs/evidence/2026-09-07-wsl-route-frontend.patch and then the same command without --check. Verify after hashes. Link the latest backend with cargo build --offline --locked --manifest-path ../tinto/src-tauri/Cargo.toml --features pumarejo --bin tinto. Start fresh supported Pum/Tinto with the existing --no-watch configuration. No Linux helper install/rebuild or provider staging is needed.

Native acceptance remains ONE public ICook start after confirming no uncertain task/process exists: require exactly one new session, exact Linux provider PID/start-time identity, bounded task acknowledgment/completion and responsive Windows UI. If failure recurs, retain its visible stage/category without redispatch; the recovered old checkpoint was not sent, but that does not establish a later request's outcome. Explicitly close the disposable session at the controller's chosen end and verify owned Windows/Linux cleanup, preserving unrelated 05:43 Codex/headroom processes. No claim of native WSL success or improved large-transcript maturity is made by the deterministic tests.

Recovered-exception preservation check: 638/638 other pre-existing dirty files retain baseline SHA256. Dirty entries Pum 19, Tinto 44, ICook 580. Live frontend preimages, staged frontend sources and patch hashes match; final backend hash matches the receipt. No unrelated changes.


## Binary-check contention and corrected build cwd — 2026-09-07

The earlier three-file frontend patch is now APPLIED. All live frontend files independently match sources[].afterSha256 in the existing recovery-staging receipt. Controller copied exact staged LF bytes for agentAvailability.ts after git apply produced CRLF with identical normalized text; this intentional byte correction is accepted, not new drift. Do not reapply that patch. Prior task_complete, public close024/status025 (idle/lastAction close), explicit-close-process-check.json (passed, survivors []) and controller's Linux post-close observation are preserved. No Tinto Linux helper survived that close; unrelated 05:43 Codex/headroom processes remain excluded and untouched.

Preflight independently verified actual Pum/Tinto roots, Node/npm/git/cargo/rustup/wsl paths, danger-full-access with approval never, and live Tauri18956 --no-watch (created 14:40:32.1650250Z) / Tinto28168 (14:41:47.5297510Z). These identities remain unchanged. %TEMP%/tinto-binary-contention-baseline-20260907.json captured all 646 dirty files: Pum19/Tinto47/ICook580. No frontend edit, host/provider lifecycle action or mutation probe was performed.

Build correction: the former Pum-root cargo command was incomplete because --manifest-path does not select the repository's rustup directory override. Controller observed GNU/dlltool failure there and a successful 1m10 build from Tinto. This Agent currently inherits RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc. Read-only child checks with only that environment override omitted independently confirmed Pum selects stable-x86_64-pc-windows-gnu (default), while Tinto selects stable-x86_64-pc-windows-msvc (directory override). No toolchain was installed or changed. All Rust tests in this pass ran from Tinto root.

New native evidence at %TEMP%/tinto-wsl-acceptance-20260907: readiness004/005 preceded ONE click006 at 14:43:35.736Z (dispatch4350ms). Snapshot007 showed Iniciando; 008 returned idle without a new journal Agent; 009 visibly reported timeout; binary_check. Before/after Linux receipts show helper191991 then192087 and no new app-server; old Codex/headroom processes remain unrelated. Windows observations remained responsive (roughly2–4s). No second start was issued. The visible category identifies the binary-check stage, but omits the queue-vs-execution detail of that individual timeout; a read-only controller console capture was requested without retry. No exact historical queue substage is inferred solely from duration.

### Demonstrated contention and narrow fix

AgentBinaryAvailable is used both by frontend readiness and registry startup preflight. It previously went through the same per-launch-argv persistent helper and exclusive I/O lock as repository scans. The Linux helper serves request lines synchronously. A long scan can therefore consume the entire binary-check admission budget even when Codex is available. The recent total deadline bounds this wait but cannot make it useful progress.

A deterministic test held the scan helper's actual I/O lock while calling the real request wrapper for AgentBinaryAvailable. Before this change it failed after3.04s with timeout en cola del agente WSL; solicitud no enviada. In parallel evidence, a fresh managed-helper availability probe returned available true/exit0/empty stderr in1472ms from Pum and1445ms from the actual Tinto cwd. The latter receipt is %TEMP%/tinto-binary-contention-probe-20260907.json. Both were bounded read-only protocol calls; no Codex provider/checkpoint/AI task was launched. This demonstrates the contention defect and current independent availability; it does not identify which particular native scan held a lock.

Only AgentBinaryAvailable now runs through one owned, short-lived helper using the existing hardened exchange implementation. It does not touch/register in the scan pool, uses the original budget including startup elapsed time, and cleans up its owned helper before returning/parsing. There is no generic second pool, new cache, timeout increase, automatic availability retry or altered mutation replay policy. Checkpoint requests keep existing transport, deadline and retired-before-dispatch recovery; any potentially dispatched checkpoint still never retries. If native acceptance next identifies a checkpoint-stage issue, it must be diagnosed separately rather than declared solved here.

The new regression passes while the original scan helper stays alive and retains its pool identity. Full WSL suite:97 passed, including all prior deadline, retired-before-dispatch and lost-response/no-replay tests. Exact test command from C:/Users/User/Documents/personal/tinto: cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features pumarejo --lib wsl -- --test-threads=1. Logs: %TEMP%/tinto-binary-contention-red.log and tinto-binary-contention-green.log. Rust library test compilation passed; no live executable was linked. Existing64 UI tests/typecheck/Vite results stand because frontend code was not changed. Targeted manual review and diff-check passed. Final launcher SHA256: d5913e1b1c8a763eed685aa97fcd3b818c48cced535267f4b6ac304ba5659e75; the receipt wslRoute member carries this source hash, applied-frontend state and corrected cwd/build command.

### Controller build and native acceptance

After this turn completes, controller Pum81176 owns clean close/identity cleanup. Preserve unrelated Linux processes. The frontend is already applied and no provider/helper staging or install is required. From PowerShell, use these separate commands:

~~~powershell
Set-Location C:/Users/User/Documents/personal/tinto
rustup show active-toolchain
cargo build --offline --locked --manifest-path src-tauri/Cargo.toml --features pumarejo --bin tinto
~~~

Require the displayed toolchain to be the existing stable MSVC toolchain; do not proceed with GNU or install anything to fix the old cwd mistake. If an inherited toolchain environment override differs, use the already-installed explicit +stable-x86_64-pc-windows-msvc selector from this same Tinto cwd. Do not link while this host is active. Start the supported fresh Pum/Tinto route with the approved --no-watch argv and verify OS identity/argv.

Native acceptance: observe ICook readiness during background scans, confirm no uncertain prior task/process, then issue ONE public start. Binary availability should complete independently without retiring the scan helper. Require exactly one new Tinto Agent session, exact Linux provider PID/start-time, an acknowledged bounded task and completion; capture category/stage on failure instead of repeating the start. Capture fresh status/screenshot/snapshot and Windows responsiveness. At the controller's chosen end explicitly close the disposable session and verify Windows/Linux owned cleanup while excluding unrelated05:43 Codex/headroom processes. The last failed binary check did not establish a new Agent session, but a later click needs its own outcome evidence.

Native WSL success remains pending this rebuild/acceptance. Earlier restore/action cancellation/active same-turn completion and close cleanup remain verified. Current2–4s Windows observations do not establish long-session maturity or resolve the earlier9–26s large-transcript limits. No installs/distro reset/direct Windows UI API/other Agents/commit/push/release occurred.

Binary-contention preservation: 641/641 other pre-existing dirty files retain baseline SHA256. Dirty entries Pum 19, Tinto 47, ICook 580. All applied frontend final hashes and updated backend source hash match the staging receipt. No unrelated changes.


## Complete startup helper-contention path — 2026-09-07

New receipt %TEMP%/tinto-wsl-binary-acceptance-20260907/native-console-fallback.json (SHA256 1e4e787b9305d6f6f3a132fae2efd223c8bee82f8032ecd1451e14ac8233b22d) identifies the next native failure exactly: timeout; WSL startup [checkpoint_create]: timeout en cola del agente WSL; solicitud no enviada. One public click005 followed enabled readiness004; snapshot006 displayed checkpoint_create failure, with no new Agent record and no retry. Binary preflight now progresses. This checkpoint request exhausted admission behind repository scans before sending bytes. Native DevTools inspection was read-only Computer Use fallback, with no code execution, and remains explicitly not Pum capability proof.

Prior public016 close/public017 idle and Windows identity cleanup (passed, survivors []) were independently read from tinto-wsl-acceptance-20260907. Current Tauri19348 has --no-watch (creation14:58:50.6030440Z), Tinto26888 creation14:59:41.2297130Z; tools, actual Pum/Tinto roots and danger-full-access/approval never were reverified before edits. The live executable hash is 7427313836112a1ccfa28f8e4f051df659b3c91eb72df71d259f13be1fe327c7, last write14:59:39.0389562Z. No host lifecycle or frontend edit occurred. Baseline %TEMP%/tinto-startup-contention-baseline-20260907.json captured Pum19/Tinto47/ICook580 dirty files.

The remaining startup path was traced beyond the failing label:

| Step | Actual path | Relation to repository scan helper |
| --- | --- | --- |
| Binary preflight | AgentBinaryAvailable | Already uses an owned bounded exchange. |
| Existing-session refresh before capacity/start | refresh_session_statuses -> refresh_status/refresh_turn_checkpoints -> AgentCheckpointScan; a completed turn can also create a checkpoint | Both checkpoint calls now use owned exchanges. Idle sessions short-circuit the turn scan. |
| Initial checkpoint | create_wsl_checkpoint -> AgentCheckpointCreate | Now uses an owned exchange, never a mutation retry. |
| Codex provider spawn | pty factory -> CodexAppServerHandle::spawn_wsl -> build_wsl_app_server_command/spawn_command | Direct wsl.exe/bash process and private stdio, no request_wsl_agent/pool acquisition. |
| Compatibility PTY spawn | build_wsl_agent_command -> PTY spawn | Also direct wsl.exe/bash, no helper queue. |
| Session insertion | AgentSessionRecord::start | Stores process/identity and marks running; no helper request. |

This closes the demonstrated scan-pool dependency across the actual start/status path rather than only changing checkpoint_create. These three request kinds need no helper-local watcher state: binary availability, checkpoint creation, and checkpoint scans. Creation still writes checkpoint files and is not considered read-only. Each now uses the existing owned-helper exchange once, under its existing budget, and cleans up its owned Windows transport before returning. Any possible write or lost response is uncertain and is never retried. Repository watcher requests keep their persistent helper/state. Revert/remove and unrelated request policies were not expanded; no generic pool, cache, framework or longer timeout was added.

Only Tinto src-tauri/src/wsl_agent/launcher.rs changed, preserving all prior fixes. Two deterministic real-wrapper tests held the repository helper I/O lock: checkpoint creation and an existing-session checkpoint scan both failed before the fix with the exact queue/not-sent timeout. Afterward both return their correctly typed fixture response with one recorded dispatch, while the scan helper remains alive and retains its identity. The existing checkpoint lost-response/no-replay regression also passes. Full WSL suite:99 passed, including direct app-server/PTY command-construction tests. Command from Tinto root: cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features pumarejo --lib wsl -- --test-threads=1. Logs: %TEMP%/tinto-startup-contention-red.log and tinto-startup-contention-green.log. The only post-compilation edit was a comment clarifying helper-local state, with no behavior change.

A bounded real preflight reused the exact agent_console_script and actual ICook Linux cwd, substituting --version for app-server/Agent arguments. It completed in1505ms, exit0, codex-cli0.153.2, empty stderr. Receipt: %TEMP%/tinto-startup-provider-preflight-20260907.json. It proves the current cwd/environment/resolver/version path, not provider initialization or task execution. No native ICook checkpoint mutation, AI provider session, duplicate start or unrelated Linux process action was performed. Direct provider processes cannot inherit this particular helper-pool starvation; separate initialization, registry-lock or filesystem failures are not declared impossible.

Final backend SHA256: f6ad6f23e872906380ccf413434ca98776e7000a8e1b66dc0bd985df5b919b85. The existing recovery-staging receipt wslRoute.startupContention contains evidence/probe hashes, route scope and tests. Frontend is already applied and its final hashes remain authoritative; do not reapply. Existing UI tests/typecheck/Vite results stand. Rust library tests compiled; this host was not linked or restarted. Targeted manual review and diff-check passed.

Controller Pum81425 owns lifecycle. After this turn ends, close cleanly and verify owned identities, preserving unrelated05:43 Codex/headroom. Build the latest source from the correct cwd with the existing MSVC toolchain:

~~~powershell
Set-Location C:/Users/User/Documents/personal/tinto
rustup show active-toolchain
cargo build --offline --locked --manifest-path src-tauri/Cargo.toml --features pumarejo --bin tinto
~~~

Require stable MSVC; the existing directory override applies here. The earlier Pum-root GNU/dlltool command remains superseded. No frontend/provider restaging, helper install or distro change is required. Start the supported fresh no-watch host and verify argv/identities. Confirm there is no uncertain prior task, then issue ONE public ICook start while background scans run. Require one checkpoint/start outcome, exactly one new session/Linux provider identity, a bounded acknowledged task and completion, and responsive Windows UI. Capture any new category/stage without automatic retry. A not-sent old request does not prove the outcome of a later one. At the controller's chosen end explicitly close and verify Windows/Linux owned cleanup, excluding unrelated processes.

Native route success still requires this acceptance. Prior cancellation/restore/active-task continuity and clean closes remain verified. Earlier large-transcript9–26s and current2–4s observations remain bounded evidence, not full maturity. No installs, distro reset, direct Windows UI API, other Agents, project commit/push or release occurred.

Startup-contention preservation: 641/641 other dirty files retain baseline SHA256. Dirty entries Pum 19, Tinto 47, ICook 580. Applied frontend hashes and final backend hash match the receipt; all unrelated work is preserved.


## Native WSL startup acceptance resolved — 2026-09-07

The latest startup-isolation fix passed native acceptance. This supersedes earlier WSL-route pending/blocker statements for this bounded path; earlier failures and their attribution remain historical evidence. Controller built from C:/Users/User/Documents/personal/tinto using the existing MSVC directory override: cargo build --offline --locked --manifest-path src-tauri/Cargo.toml --features pumarejo --bin tinto, PASS 44.86s. Backend SHA256 f6ad6f23e872906380ccf413434ca98776e7000a8e1b66dc0bd985df5b919b85; frontend was already applied and was not reapplied. Prior 99 WSL regression passes remain historical validation; no tests or build were repeated in this docs turn.

Public launch001/ready003 owned13520, Tinto8976, no-watch; readiness004 enabled ICook despite failed background scans. ONE click005 created Tinto session 4d2e4f9d-5009-44a1-a7a3-33231765bf7a and provider 01a07c74-7dc2-7631-9891-eaa29ab0b430. Linux Node214367 and Codex214847 share PGID214367, started17:20:00/02 local; proc stat and creation identities are retained in the receipt. Click dispatch alone was not used as proof of completion.

Public007 type/008 ENTER preflight completed at /mnt/c/Users/User/Documents/personal/ICook, Ubuntu24.04 WSL2, with git/node/npm/cargo,580 dirty files and package.json SHA256 40aa54478e354d760b571db804df0c22bd841533f6dc02bafbdb944647a91675. Effective WSL scope was workspace-write, restricted network, approval never; this is NOT WSL full-access acceptance. Public010 type/011 ENTER started exact task01a07c77-85d0-7641-adcd-d9584f39979c at15:23:23.449Z and completed15:24:11.638Z, with three matching reads and five-second gaps. Active public snapshot012 took418ms (Trabajando); screenshot013 took1890ms and visibly confirms IC_WSL_ACCEPT_DONE count=3, idle. All native actions were PUBLIC Pum; read-only journal/OS verification is separate observation fallback.

Public014 close/015 idle passed recorded Windows identity and Linux provider PID/group/helper cleanup, with no owned survivors. This is bounded close-time evidence, not a global process absence or future PID-reuse claim. Unrelated Linux workloads remain untouched; their large command lines were not copied. Controller launch016 was solely for this docs turn (Pum3446 owns lifecycle); current Tauri25576 --no-watch/Tinto11492 were independently observed. Actual Pum/Tinto/ICook roots and Windows tools were checked; this docs Agent is danger-full-access, network enabled, approval never, distinct from the accepted WSL scope. No lifecycle action occurred here.

Remaining limits: background repository scan timeouts, long-history action latency, and untested WSL full access. No full daily-use maturity claim. Original Windows ICook app readiness remains separate. The 21-case ICook campaign was NOT rerun: retain17 pass +1 lifecycle pass with limits +3 blocked (2 fixture/contract,1 Pumarejo keyboard); no release or gate promotion.

Durable [native success receipt](../../../tinto/docs/orchestration/evidence/2026-09-07-wsl-startup-native-success.json) (SHA256 bb6c6552ee60fb203af8bf1b4346a1a8b20d744a6e951092067959dcf3a3f594) embeds task proof, sanitized identities/cleanup and raw-file hashes; [final public screenshot](../../../tinto/docs/orchestration/evidence/2026-09-07-wsl-startup-native-final.png). Raw source: %TEMP%/tinto-wsl-startup-acceptance-20260907. Earlier blocked history is retained as resolved for WSL startup only.

Final docs preservation: 637/637 other pre-existing dirty files retain their baseline SHA256; no unexpected changes. Dirty totals Pum19/Tinto49/ICook580 include authorized evidence additions. Source, cached dependency reconciliation and staged frontend bytes remain preserved. No source edits, retests, builds, installs, dispatch, host lifecycle, other Agents, commits/push/releases in this turn.
