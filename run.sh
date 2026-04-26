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
