#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
APP_NAME="${APP_NAME:-script-asset-analyzer}"

cd "$APP_DIR"

if [ ! -f ".env" ]; then
  echo "Missing .env. Create it on the server before deploying."
  exit 1
fi

if [ -d ".git" ] && command -v git >/dev/null 2>&1; then
  git fetch --all --prune
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

bash "$APP_DIR/scripts/backup-data.sh"

npm ci
npm test
npm run build

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --only "$APP_NAME" --update-env
else
  pm2 start ecosystem.config.cjs --only "$APP_NAME"
fi

pm2 save
pm2 status "$APP_NAME"
