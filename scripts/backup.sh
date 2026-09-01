#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP_DIR=${OWLY_BACKUP_DIR:-"$PROJECT_DIR/backups"}
DB_CONTAINER=${OWLY_DB_CONTAINER:-owly-db-1}
DB_USER=${POSTGRES_USER:-postgres}
DB_NAME=${POSTGRES_DB:-owly}
KEEP=${OWLY_BACKUP_KEEP:-7}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/owly-backup.XXXXXX")
ARCHIVE="$BACKUP_DIR/owly-$STAMP.tar.gz"

cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT INT TERM

mkdir -p "$BACKUP_DIR"
echo "Creating PostgreSQL dump..."
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges > "$WORK_DIR/database.sql"

echo "Copying application data..."
mkdir -p "$WORK_DIR/project"
for item in imports prisma scripts .env docker-compose.yml Dockerfile package.json package-lock.json; do
  if [ -e "$PROJECT_DIR/$item" ]; then cp -a "$PROJECT_DIR/$item" "$WORK_DIR/project/"; fi
done

if docker volume inspect owly_whatsapp_auth >/dev/null 2>&1; then
  docker run --rm -v owly_whatsapp_auth:/source:ro -v "$WORK_DIR":/backup alpine:3.20 \
    tar -czf /backup/whatsapp-auth.tar.gz -C /source .
fi

printf 'created_at=%s\ndatabase=%s\ndatabase_container=%s\n' "$STAMP" "$DB_NAME" "$DB_CONTAINER" > "$WORK_DIR/manifest.txt"
tar -czf "$ARCHIVE" -C "$WORK_DIR" .
chmod 644 "$ARCHIVE"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'owly-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null \
  | sort -nr | awk "NR > $KEEP {print \$2}" | xargs -r rm -f

echo "Backup created: $ARCHIVE"
ls -lh "$ARCHIVE"