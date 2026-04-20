#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/ai-vacancy-screneer"
REPO_URL="https://github.com/atorichko/ai-vacancy-screneer.git"
BRANCH="${BRANCH:-main}"

sudo apt-get update
sudo apt-get install -y ca-certificates curl git

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
fi

if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get install -y docker-compose-plugin
fi

if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p /opt
  sudo chown -R "$USER:$USER" /opt
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

sudo docker compose up -d --build
sudo docker compose ps
