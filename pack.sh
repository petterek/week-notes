#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ZIP_NAME="weeks-app.zip"

cd "$SCRIPT_DIR"

zip -r "$ZIP_NAME" . \
  -x "./data/*" \
  -x "./node_modules/*" \
  -x "./build/*" \
  -x "./.server.pid" \
  -x "./$ZIP_NAME"

echo "✅ Created $SCRIPT_DIR/$ZIP_NAME"
