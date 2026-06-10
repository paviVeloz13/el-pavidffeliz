from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from pavidffeliz_backend.constants import FLATTEN_DPI, PYPDF_REQUIRED_VERSION
from pavidffeliz_backend.operations.health import (
    REQUIRED_DEPENDENCIES,
    probe_crypto_aes,
    probe_dependency,
)


class DependencyProbeTests(unittest.TestCase):
    def test_requirements_pin_pypdf_and_pycryptodome(self) -> None:
        requirements = Path(__file__).parent.parent.joinpath("requirements.txt").read_text(encoding="utf-8")

        self.assertIn(f"pypdf=={PYPDF_REQUIRED_VERSION}", requirements)
        self.assertIn("pycryptodome==", requirements)
        self.assertEqual(PYPDF_REQUIRED_VERSION, "4.3.1")
        self.assertEqual(FLATTEN_DPI, 200)

    def test_dependency_manifest_includes_required_pdf_stack(self) -> None:
        self.assertEqual(REQUIRED_DEPENDENCIES["pypdf"]["required_version"], "4.3.1")
        self.assertIn("pycryptodome", REQUIRED_DEPENDENCIES)
        self.assertIn("pdf2image", REQUIRED_DEPENDENCIES)
        self.assertIn("Pillow", REQUIRED_DEPENDENCIES)
        self.assertIn("reportlab", REQUIRED_DEPENDENCIES)

    def test_probe_dependency_reports_missing_without_raising(self) -> None:
        result = probe_dependency("definitely_missing_ilovepavidf_module")

        self.assertFalse(result["ok"])
        self.assertFalse(result["installed"])
        self.assertEqual(result["reason"], "missing_import")

    def test_probe_dependency_reports_pypdf_version_mismatch(self) -> None:
        with patch("pavidffeliz_backend.operations.health.importlib.util.find_spec", return_value=object()):
            with patch("pavidffeliz_backend.operations.health.metadata.version", return_value="5.0.0"):
                result = probe_dependency("pypdf", "pypdf", "4.3.1")

        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "version_mismatch")
        self.assertEqual(result["version"], "5.0.0")

    def test_crypto_aes_probe_has_stable_shape(self) -> None:
        result = probe_crypto_aes()

        self.assertIn("ok", result)
        self.assertEqual(result["module"], "Crypto.Cipher.AES")
        if result["ok"]:
            self.assertEqual(result["block_size"], 16)
        else:
            self.assertIn("error_type", result)


if __name__ == "__main__":
    unittest.main()
