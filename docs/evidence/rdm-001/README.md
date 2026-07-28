# Provider and platform proof

This evidence folder is the RU1 gate record. The supported-platform contract
still calls for Windows 11 24H2 and a native/dedicated Ubuntu 24.04 graphical
host. For this prototype gate, the user explicitly accepted the available
Windows and WSL hosts under the audited exception below.

Current status: **passed** under explicit host exception
`USER-2026-07-27-WINDOWS-WSL`.

On 2026-07-27 the user explicitly accepted the available Windows host and WSL
as usable proof hosts. The harness requires both
`TAURI_AGENT_ACCEPT_NONSTANDARD_HOST=1` and the matching
`TAURI_AGENT_HOST_EXCEPTION_ID`; this exception applies only to the prototype
feasibility evidence and does not change the supported-platform requirements.

- The minimal fixture and Cargo feature/registration guard are present under `tests/fixtures/tauri-app/`.
- The structural suite passes with 11 tests and five intentionally skipped live-only branches.
- Live W3C provider execution is not simulated. Windows passes both visible and hidden owned-provider sequences, including direct-provider bypass rejection, authenticated endpoint ownership, screenshot, focus/click, input, W3C actions, session deletion and process-tree cleanup.
- Ubuntu 24.04.4 under WSL2 passes the Cargo matrix and the complete visible W3C sequence through WSLg/XWayland. Xvfb 21.1.12 supplies an authenticated isolated display for background mode. A versioned provider patch preserves viewport screenshots and falls back to a full-document WebKitGTK snapshot only when an initially hidden window has no mapped visible surface. Three complete Ubuntu repetitions passed background PNG capture, DOM observation, actions, cleanup, and the direct-provider bypass check.
- The active GNU Rust toolchain cannot find `dlltool.exe`, but the already-installed `stable-x86_64-pc-windows-msvc` toolchain and Visual Studio 2022 C++ tools provide a valid supplemental path. With MSVC, the real fixture builds and runs successfully through Tauri CLI 2.11.4.
- The authoritative platform scripts now fail closed when provider, nonce, Cargo, display, or exact-host prerequisites are absent; `test:platform:structural` is the only non-gating smoke suite.
- The structural suite covers an agent-owned loopback proxy that rejects missing/wrong session nonces and forwards only the required W3C route family. The provider requires a separate internal nonce, compared in constant time and injected only by the proxy; direct unauthenticated access returns 401. Cleanup refuses to terminate a PID whose start time or command hash no longer matches its lease.
- Live W3C assertions now require non-empty window handles, the fixture title, a complete DOM, a decodable PNG signature, observable focus/click effects, the expected typed value, and a successful Enter-key form submission. Background window/focus claims are not inferred from these protocol results.
- The supplemental Cargo matrix passes feature-enabled debug, featureless debug and featureless release checks. The empty WebDriver plugin capability was removed so featureless builds do not refer to a dependency that is intentionally absent; the plugin has no IPC permissions in its default permission set.

Accepted-exception host facts: Windows reports `Windows 10 Pro`, display version `25H2`, build `26200`; the Ubuntu distro reports Ubuntu `24.04.4 LTS` under kernel `6.6.87.2-microsoft-standard-WSL2`, WSLg/XWayland for visible mode, and Xvfb `21.1.12` for background mode.

Required evidence commands:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:platform:structural
pnpm test:platform:windows
pnpm test:platform:linux
```

The recorded Windows and Ubuntu outputs satisfy RU1 under the explicit exception. Release remains deferred until all implementation packages are complete.

The owned-launch lifecycle now creates a permission-restricted per-launch mode overlay, spawns with an argument vector and `shell: false`, requires the selected provider port to be owned by the spawned PID before exposing the authenticated proxy, binds the nonce to the process/port lease, and performs ordered session/proxy/process/overlay cleanup with port-release checks. Structural tests cover normal cleanup, PID/start-time/hash drift, and a competing process winning the provider port.

Native Windows and Linux adapters now launch the workspace-installed Tauri CLI, wait for the provider, resolve the listening PID, require it to be a descendant of the leased CLI root, and terminate the validated process tree during cleanup. The authoritative tests call this owned launcher directly; they no longer accept an externally supplied provider port or nonce.

Remaining RU1 blockers: none. Residual security boundary: a hostile process already
running as the same OS account may inspect another same-account process; the
nonce design prevents accidental or unsanctioned clients that do not already
control the user session, not a compromised local account.

Supplemental local commands (passing with `RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc`):

```text
TAURI_AGENT_RUN_PROVIDER=1 pnpm vitest run tests/platform/provider-proof.test.ts
TAURI_AGENT_RUN_PROVIDER=1 pnpm vitest run tests/platform/background-proof.test.ts
TAURI_AGENT_RUN_CARGO=1 pnpm vitest run tests/platform/cargo-proof.test.ts
```
