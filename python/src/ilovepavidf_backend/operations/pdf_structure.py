"""Core pypdf operations that do not require Poppler."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pypdf import PdfReader, PdfWriter

from ilovepavidf_backend.errors import OperationError, ValidationError
from ilovepavidf_backend.operations.common import (
    ProgressEmitter,
    bool_param,
    file_result,
    int_param,
    noop_progress,
    require_input_file,
    require_input_files,
    require_output_dir,
    require_output_file,
    str_param,
)


@dataclass(frozen=True)
class PageRange:
    label: str
    pages: tuple[int, ...]


def _open_reader(input_path: Path, password: str | None = None) -> PdfReader:
    try:
        reader = PdfReader(str(input_path))
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


def _write_pdf(writer: PdfWriter, output_path: Path) -> None:
    try:
        with output_path.open("wb") as output_file:
            writer.write(output_file)
    except Exception as exc:
        raise OperationError("Could not write PDF.", {"path": str(output_path), "error": str(exc)}) from exc


def _page_count(reader: PdfReader) -> int:
    return len(reader.pages)


def _validate_page_number(page: int, page_count: int) -> int:
    if page < 1 or page > page_count:
        raise ValidationError("Page number is out of range.", {"page": page, "page_count": page_count})
    return page


def _parse_range_token(token: str, page_count: int) -> PageRange:
    normalized = token.strip().replace(" ", "")
    if not normalized:
        raise ValidationError("Page range cannot be empty.")

    if "-" in normalized:
        start_text, end_text = normalized.split("-", 1)
        if not start_text.isdigit() or not end_text.isdigit():
            raise ValidationError("Page range bounds must be integers.", {"range": token})
        start = _validate_page_number(int(start_text), page_count)
        end = _validate_page_number(int(end_text), page_count)
        if end < start:
            raise ValidationError("Page range end must be greater than or equal to start.", {"range": token})
        pages = tuple(range(start, end + 1))
        return PageRange(label=f"{start}-{end}", pages=pages)

    if not normalized.isdigit():
        raise ValidationError("Page range must be an integer or start-end range.", {"range": token})
    page = _validate_page_number(int(normalized), page_count)
    return PageRange(label=str(page), pages=(page,))


def parse_page_ranges(ranges: Any, page_count: int) -> list[PageRange]:
    if isinstance(ranges, str):
        tokens = ranges.split(",")
    elif isinstance(ranges, list):
        tokens = [str(item) for item in ranges]
    else:
        raise ValidationError("ranges must be a comma-separated string or list.", {"ranges": ranges})

    parsed = [_parse_range_token(token, page_count) for token in tokens]
    if not parsed:
        raise ValidationError("At least one page range is required.")
    return parsed


def _write_selected_pages(reader: PdfReader, pages: tuple[int, ...], output_path: Path) -> None:
    writer = PdfWriter()
    for page_number in pages:
        writer.add_page(reader.pages[page_number - 1])
    _write_pdf(writer, output_path)


def _range_output_path(input_path: Path, output_dir: Path, label: str) -> Path:
    safe_label = label.replace(",", "_").replace(" ", "")
    return output_dir / f"{input_path.stem}_pages_{safe_label}.pdf"


def merge_pdfs(
    input_paths: list[Path],
    output_path: Path,
    *,
    overwrite: bool = False,
    password: str | None = None,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    output = require_output_file(str(output_path), overwrite=overwrite)
    writer = PdfWriter()
    total_pages = 0

    for index, input_path in enumerate(input_paths):
        emit_progress(index / max(len(input_paths), 1), f"Adding PDF {index + 1} of {len(input_paths)}")
        reader = _open_reader(input_path, password)
        total_pages += _page_count(reader)
        for page in reader.pages:
            writer.add_page(page)

    emit_progress(0.9, "Writing merged PDF")
    _write_pdf(writer, output)
    emit_progress(1.0, "PDFs merged")

    result = file_result("pdf.merge", input_paths, [output])
    result["page_count"] = total_pages
    return result


def split_pdf_by_ranges(
    input_path: Path,
    output_dir: Path,
    ranges: Any,
    *,
    overwrite: bool = False,
    password: str | None = None,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    reader = _open_reader(input_path, password)
    parsed_ranges = parse_page_ranges(ranges, _page_count(reader))
    outputs: list[Path] = []

    for index, page_range in enumerate(parsed_ranges):
        emit_progress(index / max(len(parsed_ranges), 1), f"Writing page range {page_range.label}")
        output_path = _range_output_path(input_path, output_dir, page_range.label)
        output = require_output_file(str(output_path), overwrite=overwrite)
        _write_selected_pages(reader, page_range.pages, output)
        outputs.append(output)

    emit_progress(1.0, "PDF split by ranges")
    result = file_result("pdf.split_ranges", [input_path], outputs)
    result["ranges"] = [{"label": item.label, "pages": list(item.pages)} for item in parsed_ranges]
    return result


def split_pdf_every_n_pages(
    input_path: Path,
    output_dir: Path,
    pages_per_file: int,
    *,
    overwrite: bool = False,
    password: str | None = None,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    if pages_per_file <= 0:
        raise ValidationError("pages_per_file must be greater than zero.", {"pages_per_file": pages_per_file})

    reader = _open_reader(input_path, password)
    page_count = _page_count(reader)
    ranges = [
        PageRange(
            label=f"{start}-{min(start + pages_per_file - 1, page_count)}",
            pages=tuple(range(start, min(start + pages_per_file - 1, page_count) + 1)),
        )
        for start in range(1, page_count + 1, pages_per_file)
    ]
    result = split_pdf_by_ranges(
        input_path,
        output_dir,
        [page_range.label for page_range in ranges],
        overwrite=overwrite,
        password=password,
        emit_progress=emit_progress,
    )
    result["operation"] = "pdf.split_every_n"
    result["pages_per_file"] = pages_per_file
    return result


def split_pdf_individual_pages(
    input_path: Path,
    output_dir: Path,
    *,
    overwrite: bool = False,
    password: str | None = None,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    reader = _open_reader(input_path, password)
    page_count = _page_count(reader)
    del reader
    result = split_pdf_by_ranges(
        input_path,
        output_dir,
        [str(page) for page in range(1, page_count + 1)],
        overwrite=overwrite,
        password=password,
        emit_progress=emit_progress,
    )
    result["operation"] = "pdf.split_individual"
    return result


def reorder_pdf(
    input_path: Path,
    output_path: Path,
    page_order: list[int],
    *,
    overwrite: bool = False,
    password: str | None = None,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    output = require_output_file(str(output_path), input_path=input_path, overwrite=overwrite)
    reader = _open_reader(input_path, password)
    page_count = _page_count(reader)
    if sorted(page_order) != list(range(1, page_count + 1)):
        raise ValidationError(
            "page_order must contain each page exactly once.",
            {"page_order": page_order, "page_count": page_count},
        )

    writer = PdfWriter()
    for index, page_number in enumerate(page_order):
        emit_progress(index / max(page_count, 1), f"Adding page {page_number}")
        writer.add_page(reader.pages[page_number - 1])

    _write_pdf(writer, output)
    emit_progress(1.0, "PDF pages reordered")

    result = file_result("pdf.reorder", [input_path], [output])
    result["page_order"] = page_order
    result["page_count"] = page_count
    return result


def delete_pdf_pages(
    input_path: Path,
    output_path: Path,
    pages: Any,
    *,
    overwrite: bool = False,
    password: str | None = None,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    output = require_output_file(str(output_path), input_path=input_path, overwrite=overwrite)
    reader = _open_reader(input_path, password)
    page_count = _page_count(reader)
    ranges = parse_page_ranges(pages, page_count)
    pages_to_delete = {page for page_range in ranges for page in page_range.pages}
    if len(pages_to_delete) >= page_count:
        raise ValidationError("Cannot delete every page in a PDF.", {"page_count": page_count})

    writer = PdfWriter()
    kept_pages: list[int] = []
    for page_number in range(1, page_count + 1):
        if page_number in pages_to_delete:
            continue
        emit_progress(len(kept_pages) / max(page_count - len(pages_to_delete), 1), f"Keeping page {page_number}")
        writer.add_page(reader.pages[page_number - 1])
        kept_pages.append(page_number)

    _write_pdf(writer, output)
    emit_progress(1.0, "PDF pages deleted")

    result = file_result("pdf.delete_pages", [input_path], [output])
    result["deleted_pages"] = sorted(pages_to_delete)
    result["kept_pages"] = kept_pages
    result["page_count"] = len(kept_pages)
    return result


def lock_pdf(
    input_path: Path,
    output_path: Path,
    user_password: str,
    *,
    owner_password: str | None = None,
    input_password: str | None = None,
    overwrite: bool = False,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    output = require_output_file(str(output_path), input_path=input_path, overwrite=overwrite)
    reader = _open_reader(input_path, input_password)
    writer = PdfWriter()

    for index, page in enumerate(reader.pages):
        emit_progress(index / max(_page_count(reader), 1), "Copying PDF pages")
        writer.add_page(page)

    writer.encrypt(
        user_password=user_password,
        owner_password=owner_password or user_password,
        algorithm="AES-128",
    )
    _write_pdf(writer, output)
    emit_progress(1.0, "PDF locked")

    result = file_result("pdf.lock", [input_path], [output])
    result["encryption"] = {"algorithm": "AES-128", "encrypted": True}
    result["page_count"] = _page_count(reader)
    return result


def unlock_pdf(
    input_path: Path,
    output_path: Path,
    password: str,
    *,
    overwrite: bool = False,
    emit_progress: ProgressEmitter = noop_progress,
) -> dict[str, Any]:
    output = require_output_file(str(output_path), input_path=input_path, overwrite=overwrite)
    reader = _open_reader(input_path, password)
    if not reader.is_encrypted:
        raise OperationError("Input PDF is not encrypted.", {"path": str(input_path)})

    writer = PdfWriter()
    page_count = _page_count(reader)
    for index, page in enumerate(reader.pages):
        emit_progress(index / max(page_count, 1), "Copying decrypted pages")
        writer.add_page(page)

    _write_pdf(writer, output)
    emit_progress(1.0, "PDF unlocked")

    result = file_result("pdf.unlock", [input_path], [output])
    result["encryption"] = {"encrypted": False}
    result["page_count"] = page_count
    return result


def _page_order_param(params: dict[str, Any]) -> list[int]:
    page_order = params.get("page_order")
    if not isinstance(page_order, list) or not all(isinstance(page, int) for page in page_order):
        raise ValidationError("page_order must be a list of page numbers.", {"page_order": page_order})
    return page_order


def handle_merge(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return merge_pdfs(
        require_input_files(params.get("input_paths")),
        require_output_file(params.get("output_path"), overwrite=bool_param(params, "overwrite", False)),
        overwrite=True,
        password=params.get("password"),
        emit_progress=emit_progress,
    )


def handle_split_ranges(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return split_pdf_by_ranges(
        require_input_file(params.get("input_path")),
        require_output_dir(params.get("output_dir")),
        params.get("ranges"),
        overwrite=bool_param(params, "overwrite", False),
        password=params.get("password"),
        emit_progress=emit_progress,
    )


def handle_split_every_n(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return split_pdf_every_n_pages(
        require_input_file(params.get("input_path")),
        require_output_dir(params.get("output_dir")),
        int_param(params, "pages_per_file"),
        overwrite=bool_param(params, "overwrite", False),
        password=params.get("password"),
        emit_progress=emit_progress,
    )


def handle_split_individual(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return split_pdf_individual_pages(
        require_input_file(params.get("input_path")),
        require_output_dir(params.get("output_dir")),
        overwrite=bool_param(params, "overwrite", False),
        password=params.get("password"),
        emit_progress=emit_progress,
    )


def handle_reorder(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return reorder_pdf(
        require_input_file(params.get("input_path")),
        require_output_file(params.get("output_path"), overwrite=bool_param(params, "overwrite", False)),
        _page_order_param(params),
        overwrite=True,
        password=params.get("password"),
        emit_progress=emit_progress,
    )


def handle_delete_pages(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return delete_pdf_pages(
        require_input_file(params.get("input_path")),
        require_output_file(params.get("output_path"), overwrite=bool_param(params, "overwrite", False)),
        params.get("pages"),
        overwrite=True,
        password=params.get("password"),
        emit_progress=emit_progress,
    )


def handle_lock(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return lock_pdf(
        require_input_file(params.get("input_path")),
        require_output_file(params.get("output_path"), overwrite=bool_param(params, "overwrite", False)),
        str_param(params, "user_password"),
        owner_password=params.get("owner_password"),
        input_password=params.get("input_password"),
        overwrite=True,
        emit_progress=emit_progress,
    )


def handle_unlock(params: dict[str, Any], emit_progress: ProgressEmitter = noop_progress) -> dict[str, Any]:
    return unlock_pdf(
        require_input_file(params.get("input_path")),
        require_output_file(params.get("output_path"), overwrite=bool_param(params, "overwrite", False)),
        str_param(params, "password"),
        overwrite=True,
        emit_progress=emit_progress,
    )
