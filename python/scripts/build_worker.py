#!/usr/bin/env python3
"""Build the pavidffeliz-worker PyInstaller bundle.

Run from the python/ directory:
    .venv/bin/python scripts/build_worker.py [--clean]

Checks that all required vendor assets are present for the current platform
before invoking PyInstaller.
"""

import argparse
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

    pyinstaller = ROOT / ".venv" / "bin" / "pyinstaller"
    if sys.platform == "win32":
        pyinstaller = ROOT / ".venv" / "Scripts" / "pyinstaller.exe"

    if not pyinstaller.exists():
        print(
            "[build_worker] ERROR: PyInstaller not found in .venv. "
            "Run: pip install pyinstaller",
            file=sys.stderr,
        )
        return 1

    cmd = [str(pyinstaller), str(SPEC), "--noconfirm"]
    if not args.no_clean:
        cmd.append("--clean")

    print(f"[build_worker] running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=ROOT)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
