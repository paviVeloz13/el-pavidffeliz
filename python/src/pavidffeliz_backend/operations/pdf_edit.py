"""PDF editing: text boxes, highlights, and strikethroughs via reportlab overlays."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from reportlab.lib.colors import Color
from reportlab.pdfgen import canvas as rl_canvas
from pypdf import PdfReader, PdfWriter

from pavidffeliz_backend.errors import OperationError, ValidationError
from pavidffeliz_backend.operations.common import (
    ProgressEmitter,
    bool_param,
    file_result,
    noop_progress,
    require_input_file,
    require_output_file,
)

VALID_TYPES = {"text_box", "highlight", "strikethrough"}

_DEFAULT_COLOR: dict[str, list[float]] = {
    "highlight": [1.0, 1.0, 0.0],
    "strikethrough": [1.0, 0.0, 0.0],
    "text_box": [0.0, 0.0, 0.0],
}


def _parse_annotation(ann: Any, idx: int) -> dict:
    if not isinstance(ann, dict):
        raise ValidationError(f"Annotation {idx} must be an object.")

    ann_type = ann.get("type")
    if ann_type not in VALID_TYPES:
        raise ValidationError(f"Annotation {idx}: type must be one of {sorted(VALID_TYPES)}.")

    page = ann.get("page", 1)
    if not isinstance(page, int) or page < 1:
        raise ValidationError(f"Annotation {idx}: page must be a positive integer.")

    for field in ("x_pt", "y_pt", "width_pt", "height_pt"):
        val = ann.get(field, 0)
        if not isinstance(val, (int, float)):
            raise ValidationError(f"Annotation {idx}: {field} must be a number.")

    color = ann.get("color", _DEFAULT_COLOR[ann_type])
    if not isinstance(color, list) or len(color) != 3:
        raise ValidationError(f"Annotation {idx}: color must be an [R, G, B] array.")

    result: dict[str, Any] = {
        "type": ann_type,
        "page": int(page),
        "x_pt": float(ann.get("x_pt", 0)),
        "y_pt": float(ann.get("y_pt", 0)),
        "width_pt": float(ann.get("width_pt", 50)),
        "height_pt": float(ann.get("height_pt", 20)),
        "color": [float(c) for c in color],
    }

    if ann_type == "text_box":
        text = ann.get("text", "")
        if not isinstance(text, str):
            raise ValidationError(f"Annotation {idx}: text must be a string.")
        result["text"] = text
        result["font_size"] = float(ann.get("font_size", 11.0))

    return result


def _draw_annotation(c: rl_canvas.Canvas, ann: dict) -> None:
    ann_type = ann["type"]
    x, y = ann["x_pt"], ann["y_pt"]
    w, h = ann["width_pt"], ann["height_pt"]
    r, g, b = ann["color"]

    c.saveState()

    if ann_type == "highlight":
        c.setFillColor(Color(r, g, b, alpha=0.35))
        c.rect(x, y, w, h, fill=1, stroke=0)

    elif ann_type == "strikethrough":
        c.setStrokeColor(Color(r, g, b, alpha=1.0))
        c.setLineWidth(1.5)
        c.line(x, y + h / 2, x + w, y + h / 2)

    elif ann_type == "text_box":
        font_size = ann.get("font_size", 11.0)
        c.setFillColor(Color(1.0, 1.0, 0.88, alpha=0.92))
        c.setStrokeColor(Color(r, g, b, alpha=0.8))
        c.setLineWidth(1)
        c.rect(x, y, w, h, fill=1, stroke=1)

        c.setFillColor(Color(r, g, b, alpha=1.0))
        c.setFont("Helvetica", font_size)
        max_text_w = w - 8
        words = ann.get("text", "").split()
        lines: list[str] = []
        line = ""
        for word in words:
            test = (line + " " + word).strip() if line else word
            if c.stringWidth(test, "Helvetica", font_size) <= max_text_w:
                line = test
            else:
                if line:
                    lines.append(line)
                line = word
        if line:
            lines.append(line)

        cursor_y = y + h - font_size - 3
        for ltext in lines:
            if cursor_y < y + 2:
                break
            c.drawString(x + 4, cursor_y, ltext)
            cursor_y -= font_size + 1

    c.restoreState()


def apply_pdf_annotations(
    input_path: Path,
    output_path: Path,
    annotations: list[dict],
    *,
    overwrite: bool = False,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    try:
        reader = PdfReader(str(input_path))
    except Exception as exc:
        raise OperationError("Could not read PDF.", {"path": str(input_path), "error": str(exc)}) from exc

    page_count = len(reader.pages)
    parsed = [_parse_annotation(ann, i) for i, ann in enumerate(annotations)]
    for ann in parsed:
        if ann["page"] > page_count:
            raise ValidationError(
                f"Annotation references page {ann['page']} but PDF has {page_count} pages."
            )

    by_page: dict[int, list[dict]] = {}
    for ann in parsed:
        by_page.setdefault(ann["page"], []).append(ann)

    emit_progress(0.1, "Preparing overlays")
    writer = PdfWriter()

    for i, page in enumerate(reader.pages):
        page_num = i + 1
        emit_progress(0.1 + 0.8 * (i / page_count), f"Processing page {page_num}")

        page_anns = by_page.get(page_num)
        if page_anns:
            page_w = float(page.mediabox.width)
            page_h = float(page.mediabox.height)

            buf = io.BytesIO()
            c = rl_canvas.Canvas(buf, pagesize=(page_w, page_h))
            for ann in page_anns:
                _draw_annotation(c, ann)
            c.save()
            buf.seek(0)

            overlay_reader = PdfReader(buf)
            page.merge_page(overlay_reader.pages[0])

        writer.add_page(page)

    emit_progress(0.9, "Writing output")
    with open(str(output_path), "wb") as f:
        writer.write(f)

    emit_progress(1.0, "Done")
    result = file_result("pdf.apply_annotations", [input_path], [output_path])
    result["annotation_count"] = len(parsed)
    return result


def handle_apply_annotations(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    input_path = require_input_file(params.get("input_path"))
    output_path = require_output_file(
        params.get("output_path"),
        input_path=input_path,
        overwrite=bool_param(params, "overwrite", False),
    )

    annotations = params.get("annotations", [])
    if not isinstance(annotations, list) or not annotations:
        raise ValidationError("annotations must be a non-empty array.")

    return apply_pdf_annotations(
        input_path,
        output_path,
        annotations,
        overwrite=bool_param(params, "overwrite", False),
        emit_progress=emit_progress,
    )
