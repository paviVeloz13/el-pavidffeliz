"""Typed errors that can be serialized over the worker protocol."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AppError(Exception):
    """Base application error with a stable protocol code."""

    message: str
    code: str = "APP_ERROR"
    details: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        super().__init__(self.message)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }


class ProtocolError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="PROTOCOL_ERROR", details=details or {})


class UnknownOperationError(AppError):
    def __init__(self, action: str) -> None:
        super().__init__(
            message=f"Unknown worker action: {action}",
            code="UNKNOWN_OPERATION",
            details={"action": action},
        )


class RuntimePathError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="RUNTIME_PATH_ERROR", details=details or {})


class DependencyProbeError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="DEPENDENCY_PROBE_ERROR", details=details or {})


class PopplerMissingError(AppError):
    def __init__(self, details: dict[str, Any] | None = None) -> None:
        super().__init__(
            message="Bundled Poppler binaries are missing or incomplete.",
            code="POPPLER_MISSING",
            details=details or {},
        )


class OperationError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="OPERATION_ERROR", details=details or {})


class ValidationError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="VALIDATION_ERROR", details=details or {})
