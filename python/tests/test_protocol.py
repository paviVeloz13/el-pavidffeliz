from __future__ import annotations

import json
import unittest

from pavidffeliz_backend.errors import ProtocolError
from pavidffeliz_backend.protocol import (
    encode_event,
    error_response,
    ok_response,
    parse_command_line,
    progress_response,
)


class ProtocolTests(unittest.TestCase):
    def test_parse_valid_command(self) -> None:
        command = parse_command_line('{"id":"1","action":"health","params":{"quick":true}}')

        self.assertEqual(command.command_id, "1")
        self.assertEqual(command.action, "health")
        self.assertEqual(command.params, {"quick": True})

    def test_parse_rejects_invalid_json(self) -> None:
        with self.assertRaises(ProtocolError):
            parse_command_line("{not-json")

    def test_parse_rejects_missing_action(self) -> None:
        with self.assertRaises(ProtocolError):
            parse_command_line('{"id":"1","params":{}}')

    def test_parse_rejects_non_object_params(self) -> None:
        with self.assertRaises(ProtocolError):
            parse_command_line('{"id":"1","action":"health","params":[]}')

    def test_event_encoding_is_one_ndjson_line(self) -> None:
        encoded = encode_event(ok_response("1", {"hello": "mundo"}))

        self.assertTrue(encoded.endswith("\n"))
        self.assertEqual(encoded.count("\n"), 1)
        self.assertEqual(json.loads(encoded)["result"], {"hello": "mundo"})

    def test_error_response_shape(self) -> None:
        response = error_response("1", ProtocolError("Bad input."))

        self.assertEqual(response["status"], "error")
        self.assertEqual(response["error"]["code"], "PROTOCOL_ERROR")

    def test_progress_response_shape(self) -> None:
        response = progress_response("1", 0.5, "Halfway")

        self.assertEqual(response["status"], "progress")
        self.assertEqual(response["progress"], 0.5)
        self.assertEqual(response["message"], "Halfway")


if __name__ == "__main__":
    unittest.main()
