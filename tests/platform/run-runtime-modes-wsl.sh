#!/usr/bin/env bash
set -euo pipefail

workspace="${1:?workspace directory is required}"
cd "$workspace"

export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
export PATH="$HOME/.cargo/bin:$PATH"

auth_file="/tmp/pumarejo-u9-xvfb.auth"
cookie_file="/tmp/pumarejo-u9-xvfb.cookie"
rm -f "$auth_file" "$cookie_file"
mcookie >"$cookie_file"
read -r cookie <"$cookie_file"
xauth -f "$auth_file" add 127.0.0.1:98 . "$cookie"
XAUTHORITY="$auth_file" Xvfb :98 -screen 0 1280x800x24 \
  -nolisten unix -listen tcp -auth "$auth_file" \
  >/tmp/pumarejo-u9-xvfb.log 2>&1 &
xvfb_pid=$!

cleanup() {
  kill "$xvfb_pid" 2>/dev/null || true
  rm -f "$auth_file" "$cookie_file"
}
trap cleanup EXIT

for _attempt in {1..100}; do
  if ss -ltn | grep -q ":6098 "; then
    break
  fi
  sleep 0.1
done
ss -ltn | grep -q ":6098 "

export XAUTHORITY="$auth_file"
export GDK_BACKEND=x11
export PUMAREJO_BACKGROUND_DISPLAY=127.0.0.1:98
export PUMAREJO_RUN_RUNTIME_MODES=1
export PUMAREJO_PROVIDER_READY_TIMEOUT_MS=600000
export PUMAREJO_LIVE_TARGET_DIR="$HOME/.cache/pumarejo-runtime-modes-target"

pnpm exec vitest run tests/platform/linux-modes.test.ts
