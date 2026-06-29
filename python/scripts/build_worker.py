#!/usr/bin/env python3
"""Build the pavidffeliz-worker PyInstaller bundle.

Run from the python/ directory:
    .venv/bin/python scripts/build_worker.py [--no-clean]

Checks that all required vendor assets are present for the current platform
before invoking PyInstaller.
"""

import argparse
import importlib.util
import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
SPEC = ROOT / "pyinstaller" / "worker.spec"


def platform_id() -> str:
    if sys.platform == "win32":
        return "windows"
    machine = platform.machine().lower()
    if machine == "arm64":
        return "macos-arm64"
    return "macos-x64"


def check_assets(pid: str) -> list[str]:
    errors = []

    poppler_dir = ROOT / "vendor" / "poppler" / pid
    if not poppler_dir.exists() or not any(poppler_dir.iterdir()):
        errors.append(
            f"Poppler vendor missing for {pid}. "
            f"Run: .venv/bin/python scripts/vendor_poppler_macos.py  (macOS)"
        )

    fonts_dir = ROOT / "assets" / "fonts"
    dancing_candidates = ["DancingScript.ttf", "DancingScript-Regular.ttf"]
    if not any((fonts_dir / f).exists() for f in dancing_candidates):
        errors.append(
            f"Font missing in {fonts_dir}: expected DancingScript.ttf or DancingScript-Regular.ttf."
        )

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the backend worker bundle.")
    parser.add_argument(
        "--no-clean",
        action="store_true",
        help="Skip --clean (faster incremental rebuild).",
    )
    args = parser.parse_args()

    pid = platform_id()
    print(f"[build_worker] platform: {pid}")

    errors = check_assets(pid)
    if errors:
        for e in errors:
            print(f"[build_worker] ERROR: {e}", file=sys.stderr)
        return 1

    python_exe = Path(sys.executable)
    if not python_exe.exists():
        print(
            "[build_worker] ERROR: Active Python interpreter not found. "
            "Run this script with the project venv Python.",
            file=sys.stderr,
        )
        return 1

    if importlib.util.find_spec("PyInstaller") is None:
        print(
            "[build_worker] ERROR: PyInstaller is not installed in the active environment. "
            "Run: .venv/bin/python -m pip install -r requirements-dev.txt",
            file=sys.stderr,
        )
        return 1

    cmd = [str(python_exe), "-m", "PyInstaller", str(SPEC), "--noconfirm"]
    if not args.no_clean:
        cmd.append("--clean")

    print(f"[build_worker] running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=ROOT)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
