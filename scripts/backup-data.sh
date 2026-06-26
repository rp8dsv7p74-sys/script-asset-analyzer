#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/data-$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

if [ ! -d "$DATA_DIR" ]; then
  echo "data directory not found: $DATA_DIR"
  exit 0
fi

tar -czf "$BACKUP_FILE" -C "$APP_DIR" data
echo "backup created: $BACKUP_FILE"

find "$BACKUP_DIR" -name 'data-*.tar.gz' -type f -mtime +"$KEEP_DAYS" -delete
