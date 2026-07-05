#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/sinxy-sai.github.io}"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${BACKUP_DIR}/sinxy-blog-data-${STAMP}.tar.gz"

if [[ ! -d "${APP_DIR}/.data" ]]; then
  echo "No data directory found: ${APP_DIR}/.data" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
tar -czf "$ARCHIVE" -C "$APP_DIR" .data
sha256sum "$ARCHIVE" > "${ARCHIVE}.sha256"

echo "$ARCHIVE"
echo "${ARCHIVE}.sha256"
