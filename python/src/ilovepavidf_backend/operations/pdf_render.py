"""Poppler/pdf2image-backed operations.

Every pdf2image call in this module passes an explicit bundled poppler_path.
There is no fallback to system PATH.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

from pdf2image import convert_from_path
from pdf2image.exceptions import PDFInfoNotInstalledError, PDFPageCountError, PDFPopplerTimeoutError, PDFSyntaxError
from PIL import Image
from pypdf import PdfReader

from ilovepavidf_backend.constants import (
    ALLOWED_RENDER_DPI,
    FLATTEN_DPI,
    MAX_JOINED_IMAGE_HEIGHT_PX,
    ORGANIZE_THUMBNAIL_DPI,
    PREVIEW_DPI,
)
from ilovepavidf_backend.errors import OperationError, ValidationError
from ilovepavidf_backend.operations.common import (
    ProgressEmitter,
    bool_param,
    file_result,
    int_param,
    noop_progress,
    require_input_file,
    require_output_dir,
    require_output_file,
    str_param,
)
from ilovepavidf_backend.runtime_paths import require_poppler_path

ImageFormat = Literal["jpeg", "png"]


def _validate_dpi(dpi: int) -> int:
    if dpi not in ALLOWED_RENDER_DPI:
        raise ValidationError("dpi must be one of 72, 150, or 300.", {"dpi": dpi, "allowed": list(ALLOWED_RENDER_DPI)})
    return dpi


def _open_reader(input_path: Path, password: str | None = None) -> PdfReader:
    try:
        reader = PdfReader(str(input_path), password=password)
    except Exception as exc:
        raise OperationError("Could not read PDF.", {"path": str(input_path), "error": str(exc)}) from exc

    if reader.is_encrypted:
        if not password:
            raise OperationError("PDF is encrypted and requires a password.", {"path": str(input_path)})
        try:
            decrypt_result = reader.decrypt(password)
        except Exception as exc:
            raise OperationError("Could not decrypt PDF.", {"path": str(input_path), "error": str(exc)}) from exc
        if decrypt_result == 0:
            raise OperationError("Incorrect PDF password.", {"path": str(input_path)})
    return reader


def _box_metadata(box: Any) -> dict[str, float]:
    left = float(box.left)
    bottom = float(box.bottom)
    right = float(box.right)
    top = float(box.top)
    return {
        "left": left,
        "bottom": bottom,
        "right": right,
        "top": top,
        "width": right - left,
        "height": top - bottom,
    }


def _page_metadata(reader: PdfReader, page_number: int) -> dict[str, Any]:
    page_count = len(reader.pages)
    if page_number < 1 or page_number > page_count:
        raise ValidationError("page_number is out of range.", {"page_number": page_number, "page_count": page_count})

    page = reader.pages[page_number - 1]
    media_box = _box_metadata(page.mediabox)
    crop_box = _box_metadata(page.cropbox)
    rotation = int(getattr(page, "rotation", 0) or 0) % 360
    visual_width = crop_box["height"] if rotation in {90, 270} else crop_box["width"]
    visual_height = crop_box["width"] if rotation in {90, 270} else crop_box["height"]
    return {
        "page_number": page_number,
        "page_count": page_count,
        "media_box": media_box,
        "crop_box": crop_box,
        "rotation": rotation,
        "visual_width_points": visual_width,
        "visual_height_points": visual_height,
    }


def _page_metadatas(input_path: Path, password: str | None = None) -> list[dict[str, Any]]:
    reader = _open_reader(input_path, password)
    return [_page_metadata(reader, page_number) for page_number in range(1, len(reader.pages) + 1)]


def _estimated_render_pixels(page_metadata: dict[str, Any], dpi: int) -> dict[str, int]:
    return {
        "width": round(float(page_metadata["visual_width_points"]) / 72 * dpi),
        "height": round(float(page_metadata["visual_height_points"]) / 72 * dpi),
    }


def _render_page(
    input_path: Path,
    page_number: int,
    *,
    dpi: int,
    image_format: ImageFormat,
    password: str | None = None,
) -> Image.Image:
    poppler_path = require_poppler_path()
    try:
        images = convert_from_path(
            input_path,
            dpi=dpi,
            first_page=page_number,
            last_page=page_number,
            fmt="jpeg" if image_format == "jpeg" else "png",
            userpw=password,
            poppler_path=str(poppler_path),
            use_cropbox=True,
            single_file=True,
        )
    except (PDFInfoNotInstalledError, PDFPageCountError) as exc:
        raise OperationError("Poppler could not inspect the PDF.", {"path": str(input_path), "error": str(exc)}) from exc
    except PDFPopplerTimeoutError as exc:
        raise OperationError("Poppler timed out while rendering the PDF.", {"path": str(input_path), "error": str(exc)}) from exc
    except PDFSyntaxError as exc:
        raise OperationError("PDF syntax error while rendering.", {"path": str(input_path), "error": str(exc)}) from exc
    except Exception as exc:
        raise OperationError("Could not render PDF page.", {"path": str(input_path), "page_number": page_number, "error": str(exc)}) from exc

    if len(images) != 1:
        raise OperationError("Expected one rendered page image.", {"path": str(input_path), "page_number": page_number})
    return images[0]


def _save_image(image: Image.Image, output_path: Path, image_format: ImageFormat) -> None:
    if image_format == "jpeg":
        converted = image.convert("RGB")
        try:
            converted.save(output_path, format="JPEG", quality=92, optimize=True)
        finally:
            converted.close()
    else:
        image.save(output_path, format="PNG")


def _separate_output_path(input_path: Path, output_dir: Path, page_number: int, image_format: ImageFormat) -> Path:
    suffix = "jpg" if image_format == "jpeg" else "png"
    return output_dir / f"{input_path.stem}_page_{page_number:03d}.{suffix}"


def _assert_joined_height_within_limit(page_metadatas: list[dict[str, Any]], dpi: int) -> dict[str, int]:
    estimated = [_estimated_render_pixels(page, dpi) for page in page_metadatas]
    total_height = sum(page["height"] for page in estimated)
    max_width = max(page["width"] for page in estimated)
    if total_height > MAX_JOINED_IMAGE_HEIGHT_PX:
        raise ValidationError(
            "Joined tall image would exceed the 10,000 px height limit.",
            {
                "estimated_height_px": total_height,
                "max_allowed_height_px": MAX_JOINED_IMAGE_HEIGHT_PX,
                "dpi": dpi,
            },
        )
    return {"estimated_width_px": max_width, "estimated_height_px": total_height}


def pdf_to_images(
    input_path: Path,
    *,
    image_format: ImageFormat,
    output_dir: Path | None = None,
    output_path: Path | None = None,
    dpi: int = 150,
    join: bool = False,
    overwrite: bool = False,
    password: str | None = None,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    dpi = _validate_dpi(dpi)
    page_metadatas = _page_metadatas(input_path, password)

    if join:
        if output_path is None:
            raise ValidationError("output_path is required when join is true.")
        output = require_output_file(str(output_path), input_path=input_path, overwrite=overwrite)
        join_estimate = _assert_joined_height_within_limit(page_metadatas, dpi)
        rendered_images: list[Image.Image] = []
        try:
            for index, page_metadata in enumerate(page_metadatas):
                page_number = int(page_metadata["page_number"])
                emit_progress(index / max(len(page_metadatas), 1), f"Rendering page {page_number}")
                rendered_images.append(_render_page(input_path, page_number, dpi=dpi, image_format=image_format, password=password))

            total_height = sum(image.height for image in rendered_images)
            if total_height > MAX_JOINED_IMAGE_HEIGHT_PX:
                raise ValidationError(
                    "Joined tall image exceeds the 10,000 px height limit.",
                    {"height_px": total_height, "max_allowed_height_px": MAX_JOINED_IMAGE_HEIGHT_PX},
                )
            max_width = max(image.width for image in rendered_images)
            mode = "RGB" if image_format == "jpeg" else "RGBA"
            background = (255, 255, 255) if image_format == "jpeg" else (255, 255, 255, 0)
            canvas = Image.new(mode, (max_width, total_height), background)
            y = 0
            for image in rendered_images:
                paste_image = image.convert(mode)
                try:
                    canvas.paste(paste_image, (0, y))
                    y += image.height
                finally:
                    paste_image.close()
            emit_progress(0.95, "Saving joined image")
            _save_image(canvas, output, image_format)
            canvas.close()
        finally:
            for image in rendered_images:
                image.close()

        emit_progress(1.0, "PDF rendered to joined image")
        result = file_result(f"pdf.to_{image_format}", [input_path], [output])
        result.update(
            {
                "dpi": dpi,
                "join": True,
                "page_count": len(page_metadatas),
                "format": image_format,
                "joined_image_limit": {"max_height_px": MAX_JOINED_IMAGE_HEIGHT_PX, **join_estimate},
            }
        )
        return result

    if output_dir is None:
        raise ValidationError("output_dir is required when join is false.")
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    for index, page_metadata in enumerate(page_metadatas):
        page_number = int(page_metadata["page_number"])
        emit_progress(index / max(len(page_metadatas), 1), f"Rendering page {page_number}")
        output = require_output_file(str(_separate_output_path(input_path, output_dir, page_number, image_format)), overwrite=overwrite)
        image = _render_page(input_path, page_number, dpi=dpi, image_format=image_format, password=password)
        try:
            _save_image(image, output, image_format)
        finally:
            image.close()
        outputs.append(output)

    emit_progress(1.0, "PDF rendered to separate images")
    result = file_result(f"pdf.to_{image_format}", [input_path], outputs)
    result.update({"dpi": dpi, "join": False, "page_count": len(page_metadatas), "format": image_format})
    return result


def render_preview_page(
    input_path: Path,
    output_path: Path,
    *,
    page_number: int,
    preview_kind: str = "edit",
    password: str | None = None,
    overwrite: bool = False,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    if preview_kind in {"edit", "sign"}:
        dpi = PREVIEW_DPI
    elif preview_kind == "organize":
        dpi = ORGANIZE_THUMBNAIL_DPI
    else:
        raise ValidationError("preview_kind must be edit, sign, or organize.", {"preview_kind": preview_kind})

    output = require_output_file(str(output_path), input_path=input_path, overwrite=overwrite)
    reader = _open_reader(input_path, password)
    page_metadata = _page_metadata(reader, page_number)

    emit_progress(0.2, f"Rendering preview page {page_number}")
    image = _render_page(input_path, page_number, dpi=dpi, image_format="png", password=password)
    try:
        image.save(output, format="PNG")
        pixel_dimensions = {"width": image.width, "height": image.height}
    finally:
        image.close()

    emit_progress(1.0, "Preview rendered")
    result = file_result("pdf.render_preview", [input_path], [output])
    result.update(
        {
            "page": page_metadata,
            "preview_kind": preview_kind,
            "dpi": dpi,
            "image": {"path": str(output), **pixel_dimensions},
            "scale_reference": {
                "image_width_px": pixel_dimensions["width"],
                "image_height_px": pixel_dimensions["height"],
                "visual_width_points": page_metadata["visual_width_points"],
                "visual_height_points": page_metadata["visual_height_points"],
            },
        }
    )
    return result


def flatten_to_image_pdf(
    input_path: Path,
    output_path: Path,
    *,
    password: str | None = None,
    overwrite: bool = False,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    output = require_output_file(str(output_path), input_path=input_path, overwrite=overwrite)
    page_metadatas = _page_metadatas(input_path, password)
    rendered_images: list[Image.Image] = []
    try:
        for index, page_metadata in enumerate(page_metadatas):
            page_number = int(page_metadata["page_number"])
            emit_progress(index / max(len(page_metadatas), 1), f"Rasterizing page {page_number}")
            rendered_page = _render_page(input_path, page_number, dpi=FLATTEN_DPI, image_format="jpeg", password=password)
            try:
                rendered_images.append(rendered_page.convert("RGB"))
            finally:
                rendered_page.close()
        if not rendered_images:
            raise ValidationError("PDF must contain at least one page.")
        emit_progress(0.9, "Writing flattened image PDF")
        first, rest = rendered_images[0], rendered_images[1:]
        first.save(output, format="PDF", save_all=True, append_images=rest)
    finally:
        for image in rendered_images:
            image.close()

    emit_progress(1.0, "PDF flattened to image PDF")
    result = file_result("pdf.flatten_to_image_pdf", [input_path], [output])
    result.update({"dpi": FLATTEN_DPI, "page_count": len(page_metadatas), "flattened": True})
    return result


def _render_params(params: dict[str, Any]) -> dict[str, Any]:
    join = bool_param(params, "join", False)
    return {
        "input_path": require_input_file(params.get("input_path")),
        "output_dir": require_output_dir(params.get("output_dir")) if not join else None,
        "output_path": require_output_file(params.get("output_path"), overwrite=bool_param(params, "overwrite", False)) if join else None,
        "dpi": int_param(params, "dpi", 150),
        "join": join,
        "overwrite": bool_param(params, "overwrite", False),
        "password": params.get("password"),
    }


def handle_pdf_to_jpeg(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return pdf_to_images(image_format="jpeg", emit_progress=emit_progress, **_render_params(params))


def handle_pdf_to_png(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return pdf_to_images(image_format="png", emit_progress=emit_progress, **_render_params(params))


def handle_render_preview(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return render_preview_page(
        require_input_file(params.get("input_path")),
        require_output_file(params.get("output_path"), overwrite=bool_param(params, "overwrite", False)),
        page_number=int_param(params, "page_number"),
        preview_kind=str_param(params, "preview_kind", "edit"),
        password=params.get("password"),
        overwrite=True,
        emit_progress=emit_progress,
    )


def handle_flatten_to_image_pdf(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return flatten_to_image_pdf(
        require_input_file(params.get("input_path")),
        require_output_file(params.get("output_path"), overwrite=bool_param(params, "overwrite", False)),
        password=params.get("password"),
        overwrite=True,
        emit_progress=emit_progress,
    )
