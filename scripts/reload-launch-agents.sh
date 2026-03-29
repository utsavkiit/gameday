#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
USER_DOMAIN="gui/$(id -u)"

PLISTS=(
  "com.utsavmehta.f1bot.sync.plist"
  "com.utsavmehta.f1bot.checker.plist"
  "com.utsavmehta.iplbot.sync.plist"
  "com.utsavmehta.iplbot.checker.plist"
)

mkdir -p "$LAUNCH_AGENTS_DIR"

for plist in "${PLISTS[@]}"; do
  src="$PROJECT_DIR/$plist"
  dest="$LAUNCH_AGENTS_DIR/$plist"
  label="${plist%.plist}"

  if [[ ! -f "$src" ]]; then
    echo "Missing plist: $src" >&2
    exit 1
  fi

  cp "$src" "$dest"
  launchctl bootout "$USER_DOMAIN/$label" >/dev/null 2>&1 || true
  launchctl bootstrap "$USER_DOMAIN" "$dest"
  echo "Reloaded $label"
done

echo "LaunchAgents updated in $LAUNCH_AGENTS_DIR"
