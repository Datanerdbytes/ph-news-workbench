#!/bin/bash
# Installs the download worker as a macOS LaunchAgent so downloads queued on
# the Downloads page are picked up automatically — no manual terminal needed.
#
#   scripts/install-download-worker.sh              install (or refresh) + start
#   scripts/install-download-worker.sh --uninstall  stop + remove
#   scripts/install-download-worker.sh --status     show whether it is running
#
# The agent starts at login, restarts if it crashes (KeepAlive), and logs to
# ~/Library/Logs/ph-news-workbench-download-worker.log.

set -euo pipefail

LABEL="com.ph-news-workbench.download-worker"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_PATH="$HOME/Library/Logs/ph-news-workbench-download-worker.log"

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
  echo "Removed. Any active download was requeued and will run the next time a worker starts."
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
for var in DATABASE_URL BLOB_READ_WRITE_TOKEN; do
  if ! grep -q "^${var}=" "$ENV_FILE"; then
    echo "error: $ENV_FILE is missing $var — the worker needs it." >&2
    exit 1
  fi
done

# launchd gives agents a bare PATH (no Homebrew, no /usr/local/bin), which would
# hide the ffmpeg/ffprobe and the node runtime yt-dlp uses. Give the worker the
# full search path it gets in an interactive shell.
WORKER_PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

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
    <string>$REPO_DIR/download-worker.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$REPO_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$WORKER_PATH</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
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
echo "Installed $LABEL from $REPO_DIR."
echo "Worker status:"
print_status
