#!/bin/sh
# Daily snapshot of Owly: DB dump + image tag.
# Keeps the last 7 snapshots (one per day) under /backups/stable/.
# Usage: scripts/snapshot-stable.sh
set -eu

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$PROJECT_ROOT"

BACKUP_ROOT=${BACKUP_ROOT:-/backups/stable}
SNAPSHOT_DIR="$BACKUP_ROOT/snapshots"
IMAGE_DIR="$BACKUP_ROOT/images"
RETENTION_DAYS=${RETENTION_DAYS:-7}
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H%M%S)
DB_CONTAINER=${OWLY_DB_CONTAINER:-owly-db-1}
DB_USER=${POSTGRES_USER:-postgres}
DB_NAME=${POSTGRES_DB:-owly}
IMAGE_NAME=${OWLY_IMAGE_NAME:-owly-app}

mkdir -p "$SNAPSHOT_DIR" "$IMAGE_DIR"

echo "[snapshot] $DATE $TIME — starting snapshot"

# 1. Dump database
DUMP_FILE="$SNAPSHOT_DIR/${DATE}_${TIME}_database.sql"
echo "[snapshot] dumping database to $DUMP_FILE"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl > "$DUMP_FILE"

# Compress
gzip -f "$DUMP_FILE"
DUMP_FILE_GZ="${DUMP_FILE}.gz"

# 2. Dump whatsapp auth volume if it exists
if docker volume inspect owly_whatsapp_auth >/dev/null 2>&1; then
  WA_FILE="$SNAPSHOT_DIR/${DATE}_${TIME}_whatsapp-auth.tar.gz"
  echo "[snapshot] dumping whatsapp auth to $WA_FILE"
  docker run --rm -v owly_whatsapp_auth:/source:ro alpine:3.20 \
    tar -czf - -C /source . > "$WA_FILE"
fi

# 3. Build a complete .tar.gz archive compatible with scripts/restore.sh
ARCHIVE_FILE="$SNAPSHOT_DIR/owly-stable-${DATE}.tar.gz"
echo "[snapshot] building archive $ARCHIVE_FILE"
TMP_DIR=$(mktemp -d)
cp "$DUMP_FILE_GZ" "$TMP_DIR/database.sql.gz"
gunzip "$TMP_DIR/database.sql.gz"
[ -f "$SNAPSHOT_DIR/${DATE}_${TIME}_whatsapp-auth.tar.gz" ] && \
  cp "$SNAPSHOT_DIR/${DATE}_${TIME}_whatsapp-auth.tar.gz" "$TMP_DIR/whatsapp-auth.tar.gz"
tar -czf "$ARCHIVE_FILE" -C "$TMP_DIR" .
rm -rf "$TMP_DIR"

# 4. Tag current image as stable-YYYY-MM-DD
TAG="stable-${DATE}"
if docker image inspect "$IMAGE_NAME:latest" >/dev/null 2>&1; then
  echo "[snapshot] tagging image $IMAGE_NAME:latest as $IMAGE_NAME:$TAG"
  docker tag "$IMAGE_NAME:latest" "$IMAGE_NAME:$TAG"
  # Also save image as a .tar file for offline restore
  IMAGE_FILE="$IMAGE_DIR/owly-app-${DATE}.tar"
  echo "[snapshot] saving image to $IMAGE_FILE"
  docker save "$IMAGE_NAME:$TAG" -o "$IMAGE_FILE"
  gzip -f "$IMAGE_FILE"
fi

# 5. Retention: keep last N days
echo "[snapshot] enforcing retention ($RETENTION_DAYS days)"
find "$SNAPSHOT_DIR" -maxdepth 1 -name "owly-stable-*.tar.gz" -mtime +$RETENTION_DAYS -delete || true
find "$SNAPSHOT_DIR" -maxdepth 1 -name "*_database.sql.gz" -mtime +$RETENTION_DAYS -delete || true
find "$SNAPSHOT_DIR" -maxdepth 1 -name "*_whatsapp-auth.tar.gz" -mtime +$RETENTION_DAYS -delete || true
find "$IMAGE_DIR" -maxdepth 1 -name "owly-app-*.tar.gz" -mtime +$RETENTION_DAYS -delete || true
# Prune old docker image tags beyond retention
for old_tag in $(docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' "$IMAGE_NAME" \
  | grep "stable-" | awk '{print $1}' | head -n -$RETENTION_DAYS); do
  echo "[snapshot] removing old image tag $old_tag"
  docker rmi "$old_tag" >/dev/null 2>&1 || true
done

echo "[snapshot] done — $ARCHIVE_FILE"
