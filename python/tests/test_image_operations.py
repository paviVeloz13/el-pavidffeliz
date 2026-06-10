from __future__ import annotations

import unittest
from tempfile import TemporaryDirectory
from pathlib import Path

from PIL import Image

from ilovepavidf_backend.errors import ValidationError
from ilovepavidf_backend.operations.image import (
    JPEG_QUALITY_LEVELS,
    convert_jpeg_to_png,
    convert_png_to_jpeg,
    images_to_pdf,
)
from helpers import create_jpeg, create_png, pdf_page_count


class ImageOperationTests(unittest.TestCase):
    def test_jpeg_to_png_writes_png_and_preserves_source(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_jpeg(root / "photo.jpg")
            source_bytes = source.read_bytes()
            output = root / "photo.png"

            result = convert_jpeg_to_png(source, output)

            self.assertEqual(result["operation"], "image.jpeg_to_png")
            self.assertEqual(result["output_paths"], [str(output)])
            self.assertEqual(source.read_bytes(), source_bytes)
            with Image.open(output) as image:
                self.assertEqual(image.format, "PNG")
                self.assertEqual(image.size, (32, 24))

    def test_png_to_jpeg_flattens_alpha_and_applies_quality_level(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_png(root / "badge.png")
            output = root / "badge.jpg"

            result = convert_png_to_jpeg(source, output, quality_level="high")

            self.assertEqual(result["operation"], "image.png_to_jpeg")
            self.assertEqual(result["quality"], JPEG_QUALITY_LEVELS["high"])
            with Image.open(output) as image:
                self.assertEqual(image.format, "JPEG")
                self.assertEqual(image.mode, "RGB")

    def test_png_to_jpeg_rejects_unknown_quality(self) -> None:
        with TemporaryDirectory() as tmp:
            source = create_png(Path(tmp) / "badge.png")

            with self.assertRaises(ValidationError):
                convert_png_to_jpeg(source, Path(tmp) / "badge.jpg", quality_level="tiny")

    def test_images_to_pdf_writes_one_page_per_image_in_order(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = create_jpeg(root / "first.jpg", size=(20, 30))
            second = create_png(root / "second.png", size=(40, 20))
            output = root / "images.pdf"

            result = images_to_pdf([first, second], output)

            self.assertEqual(result["operation"], "image.images_to_pdf")
            self.assertEqual(result["page_count"], 2)
            self.assertEqual(pdf_page_count(output), 2)
            self.assertEqual(result["sources"][0]["path"], str(first))
            self.assertEqual(result["sources"][1]["path"], str(second))


if __name__ == "__main__":
    unittest.main()
