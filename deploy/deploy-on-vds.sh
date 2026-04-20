#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ai-vacancy-screneer}"
BRANCH="${BRANCH:-main}"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Repository not found in $APP_DIR"
  echo "Run initial setup first:"
  echo "git clone <repo-url> $APP_DIR"
  exit 1
fi

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env file created. Fill POLZA_API_KEY and rerun."
  exit 1
fi

docker compose pull || true
docker compose up -d --build
docker compose ps
