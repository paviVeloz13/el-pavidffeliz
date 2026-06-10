# -*- mode: python ; coding: utf-8 -*-
"""Production PyInstaller --onedir spec for the backend worker.

Run via:  python scripts/build_worker.py
Or directly (from python/):  .venv/bin/pyinstaller pyinstaller/worker.spec --clean --noconfirm
"""

import platform
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all


ROOT = Path.cwd()


def collect_existing_tree(source: str, target: str):
    source_path = ROOT / source
    if not source_path.exists():
        return []
    return [
        (str(path), str(Path(target) / path.relative_to(source_path).parent))
        for path in source_path.rglob("*")
        if path.is_file()
    ]


def platform_id() -> str:
    if sys.platform == "win32":
        return "windows"
    machine = platform.machine().lower()
    if machine == "arm64":
        return "macos-arm64"
    return "macos-x64"


PLATFORM = platform_id()

crypto_datas, crypto_binaries, crypto_hiddenimports = collect_all("Crypto")
reportlab_datas, reportlab_binaries, reportlab_hiddenimports = collect_all("reportlab")

poppler_binaries = collect_existing_tree(
    f"vendor/poppler/{PLATFORM}",
    f"vendor/poppler/{PLATFORM}",
)
font_datas = collect_existing_tree("assets/fonts", "assets/fonts")

a = Analysis(
    [str(ROOT / "pyinstaller/entrypoint.py")],
    pathex=[str(ROOT / "src")],
    binaries=crypto_binaries + reportlab_binaries + poppler_binaries,
    datas=crypto_datas + reportlab_datas + font_datas,
    hiddenimports=crypto_hiddenimports + reportlab_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="pavidffeliz-worker",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="pavidffeliz-worker",
)
