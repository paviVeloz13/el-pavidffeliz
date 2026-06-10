"""Health and risk-probe operation for Milestone 1."""

from __future__ import annotations

import importlib.metadata as metadata
import importlib.util
from typing import Any

from pavidffeliz_backend import __version__
from pavidffeliz_backend.constants import (
    APP_NAME,
    FLATTEN_DPI,
    ORGANIZE_THUMBNAIL_DPI,
    PREVIEW_DPI,
    PYPDF_REQUIRED_VERSION,
    WORKER_PROTOCOL_VERSION,
)
from pavidffeliz_backend.runtime_paths import development_asset_roots, probe_font, probe_poppler

REQUIRED_DEPENDENCIES: dict[str, dict[str, str | None]] = {
    "pdf2image": {"import_name": "pdf2image", "distribution_name": "pdf2image", "required_version": "1.17.0"},
    "Pillow": {"import_name": "PIL", "distribution_name": "Pillow", "required_version": "10.4.0"},
    "pypdf": {"import_name": "pypdf", "distribution_name": "pypdf", "required_version": PYPDF_REQUIRED_VERSION},
    "pycryptodome": {"import_name": "Crypto", "distribution_name": "pycryptodome", "required_version": "3.20.0"},
    "reportlab": {"import_name": "reportlab", "distribution_name": "reportlab", "required_version": "4.2.2"},
}


def probe_dependency(
    import_name: str,
    distribution_name: str | None = None,
    required_version: str | None = None,
) -> dict[str, Any]:
    spec = importlib.util.find_spec(import_name)
    installed = spec is not None
    version = None
    error = None

    if installed and distribution_name:
        try:
            version = metadata.version(distribution_name)
        except metadata.PackageNotFoundError:
            error = f"Distribution metadata not found for {distribution_name}."

    ok = installed and error is None
    reason = "ok"
    if not installed:
        ok = False
        reason = "missing_import"
    elif required_version and version and version != required_version:
        ok = False
        reason = "version_mismatch"
    elif error:
        ok = False
        reason = "missing_distribution_metadata"

    return {
        "import_name": import_name,
        "distribution_name": distribution_name,
        "installed": installed,
        "version": version,
        "required_version": required_version,
        "ok": ok,
        "reason": reason,
        "error": error,
    }


def probe_all_dependencies() -> dict[str, dict[str, Any]]:
    probes: dict[str, dict[str, Any]] = {}
    for name, dependency in REQUIRED_DEPENDENCIES.items():
        probes[name] = probe_dependency(
            import_name=str(dependency["import_name"]),
            distribution_name=dependency["distribution_name"],
            required_version=dependency["required_version"],
        )
    return probes


def probe_crypto_aes() -> dict[str, Any]:
    try:
        from Crypto.Cipher import AES

        key = b"0" * 16
        iv = b"1" * 16
        AES.new(key, AES.MODE_CBC, iv=iv).encrypt(b"2" * 16)
    except Exception as exc:
        return {
            "ok": False,
            "module": "Crypto.Cipher.AES",
            "error": str(exc) or exc.__class__.__name__,
            "error_type": exc.__class__.__name__,
        }

    return {
        "ok": True,
        "module": "Crypto.Cipher.AES",
        "block_size": AES.block_size,
        "mode": "AES-CBC",
    }


def handle_health(params: dict[str, Any] | None = None, emit_progress: Any | None = None) -> dict[str, Any]:
    del params
    del emit_progress
    return {
        "app": APP_NAME,
        "backend_version": __version__,
        "protocol_version": WORKER_PROTOCOL_VERSION,
        "constants": {
            "pypdf_required_version": PYPDF_REQUIRED_VERSION,
            "flatten_dpi": FLATTEN_DPI,
            "preview_dpi": PREVIEW_DPI,
            "organize_thumbnail_dpi": ORGANIZE_THUMBNAIL_DPI,
        },
        "dependencies": probe_all_dependencies(),
        "crypto_aes": probe_crypto_aes(),
        "poppler": probe_poppler(),
        "font": probe_font(),
        "asset_roots": development_asset_roots(),
    }
