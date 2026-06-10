"""Runtime asset and native-binary path resolution.

All future pdf2image calls must pass poppler_path=get_poppler_path().
"""

from __future__ import annotations

import platform
import subprocess
import sys
from pathlib import Path

from .constants import (
    DANCING_SCRIPT_FILENAME,
    FONT_ASSET_ROOT,
    MACOS_POPPLER_BINARIES,
    POPPLER_VENDOR_ROOT,
    PYTHON_ROOT,
    WINDOWS_POPPLER_BINARIES,
)
from .errors import RuntimePathError
from .errors import PopplerMissingError


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False)) and hasattr(sys, "_MEIPASS")


def app_base_path() -> Path:
    if is_frozen():
        return Path(getattr(sys, "_MEIPASS")).resolve()
    return PYTHON_ROOT.resolve()


def platform_key(system: str | None = None, machine: str | None = None) -> str:
    current_system = (system or platform.system()).lower()
    current_machine = (machine or platform.machine()).lower()

    if current_system == "darwin":
        if current_machine in {"arm64", "aarch64"}:
            return "macos-arm64"
        if current_machine in {"x86_64", "amd64"}:
            return "macos-x64"
    if current_system == "windows":
        return "windows"

    raise RuntimePathError(
        "Unsupported platform for bundled Poppler.",
        {"system": system or platform.system(), "machine": machine or platform.machine()},
    )


def get_poppler_platform_root(platform_id: str | None = None, base_path: Path | None = None) -> Path:
    base = base_path if base_path is not None else app_base_path()
    selected_platform = platform_id or platform_key()
    return base / "vendor" / "poppler" / selected_platform


def get_poppler_path(platform_id: str | None = None, base_path: Path | None = None) -> Path:
    return get_poppler_platform_root(platform_id, base_path) / "bin"


def expected_poppler_binaries(platform_id: str | None = None) -> tuple[str, ...]:
    selected_platform = platform_id or platform_key()
    if selected_platform == "windows":
        return WINDOWS_POPPLER_BINARIES
    if selected_platform in {"macos-arm64", "macos-x64"}:
        return MACOS_POPPLER_BINARIES
    raise RuntimePathError("Unknown Poppler platform id.", {"platform_id": selected_platform})


def _is_system_library(reference: str) -> bool:
    return reference.startswith("/usr/lib/") or reference.startswith("/System/")


def _parse_otool_dependencies(binary_path: Path) -> list[str]:
    try:
        completed = subprocess.run(
            ["otool", "-L", str(binary_path)],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        return [f"otool_error:{exc}"]

    dependencies: list[str] = []
    for line in completed.stdout.splitlines()[1:]:
        stripped = line.strip()
        if not stripped:
            continue
        dependencies.append(stripped.split(" ", 1)[0])
    return dependencies


def _linked_library_diagnostics(binary_path: Path, library_path: Path) -> dict[str, object]:
    dependencies = _parse_otool_dependencies(binary_path)
    missing: list[str] = []
    external: list[str] = []
    resolved: list[dict[str, str]] = []

    for dependency in dependencies:
        if dependency.startswith("otool_error:"):
            missing.append(dependency)
            continue
        if _is_system_library(dependency):
            resolved.append({"reference": dependency, "kind": "system"})
            continue
        if dependency.startswith("@rpath/"):
            candidate = library_path / Path(dependency).name
            if candidate.exists():
                resolved.append({"reference": dependency, "resolved": str(candidate), "kind": "bundled"})
            else:
                missing.append(dependency)
            continue
        if dependency.startswith("@loader_path/"):
            candidate = (binary_path.parent / dependency.replace("@loader_path/", "", 1)).resolve()
            if candidate.exists():
                resolved.append({"reference": dependency, "resolved": str(candidate), "kind": "loader_path"})
            else:
                missing.append(dependency)
            continue
        if dependency.startswith("/"):
            if Path(dependency).exists():
                external.append(dependency)
            else:
                missing.append(dependency)
            continue
        missing.append(dependency)

    return {
        "binary": str(binary_path),
        "dependencies": dependencies,
        "resolved_libraries": resolved,
        "external_libraries": external,
        "missing_libraries": missing,
    }


def probe_poppler(platform_id: str | None = None, base_path: Path | None = None) -> dict[str, object]:
    selected_platform = platform_id or platform_key()
    platform_root = get_poppler_platform_root(selected_platform, base_path)
    poppler_path = get_poppler_path(selected_platform, base_path)
    library_path = platform_root / "lib"
    expected = expected_poppler_binaries(selected_platform)
    missing = [binary for binary in expected if not (poppler_path / binary).exists()]
    linked_libraries = [
        _linked_library_diagnostics(poppler_path / binary, library_path)
        for binary in expected
        if (poppler_path / binary).exists()
    ]
    missing_linked_libraries = sorted(
        {
            missing_library
            for diagnostics in linked_libraries
            for missing_library in diagnostics["missing_libraries"]  # type: ignore[index]
        }
    )
    external_linked_libraries = sorted(
        {
            external_library
            for diagnostics in linked_libraries
            for external_library in diagnostics["external_libraries"]  # type: ignore[index]
        }
    )
    return {
        "platform": selected_platform,
        "platform_root": str(platform_root),
        "path": str(poppler_path),
        "library_path": str(library_path),
        "exists": poppler_path.exists(),
        "expected_binaries": list(expected),
        "missing_binaries": missing,
        "linked_libraries": linked_libraries,
        "missing_linked_libraries": missing_linked_libraries,
        "external_linked_libraries": external_linked_libraries,
        "ready": poppler_path.exists() and not missing and not missing_linked_libraries,
    }


def require_poppler_path(platform_id: str | None = None, base_path: Path | None = None) -> Path:
    """Return the bundled Poppler path or raise a structured missing error.

    This intentionally does not inspect or fall back to system PATH.
    """

    probe = probe_poppler(platform_id, base_path)
    if not probe["ready"]:
        raise PopplerMissingError(probe)
    return Path(str(probe["path"]))


def get_font_path(filename: str = DANCING_SCRIPT_FILENAME, base_path: Path | None = None) -> Path:
    base = base_path if base_path is not None else app_base_path()
    return base / "assets" / "fonts" / filename


def probe_font(filename: str = DANCING_SCRIPT_FILENAME, base_path: Path | None = None) -> dict[str, object]:
    font_path = get_font_path(filename, base_path)
    return {
        "filename": filename,
        "path": str(font_path),
        "exists": font_path.exists(),
        "ready": font_path.exists(),
    }


def development_asset_roots() -> dict[str, str]:
    return {
        "python_root": str(PYTHON_ROOT),
        "poppler_vendor_root": str(POPPLER_VENDOR_ROOT),
        "font_asset_root": str(FONT_ASSET_ROOT),
    }
