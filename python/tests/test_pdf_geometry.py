from __future__ import annotations

import unittest

from pavidffeliz_backend.pdf.geometry import (
    PageGeometry,
    PdfBox,
    PreviewGeometry,
    build_preview_geometry_for_page,
    map_ui_point_to_pdf,
)


class PdfGeometryTests(unittest.TestCase):
    def assertPointAlmostEqual(self, point, x: float, y: float) -> None:  # noqa: N802
        self.assertAlmostEqual(point.x, x, places=5)
        self.assertAlmostEqual(point.y, y, places=5)

    def test_normal_page_y_axis_flip_and_scaling(self) -> None:
        page = PageGeometry(media_box=PdfBox(0, 0, 200, 100))
        preview = PreviewGeometry(1000, 500, 400, 200)

        self.assertPointAlmostEqual(map_ui_point_to_pdf(0, 0, page, preview), 0, 100)
        self.assertPointAlmostEqual(map_ui_point_to_pdf(400, 200, page, preview), 200, 0)
        self.assertPointAlmostEqual(map_ui_point_to_pdf(200, 100, page, preview), 100, 50)

    def test_non_zero_media_box_origin(self) -> None:
        page = PageGeometry(media_box=PdfBox(100, 200, 300, 300))
        preview = PreviewGeometry(1000, 500, 400, 200)

        self.assertPointAlmostEqual(map_ui_point_to_pdf(0, 0, page, preview), 100, 300)
        self.assertPointAlmostEqual(map_ui_point_to_pdf(400, 200, page, preview), 300, 200)

    def test_crop_box_is_used_as_visible_rendered_region(self) -> None:
        page = PageGeometry(
            media_box=PdfBox(0, 0, 400, 400),
            crop_box=PdfBox(50, 60, 250, 160),
        )
        preview = PreviewGeometry(1000, 500, 400, 200)

        self.assertPointAlmostEqual(map_ui_point_to_pdf(0, 0, page, preview), 50, 160)
        self.assertPointAlmostEqual(map_ui_point_to_pdf(400, 200, page, preview), 250, 60)

    def test_rotated_90_page_corner_matrix(self) -> None:
        page = PageGeometry(media_box=PdfBox(0, 0, 200, 100), rotate=90)
        preview = PreviewGeometry(500, 1000, 100, 200)

        self.assertPointAlmostEqual(map_ui_point_to_pdf(0, 0, page, preview), 0, 0)
        self.assertPointAlmostEqual(map_ui_point_to_pdf(100, 0, page, preview), 0, 100)
        self.assertPointAlmostEqual(map_ui_point_to_pdf(0, 200, page, preview), 200, 0)
        self.assertPointAlmostEqual(map_ui_point_to_pdf(100, 200, page, preview), 200, 100)

    def test_rotated_180_page_corner_matrix(self) -> None:
        page = PageGeometry(media_box=PdfBox(0, 0, 200, 100), rotate=180)
        preview = PreviewGeometry(1000, 500, 400, 200)

        self.assertPointAlmostEqual(map_ui_point_to_pdf(0, 0, page, preview), 200, 0)
        self.assertPointAlmostEqual(map_ui_point_to_pdf(400, 200, page, preview), 0, 100)

    def test_rotated_270_page_corner_matrix(self) -> None:
        page = PageGeometry(media_box=PdfBox(0, 0, 200, 100), rotate=270)
        preview = PreviewGeometry(500, 1000, 100, 200)

        self.assertPointAlmostEqual(map_ui_point_to_pdf(0, 0, page, preview), 200, 100)
        self.assertPointAlmostEqual(map_ui_point_to_pdf(100, 200, page, preview), 0, 0)

    def test_build_preview_geometry_uses_rotated_aspect_ratio(self) -> None:
        page = PageGeometry(media_box=PdfBox(0, 0, 200, 100), rotate=90)
        preview = build_preview_geometry_for_page(page, 500, 1000, 250)

        self.assertEqual(preview.display_width_px, 250)
        self.assertEqual(preview.display_height_px, 500)


if __name__ == "__main__":
    unittest.main()
