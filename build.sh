#!/usr/bin/env bash
# Build El PaviDFeliz — Python worker + Electron app.
#
# Usage:
#   ./build.sh           # macOS build using electron-builder's mac target config
#   ./build.sh --win     # Windows x64 NSIS installer (must run on Windows)
#   ./build.sh --no-py   # Skip Python build (use existing dist/)
#   ./build.sh --release # macOS arm64 release build with signing/notarization checks
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
PY_DIR="$REPO_ROOT/python"
ELECTRON_DIR="$REPO_ROOT/electron"

SKIP_PY=0
RELEASE=0
MAC_ARCH="default"
ELECTRON_ARGS=(--mac)
EXTRA_BUILDER_ARGS=()
TARGET=mac

has_notarization_credentials() {
  if [[ -n "${APPLE_API_KEY:-}" || -n "${APPLE_API_KEY_ID:-}" || -n "${APPLE_API_ISSUER:-}" ]]; then
    if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
      return 0
    fi
    return 1
  fi

  if [[ -n "${APPLE_ID:-}" || -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" || -n "${APPLE_TEAM_ID:-}" ]]; then
    if [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
      return 0
    fi
    return 1
  fi

  if [[ -n "${APPLE_KEYCHAIN:-}" || -n "${APPLE_KEYCHAIN_PROFILE:-}" ]]; then
    if [[ -n "${APPLE_KEYCHAIN:-}" && -n "${APPLE_KEYCHAIN_PROFILE:-}" ]]; then
      return 0
    fi
    return 1
  fi

  return 1
}

verify_release_prereqs() {
  if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
    echo "ERROR: No 'Developer ID Application' signing identity is available in the current keychain." >&2
    echo "Import the Apple Developer ID Application certificate before building a public macOS release." >&2
    exit 1
  fi

  if ! has_notarization_credentials; then
    echo "ERROR: Missing notarization credentials for a public macOS release." >&2
    echo "Provide one of these credential sets before running --release:" >&2
    echo "  1. APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER" >&2
    echo "  2. APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID" >&2
    echo "  3. APPLE_KEYCHAIN + APPLE_KEYCHAIN_PROFILE" >&2
    exit 1
  fi
}

verify_release_artifact() {
  local app_path="$1"

  echo "==> Verifying signed app: $app_path"
  codesign --verify --deep --strict --verbose=2 "$app_path"
  xcrun stapler validate "$app_path"
  spctl -a -vvv -t exec "$app_path"
}

for arg in "$@"; do
  case "$arg" in
    --win)
      TARGET=win
      ELECTRON_ARGS=(--win --x64)
      ;;
    --arm64) MAC_ARCH="arm64" ;;
    --x64)   MAC_ARCH="x64" ;;
    --release) RELEASE=1 ;;
    --no-py)  SKIP_PY=1 ;;
  esac
done

if [[ "$TARGET" == "mac" ]]; then
  case "$MAC_ARCH" in
    arm64) ELECTRON_ARGS=(--mac --arm64) ;;
    x64)   ELECTRON_ARGS=(--mac --x64) ;;
    *)
      if [[ $RELEASE -eq 1 ]]; then
        MAC_ARCH="arm64"
        ELECTRON_ARGS=(--mac --arm64)
      fi
      ;;
  esac
fi

if [[ "$TARGET" == "win" ]]; then
  if [[ ! ("${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" || "${OSTYPE:-}" == "win32") ]]; then
    echo "ERROR: Self-contained Windows builds must run on Windows." >&2
    echo "Use build-windows.ps1 on the Windows machine so the packaged app contains a Windows PyInstaller worker and a Windows NSIS installer." >&2
    exit 1
  fi
fi

if [[ "$TARGET" == "mac" && $RELEASE -eq 1 ]]; then
  verify_release_prereqs
  EXTRA_BUILDER_ARGS=(-c.forceCodeSigning=true)
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
npx electron-builder "${ELECTRON_ARGS[@]}" "${EXTRA_BUILDER_ARGS[@]}"
echo "==> Electron app built: dist-electron/"

if [[ "$TARGET" == "mac" && $RELEASE -eq 1 ]]; then
  APP_VERIFY_PATH="$ELECTRON_DIR/dist-electron/mac-arm64/El PaviDFeliz.app"
  if [[ "$MAC_ARCH" == "x64" ]]; then
    APP_VERIFY_PATH="$ELECTRON_DIR/dist-electron/mac/El PaviDFeliz.app"
  fi
  verify_release_artifact "$APP_VERIFY_PATH"
fi
