#!/bin/sh
# Install (or uninstall) a daily cron job that runs scripts/snapshot-stable.sh.
# Usage:
#   scripts/setup-snapshot-cron.sh           # install at 03:00 daily
#   scripts/setup-snapshot-cron.sh --remove  # uninstall
set -eu

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SCRIPT="$PROJECT_ROOT/scripts/snapshot-stable.sh"
CRON_LINE="0 3 * * * /bin/sh $SCRIPT >> /var/log/owly-snapshot.log 2>&1"
CRON_TAG="# owly-stable-snapshot"

if [ "${1:-}" = "--remove" ]; then
  crontab -l 2>/dev/null | grep -v "$CRON_TAG" | crontab - || true
  echo "[cron] removed daily snapshot job"
  exit 0
fi

if [ ! -x "$SCRIPT" ]; then
  chmod +x "$SCRIPT"
fi

# Append (or replace) the cron line
EXISTING=$(crontab -l 2>/dev/null || true)
FILTERED=$(echo "$EXISTING" | grep -v "$CRON_TAG" || true)
{
  echo "$FILTERED"
  echo "$CRON_LINE $CRON_TAG"
} | crontab -

echo "[cron] installed daily snapshot at 03:00 (log: /var/log/owly-snapshot.log)"
echo "[cron] current crontab:"
crontab -l | grep -A0 -B0 owly || true
