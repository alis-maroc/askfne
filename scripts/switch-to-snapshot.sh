#!/bin/sh
# Switch the running Owly to a previous stable snapshot.
# Uses the existing scripts/restore.sh for the database + auth restore,
# then loads the corresponding Docker image and rolls the container.
#
# Usage: scripts/switch-to-snapshot.sh YYYY-MM-DD [--yes]
set -eu

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$PROJECT_ROOT"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 YYYY-MM-DD [--yes]" >&2
  exit 1
fi

DATE=$1
CONFIRM=${2:-}

BACKUP_ROOT=${BACKUP_ROOT:-/backups/stable}
SNAPSHOT_DIR="$BACKUP_ROOT/snapshots"
IMAGE_DIR="$BACKUP_ROOT/images"
IMAGE_NAME=${OWLY_IMAGE_NAME:-owly-app}
ARCHIVE="$SNAPSHOT_DIR/owly-stable-${DATE}.tar.gz"
IMAGE_FILE="$IMAGE_DIR/owly-app-${DATE}.tar.gz"

if [ ! -f "$ARCHIVE" ]; then
  echo "Error: archive not found: $ARCHIVE" >&2
  echo "Run scripts/list-snapshots.sh to see available dates." >&2
  exit 1
fi

if [ "$CONFIRM" != "--yes" ]; then
  echo "WARNING: this will REPLACE the current database, WhatsApp auth, and image"
  echo "         with the snapshot from $DATE."
  echo ""
  echo "The current state will NOT be saved automatically."
  echo "If you want to keep the current state, run scripts/snapshot-stable.sh first."
  echo ""
  printf "Type SWITCH to continue: "
  read confirmation
  [ "$confirmation" = "SWITCH" ] || { echo "Switch cancelled."; exit 1; }
fi

# 1. Restore DB + WhatsApp auth (uses existing scripts/restore.sh)
echo "[switch] restoring database and whatsapp auth from $ARCHIVE"
CONFIRM_RESTORE=yes "$PROJECT_ROOT/scripts/restore.sh" "$ARCHIVE" --yes

# 2. Load the corresponding Docker image if present
if [ -f "$IMAGE_FILE" ]; then
  echo "[switch] loading docker image from $IMAGE_FILE"
  docker load -i "$IMAGE_FILE"
else
  echo "[switch] no image file found for $DATE, using the currently-built image"
fi

# 3. Re-tag so that compose picks the right image
if docker image inspect "$IMAGE_NAME:stable-${DATE}" >/dev/null 2>&1; then
  echo "[switch] re-tagging $IMAGE_NAME:stable-${DATE} as $IMAGE_NAME:latest"
  docker tag "$IMAGE_NAME:stable-${DATE}" "$IMAGE_NAME:latest"
  docker compose up -d app
else
  echo "[switch] image $IMAGE_NAME:stable-${DATE} not available, just restarting with current"
  docker compose up -d app
fi

echo "[switch] done — running on snapshot $DATE"
