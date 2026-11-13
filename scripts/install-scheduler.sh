#!/bin/bash
# Installs the scheduling sweep as a macOS LaunchAgent so due posts and
# Facebook-native schedules are resolved every minute — not whenever GitHub's
# delayed cron happens to fire. The GitHub Actions cron stays installed as the
# backup for when this Mac is asleep.
#
#   scripts/install-scheduler.sh              install (or refresh) + start
#   scripts/install-scheduler.sh --uninstall  stop + remove
#   scripts/install-scheduler.sh --status     show whether it is running
#
# The agent runs at login (RunAtLoad), re-fires every 60 seconds, and logs to
# ~/Library/Logs/ph-news-workbench-scheduler.log.

set -euo pipefail

LABEL="com.ph-news-workbench.scheduler"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_PATH="$HOME/Library/Logs/ph-news-workbench-scheduler.log"
INTERVAL_SECONDS=60

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/..")"
REPO_DIR="$(cd "$REPO_DIR" && pwd)"

uid="$(id -u)"

print_status() {
  if launchctl print "gui/$uid/$LABEL" 2>/dev/null | grep -E "state|pid" | head -3; then
    echo "Logs: $LOG_PATH"
  else
    echo "Not installed (no LaunchAgent at gui/$uid/$LABEL)."
  fi
}

if [[ "${1:-}" == "--status" ]]; then
  print_status
  exit 0
fi

if [[ "${1:-}" == "--uninstall" ]]; then
  echo "Stopping and removing $LABEL…"
  launchctl bootout "gui/$uid/$LABEL" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "Removed. Scheduled posts now rely on the GitHub Actions cron again."
  exit 0
fi

NODE_BIN="$(command -v node)"
if [[ -z "$NODE_BIN" ]]; then
  echo "error: node was not found on PATH." >&2
  exit 1
fi

ENV_FILE="$REPO_DIR/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE does not exist." >&2
  exit 1
fi
if ! grep -q "^CRON_SECRET=." "$ENV_FILE"; then
  echo "error: $ENV_FILE is missing a CRON_SECRET value — the sweep cannot authenticate." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$(dirname "$LOG_PATH")"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--env-file=$ENV_FILE</string>
    <string>$REPO_DIR/scripts/scheduler-sweep.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$REPO_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>$INTERVAL_SECONDS</integer>
  <key>StandardOutPath</key>
  <string>$LOG_PATH</string>
  <key>StandardErrorPath</key>
  <string>$LOG_PATH</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PLIST

# A refreshed plist only takes effect after reloading the agent.
launchctl bootout "gui/$uid/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$uid" "$PLIST_PATH"

sleep 2
echo "Installed $LABEL from $REPO_DIR (every ${INTERVAL_SECONDS}s)."
echo "Agent status:"
print_status
