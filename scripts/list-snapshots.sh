#!/bin/sh
# List available stable snapshots.
# Usage: scripts/list-snapshots.sh
set -eu

BACKUP_ROOT=${BACKUP_ROOT:-/backups/stable}
SNAPSHOT_DIR="$BACKUP_ROOT/snapshots"
IMAGE_DIR="$BACKUP_ROOT/images"
IMAGE_NAME=${OWLY_IMAGE_NAME:-owly-app}

echo "============================================================"
echo "  Available stable snapshots"
echo "============================================================"

if [ -d "$SNAPSHOT_DIR" ]; then
  echo ""
  echo "Archives (compatible with scripts/restore.sh):"
  echo "------------------------------------------------------------"
  ls -lh "$SNAPSHOT_DIR"/owly-stable-*.tar.gz 2>/dev/null | \
    awk '{printf "  %-45s %8s\n", $NF, $5}' || echo "  (none)"
fi

if [ -d "$IMAGE_DIR" ]; then
  echo ""
  echo "Docker images (saved as .tar.gz):"
  echo "------------------------------------------------------------"
  ls -lh "$IMAGE_DIR"/owly-app-*.tar.gz 2>/dev/null | \
    awk '{printf "  %-45s %8s\n", $NF, $5}' || echo "  (none)"
fi

echo ""
echo "Docker image tags (stable-YYYY-MM-DD):"
echo "------------------------------------------------------------"
docker images --format "  {{.Repository}}:{{.Tag}} ({{.Size}}, {{.CreatedSince}})" \
  "$IMAGE_NAME" 2>/dev/null | grep "stable-" | sort || echo "  (none)"

echo ""
echo "============================================================"
echo "To restore a snapshot, use:"
echo "  scripts/switch-to-snapshot.sh YYYY-MM-DD"
echo "============================================================"
