from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from pavidffeliz_backend.runtime_paths import (
    expected_poppler_binaries,
    get_font_path,
    get_poppler_path,
    platform_key,
    probe_font,
    probe_poppler,
    require_poppler_path,
)
from pavidffeliz_backend.errors import PopplerMissingError


class RuntimePathTests(unittest.TestCase):
    def test_platform_key_for_macos_architectures(self) -> None:
        self.assertEqual(platform_key("Darwin", "arm64"), "macos-arm64")
        self.assertEqual(platform_key("Darwin", "x86_64"), "macos-x64")

    def test_platform_key_for_windows(self) -> None:
        self.assertEqual(platform_key("Windows", "AMD64"), "windows")

    def test_get_poppler_path_uses_platform_folder(self) -> None:
        base = Path("/tmp/ilovepavidf")

        self.assertEqual(
            get_poppler_path("macos-arm64", base),
            base / "vendor" / "poppler" / "macos-arm64" / "bin",
        )

    def test_expected_poppler_binaries_are_platform_specific(self) -> None:
        self.assertEqual(expected_poppler_binaries("macos-arm64"), ("pdftoppm", "pdftocairo", "pdfinfo"))
        self.assertEqual(expected_poppler_binaries("windows"), ("pdftoppm.exe", "pdftocairo.exe", "pdfinfo.exe"))

    def test_probe_poppler_reports_missing_placeholder_binaries(self) -> None:
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "vendor" / "poppler" / "macos-arm64").mkdir(parents=True)
            result = probe_poppler("macos-arm64", base)

        self.assertEqual(result["platform"], "macos-arm64")
        self.assertFalse(result["ready"])
        self.assertEqual(result["missing_binaries"], ["pdftoppm", "pdftocairo", "pdfinfo"])

    def test_require_poppler_path_raises_structured_error_when_missing(self) -> None:
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "vendor" / "poppler" / "macos-arm64").mkdir(parents=True)
            with self.assertRaises(PopplerMissingError) as context:
                require_poppler_path("macos-arm64", base)

        self.assertEqual(context.exception.code, "POPPLER_MISSING")
        self.assertEqual(context.exception.details["missing_binaries"], ["pdftoppm", "pdftocairo", "pdfinfo"])

    def test_font_path_and_probe(self) -> None:
        base = Path("/tmp/ilovepavidf")
        expected = base / "assets" / "fonts" / "DancingScript.ttf"

        self.assertEqual(get_font_path(base_path=base), expected)
        self.assertEqual(probe_font(base_path=base)["path"], str(expected))


if __name__ == "__main__":
    unittest.main()
