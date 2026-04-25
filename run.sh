#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node &>/dev/null; then
  echo "Error: node is not installed" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

PROCESS_NAME="weeks-presentation-server"
PORT=3001

if [ -f .server.pid ]; then
  EXISTING_PID=$(cat .server.pid)
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "Server is already running (PID: $EXISTING_PID)"
    exit 0
  fi
  rm -f .server.pid
fi

if command -v lsof &>/dev/null && lsof -iTCP:"$PORT" -sTCP:LISTEN &>/dev/null; then
  echo "Error: port $PORT is already in use" >&2
  exit 1
fi

(exec -a "$PROCESS_NAME" node server.js) &
echo $! > .server.pid
echo "Server started in background (PID: $!, name: $PROCESS_NAME)"
