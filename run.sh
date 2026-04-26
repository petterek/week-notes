#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

usage() {
  cat <<EOF
Usage: $0 [-p PORT] [-h]
  -p PORT   Port to run on (default: 3001, or \$PORT env var)
  -h        Show this help
EOF
}

PORT="${PORT:-3001}"

while getopts ":p:h" opt; do
  case "$opt" in
    p) PORT="$OPTARG" ;;
    h) usage; exit 0 ;;
    \?) echo "Unknown option: -$OPTARG" >&2; usage; exit 1 ;;
    :)  echo "Option -$OPTARG requires an argument" >&2; usage; exit 1 ;;
  esac
done

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo "Error: invalid port '$PORT'" >&2
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "Error: node is not installed" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

PROCESS_NAME="weeks-presentation-server"

if [ -f .server.pid ]; then
  EXISTING_PID=$(cat .server.pid)
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    EXISTING_PORT=$(lsof -Pan -p "$EXISTING_PID" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {sub(/.*:/,"",$9); print $9}')
    echo "Server is already running (PID: $EXISTING_PID)"
    [ -n "$EXISTING_PORT" ] && echo "  → http://localhost:$EXISTING_PORT/"
    exit 0
  fi
  rm -f .server.pid
fi

if command -v lsof &>/dev/null && lsof -iTCP:"$PORT" -sTCP:LISTEN &>/dev/null; then
  ORIG_PORT="$PORT"
  PORT=$(node -e 'const s=require("net").createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>console.log(p));});' 2>/dev/null)
  if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
    echo "Error: port $ORIG_PORT is in use and no free port could be found" >&2
    exit 1
  fi
  echo "Port $ORIG_PORT is in use; using free port $PORT instead"
fi

(exec -a "$PROCESS_NAME" env PORT="$PORT" node server.js) &
echo $! > .server.pid
echo "Server started in background (PID: $!, name: $PROCESS_NAME)"
echo "  → http://localhost:$PORT/"
