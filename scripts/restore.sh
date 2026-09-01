#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then echo "Usage: $0 /path/to/owly-backup.tar.gz" >&2; exit 1; fi
ARCHIVE=$1
DB_CONTAINER=${OWLY_DB_CONTAINER:-owly-db-1}
DB_USER=${POSTGRES_USER:-postgres}
DB_NAME=${POSTGRES_DB:-owly}
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/owly-restore.XXXXXX")
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT INT TERM

[ -f "$ARCHIVE" ] || { echo "Archive not found: $ARCHIVE" >&2; exit 1; }
if [ "${CONFIRM_RESTORE:-}" != "yes" ] && [ "${2:-}" != "--yes" ]; then
  echo "WARNING: this replaces the current database contents."
  printf "Type RESTORE to continue: "
  read confirmation
  [ "$confirmation" = "RESTORE" ] || { echo "Restore cancelled."; exit 1; }
fi

tar -xzf "$ARCHIVE" -C "$WORK_DIR"
docker compose stop app >/dev/null
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$WORK_DIR/database.sql"

if [ -f "$WORK_DIR/whatsapp-auth.tar.gz" ] && docker volume inspect owly_whatsapp_auth >/dev/null 2>&1; then
  docker run --rm -i -v owly_whatsapp_auth:/target alpine:3.20 sh -c 'rm -rf /target/* /target/.[!.]* /target/..?*; tar -xzf - -C /target' < "$WORK_DIR/whatsapp-auth.tar.gz"
fi
docker compose start app >/dev/null
echo "Restore completed."