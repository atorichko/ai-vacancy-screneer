#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/recruitment-mvp}"
REPO_URL="https://github.com/atorichko/ai-vacancy-screneer.git"
BRANCH="${BRANCH:-main}"

if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl git

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  $SUDO usermod -aG docker "$USER" || true
fi

if ! docker compose version >/dev/null 2>&1; then
  $SUDO apt-get install -y docker-compose-plugin
fi

if [ ! -d "$APP_DIR/.git" ]; then
  $SUDO mkdir -p "$(dirname "$APP_DIR")"
  $SUDO chown -R "$USER:$USER" "$(dirname "$APP_DIR")" || true
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Set POLZA_API_KEY in $APP_DIR/.env then rerun."
  exit 1
fi

$SUDO docker compose up -d --build
$SUDO docker compose ps
