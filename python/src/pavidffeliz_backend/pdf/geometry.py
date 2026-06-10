"""Coordinate mapping from rendered page previews to PDF user space.

The functions here intentionally model the edge cases called out in spec v0.2:
display scaling, Y-axis flip, page /Rotate, non-zero MediaBox origins, and
CropBox-vs-MediaBox offsets.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PdfBox:
    left: float
    bottom: float
    right: float
    top: float

    def __post_init__(self) -> None:
        if self.right <= self.left:
            raise ValueError("PdfBox right must be greater than left.")
        if self.top <= self.bottom:
            raise ValueError("PdfBox top must be greater than bottom.")

    @property
    def width(self) -> float:
        return self.right - self.left

    @property
    def height(self) -> float:
        return self.top - self.bottom


@dataclass(frozen=True)
class PageGeometry:
    media_box: PdfBox
    crop_box: PdfBox | None = None
    rotate: int = 0

    @property
    def visible_box(self) -> PdfBox:
        return self.crop_box or self.media_box

    @property
    def normalized_rotation(self) -> int:
        rotation = self.rotate % 360
        if rotation not in {0, 90, 180, 270}:
            raise ValueError("PDF rotation must normalize to 0, 90, 180, or 270 degrees.")
        return rotation

    @property
    def visual_width_points(self) -> float:
        box = self.visible_box
        if self.normalized_rotation in {90, 270}:
            return box.height
        return box.width

    @property
    def visual_height_points(self) -> float:
        box = self.visible_box
        if self.normalized_rotation in {90, 270}:
            return box.width
        return box.height


@dataclass(frozen=True)
class PreviewGeometry:
    image_width_px: float
    image_height_px: float
    display_width_px: float
    display_height_px: float

    def __post_init__(self) -> None:
        for field_name in ("image_width_px", "image_height_px", "display_width_px", "display_height_px"):
            if getattr(self, field_name) <= 0:
                raise ValueError(f"{field_name} must be greater than zero.")

    @property
    def display_scale_x(self) -> float:
        return self.display_width_px / self.image_width_px

    @property
    def display_scale_y(self) -> float:
        return self.display_height_px / self.image_height_px


@dataclass(frozen=True)
class PdfPoint:
    x: float
    y: float


def map_ui_point_to_pdf(
    ui_x_px: float,
    ui_y_px: float,
    page: PageGeometry,
    preview: PreviewGeometry,
) -> PdfPoint:
    """Map a top-left-origin UI point to PDF user-space coordinates."""

    visual_x_pt = (ui_x_px / preview.display_width_px) * page.visual_width_points
    visual_y_top_pt = (ui_y_px / preview.display_height_px) * page.visual_height_points

    box = page.visible_box
    rotation = page.normalized_rotation

    if rotation == 0:
        relative_x = visual_x_pt
        relative_y = box.height - visual_y_top_pt
    elif rotation == 90:
        relative_x = visual_y_top_pt
        relative_y = visual_x_pt
    elif rotation == 180:
        relative_x = box.width - visual_x_pt
        relative_y = visual_y_top_pt
    else:
        relative_x = box.width - visual_y_top_pt
        relative_y = box.height - visual_x_pt

    return PdfPoint(x=box.left + relative_x, y=box.bottom + relative_y)


def build_preview_geometry_for_page(
    page: PageGeometry,
    image_width_px: float,
    image_height_px: float,
    display_width_px: float,
) -> PreviewGeometry:
    """Create preview geometry using the page aspect ratio for display height."""

    display_height_px = display_width_px * (page.visual_height_points / page.visual_width_points)
    return PreviewGeometry(
        image_width_px=image_width_px,
        image_height_px=image_height_px,
        display_width_px=display_width_px,
        display_height_px=display_height_px,
    )
