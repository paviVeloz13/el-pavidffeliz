# -*- mode: python ; coding: utf-8 -*-
"""Minimal PyInstaller --onedir smoke spec for the backend worker.

Run from the python/ directory after macOS Poppler binaries and DancingScript.ttf
have been added. This spec intentionally uses COLLECT so the output is onedir.
"""

from pathlib import Path

from PyInstaller.utils.hooks import collect_all


ROOT = Path.cwd()


def collect_existing_tree(source: str, target: str):
    source_path = ROOT / source
    if not source_path.exists():
        return []
    return [(str(path), str(Path(target) / path.relative_to(source_path).parent)) for path in source_path.rglob("*") if path.is_file()]


crypto_datas, crypto_binaries, crypto_hiddenimports = collect_all("Crypto")
reportlab_datas, reportlab_binaries, reportlab_hiddenimports = collect_all("reportlab")

poppler_binaries = collect_existing_tree("vendor/poppler/macos-arm64", "vendor/poppler/macos-arm64")
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
    name="ilovepavidf-worker",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="ilovepavidf-worker",
)
