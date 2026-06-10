"""Shared helpers for backend file operations."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

from ilovepavidf_backend.errors import OperationError, ValidationError

ProgressEmitter = Callable[[float, str | None], None]


def noop_progress(progress: float, message: str | None = None) -> None:
    del progress
    del message


def require_path(value: Any, field_name: str) -> Path:
    if not isinstance(value, str) or not value:
        raise ValidationError(f"{field_name} must be a non-empty path string.", {"field": field_name})
    return Path(value).expanduser()


def require_input_file(value: Any, field_name: str = "input_path") -> Path:
    path = require_path(value, field_name)
    if not path.exists():
        raise OperationError("Input file does not exist.", {"field": field_name, "path": str(path)})
    if not path.is_file():
        raise OperationError("Input path is not a file.", {"field": field_name, "path": str(path)})
    return path


def require_input_files(value: Any, field_name: str = "input_paths") -> list[Path]:
    if not isinstance(value, list) or not value:
        raise ValidationError(f"{field_name} must be a non-empty list of path strings.", {"field": field_name})
    return [require_input_file(item, f"{field_name}[{index}]") for index, item in enumerate(value)]


def require_output_file(
    value: Any,
    *,
    field_name: str = "output_path",
    input_path: Path | None = None,
    default_suffix: str | None = None,
    overwrite: bool = False,
) -> Path:
    if value is None:
        if input_path is None or default_suffix is None:
            raise ValidationError(f"{field_name} is required.", {"field": field_name})
        path = input_path.with_suffix(default_suffix)
    else:
        path = require_path(value, field_name)

    if input_path is not None and path.resolve() == input_path.resolve():
        raise ValidationError(
            "Output path must not be the same as the input path.",
            {"input_path": str(input_path), "output_path": str(path)},
        )
    if path.exists() and not overwrite:
        raise OperationError("Output file already exists.", {"path": str(path)})

    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def require_output_dir(value: Any, field_name: str = "output_dir") -> Path:
    path = require_path(value, field_name)
    path.mkdir(parents=True, exist_ok=True)
    if not path.is_dir():
        raise OperationError("Output path is not a directory.", {"field": field_name, "path": str(path)})
    return path


def bool_param(params: dict[str, Any], field_name: str, default: bool = False) -> bool:
    value = params.get(field_name, default)
    if not isinstance(value, bool):
        raise ValidationError(f"{field_name} must be a boolean.", {"field": field_name})
    return value


def int_param(params: dict[str, Any], field_name: str, default: int | None = None) -> int:
    value = params.get(field_name, default)
    if not isinstance(value, int):
        raise ValidationError(f"{field_name} must be an integer.", {"field": field_name})
    return value


def str_param(params: dict[str, Any], field_name: str, default: str | None = None) -> str:
    value = params.get(field_name, default)
    if not isinstance(value, str) or not value:
        raise ValidationError(f"{field_name} must be a non-empty string.", {"field": field_name})
    return value


def file_result(operation: str, input_paths: Iterable[Path], output_paths: Iterable[Path]) -> dict[str, Any]:
    outputs = list(output_paths)
    return {
        "operation": operation,
        "input_paths": [str(path) for path in input_paths],
        "output_paths": [str(path) for path in outputs],
        "outputs": [
            {
                "path": str(path),
                "bytes": path.stat().st_size if path.exists() else None,
            }
            for path in outputs
        ],
    }
