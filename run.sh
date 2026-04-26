#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

usage() {
  cat <<EOF
Usage: $0 [-p PORT] [-h]
  -p PORT   Port to run on (default: last-used port from .server.port,
            else 3001, or \$PORT env var)
  -h        Show this help
EOF
}

PORT_FILE=".server.port"
DEFAULT_PORT=3001
EXPLICIT_PORT=""

if [ -n "${PORT:-}" ]; then EXPLICIT_PORT="$PORT"; fi

while getopts ":p:h" opt; do
  case "$opt" in
    p) EXPLICIT_PORT="$OPTARG" ;;
    h) usage; exit 0 ;;
    \?) echo "Unknown option: -$OPTARG" >&2; usage; exit 1 ;;
    :)  echo "Option -$OPTARG requires an argument" >&2; usage; exit 1 ;;
  esac
done

if [ -n "$EXPLICIT_PORT" ]; then
  PORT="$EXPLICIT_PORT"
elif [ -f "$PORT_FILE" ] && [[ "$(cat "$PORT_FILE" 2>/dev/null)" =~ ^[0-9]+$ ]]; then
  PORT="$(cat "$PORT_FILE")"
  echo "Using last-used port $PORT (from $PORT_FILE)"
else
  PORT="$DEFAULT_PORT"
fi

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

# Check whether the local checkout is behind origin and offer to pull.
if command -v git &>/dev/null && [ -d .git ]; then
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' &>/dev/null; then
    if git fetch --quiet 2>/dev/null; then
      LOCAL=$(git rev-parse @ 2>/dev/null || echo "")
      REMOTE=$(git rev-parse '@{u}' 2>/dev/null || echo "")
      BASE=$(git merge-base @ '@{u}' 2>/dev/null || echo "")
      if [ -n "$LOCAL" ] && [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
        if [ "$LOCAL" = "$BASE" ]; then
          BEHIND=$(git rev-list --count "$LOCAL..$REMOTE" 2>/dev/null || echo "?")
          echo "ℹ️  $BEHIND new commit(s) on origin you don't have locally."
          if [ -t 0 ]; then
            read -r -p "Pull latest before starting? [Y/n] " ANSWER
          else
            ANSWER=""
          fi
          case "${ANSWER:-Y}" in
            n|N|no|No|NO) echo "  → Skipping pull, starting current version." ;;
            *)
              if git pull --ff-only --quiet; then
                echo "  → Pulled latest. New HEAD: $(git rev-parse --short HEAD)"
              else
                echo "  ⚠️  git pull failed (local changes?). Starting current version anyway." >&2
              fi
              ;;
          esac
        elif [ "$REMOTE" = "$BASE" ]; then
          : # local is ahead — fine
        else
          echo "ℹ️  Local and origin have diverged — leaving as-is."
        fi
      fi
    else
      echo "ℹ️  Could not fetch from origin (offline?). Starting current version." >&2
    fi
  fi
fi

PROCESS_NAME="weeks-presentation-server"

if [ -f .server.pid ]; then
  EXISTING_PID=$(cat .server.pid)
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    EXISTING_PORT=$(lsof -Pan -p "$EXISTING_PID" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {sub(/.*:/,"",$9); print $9}')
    echo "Server is already running (PID: $EXISTING_PID)"
    [ -n "$EXISTING_PORT" ] && echo "  → http://localhost:$EXISTING_PORT/"
    if [ -t 0 ]; then
      read -r -p "Restart it? [y/N] " ANSWER
    else
      ANSWER=""
    fi
    case "${ANSWER:-N}" in
      y|Y|yes|Yes|YES)
        echo "  → Stopping PID $EXISTING_PID..."
        kill "$EXISTING_PID" 2>/dev/null || true
        for i in 1 2 3 4 5; do
          kill -0 "$EXISTING_PID" 2>/dev/null || break
          sleep 1
        done
        if kill -0 "$EXISTING_PID" 2>/dev/null; then
          echo "  → Force-killing PID $EXISTING_PID..."
          kill -9 "$EXISTING_PID" 2>/dev/null || true
          sleep 1
        fi
        rm -f .server.pid
        ;;
      *)
        exit 0
        ;;
    esac
  else
    rm -f .server.pid
  fi
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
echo "$PORT" > "$PORT_FILE"
echo "Server started in background (PID: $!, name: $PROCESS_NAME)"
echo "  → http://localhost:$PORT/"
