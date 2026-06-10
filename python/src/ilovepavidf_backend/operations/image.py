"""Core image operations that do not require Poppler."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

from ilovepavidf_backend.errors import OperationError, ValidationError
from ilovepavidf_backend.operations.common import (
    ProgressEmitter,
    bool_param,
    file_result,
    noop_progress,
    require_input_file,
    require_input_files,
    require_output_file,
    str_param,
)

JPEG_QUALITY_LEVELS = {
    "low": 55,
    "medium": 75,
    "high": 92,
}

SUPPORTED_IMAGE_TO_PDF_FORMATS = {"JPEG", "PNG"}


def _open_image(path: Path) -> Image.Image:
    try:
        image = Image.open(path)
        image.load()
        return image
    except UnidentifiedImageError as exc:
        raise OperationError("Input file is not a supported image.", {"path": str(path)}) from exc
    except OSError as exc:
        raise OperationError("Could not read image file.", {"path": str(path), "error": str(exc)}) from exc


def _flatten_to_rgb(image: Image.Image, background: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        canvas = Image.new("RGBA", rgba.size, background + (255,))
        canvas.alpha_composite(rgba)
        return canvas.convert("RGB")
    if image.mode != "RGB":
        return image.convert("RGB")
    return image.copy()


def _image_metadata(image: Image.Image) -> dict[str, Any]:
    return {
        "width": image.width,
        "height": image.height,
        "mode": image.mode,
        "format": image.format,
    }


def convert_jpeg_to_png(
    input_path: Path,
    output_path: Path | None = None,
    *,
    overwrite: bool = False,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    emit_progress(0.05, "Opening JPEG")
    output = require_output_file(output_path and str(output_path), input_path=input_path, default_suffix=".png", overwrite=overwrite)

    image = _open_image(input_path)
    if image.format != "JPEG":
        raise ValidationError("Input image must be JPEG.", {"path": str(input_path), "format": image.format})

    emit_progress(0.55, "Saving PNG")
    image.save(output, format="PNG")
    emit_progress(1.0, "JPEG converted to PNG")

    result = file_result("image.jpeg_to_png", [input_path], [output])
    result["image"] = _image_metadata(image)
    return result


def convert_png_to_jpeg(
    input_path: Path,
    output_path: Path | None = None,
    *,
    quality_level: str = "medium",
    overwrite: bool = False,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    if quality_level not in JPEG_QUALITY_LEVELS:
        raise ValidationError(
            "quality_level must be one of low, medium, or high.",
            {"quality_level": quality_level, "allowed": list(JPEG_QUALITY_LEVELS)},
        )

    emit_progress(0.05, "Opening PNG")
    output = require_output_file(output_path and str(output_path), input_path=input_path, default_suffix=".jpg", overwrite=overwrite)

    image = _open_image(input_path)
    if image.format != "PNG":
        raise ValidationError("Input image must be PNG.", {"path": str(input_path), "format": image.format})

    emit_progress(0.55, "Flattening transparency")
    rgb_image = _flatten_to_rgb(image)
    quality = JPEG_QUALITY_LEVELS[quality_level]
    rgb_image.save(output, format="JPEG", quality=quality, optimize=True)
    emit_progress(1.0, "PNG converted to JPEG")

    result = file_result("image.png_to_jpeg", [input_path], [output])
    result["image"] = _image_metadata(image)
    result["quality_level"] = quality_level
    result["quality"] = quality
    return result


def images_to_pdf(
    input_paths: list[Path],
    output_path: Path,
    *,
    overwrite: bool = False,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    output = require_output_file(str(output_path), overwrite=overwrite)
    pdf_images: list[Image.Image] = []
    source_metadata: list[dict[str, Any]] = []

    try:
        for index, path in enumerate(input_paths):
            emit_progress(index / max(len(input_paths), 1), f"Opening image {index + 1} of {len(input_paths)}")
            image = _open_image(path)
            if image.format not in SUPPORTED_IMAGE_TO_PDF_FORMATS:
                raise ValidationError(
                    "Images to PDF supports JPEG and PNG inputs only.",
                    {"path": str(path), "format": image.format},
                )
            source_metadata.append({"path": str(path), **_image_metadata(image)})
            pdf_images.append(_flatten_to_rgb(image))

        if not pdf_images:
            raise ValidationError("At least one image is required.")

        emit_progress(0.85, "Writing PDF")
        first, rest = pdf_images[0], pdf_images[1:]
        first.save(output, format="PDF", save_all=True, append_images=rest)
        emit_progress(1.0, "Images converted to PDF")
    finally:
        for image in pdf_images:
            image.close()

    result = file_result("image.images_to_pdf", input_paths, [output])
    result["page_count"] = len(input_paths)
    result["sources"] = source_metadata
    return result


def handle_jpeg_to_png(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    input_path = require_input_file(params.get("input_path"))
    output_value = params.get("output_path")
    output_path = Path(output_value).expanduser() if output_value is not None else None
    return convert_jpeg_to_png(
        input_path,
        output_path,
        overwrite=bool_param(params, "overwrite", False),
        emit_progress=emit_progress,
    )


def handle_png_to_jpeg(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    input_path = require_input_file(params.get("input_path"))
    output_value = params.get("output_path")
    output_path = Path(output_value).expanduser() if output_value is not None else None
    return convert_png_to_jpeg(
        input_path,
        output_path,
        quality_level=str_param(params, "quality_level", "medium"),
        overwrite=bool_param(params, "overwrite", False),
        emit_progress=emit_progress,
    )


def handle_images_to_pdf(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    input_paths = require_input_files(params.get("input_paths"))
    output_path = require_output_file(params.get("output_path"), overwrite=bool_param(params, "overwrite", False))
    return images_to_pdf(
        input_paths,
        output_path,
        overwrite=True,
        emit_progress=emit_progress,
    )
