#!/usr/bin/env python3
"""Vendor Homebrew Poppler binaries for the macOS smoke bundle.

This copies pdftoppm/pdftocairo plus recursively linked Homebrew dylibs into:

    vendor/poppler/<platform>/bin
    vendor/poppler/<platform>/lib

It rewrites Homebrew install names to @rpath references so the executables load
their dylibs from @loader_path/../lib instead of Homebrew paths.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
from collections import deque
from pathlib import Path

SYSTEM_PREFIXES = ("/usr/lib/", "/System/")
EXECUTABLES = ("pdftoppm", "pdftocairo", "pdfinfo")


def run(command: list[str]) -> str:
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    return completed.stdout


def dependencies(path: Path) -> list[str]:
    lines = run(["otool", "-L", str(path)]).splitlines()[1:]
    return [line.strip().split(" ", 1)[0] for line in lines if line.strip()]


def rpaths(path: Path) -> list[str]:
    output = run(["otool", "-l", str(path)])
    found: list[str] = []
    pending = False
    for line in output.splitlines():
        stripped = line.strip()
        if stripped == "cmd LC_RPATH":
            pending = True
            continue
        if pending and stripped.startswith("path "):
            found.append(stripped.split(" ", 2)[1])
            pending = False
    return found


def is_system_dependency(reference: str) -> bool:
    return reference.startswith(SYSTEM_PREFIXES)


def homebrew_lib_dirs(homebrew_prefix: Path) -> list[Path]:
    opt_root = homebrew_prefix / "opt"
    dirs = []
    if opt_root.exists():
        dirs.extend(path / "lib" for path in opt_root.iterdir() if (path / "lib").exists())
    return dirs


def resolve_dependency(reference: str, source: Path, search_dirs: list[Path]) -> Path | None:
    if is_system_dependency(reference):
        return None
    if reference.startswith("@rpath/"):
        name = Path(reference).name
        source_rpaths = rpaths(source)
        for rpath in source_rpaths:
            if rpath.startswith("@loader_path/"):
                candidate = (source.parent / rpath.replace("@loader_path/", "", 1) / name).resolve()
                if candidate.exists():
                    return candidate
        for directory in search_dirs:
            candidate = directory / name
            if candidate.exists():
                return candidate.resolve()
        return None
    if reference.startswith("@loader_path/"):
        candidate = (source.parent / reference.replace("@loader_path/", "", 1)).resolve()
        return candidate if candidate.exists() else None
    if reference.startswith("/opt/homebrew/") or reference.startswith("/usr/local/"):
        candidate = Path(reference)
        return candidate.resolve() if candidate.exists() else None
    return None


def copy_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination, follow_symlinks=True)
    destination.chmod(destination.stat().st_mode | 0o200)


def add_rpath_if_missing(path: Path, rpath: str) -> None:
    if rpath in rpaths(path):
        return
    subprocess.run(["install_name_tool", "-add_rpath", rpath, str(path)], check=True)


def patch_macho(path: Path, dependency_refs: dict[str, Path], copied_names: set[str], *, is_dylib: bool) -> None:
    if is_dylib:
        subprocess.run(["install_name_tool", "-id", f"@rpath/{path.name}", str(path)], check=True)
        add_rpath_if_missing(path, "@loader_path")
    else:
        add_rpath_if_missing(path, "@loader_path/../lib")

    for original, resolved in dependency_refs.items():
        if is_system_dependency(original):
            continue
        if resolved.name in copied_names:
            subprocess.run(["install_name_tool", "-change", original, f"@rpath/{resolved.name}", str(path)], check=True)


def ad_hoc_sign(path: Path) -> None:
    subprocess.run(["codesign", "--force", "--sign", "-", str(path)], check=True, capture_output=True, text=True)


def vendor_poppler(poppler_prefix: Path, output_root: Path, homebrew_prefix: Path) -> None:
    bin_dir = output_root / "bin"
    lib_dir = output_root / "lib"
    search_dirs = [poppler_prefix / "lib", *homebrew_lib_dirs(homebrew_prefix)]

    if output_root.exists():
        shutil.rmtree(output_root)
    bin_dir.mkdir(parents=True)
    lib_dir.mkdir(parents=True)

    source_to_destination: dict[Path, Path] = {}
    dependency_refs_by_source: dict[Path, dict[str, Path]] = {}
    queue: deque[Path] = deque()

    for executable in EXECUTABLES:
        source = poppler_prefix / "bin" / executable
        if not source.exists():
            raise FileNotFoundError(f"Missing Poppler executable: {source}")
        destination = bin_dir / executable
        copy_file(source, destination)
        source_to_destination[source.resolve()] = destination
        queue.append(source.resolve())

    while queue:
        source = queue.popleft()
        dependency_refs: dict[str, Path] = {}
        for reference in dependencies(source):
            resolved = resolve_dependency(reference, source, search_dirs)
            if resolved is None:
                continue
            dependency_refs[reference] = resolved
            if resolved not in source_to_destination:
                destination = lib_dir / Path(reference).name
                copy_file(resolved, destination)
                source_to_destination[resolved] = destination
                queue.append(resolved)
        dependency_refs_by_source[source] = dependency_refs

    copied_names = {destination.name for destination in source_to_destination.values() if destination.parent == lib_dir}
    for source, destination in source_to_destination.items():
        patch_macho(
            destination,
            dependency_refs_by_source.get(source, {}),
            copied_names,
            is_dylib=destination.parent == lib_dir,
        )
    for destination in source_to_destination.values():
        ad_hoc_sign(destination)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--poppler-prefix", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--homebrew-prefix", default="/opt/homebrew")
    args = parser.parse_args()

    vendor_poppler(
        poppler_prefix=Path(args.poppler_prefix).resolve(),
        output_root=Path(args.output_root).resolve(),
        homebrew_prefix=Path(args.homebrew_prefix).resolve(),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
