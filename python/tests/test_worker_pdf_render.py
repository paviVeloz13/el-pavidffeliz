from __future__ import annotations

import io
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from pavidffeliz_backend.errors import PopplerMissingError
from pavidffeliz_backend.runtime_paths import probe_poppler
from pavidffeliz_backend.worker import run
from helpers import create_blank_pdf


def run_worker_command(command: dict[str, object]) -> list[dict[str, object]]:
    input_stream = io.StringIO(json.dumps(command) + "\n")
    output_stream = io.StringIO()
    run(input_stream, output_stream)
    return [json.loads(line) for line in output_stream.getvalue().splitlines()]


def poppler_skip_reason() -> str | None:
    probe = probe_poppler()
    if probe["ready"]:
        return None
    return f"bundled Poppler unavailable at {probe['path']}; missing {probe['missing_binaries']}"


class WorkerPdfRenderTests(unittest.TestCase):
    def test_worker_pdf_to_png_returns_structured_poppler_missing_error(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(72, 72)])

            with patch(
                "pavidffeliz_backend.operations.pdf_render.require_poppler_path",
                side_effect=PopplerMissingError({"missing_binaries": ["pdftoppm", "pdftocairo", "pdfinfo"]}),
            ):
                events = run_worker_command(
                    {
                        "id": "png-missing-poppler",
                        "action": "pdf.to_png",
                        "params": {"input_path": str(source), "output_dir": str(root / "out"), "dpi": 72},
                    }
                )

            self.assertEqual(events[-1]["status"], "error")
            self.assertEqual(events[-1]["error"]["code"], "POPPLER_MISSING")
            self.assertIn("missing_binaries", events[-1]["error"]["details"])

    @unittest.skipIf(poppler_skip_reason() is not None, poppler_skip_reason() or "")
    def test_worker_pdf_to_png_success_with_real_poppler(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(72, 72)])

            events = run_worker_command(
                {
                    "id": "png-ok",
                    "action": "pdf.to_png",
                    "params": {"input_path": str(source), "output_dir": str(root / "out"), "dpi": 72},
                }
            )

            self.assertEqual(events[-1]["status"], "ok")
            self.assertEqual(events[-1]["result"]["operation"], "pdf.to_png")
            self.assertTrue(any(event["status"] == "progress" for event in events[:-1]))
            self.assertTrue(Path(events[-1]["result"]["output_paths"][0]).exists())

    @unittest.skipIf(poppler_skip_reason() is not None, poppler_skip_reason() or "")
    def test_worker_flatten_success_with_real_poppler(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(72, 72)])
            output = root / "flattened.pdf"

            events = run_worker_command(
                {
                    "id": "flatten-ok",
                    "action": "pdf.flatten_to_image_pdf",
                    "params": {"input_path": str(source), "output_path": str(output)},
                }
            )

            self.assertEqual(events[-1]["status"], "ok")
            self.assertEqual(events[-1]["result"]["operation"], "pdf.flatten_to_image_pdf")
            self.assertTrue(output.exists())


if __name__ == "__main__":
    unittest.main()
