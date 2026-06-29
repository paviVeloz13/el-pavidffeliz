#!/usr/bin/env bash
# Build El PaviDFeliz — Python worker + Electron app.
#
# Usage:
#   ./build.sh           # macOS build using electron-builder's mac target config
#   ./build.sh --win     # Windows x64 NSIS installer (must run on Windows)
#   ./build.sh --no-py   # Skip Python build (use existing dist/)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
PY_DIR="$REPO_ROOT/python"
ELECTRON_DIR="$REPO_ROOT/electron"

SKIP_PY=0
ELECTRON_ARGS=(--mac)
TARGET=mac

for arg in "$@"; do
  case "$arg" in
    --win)
      TARGET=win
      ELECTRON_ARGS=(--win --x64)
      ;;
    --no-py)  SKIP_PY=1 ;;
  esac
done

if [[ "$TARGET" == "win" ]]; then
  if [[ ! ("${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" || "${OSTYPE:-}" == "win32") ]]; then
    echo "ERROR: Self-contained Windows builds must run on Windows." >&2
    echo "Use build-windows.ps1 on the Windows machine so the packaged app contains a Windows PyInstaller worker and a Windows NSIS installer." >&2
    exit 1
  fi
fi

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
