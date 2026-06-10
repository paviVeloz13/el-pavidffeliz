from __future__ import annotations

import io
import json
import unittest

from pavidffeliz_backend.constants import APP_NAME, FLATTEN_DPI, PYPDF_REQUIRED_VERSION
from pavidffeliz_backend.protocol import Command
from pavidffeliz_backend.worker import dispatch, run


class WorkerHealthTests(unittest.TestCase):
    def test_dispatch_health_command(self) -> None:
        response = dispatch(Command(command_id="health-1", action="health", params={}))

        self.assertEqual(response["id"], "health-1")
        self.assertEqual(response["status"], "ok")
        result = response["result"]
        self.assertEqual(result["app"], APP_NAME)
        self.assertEqual(result["constants"]["pypdf_required_version"], PYPDF_REQUIRED_VERSION)
        self.assertEqual(result["constants"]["flatten_dpi"], FLATTEN_DPI)
        self.assertIn("dependencies", result)
        self.assertIn("crypto_aes", result)
        self.assertIn("poppler", result)

    def test_dispatch_unknown_operation_returns_error_from_worker_loop(self) -> None:
        input_stream = io.StringIO('{"id":"bad-1","action":"nope","params":{}}\n')
        output_stream = io.StringIO()

        exit_code = run(input_stream, output_stream)
        event = json.loads(output_stream.getvalue())

        self.assertEqual(exit_code, 0)
        self.assertEqual(event["id"], "bad-1")
        self.assertEqual(event["status"], "error")
        self.assertEqual(event["error"]["code"], "UNKNOWN_OPERATION")

    def test_worker_loop_handles_protocol_errors(self) -> None:
        input_stream = io.StringIO("{not-json\n")
        output_stream = io.StringIO()

        run(input_stream, output_stream)
        event = json.loads(output_stream.getvalue())

        self.assertIsNone(event["id"])
        self.assertEqual(event["status"], "error")
        self.assertEqual(event["error"]["code"], "PROTOCOL_ERROR")


if __name__ == "__main__":
    unittest.main()
