#!/usr/bin/env bash
# Build El PaviDFeliz — Python worker + Electron app.
#
# Usage:
#   ./build.sh           # macOS (arm64 + x64 DMGs)
#   ./build.sh --win     # Windows NSIS installer (run on Windows or via cross-build)
#   ./build.sh --no-py   # Skip Python build (use existing dist/)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
PY_DIR="$REPO_ROOT/python"
ELECTRON_DIR="$REPO_ROOT/electron"

SKIP_PY=0
ELECTRON_ARGS=(--mac)

for arg in "$@"; do
  case "$arg" in
    --win)    ELECTRON_ARGS=(--win) ;;
    --no-py)  SKIP_PY=1 ;;
  esac
done

# ── 1. Python worker ──────────────────────────────────────────────────────────
if [[ $SKIP_PY -eq 0 ]]; then
  echo "==> Building Python worker..."
  cd "$PY_DIR"
  PYTHON=".venv/bin/python"
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    PYTHON=".venv/Scripts/python.exe"
  fi
  "$PYTHON" scripts/build_worker.py
  echo "==> Python worker built: dist/pavidffeliz-worker/"
fi

# ── 2. Electron app ───────────────────────────────────────────────────────────
echo "==> Building Electron app..."
cd "$ELECTRON_DIR"
npm run build:renderer
npx electron-builder "${ELECTRON_ARGS[@]}"
echo "==> Electron app built: dist-electron/"
