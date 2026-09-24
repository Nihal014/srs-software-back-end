#!/usr/bin/env bash
# Database backup:  ./deploy/backup.sh [label]
# Nightly via cron (see SERVER-SETUP.md). Keeps 30 days in ~/backups/rsrbakes (override with BACKUP_DIR).
# Reads DB_* from the backend .env, so it always dumps the database the API is using.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

DIR="${BACKUP_DIR:-$HOME/backups/rsrbakes}"
mkdir -p "$DIR"
FILE="$DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S)${1:+_$1}.sql.gz"

# The password goes through a temp defaults file so it never shows up in `ps`.
CNF=$(mktemp); trap 'rm -f "$CNF"' EXIT
printf '[client]\nuser=%s\npassword=%s\nhost=%s\nport=%s\n' "$DB_USER" "$DB_PASSWORD" "${DB_HOST:-127.0.0.1}" "${DB_PORT:-3306}" > "$CNF"

mysqldump --defaults-extra-file="$CNF" --single-transaction --routines "$DB_NAME" | gzip > "$FILE"
find "$DIR" -name "${DB_NAME}_*.sql.gz" -mtime +30 -delete
echo "backup written: $FILE"
