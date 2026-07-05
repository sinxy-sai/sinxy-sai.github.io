#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/sinxy-sai.github.io}"
ARCHIVE="${1:-}"

if [[ -z "$ARCHIVE" ]]; then
  echo "Usage: APP_DIR=/home/ubuntu/sinxy-sai.github.io bash scripts/vps/restore.sh <backup.tar.gz>" >&2
  exit 1
fi

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Backup archive not found: $ARCHIVE" >&2
  exit 1
fi

mkdir -p "$APP_DIR"

if [[ -d "${APP_DIR}/.data" ]]; then
  SAFETY_COPY="${APP_DIR}/.data.before-restore.$(date -u +%Y%m%dT%H%M%SZ)"
  mv "${APP_DIR}/.data" "$SAFETY_COPY"
  echo "Existing data moved to: $SAFETY_COPY"
fi

tar -xzf "$ARCHIVE" -C "$APP_DIR"

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^sinxy-blog.service'; then
  sudo systemctl restart sinxy-blog
fi

echo "Restore complete: ${APP_DIR}/.data"
