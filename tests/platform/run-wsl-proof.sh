#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:?workspace source directory is required}"
run_dir="${2:-$(mktemp -d /home/teb/tauri-agent-ru1-XXXXXX)}"
mkdir -p "$run_dir"
printf 'RUN_DIR=%s\n' "$run_dir"

rsync -rlt \
  --exclude node_modules \
  --exclude dist \
  --exclude target \
  --exclude target-live \
  --exclude .proof-target \
  --exclude .git \
  "$source_dir/" "$run_dir/"

cd "$run_dir"
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
export PATH="$HOME/.cargo/bin:$PATH"

pnpm install --frozen-lockfile

export TAURI_AGENT_RUN_PROVIDER=1
export TAURI_AGENT_REQUIRE_AUTH_HOST=1
export TAURI_AGENT_RUN_CARGO=1
export TAURI_AGENT_ACCEPT_NONSTANDARD_HOST=1
export TAURI_AGENT_HOST_EXCEPTION_ID=USER-2026-07-27-WINDOWS-WSL
export TAURI_AGENT_OS_BUILD=6.6.87.2-microsoft-standard-WSL2
export TAURI_AGENT_DISPLAY_SESSION=WSLg-Wayland
export TAURI_AGENT_WEBVIEW_RUNTIME=WebKitGTK-2.52.3
export TAURI_AGENT_NO_TRANSIENT_WINDOW=1
export TAURI_AGENT_NO_FOCUS_CHANGE=1
export TAURI_AGENT_PROVIDER_READY_TIMEOUT_MS=600000
# WSLg's Wayland path stalls WebKitGTK initialization on this host; XWayland is
# the usable active desktop supplied by the same WSLg session.
export GDK_BACKEND=x11
xauth_file="$run_dir/xvfb.auth"
xauth -f "$xauth_file" add 127.0.0.1:99 . "$(mcookie)"
XAUTHORITY="$xauth_file" Xvfb :99 -screen 0 1280x800x24 \
  -nolisten unix -listen tcp -auth "$xauth_file" \
  >"$run_dir/xvfb.log" 2>&1 &
xvfb_pid=$!
trap 'kill "$xvfb_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 100); do
  (echo >/dev/tcp/127.0.0.1/6099) >/dev/null 2>&1 && break
  sleep 0.1
done
(echo >/dev/tcp/127.0.0.1/6099) >/dev/null 2>&1 || {
  printf 'Xvfb did not become ready\n' >&2
  exit 1
}
export XAUTHORITY="$xauth_file"
export TAURI_AGENT_BACKGROUND_DISPLAY=127.0.0.1:99

pnpm test:platform:linux
