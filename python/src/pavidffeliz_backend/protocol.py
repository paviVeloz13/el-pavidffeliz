"""NDJSON command/result helpers for Electron <-> Python IPC."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from .errors import AppError, ProtocolError


@dataclass(frozen=True)
class Command:
    """A single command sent by Electron to the persistent worker."""

    command_id: str
    action: str
    params: dict[str, Any] = field(default_factory=dict)


def parse_command_line(line: str) -> Command:
    """Parse and validate one NDJSON command line."""

    stripped = line.strip()
    if not stripped:
        raise ProtocolError("Empty command line.")

    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise ProtocolError(
            "Command line is not valid JSON.",
            {"line": stripped, "error": str(exc)},
        ) from exc

    if not isinstance(payload, dict):
        raise ProtocolError("Command payload must be a JSON object.")

    command_id = payload.get("id")
    action = payload.get("action")
    params = payload.get("params", {})

    if not isinstance(command_id, str) or not command_id:
        raise ProtocolError("Command id must be a non-empty string.")
    if not isinstance(action, str) or not action:
        raise ProtocolError("Command action must be a non-empty string.")
    if not isinstance(params, dict):
        raise ProtocolError("Command params must be a JSON object.", {"id": command_id})

    return Command(command_id=command_id, action=action, params=params)


def ok_response(command_id: str, result: dict[str, Any] | list[Any] | str | int | None) -> dict[str, Any]:
    return {"id": command_id, "status": "ok", "result": result}


def progress_response(command_id: str, progress: float, message: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": command_id,
        "status": "progress",
        "progress": progress,
    }
    if message:
        payload["message"] = message
    return payload


def error_response(command_id: str | None, error: AppError | Exception) -> dict[str, Any]:
    if isinstance(error, AppError):
        error_payload = error.to_dict()
    else:
        error_payload = {
            "code": "INTERNAL_ERROR",
            "message": str(error) or error.__class__.__name__,
            "details": {"type": error.__class__.__name__},
        }
    return {"id": command_id, "status": "error", "error": error_payload}


def encode_event(event: dict[str, Any]) -> str:
    """Serialize one worker event as a compact NDJSON line."""

    return json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"
