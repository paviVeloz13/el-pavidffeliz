"""Shared constants for the El PaviDFeliz backend."""

from __future__ import annotations

from pathlib import Path

APP_NAME = "El PaviDFeliz"
WORKER_PROTOCOL_VERSION = "2026-06-09.1"

PYPDF_REQUIRED_VERSION = "4.3.1"
FLATTEN_DPI = 200
PREVIEW_DPI = 150
ORGANIZE_THUMBNAIL_DPI = 72
ALLOWED_RENDER_DPI = (72, 150, 300)
MAX_JOINED_IMAGE_HEIGHT_PX = 10_000

SUPPORTED_LANGUAGES = ("es", "en", "ja", "ko")
DANCING_SCRIPT_FILENAME = "DancingScript.ttf"

PACKAGE_ROOT = Path(__file__).resolve().parent
PYTHON_ROOT = PACKAGE_ROOT.parents[1]
POPPLER_VENDOR_ROOT = PYTHON_ROOT / "vendor" / "poppler"
FONT_ASSET_ROOT = PYTHON_ROOT / "assets" / "fonts"

MACOS_POPPLER_BINARIES = ("pdftoppm", "pdftocairo", "pdfinfo")
WINDOWS_POPPLER_BINARIES = ("pdftoppm.exe", "pdftocairo.exe", "pdfinfo.exe")
