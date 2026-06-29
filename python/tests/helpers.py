from __future__ import annotations

from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter


def create_jpeg(path: Path, size: tuple[int, int] = (32, 24), color: tuple[int, int, int] = (180, 40, 30)) -> Path:
    image = Image.new("RGB", size, color)
    image.save(path, format="JPEG", quality=90)
    return path


def create_png(
    path: Path,
    size: tuple[int, int] = (32, 24),
    color: tuple[int, int, int, int] = (30, 120, 220, 180),
) -> Path:
    image = Image.new("RGBA", size, color)
    image.save(path, format="PNG")
    return path


def create_webp(
    path: Path,
    size: tuple[int, int] = (32, 24),
    color: tuple[int, int, int, int] = (70, 150, 60, 180),
) -> Path:
    image = Image.new("RGBA", size, color)
    image.save(path, format="WEBP", quality=90)
    return path


def create_blank_pdf(path: Path, page_sizes: list[tuple[int, int]]) -> Path:
    writer = PdfWriter()
    for width, height in page_sizes:
        writer.add_blank_page(width=width, height=height)
    with path.open("wb") as output_file:
        writer.write(output_file)
    return path


def pdf_page_count(path: Path, password: str | None = None) -> int:
    reader = PdfReader(str(path))
    if reader.is_encrypted and password:
        reader.decrypt(password)
    return len(reader.pages)


def pdf_page_widths(path: Path) -> list[int]:
    reader = PdfReader(str(path))
    return [int(page.mediabox.width) for page in reader.pages]
