"""Persistent NDJSON worker used by the Electron main process."""

from __future__ import annotations

import sys
from collections.abc import Callable
from typing import TextIO
from typing import Any

from .errors import AppError, ProtocolError, UnknownOperationError
from .operations.health import handle_health
from .operations.image import handle_images_to_pdf, handle_jpeg_to_png, handle_png_to_jpeg
from .operations.pdf_render import (
    handle_flatten_to_image_pdf,
    handle_pdf_to_jpeg,
    handle_pdf_to_png,
    handle_render_preview,
)
from .operations.pdf_overlay import handle_apply_signature, handle_clean_signature
from .operations.pdf_structure import (
    handle_delete_pages,
    handle_lock,
    handle_merge,
    handle_reorder,
    handle_split_every_n,
    handle_split_individual,
    handle_split_ranges,
    handle_unlock,
)
from .operations.common import ProgressEmitter
from .protocol import Command, encode_event, error_response, ok_response, parse_command_line, progress_response

OperationHandler = Callable[[dict[str, Any], ProgressEmitter], dict[str, Any]]

OPERATIONS: dict[str, OperationHandler] = {
    "health": handle_health,
    "image.jpeg_to_png": handle_jpeg_to_png,
    "image.png_to_jpeg": handle_png_to_jpeg,
    "image.images_to_pdf": handle_images_to_pdf,
    "pdf.to_jpeg": handle_pdf_to_jpeg,
    "pdf.to_png": handle_pdf_to_png,
    "pdf.render_preview": handle_render_preview,
    "pdf.flatten_to_image_pdf": handle_flatten_to_image_pdf,
    "pdf.merge": handle_merge,
    "pdf.split_ranges": handle_split_ranges,
    "pdf.split_every_n": handle_split_every_n,
    "pdf.split_individual": handle_split_individual,
    "pdf.reorder": handle_reorder,
    "pdf.delete_pages": handle_delete_pages,
    "pdf.lock": handle_lock,
    "pdf.unlock": handle_unlock,
    "image.clean_signature": handle_clean_signature,
    "pdf.apply_signature": handle_apply_signature,
}


def dispatch(command: Command, emit_progress: ProgressEmitter | None = None) -> dict[str, Any]:
    handler = OPERATIONS.get(command.action)
    if handler is None:
        raise UnknownOperationError(command.action)
    progress = emit_progress or (lambda progress_value, message=None: None)
    return ok_response(command.command_id, handler(command.params, progress))


def run(input_stream: TextIO | None = None, output_stream: TextIO | None = None) -> int:
    input_stream = input_stream or sys.stdin
    output_stream = output_stream or sys.stdout

    for raw_line in input_stream:
        command_id: str | None = None
        try:
            command = parse_command_line(raw_line)
            command_id = command.command_id
            def emit_progress(progress_value: float, message: str | None = None) -> None:
                output_stream.write(encode_event(progress_response(command.command_id, progress_value, message)))
                output_stream.flush()

            event = dispatch(command, emit_progress)
        except ProtocolError as exc:
            event = error_response(command_id, exc)
        except AppError as exc:
            event = error_response(command_id, exc)
        except Exception as exc:  # Defensive boundary for the persistent worker.
            event = error_response(command_id, exc)

        output_stream.write(encode_event(event))
        output_stream.flush()

    return 0


def main() -> int:
    return run()
