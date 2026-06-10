from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from PIL import Image
from pypdf import PdfReader

from pavidffeliz_backend.constants import FLATTEN_DPI, MAX_JOINED_IMAGE_HEIGHT_PX, ORGANIZE_THUMBNAIL_DPI, PREVIEW_DPI
from pavidffeliz_backend.errors import PopplerMissingError, ValidationError
from pavidffeliz_backend.operations.pdf_render import (
    _render_page,
    flatten_to_image_pdf,
    pdf_to_images,
    render_preview_page,
)
from pavidffeliz_backend.runtime_paths import probe_poppler
from helpers import create_blank_pdf, pdf_page_count


def poppler_skip_reason() -> str | None:
    probe = probe_poppler()
    if probe["ready"]:
        return None
    return f"bundled Poppler unavailable at {probe['path']}; missing {probe['missing_binaries']}"


class PdfRenderOperationTests(unittest.TestCase):
    def test_render_page_passes_explicit_poppler_path(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(72, 72)])
            fake_poppler = root / "poppler"
            fake_poppler.mkdir()

            with patch("pavidffeliz_backend.operations.pdf_render.require_poppler_path", return_value=fake_poppler):
                with patch("pavidffeliz_backend.operations.pdf_render.convert_from_path", return_value=[Image.new("RGB", (10, 10))]) as convert:
                    image = _render_page(source, 1, dpi=150, image_format="png")

            try:
                self.assertEqual(image.size, (10, 10))
            finally:
                image.close()
            self.assertEqual(convert.call_args.kwargs["poppler_path"], str(fake_poppler))
            self.assertNotIn("PATH", convert.call_args.kwargs)

    def test_pdf_to_png_returns_structured_missing_poppler_error(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(72, 72)])

            with patch(
                "pavidffeliz_backend.operations.pdf_render.require_poppler_path",
                side_effect=PopplerMissingError({"missing_binaries": ["pdftoppm", "pdftocairo", "pdfinfo"]}),
            ):
                with self.assertRaises(PopplerMissingError):
                    pdf_to_images(source, image_format="png", output_dir=root / "out", dpi=72)

    def test_joined_tall_image_limit_is_enforced_before_rendering(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "tall.pdf", [(72, 3600), (72, 3600), (72, 3600)])

            with self.assertRaises(ValidationError) as context:
                pdf_to_images(source, image_format="jpeg", output_path=root / "joined.jpg", dpi=72, join=True)

            self.assertEqual(context.exception.details["max_allowed_height_px"], MAX_JOINED_IMAGE_HEIGHT_PX)

    @unittest.skipIf(poppler_skip_reason() is not None, poppler_skip_reason() or "")
    def test_pdf_to_png_separate_outputs_with_real_poppler(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(72, 72), (72, 144)])

            result = pdf_to_images(source, image_format="png", output_dir=root / "out", dpi=72)

            self.assertEqual(result["operation"], "pdf.to_png")
            self.assertEqual(result["page_count"], 2)
            self.assertEqual(len(result["output_paths"]), 2)
            self.assertTrue(all(Path(path).exists() for path in result["output_paths"]))

    @unittest.skipIf(poppler_skip_reason() is not None, poppler_skip_reason() or "")
    def test_pdf_to_jpeg_joined_output_with_real_poppler(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(72, 72), (72, 72)])
            output = root / "joined.jpg"

            result = pdf_to_images(source, image_format="jpeg", output_path=output, dpi=72, join=True)

            self.assertEqual(result["operation"], "pdf.to_jpeg")
            self.assertTrue(output.exists())
            self.assertTrue(result["join"])

    @unittest.skipIf(poppler_skip_reason() is not None, poppler_skip_reason() or "")
    def test_preview_render_returns_metadata_with_real_poppler(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(72, 144)])
            output = root / "preview.png"

            result = render_preview_page(source, output, page_number=1, preview_kind="edit")

            self.assertEqual(result["operation"], "pdf.render_preview")
            self.assertEqual(result["dpi"], PREVIEW_DPI)
            self.assertEqual(result["page"]["rotation"], 0)
            self.assertEqual(result["scale_reference"]["visual_width_points"], 72)
            self.assertTrue(output.exists())

    @unittest.skipIf(poppler_skip_reason() is not None, poppler_skip_reason() or "")
    def test_organize_preview_uses_72_dpi_with_real_poppler(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(72, 72)])
            output = root / "thumb.png"

            result = render_preview_page(source, output, page_number=1, preview_kind="organize")

            self.assertEqual(result["dpi"], ORGANIZE_THUMBNAIL_DPI)

    @unittest.skipIf(poppler_skip_reason() is not None, poppler_skip_reason() or "")
    def test_flatten_to_image_pdf_uses_flatten_dpi_with_real_poppler(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(72, 72), (72, 72)])
            output = root / "flattened.pdf"

            result = flatten_to_image_pdf(source, output)

            self.assertEqual(result["operation"], "pdf.flatten_to_image_pdf")
            self.assertEqual(result["dpi"], FLATTEN_DPI)
            self.assertEqual(pdf_page_count(output), 2)
            self.assertFalse(PdfReader(str(output)).is_encrypted)


if __name__ == "__main__":
    unittest.main()
