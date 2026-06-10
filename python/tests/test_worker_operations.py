from __future__ import annotations

import io
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from ilovepavidf_backend.worker import OPERATIONS, run
from helpers import create_blank_pdf, create_jpeg, pdf_page_count


def run_worker_command(command: dict[str, object]) -> list[dict[str, object]]:
    input_stream = io.StringIO(json.dumps(command) + "\n")
    output_stream = io.StringIO()
    run(input_stream, output_stream)
    return [json.loads(line) for line in output_stream.getvalue().splitlines()]


class WorkerOperationTests(unittest.TestCase):
    def test_milestone_2_operations_are_registered(self) -> None:
        for action in [
            "image.jpeg_to_png",
            "image.png_to_jpeg",
            "image.images_to_pdf",
            "pdf.to_jpeg",
            "pdf.to_png",
            "pdf.render_preview",
            "pdf.flatten_to_image_pdf",
            "pdf.merge",
            "pdf.split_ranges",
            "pdf.split_every_n",
            "pdf.split_individual",
            "pdf.reorder",
            "pdf.delete_pages",
            "pdf.lock",
            "pdf.unlock",
        ]:
            self.assertIn(action, OPERATIONS)

    def test_worker_executes_image_operation_with_progress_and_ok(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_jpeg(root / "photo.jpg")
            output = root / "photo.png"

            events = run_worker_command(
                {
                    "id": "img-1",
                    "action": "image.jpeg_to_png",
                    "params": {"input_path": str(source), "output_path": str(output)},
                }
            )

            self.assertGreaterEqual(len(events), 2)
            self.assertEqual(events[-1]["status"], "ok")
            self.assertEqual(events[-1]["result"]["output_paths"], [str(output)])
            self.assertTrue(any(event["status"] == "progress" for event in events[:-1]))
            self.assertTrue(output.exists())

    def test_worker_executes_pdf_operation_with_progress_and_ok(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = create_blank_pdf(root / "first.pdf", [(100, 100)])
            second = create_blank_pdf(root / "second.pdf", [(110, 100)])
            output = root / "merged.pdf"

            events = run_worker_command(
                {
                    "id": "pdf-1",
                    "action": "pdf.merge",
                    "params": {"input_paths": [str(first), str(second)], "output_path": str(output)},
                }
            )

            self.assertEqual(events[-1]["status"], "ok")
            self.assertEqual(events[-1]["result"]["page_count"], 2)
            self.assertEqual(pdf_page_count(output), 2)
            self.assertTrue(any(event["status"] == "progress" for event in events[:-1]))

    def test_worker_operation_failure_returns_structured_error(self) -> None:
        events = run_worker_command(
            {
                "id": "bad-img",
                "action": "image.jpeg_to_png",
                "params": {},
            }
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["status"], "error")
        self.assertEqual(events[0]["error"]["code"], "VALIDATION_ERROR")


if __name__ == "__main__":
    unittest.main()
