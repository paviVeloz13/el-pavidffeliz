"""Overlay operations: signature cleanup and PDF signature stamping."""

from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Any

from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from pypdf import PdfReader, PdfWriter

from pavidffeliz_backend.errors import OperationError, ValidationError
from pavidffeliz_backend.operations.common import (
    ProgressEmitter,
    bool_param,
    file_result,
    float_param,
    int_param,
    noop_progress,
    require_input_file,
    require_output_file,
    str_param,
)


def _data_url_to_image(data_url: str) -> Image.Image:
    if "," not in data_url:
        raise ValidationError("signature_data_url must be a valid data URL.")
    _, encoded = data_url.split(",", 1)
    try:
        raw = base64.b64decode(encoded)
    except Exception as exc:
        raise ValidationError("signature_data_url contains invalid base64.") from exc
    return Image.open(io.BytesIO(raw))


def _image_to_data_url(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def clean_signature_image(data_url: str) -> str:
    """Luminance-based alpha: dark strokes stay opaque, light areas become transparent."""
    try:
        img = _data_url_to_image(data_url).convert("RGBA")
    except Exception as exc:
        raise OperationError("Could not decode signature image.", {"error": str(exc)}) from exc

    r, g, b, _a = img.split()
    lum = Image.merge("RGB", (r, g, b)).convert("L")
    # Dark pixels (low luminance) get high alpha; white/light get alpha = 0
    alpha = lum.point(lambda v: max(0, 255 - v))
    img.putalpha(alpha)
    return _image_to_data_url(img)


def apply_signature_overlay(
    input_path: Path,
    output_path: Path,
    *,
    page_number: int,
    signature_data_url: str,
    x_pt: float,
    y_pt: float,
    width_pt: float,
    overwrite: bool = False,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    output = require_output_file(str(output_path), input_path=input_path, overwrite=overwrite)

    try:
        reader = PdfReader(str(input_path))
    except Exception as exc:
        raise OperationError("Could not read PDF.", {"path": str(input_path), "error": str(exc)}) from exc

    page_count = len(reader.pages)
    if page_number < 1 or page_number > page_count:
        raise ValidationError("page_number is out of range.", {"page_number": page_number, "page_count": page_count})

    page = reader.pages[page_number - 1]
    page_w = float(page.mediabox.width)
    page_h = float(page.mediabox.height)

    emit_progress(0.1, "Decoding signature")
    try:
        sig_img = _data_url_to_image(signature_data_url).convert("RGBA")
    except Exception as exc:
        raise OperationError("Could not decode signature image.", {"error": str(exc)}) from exc

    # Maintain aspect ratio
    sig_w, sig_h = sig_img.size
    if sig_w == 0 or sig_h == 0:
        raise ValidationError("Signature image has zero dimensions.")
    height_pt = width_pt * (sig_h / sig_w)

    emit_progress(0.3, "Creating overlay")
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(page_w, page_h))
    sig_buf = io.BytesIO()
    sig_img.save(sig_buf, format="PNG")
    sig_buf.seek(0)
    c.drawImage(ImageReader(sig_buf), x_pt, y_pt, width=width_pt, height=height_pt, mask="auto")
    c.save()
    buf.seek(0)

    emit_progress(0.6, "Stamping signature onto page")
    overlay_reader = PdfReader(buf)
    writer = PdfWriter()
    for i, orig_page in enumerate(reader.pages):
        if i == page_number - 1:
            orig_page.merge_page(overlay_reader.pages[0])
        writer.add_page(orig_page)

    emit_progress(0.9, "Writing output")
    with open(str(output), "wb") as f:
        writer.write(f)

    emit_progress(1.0, "Signature applied")
    result = file_result("pdf.apply_signature", [input_path], [output])
    result.update({"page_number": page_number, "placement": {"x_pt": x_pt, "y_pt": y_pt, "width_pt": width_pt, "height_pt": height_pt}})
    return result


def handle_clean_signature(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    data_url = str_param(params, "signature_data_url")
    if not data_url:
        raise ValidationError("signature_data_url is required.")
    cleaned = clean_signature_image(data_url)
    return {"cleaned_data_url": cleaned}


def handle_apply_signature(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return apply_signature_overlay(
        require_input_file(params.get("input_path")),
        require_output_file(params.get("output_path"), overwrite=bool_param(params, "overwrite", False)),
        page_number=int_param(params, "page_number", 1),
        signature_data_url=str_param(params, "signature_data_url"),
        x_pt=float_param(params, "x_pt", 0.0),
        y_pt=float_param(params, "y_pt", 0.0),
        width_pt=float_param(params, "width_pt", 150.0),
        overwrite=bool_param(params, "overwrite", False),
        emit_progress=emit_progress,
    )
