#!/usr/bin/env bash
# ============================================================
# Запуск в окне Electron (macOS / Linux / WSL)
# ТРЕБУЕТСЯ: Python 3.x (с модулем venv) и Node.js (npm).
# ============================================================
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 &> /dev/null; then
  echo "[!] Нет python3 в PATH. Установите Python 3."
  exit 1
fi
if ! command -v npm &> /dev/null; then
  echo "[!] Нет Node.js/npm. Установите Node.js 18+."
  exit 1
fi

if [ ! -d "$ROOT/backend/venv" ]; then
  echo "Создаю venv для backend..."
  python3 -m venv "$ROOT/backend/venv"
  echo "Ставлю зависимости backend..."
  "$ROOT/backend/venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Ставлю зависимости frontend..."
  cd "$ROOT/frontend" && npm install
fi

if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  echo "Собираю UI (один раз)..."
  cd "$ROOT/frontend" && npm run build
fi

if [ ! -d "$ROOT/electron/node_modules" ]; then
  echo "Ставлю Electron..."
  cd "$ROOT/electron" && npm install
fi

echo "Запуск Local Lead Studio (окно Electron)..."
cd "$ROOT/electron"
npm start
