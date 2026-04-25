#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PIDFILE=".server.pid"

if [ ! -f "$PIDFILE" ]; then
  echo "Server is not running (no PID file)"
  exit 0
fi

PID=$(cat "$PIDFILE")

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  rm -f "$PIDFILE"
  echo "Server stopped (PID: $PID)"
else
  rm -f "$PIDFILE"
  echo "Server was not running (stale PID file removed)"
fi
